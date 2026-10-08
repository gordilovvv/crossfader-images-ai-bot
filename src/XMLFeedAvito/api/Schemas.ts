import { z } from 'zod';

// Узел дерева категорий Avito. slug есть у каждого узла, но fields отдаёт только истинный лист (без nested).
export type CategoryNode = {
    name: string;
    slug?: string | undefined;
    nested?: CategoryNode[] | undefined;
};

export const CategoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
    z.object({
        name: z.string(),
        slug: z.string().optional(),
        nested: z.array(CategoryNodeSchema).optional(),
    }),
);

export type FieldContent = {
    field_type?: 'input' | 'select' | 'checkbox' | undefined;
    is_catalog?: boolean | undefined;
    values?: { value?: string | undefined }[] | undefined;
    values_link_json?: string | null | undefined;
    values_link_xml?: string | null | undefined;
    catalog?: string | undefined;
    required?: boolean | undefined;
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

export function fieldValues(content: FieldContent): string[] {
    return (content.values ?? []).map((v) => v.value).filter((v): v is string => Boolean(v));
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
export type Section = { slug: string; count: number; sections?: Section[] | undefined };
export const SectionSchema: z.ZodType<Section> = z.lazy(() =>
    z.object({ slug: z.string(), count: z.number(), sections: z.array(SectionSchema).optional() }),
);

export type AutoloadProfile = z.infer<typeof ProfileSchema>;
export type AutoloadReport = { id: number; status: z.infer<typeof ReportStatusSchema> };
// Счётчики дерева section_stats по slug: sections_stats (всего), successful, error, not_publish…
export type ReportStats = Record<string, number>;
export type AutoloadItem = z.infer<typeof ItemSchema>;
