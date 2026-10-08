import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { AvitoApi } from './api/AvitoApi.ts';
import { AvitoApiError } from './api/AvitoApiError.ts';
import {
    type CategoryNode,
    CategoryNodeSchema,
    type FieldContent,
    fieldValues,
    type NodeFields,
    walkLeaves,
} from './api/Schemas.ts';

// Офлайн-снапшот Avito (дерево, поля листьев с enum-значениями, справочники брендов): строится rebuild-скриптом, classify читает из памяти.
export type Snapshot = {
    tree: CategoryNode[];
    fields: Record<string, NodeFields>;
    brands: Record<string, string[]>;
};

export class CategorySnapshot {
    // 6 параллельных давали ConnectTimeout на api.avito.ru.
    private static readonly CONCURRENCY = 3;
    private static readonly RETRIES = 2;

    private static readonly SnapshotSchema = z.object({
        tree: z.array(CategoryNodeSchema).min(1),
        fields: z.record(
            z.string(),
            z.object({
                node: z.object({ name: z.string(), slug: z.string() }),
                fields: z.array(
                    z.object({
                        tag: z.string().optional(),
                        content: z
                            .array(
                                z.object({
                                    field_type: z.enum(['input', 'select', 'checkbox']).optional(),
                                    is_catalog: z.boolean().optional(),
                                    required: z.boolean(),
                                    values: z
                                        .array(z.object({ value: z.string().optional() }))
                                        .optional(),
                                    catalog: z.string().optional(),
                                }),
                            )
                            .optional(),
                    }),
                ),
            }),
        ),
        brands: z.record(z.string(), z.array(z.string()).min(1)),
    });

    static loadFile(path: string): Snapshot {
        const parsed = CategorySnapshot.SnapshotSchema.safeParse(
            JSON.parse(readFileSync(path, 'utf8')),
        );
        if (!parsed.success) {
            throw new Error(
                `[CategorySnapshot] пустой или битый снапшот: ${path}: ${parsed.error.issues[0]?.message}`,
            );
        }
        const snapshot: Snapshot = parsed.data;
        // Инвариант fail-fast: каждый лист дерева обязан иметь поля. Иначе при classify лист молча выпал бы из кандидатов.
        const missing = walkLeaves(snapshot.tree).filter((n) => !snapshot.fields[n.slug as string]);
        if (missing.length > 0) {
            throw new Error(
                `[CategorySnapshot] в снапшоте нет полей для ${missing.length} листьев (напр. ${missing[0]?.slug}) — пересобери`,
            );
        }
        // Инвариант: у каждого Brand-поля есть каталог и его справочник лежит в brands — иначе classify упал бы на выбранном листе.
        for (const nf of Object.values(snapshot.fields)) {
            const brand = nf.fields.find((f) => f.tag === 'Brand')?.content?.[0];
            if (brand && !(brand.catalog && snapshot.brands[brand.catalog])) {
                throw new Error(
                    `[CategorySnapshot] у Brand листа ${nf.node.slug} нет справочника брендов (каталог ${brand.catalog ?? '—'}) — пересобери`,
                );
            }
        }
        return snapshot;
    }

    static writeFile(path: string, snapshot: Snapshot): void {
        writeFileSync(path, JSON.stringify(snapshot));
    }

