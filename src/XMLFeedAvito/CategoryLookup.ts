import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Gemma } from '../AI/Gemma4.ts';
import type { ParsedProduct } from '../Parser/Parser.ts';
import { type CategoryNode, fieldValues, type NodeFields, walkLeaves } from './api/Schemas.ts';
import { CategorySnapshot, type Snapshot } from './CategorySnapshot.ts';

// Категорийные поля Avito для товара: лист дерева + производные поля узла (Category/GoodsType) + атрибуты (подвид, дискриминатор, бренд).
export type CategoryResult = {
    slug: string;
    category: string;
    goodsType: string | null;
    attrs: Record<string, string>;
};

type Discriminator = { tag: string; values: string[] };
// Дискриминаторы выбирает модель, подвиды детерминированы, Brand резолвится только для выбранного листа.
type SelectFields = {
    discriminators: Discriminator[];
    singles: { tag: string; value: string }[];
    brand: { catalog: string | undefined } | null;
};

const DEFAULT_SNAPSHOT = new URL('../../data/category-snapshot.json', import.meta.url).pathname;

// Товар поставщика -> категория Avito. Поля всех листьев берём из офлайн-снапшота (0 HTTP), маршрут и выбор листа — через Gemma.
export class CategoryLookup {
    private static readonly COARSE_PROMPT = readFileSync(
        new URL('./promts/coarse.md', import.meta.url),
        'utf8',
    );
    private static readonly FINE_PROMPT = readFileSync(
        new URL('./promts/fine.md', import.meta.url),
        'utf8',
    );

    private static readonly COARSE_TOPK = 3;
    private static readonly LEAF_CAP = 30;
    private static readonly MAX_NARROW = 3;
    private static readonly ENUM_DISPLAY_CAP = 20;
    private static readonly BRAND_OTHER = 'Другой';
    private static readonly BRAND_NONE = 'Без бренда';

    private static readonly NodesPick = z.object({
        ids: z.array(z.number().int().nonnegative()),
    });
    private static readonly FinePick = z.object({
        id: z.number().int().nonnegative(),
        attrs: z.record(z.string(), z.string()).optional(),
    });

    // Поля узла и обязательные общие поля объявления заполняет XMLBuilder — в attrs не протекают.
    private static readonly COMMON_SELECT_TAGS = new Set([
        'Category',
        'GoodsType',
        'AdType',
        'Condition',
    ]);

    private readonly snapshot: Snapshot;
    private readonly gemma: Gemma;

    private readonly level2: CategoryNode[];
    private readonly pathByNode = new WeakMap<CategoryNode, string>();

    // Единая модель gemini-3.8-flash (второй аргумент — fallback-ретрай внутри Gemma): fold видит enum'ы, а маршрут по именам надёжнее на flash, чем на lite.
    constructor(
        snapshot: Snapshot = CategorySnapshot.loadFile(DEFAULT_SNAPSHOT),
        gemma: Gemma = new Gemma('gemini-3.8-flash', 'gemma-4-26b-a4b-it'),
    ) {
        this.snapshot = snapshot;
        this.gemma = gemma;
        this.level2 = this.indexTree();
    }

