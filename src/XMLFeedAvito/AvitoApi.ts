import { z } from 'zod';
import { env } from '../environment.ts';

// Узел дерева категорий Avito. slug есть у каждого узла, но fields отдаёт только истинный лист (без nested).
export type CategoryNode = {
    name: string;
    slug?: string | undefined;
    nested?: CategoryNode[] | undefined;
};

export type FieldContent = {
    field_type?: 'input' | 'select' | 'checkbox' | undefined;
    is_catalog?: boolean | undefined;
    values?: { value?: string | undefined }[] | undefined;
    values_link_json?: string | null | undefined;
};

export type NodeFields = {
    node: { name: string; slug: string };
    fields: { tag?: string | undefined; content?: FieldContent[] | undefined }[];
};

// Листья поддерева: узлы без nested, у которых есть slug (истинные категории Avito).
export function walkLeaves(nodes: CategoryNode[]): CategoryNode[] {
    const out: CategoryNode[] = [];
    const walk = (node: CategoryNode): void => {
        if (!node.nested?.length) {
            if (node.slug) {
                out.push(node);
            }
            return;
        }
        for (const child of node.nested) {
            walk(child);
        }
    };
    for (const node of nodes) {
        walk(node);
    }
    return out;
}

// Без .loose(): POST профиля принимает только эти поля, лишнее из GET не прокидываем.
export const ProfileSchema = z.object({
    autoload_enabled: z.boolean(),
    report_email: z.string().nullable(),
    schedule: z.array(
        z.object({
            rate: z.number(),
            weekdays: z.array(z.number()),
            time_slots: z.array(z.number()),
        }),
    ),
    feeds_data: z.array(z.object({ feed_name: z.string(), feed_url: z.string() })).nullable(),
});
export const ReportStatusSchema = z.enum(['processing', 'success', 'success_warning', 'error']);
export const ItemSchema = z.object({
    ad_id: z.string(),
    messages: z.array(z.object({ type: z.string(), title: z.string(), description: z.string() })),
});
type Section = { slug: string; count: number; sections?: Section[] | undefined };
const SectionSchema: z.ZodType<Section> = z.lazy(() =>
    z.object({ slug: z.string(), count: z.number(), sections: z.array(SectionSchema).optional() }),
);

export type AutoloadProfile = z.infer<typeof ProfileSchema>;
export type AutoloadReport = { id: number; status: z.infer<typeof ReportStatusSchema> };
// Счётчики дерева section_stats по slug: sections_stats (всего), successful, error, not_publish…
export type ReportStats = Record<string, number>;
export type AutoloadItem = z.infer<typeof ItemSchema>;

export class AvitoApi {
    private static readonly BASE = 'https://api.avito.ru';
    private static readonly TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
    private static readonly ERRORS_PAGE = 100;

