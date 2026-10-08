import { z } from 'zod';
import { env } from '../../environment.ts';
import { AvitoApiError } from './AvitoApiError.ts';
import {
    type AutoloadItem,
    type AutoloadProfile,
    type AutoloadReport,
    type CategoryNode,
    CategoryNodeSchema,
    fieldValues,
    ItemSchema,
    type NodeFields,
    ProfileSchema,
    type ReportStats,
    ReportStatusSchema,
    type Section,
    SectionSchema,
} from './Schemas.ts';

export class AvitoApi {
    private static readonly BASE = 'https://api.avito.ru';
    // Зеркало каталогов значений (бренды): values_link_xml ведёт на avito.ru под антибот (429), тот же файл здесь отдаётся свободно.
    private static readonly CATALOG_MIRROR = 'https://autoload.avito.ru/format/';
    private static readonly TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
    private static readonly ERRORS_PAGE = 100;

    private static readonly TreeOut = z.object({
        categories: z.array(CategoryNodeSchema),
    });
    private static readonly FieldValue = z.object({ value: z.string().optional() }).loose();
    private static readonly FieldContentSchema = z
        .object({
            field_type: z.enum(['input', 'select', 'checkbox']).optional(),
            is_catalog: z.boolean().optional(),
            values: z.array(AvitoApi.FieldValue).optional(),
            values_link_json: z.string().nullish(),
            values_link_xml: z.string().nullish(),
            required: z.boolean().optional(),
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
            throw new AvitoApiError(
                res.status,
                `[AvitoApi] ${op} ${res.status}: ${await res.text()}`,
            );
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
        return fieldValues(parsed);
    }

    // Имя файла каталога из values_link_xml — ключ справочника брендов в снапшоте (name_in_catalog не уникален).
    static catalogName(valuesLinkXml: string): string {
        const file = valuesLinkXml.split('/').pop() ?? '';
        if (!file.endsWith('.xml')) {
            throw new Error(`[AvitoApi] неожиданная ссылка каталога: ${valuesLinkXml}`);
        }
        return file.slice(0, -'.xml'.length);
    }

    // Значения верхнего уровня каталога (бренды). Вложенные seriya/model не берём — это другие поля.
    async catalogValues(catalog: string): Promise<string[]> {
        const url = `${AvitoApi.CATALOG_MIRROR}${catalog}.xml`;
        const res = await AvitoApi.check(await fetch(url), `catalog(${catalog})`);
        return AvitoApi.topLevelNames(await res.text());
    }

    private static topLevelNames(xml: string): string[] {
        const names: string[] = [];
        let depth = 0;
        for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w.-]*)([^>]*?)(\/?)>/g)) {
            const [, close, , attrs, selfClose] = m;
            if (close) {
                depth--;
                continue;
            }
            if (depth === 1) {
                const name = /\bname=(["'])(.*?)\1/.exec(attrs ?? '')?.[2];
                if (name) {
                    names.push(AvitoApi.decodeEntities(name));
                }
            }
            if (!selfClose) {
                depth++;
            }
        }
        return names;
    }

    private static decodeEntities(s: string): string {
        return s
            .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
                String.fromCodePoint(Number.parseInt(hex, 16)),
            )
            .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }
}