    async classify(product: ParsedProduct): Promise<CategoryResult> {
        const { brand, model, title } = product.identity;
        const key = `${brand}|${model}|${title}`.toLowerCase().trim();

        const start = process.hrtime.bigint();
        const summary = CategoryLookup.summarize(product);

        const picked = await this.pickNodes(this.level2, summary);
        if (picked.length === 0) {
            throw new Error(`[CategoryLookup] coarse: ни один раздел не подошёл (${key})`);
        }
        const candidateLeaves = await this.narrowToLeaves(picked, summary);
        const result = await this.resolveLeaf(candidateLeaves, product, summary, key);

        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
            `[CategoryLookup] classify "${key}" -> ${result.slug} ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
        );
        return result;
    }

    private indexTree(): CategoryNode[] {
        const level2: CategoryNode[] = [];
        const index = (node: CategoryNode, path: string[]): void => {
            const full = [...path, node.name];
            this.pathByNode.set(node, full.join(' / '));
            for (const child of node.nested ?? []) {
                index(child, full);
            }
        };
        for (const top of this.snapshot.tree) {
            index(top, []);
            for (const child of top.nested ?? []) {
                level2.push(child);
            }
        }
        return level2;
    }

    // Спуск coarse-шагами: пока листьев под выбранными узлами слишком много, показываем детей и сужаем.
    private async narrowToLeaves(nodes: CategoryNode[], summary: string): Promise<CategoryNode[]> {
        let current = nodes;
        for (let i = 0; i < CategoryLookup.MAX_NARROW; i++) {
            const leaves = walkLeaves(current);
            if (leaves.length <= CategoryLookup.LEAF_CAP) {
                return leaves;
            }
            const children = current.flatMap((n) => (n.nested?.length ? n.nested : [n]));
            const picked = await this.pickNodes(children, summary);
            if (picked.length === 0) {
                break;
            }
            current = picked;
        }
        return walkLeaves(current);
    }

    // Выбор top-K узлов Gemma. id — позиция в списке (1-based); валидируем, что вернула реальные id.
    private async pickNodes(nodes: CategoryNode[], summary: string): Promise<CategoryNode[]> {
        const prompt = CategoryLookup.COARSE_PROMPT.replace(
            '{{TREE}}',
            this.numbered(nodes),
        ).replace('{{PRODUCT}}', summary);
        const { ids } = await this.gemma.askJson(prompt, CategoryLookup.NodesPick);
        const picked: CategoryNode[] = [];
        for (const id of ids) {
            const node = nodes[id - 1];
            if (node && !picked.includes(node)) {
                picked.push(node);
            }
            if (picked.length >= CategoryLookup.COARSE_TOPK) {
                break;
            }
        }
        return picked;
    }

    // Выбор листа и дискриминатора одним шагом: показываем кандидатам их enum-значения из снапшота, чтобы модель различала соседей (напр. Ди-бокс под «Педали и усилители», а не «Звуковое оборудование»).
    private async resolveLeaf(
        leaves: CategoryNode[],
        product: ParsedProduct,
        summary: string,
        key: string,
    ): Promise<CategoryResult> {
        const entries = leaves
            .map((leaf) => {
                const fields = leaf.slug ? this.snapshot.fields[leaf.slug] : undefined;
                if (!leaf.slug || !fields) {
                    return null;
                }
                return {
                    leaf,
                    slug: leaf.slug,
                    fields,
                    select: this.selectFields(fields),
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);
        if (entries.length === 0) {
            throw new Error(`[CategoryLookup] нет полей ни для одного кандидата (${key})`);
        }

        const list = entries
            .map((e, idx) => {
                const d = e.select.discriminators
                    .map((f) => `${f.tag}: ${CategoryLookup.enumDisplay(f.values)}`)
                    .join('; ');
                return `[${idx + 1}] ${this.pathByNode.get(e.leaf) ?? e.leaf.name}${d ? ` (${d})` : ''}`;
            })
            .join('\n');
        const prompt = CategoryLookup.FINE_PROMPT.replace('{{CANDIDATES}}', list).replace(
            '{{PRODUCT}}',
            summary,
        );
        const { id, attrs: picked } = await this.gemma.askJson(prompt, CategoryLookup.FinePick);
        const chosen = entries[id - 1];
        if (!chosen) {
            throw new Error(
                `[CategoryLookup] leaf: товар не подошёл ни к одному кандидату (${key})`,
            );
        }
        return this.buildResult(chosen.slug, chosen.fields, chosen.select, picked ?? {}, product);
    }

    private buildResult(
        slug: string,
        fields: NodeFields,
        select: SelectFields,
        picked: Record<string, string>,
        product: ParsedProduct,
    ): CategoryResult {
        const category = this.singleFromField(fields, 'Category');
        if (!category) {
            throw new Error(`[CategoryLookup] у "${slug}" нет значения Category`);
        }
        const goodsType = this.singleFromField(fields, 'GoodsType');

        const attrs: Record<string, string> = {};
        for (const f of select.discriminators) {
            const value = picked[f.tag];
            if (!value || !f.values.includes(value)) {
                throw new Error(
                    `[CategoryLookup] ${f.tag}: значение "${value ?? '—'}" нет в допустимых [${f.values.join(', ')}]`,
                );
            }
            attrs[f.tag] = value;
        }
        for (const s of select.singles) {
            attrs[s.tag] = s.value;
        }
        if (select.brand) {
            attrs.Brand = this.resolveBrand(select.brand.catalog, product.identity.brand);
        }
        return { slug, category, goodsType, attrs };
    }

    // Brand только из справочника листа: норм-матч, иначе «Другой»/«Без бренда»; фоллбэка нет в справочнике → throw.
    private resolveBrand(catalog: string | undefined, raw: string): string {
        const list = catalog ? this.snapshot.brands[catalog] : undefined;
        if (!catalog || !list?.length) {
            throw new Error(
                `[CategoryLookup] нет справочника брендов ${catalog ?? '(нет каталога)'} — пересобери снапшот`,
            );
        }
        const brand = raw.trim();
        const key = CategoryLookup.normBrand(brand);
        const matches = brand ? list.filter((v) => CategoryLookup.normBrand(v) === key) : [];
        if (matches.length > 1) {
            const exact = matches.find((v) => v.toLowerCase() === brand.toLowerCase());
            if (!exact) {
                throw new Error(
                    `[CategoryLookup] бренд "${brand}" неоднозначен в ${catalog}: ${matches.join(', ')}`,
                );
            }
            return exact;
        }
        if (matches[0]) {
            return matches[0];
        }
        const fallback = brand ? CategoryLookup.BRAND_OTHER : CategoryLookup.BRAND_NONE;
        if (!list.includes(fallback)) {
            throw new Error(
                `[CategoryLookup] бренда "${brand}" нет в ${catalog}, «${fallback}» там тоже нет`,
            );
        }
        if (brand) {
            console.log(`[CategoryLookup] brand "${brand}" нет в ${catalog} → ${fallback}`);
        }
        return fallback;
    }

    private static normBrand(s: string): string {
        return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    }

    private selectFields(fields: NodeFields): SelectFields {
        const discriminators: Discriminator[] = [];
        const singles: { tag: string; value: string }[] = [];
        let brand: SelectFields['brand'] = null;
        for (const field of fields.fields) {
            const tag = field.tag;
            const content = field.content?.[0];
            if (!tag || content?.field_type !== 'select') {
                continue;
            }
            if (CategoryLookup.COMMON_SELECT_TAGS.has(tag)) {
                continue;
            }
            if (tag === 'Brand') {
                brand = { catalog: content.catalog };
                continue;
            }
            if (!content.required) {
                continue;
            }
            if (content.is_catalog) {
                continue;
            }
            const values = fieldValues(content);
            if (values.length > 1) {
                discriminators.push({ tag, values });
            } else if (values.length === 1) {
                singles.push({ tag, value: values[0] as string });
            }
        }
        return { discriminators, singles, brand };
    }

    private numbered(nodes: CategoryNode[]): string {
        return nodes.map((n, idx) => `[${idx + 1}] ${this.pathByNode.get(n) ?? n.name}`).join('\n');
    }

    private singleFromField(fields: NodeFields, tag: string): string | null {
        const content = fields.fields.find((f) => f.tag === tag)?.content?.[0];
        return content ? (fieldValues(content)[0] ?? null) : null;
    }

    private static enumDisplay(values: string[]): string {
        const shown = values.slice(0, CategoryLookup.ENUM_DISPLAY_CAP).join(' | ');
        return values.length > CategoryLookup.ENUM_DISPLAY_CAP ? `${shown} | …` : shown;
    }

    private static summarize(p: ParsedProduct): string {
        const specs = p.specs.map((s) => `${s.label}: ${s.value}`).join('; ');
        const desc = p.description.html
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1500);
        return [
            `Название: ${p.identity.title}`,
            `Бренд: ${p.identity.brand}`,
            `Модель: ${p.identity.model}`,
            p.contents.length ? `Комплектация: ${p.contents.join(', ')}` : '',
            specs ? `Характеристики: ${specs}` : '',
            desc ? `Описание: ${desc}` : '',
        ]
            .filter(Boolean)
            .join('\n');
    }
}