    private static readonly CategoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
        z.object({
            name: z.string(),
            slug: z.string().optional(),
            nested: z.array(AvitoApi.CategoryNodeSchema).optional(),
        }),
    );
    private static readonly TreeOut = z.object({
        categories: z.array(AvitoApi.CategoryNodeSchema),
    });
    private static readonly FieldValue = z.object({ value: z.string().optional() }).loose();
    private static readonly FieldContentSchema = z
        .object({
            field_type: z.enum(['input', 'select', 'checkbox']).optional(),
            is_catalog: z.boolean().optional(),
            values: z.array(AvitoApi.FieldValue).optional(),
            values_link_json: z.string().nullish(),
        })
        .loose();
    private static readonly NodeFieldSchema = z
        .object({
            tag: z.string().optional(),
            content: z.array(AvitoApi.FieldContentSchema).optional(),
        })
        .loose();
    private static readonly FieldsOut = z.object({
        node: z.object({ name: z.string(), slug: z.string() }),
        fields: z.array(AvitoApi.NodeFieldSchema),
    });

    private static readonly ReportsOut = z.object({
        reports: z.array(z.object({ id: z.number(), status: ReportStatusSchema })),
    });
    private static readonly ReportV3Out = z.object({
        report_id: z.number(),
        status: ReportStatusSchema,
        section_stats: SectionSchema.nullish(),
    });
    private static readonly ItemsOut = z.object({
        items: z.array(ItemSchema),
        meta: z.object({ pages: z.number() }),
    });

    private token: { value: string; expiresAt: number } | null = null;

    private async accessToken(): Promise<string> {
        if (this.token && this.token.expiresAt > Date.now()) {
            return this.token.value;
        }
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: env.AVITO_CLIENT_ID,
            client_secret: env.AVITO_CLIENT_SECRET,
        });
        const res = await fetch(`${AvitoApi.BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!res.ok) {
            throw new Error(`[AvitoApi] token ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json()) as { access_token: string };
        this.token = {
            value: json.access_token,
            expiresAt: Date.now() + AvitoApi.TOKEN_TTL_MS,
        };
        return json.access_token;
    }

    private async get(path: string): Promise<Response> {
        return fetch(`${AvitoApi.BASE}${path}`, {
            headers: { Authorization: `Bearer ${await this.accessToken()}` },
        });
    }

    private async post(path: string, body?: unknown): Promise<Response> {
        return fetch(`${AvitoApi.BASE}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.accessToken()}`,
                'Content-Type': 'application/json',
            },
            body: body === undefined ? null : JSON.stringify(body),
        });
    }

    private static async check(res: Response, op: string): Promise<Response> {
        if (!res.ok) {
            throw new Error(`[AvitoApi] ${op} ${res.status}: ${await res.text()}`);
        }
        return res;
    }

    async profile(): Promise<AutoloadProfile> {
        const res = await AvitoApi.check(await this.get('/autoload/v2/profile'), 'profile');
        return ProfileSchema.parse(await res.json());
    }

    async saveProfile(profile: AutoloadProfile): Promise<void> {
        await AvitoApi.check(await this.post('/autoload/v2/profile', profile), 'saveProfile');
    }

    // Avito разрешает один запуск в час: отказ летит ошибкой с текстом Avito.
    async upload(): Promise<void> {
        await AvitoApi.check(await this.post('/autoload/v1/upload'), 'upload');
    }

    async lastReport(): Promise<AutoloadReport | null> {
        const res = await AvitoApi.check(
            await this.get('/autoload/v2/reports?per_page=1&page=0'),
            'lastReport',
        );
        return AvitoApi.ReportsOut.parse(await res.json()).reports[0] ?? null;
    }

    async report(id: number): Promise<AutoloadReport & { stats: ReportStats }> {
        const res = await AvitoApi.check(
            await this.get(`/autoload/v3/reports/${id}`),
            `report(${id})`,
        );
        const out = AvitoApi.ReportV3Out.parse(await res.json());
        const stats: ReportStats = {};
        const walk = (s: Section): void => {
            stats[s.slug] = s.count;
            s.sections?.forEach(walk);
        };
        if (out.section_stats) {
            walk(out.section_stats);
        }
        return { id: out.report_id, status: out.status, stats };
    }

    async reportErrors(id: number): Promise<AutoloadItem[]> {
        const items: AutoloadItem[] = [];
        for (let page = 0, pages = 1; page < pages; page++) {
            const res = await AvitoApi.check(
                await this.get(
                    `/autoload/v2/reports/${id}/items?sections=error&per_page=${AvitoApi.ERRORS_PAGE}&page=${page}`,
                ),
                `reportErrors(${id})`,
            );
            const out = AvitoApi.ItemsOut.parse(await res.json());
            items.push(...out.items);
            pages = out.meta.pages;
        }
        return items;
    }

    async tree(): Promise<CategoryNode[]> {
        const res = await AvitoApi.check(await this.get('/autoload/v1/user-docs/tree'), 'tree');
        return AvitoApi.TreeOut.parse(await res.json()).categories;
    }

    async nodeFields(slug: string): Promise<NodeFields> {
        const res = await AvitoApi.check(
            await this.get(`/autoload/v1/user-docs/node/${slug}/fields`),
            `fields(${slug})`,
        );
        return AvitoApi.FieldsOut.parse(await res.json());
    }

    // Значения select-поля, вынесенные в отдельную ручку (values_link_json). Тот же формат: {values:[{value}]}.
    async valuesFromLink(url: string): Promise<string[]> {
        const path = url.replace(AvitoApi.BASE, '');
        const res = await AvitoApi.check(await this.get(path), `values(${path})`);
        const parsed = z.object({ values: z.array(AvitoApi.FieldValue) }).parse(await res.json());
        return parsed.values.map((v) => v.value).filter((v): v is string => Boolean(v));
    }
}