    // Скачивает дерево + поля каждого листа, резолвит values_link_json в inline-значения, качает справочники брендов. Тяжёлый разовый джоб.
    static async build(api: AvitoApi): Promise<Snapshot> {
        const start = process.hrtime.bigint();
        const tree = await api.tree();
        const leaves = walkLeaves(tree)
            .map((n) => n.slug)
            .filter((s): s is string => Boolean(s));
        const fields: Record<string, NodeFields> = {};
        const rejected = new Set<string>();
        const brands: Record<string, string[]> = {};

        let done = 0;
        await CategorySnapshot.mapLimit(leaves, CategorySnapshot.CONCURRENCY, async (slug) => {
            const nf = await CategorySnapshot.withRetry(() =>
                CategorySnapshot.nullOn([400, 404], () => api.nodeFields(slug)),
            );
            if (nf) {
                fields[slug] = await CategorySnapshot.slimFields(nf, api, brands);
            } else {
                rejected.add(slug);
            }
            done++;
            if (done % 200 === 0) {
                console.log(`[CategorySnapshot] fields ${done}/${leaves.length}`);
            }
        });
        if (rejected.size > 0) {
            console.log(
                `[CategorySnapshot] API отверг ${rejected.size} листьев дерева (напр. ${[...rejected][0]}) — выкинуты из снапшота`,
            );
        }

        const catalogs = CategorySnapshot.brandCatalogs(fields).filter((c) => !(c in brands));
        const dead = new Set<string>();
        await CategorySnapshot.mapLimit(catalogs, CategorySnapshot.CONCURRENCY, async (catalog) => {
            const values = await CategorySnapshot.withRetry(() =>
                CategorySnapshot.nullOn([404], () => api.catalogValues(catalog)),
            );
            if (values === null || values.length === 0) {
                dead.add(catalog);
            } else {
                brands[catalog] = values;
            }
        });
        // Лист с Brand без справочника (404 или пустой список) неклассифицируем — режем его вместе с отвергнутыми, а не падаем в рантайме.
        for (const [slug, nf] of Object.entries(fields)) {
            const catalog = nf.fields.find((f) => f.tag === 'Brand')?.content?.[0]?.catalog;
            if (catalog && dead.has(catalog)) {
                rejected.add(slug);
                delete fields[slug];
            }
        }
        if (dead.size > 0) {
            console.log(
                `[CategorySnapshot] Avito не отдаёт ${dead.size} каталогов брендов (${[...dead].join(', ')}) — их листья выкинуты из снапшота`,
            );
        }
        const pruned = CategorySnapshot.prune(tree, rejected);

        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
            `[CategorySnapshot] build ${leaves.length - rejected.size} leaves, ${Object.keys(brands).length} brand catalogs ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
        );
        return CategorySnapshot.SnapshotSchema.parse({ tree: pruned, fields, brands });
    }

    // Рассинхрон Avito: часть листьев дерева /fields отвергает 400/404, часть каталогов зеркало — 404; для нас их нет, прочие статусы — ошибка.
    private static async nullOn<T>(statuses: number[], fn: () => Promise<T>): Promise<T | null> {
        try {
            return await fn();
        } catch (err) {
            if (err instanceof AvitoApiError && statuses.includes(err.status)) {
                return null;
            }
            throw err;
        }
    }

    private static prune(nodes: CategoryNode[], rejected: Set<string>): CategoryNode[] {
        const out: CategoryNode[] = [];
        for (const node of nodes) {
            if (!node.nested?.length) {
                if (!node.slug || !rejected.has(node.slug)) {
                    out.push(node);
                }
                continue;
            }
            const nested = CategorySnapshot.prune(node.nested, rejected);
            if (nested.length > 0) {
                out.push({ ...node, nested });
            }
        }
        return out;
    }

    private static brandCatalogs(fields: Record<string, NodeFields>): string[] {
        const set = new Set<string>();
        for (const nf of Object.values(fields)) {
            for (const f of nf.fields) {
                const catalog = f.content?.[0]?.catalog;
                if (f.tag === 'Brand' && catalog) {
                    set.add(catalog);
                }
            }
        }
        return [...set];
    }

    // Только select-поля + required; Brand — ключом справочника в brands, прочие catalog-поля (тысячи значений) — только флагом.
    private static async slimFields(
        nf: NodeFields,
        api: AvitoApi,
        brands: Record<string, string[]>,
    ): Promise<NodeFields> {
        const fields: NodeFields['fields'] = [];
        for (const field of nf.fields) {
            const tag = field.tag;
            const content = field.content?.[0];
            const keep = tag === 'Category' || tag === 'GoodsType';
            if (!content || (content.field_type !== 'select' && !content.is_catalog && !keep)) {
                continue;
            }
            const required = content.required === true;
            if (tag === 'Brand') {
                const catalog = await CategorySnapshot.brandCatalog(
                    nf.node.slug,
                    content,
                    api,
                    brands,
                );
                fields.push({
                    tag,
                    content: [{ field_type: 'select', is_catalog: true, required, catalog }],
                });
                continue;
            }
            if (!keep && content.is_catalog === true) {
                fields.push({
                    tag,
                    content: [{ field_type: 'select', is_catalog: true, required }],
                });
                continue;
            }
            let values = content.values ?? [];
            if (!values.some((v) => v.value) && content.values_link_json) {
                const resolved = await CategorySnapshot.withRetry(() =>
                    api.valuesFromLink(content.values_link_json as string),
                );
                values = resolved.map((value) => ({ value }));
            }
            fields.push({
                tag,
                content: [{ field_type: 'select', is_catalog: false, required, values }],
            });
        }
        return { node: nf.node, fields };
    }

    // Ключ справочника Brand: имя файла каталога на зеркале, либо хэш списка (из API или inline) — сам список сразу кладём в brands.
    private static async brandCatalog(
        slug: string,
        content: FieldContent,
        api: AvitoApi,
        brands: Record<string, string[]>,
    ): Promise<string> {
        if (!content.values_link_json && content.values_link_xml) {
            return AvitoApi.catalogName(content.values_link_xml);
        }
        const values = content.values_link_json
            ? await CategorySnapshot.withRetry(() =>
                  api.valuesFromLink(content.values_link_json as string),
              )
            : fieldValues(content);
        if (values.length === 0) {
            throw new Error(`[CategorySnapshot] у Brand листа ${slug} нет справочника брендов`);
        }
        const key = `api_${createHash('sha1').update(JSON.stringify(values)).digest('hex').slice(0, 12)}`;
        brands[key] = values;
        return key;
    }

    private static async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastErr: unknown;
        for (let i = 0; i <= CategorySnapshot.RETRIES; i++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr;
    }

    private static async mapLimit<T>(
        items: T[],
        limit: number,
        fn: (item: T) => Promise<void>,
    ): Promise<void> {
        let cursor = 0;
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const item = items[cursor++];
                if (item !== undefined) {
                    await fn(item);
                }
            }
        });
        await Promise.all(workers);
    }
}
