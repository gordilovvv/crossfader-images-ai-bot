import { readFileSync, writeFileSync } from "node:fs";
import {
  type AvitoApi,
  type CategoryNode,
  type NodeFields,
  walkLeaves,
} from "./AvitoApi.ts";

// Офлайн-снапшот справочника Avito: дерево категорий + поля всех листьев с уже вшитыми enum-значениями.
// Строится редко (rebuild-скрипт), при classify читается из памяти — ноль HTTP к Avito.
export type Snapshot = {
  tree: CategoryNode[];
  fields: Record<string, NodeFields>;
};

export class CategorySnapshot {
  private static readonly CONCURRENCY = 6;
  private static readonly RETRIES = 2;

  static loadFile(path: string): Snapshot {
    const snapshot = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
    if (!snapshot.tree?.length || !snapshot.fields) {
      throw new Error(`[CategorySnapshot] пустой или битый снапшот: ${path}`);
    }
    // Инвариант fail-fast: каждый лист дерева обязан иметь поля. Иначе при classify лист молча выпал бы из кандидатов.
    const missing = walkLeaves(snapshot.tree).filter(
      (n) => !snapshot.fields[n.slug as string],
    );
    if (missing.length > 0) {
      throw new Error(
        `[CategorySnapshot] в снапшоте нет полей для ${missing.length} листьев (напр. ${missing[0]?.slug}) — пересобери`,
      );
    }
    return snapshot;
  }

  static writeFile(path: string, snapshot: Snapshot): void {
    writeFileSync(path, JSON.stringify(snapshot));
  }

  // Скачивает дерево + поля каждого листа, резолвит values_link_json в inline-значения. Тяжёлый разовый джоб.
  static async build(api: AvitoApi): Promise<Snapshot> {
    const start = process.hrtime.bigint();
    const tree = await api.tree();
    const leaves = walkLeaves(tree)
      .map((n) => n.slug)
      .filter((s): s is string => Boolean(s));
    const fields: Record<string, NodeFields> = {};

    let done = 0;
    await CategorySnapshot.mapLimit(
      leaves,
      CategorySnapshot.CONCURRENCY,
      async (slug) => {
        const nf = await CategorySnapshot.withRetry(() => api.nodeFields(slug));
        fields[slug] = await CategorySnapshot.slimFields(nf, api);
        done++;
        if (done % 200 === 0) {
          console.log(`[CategorySnapshot] fields ${done}/${leaves.length}`);
        }
      },
    );

    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[CategorySnapshot] build ${leaves.length} leaves ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
    );
    return { tree, fields };
  }

  // Для классификации нужны только select-поля. У catalog-полей (Brand/Model — тысячи значений) значения выкидываем: Brand
  // берётся passthrough из парсера, а сам факт catalog-поля отражаем флагом. Остальным select'ам резолвим values_link в inline.
  private static async slimFields(
    nf: NodeFields,
    api: AvitoApi,
  ): Promise<NodeFields> {
    const fields: NodeFields["fields"] = [];
    for (const field of nf.fields) {
      const tag = field.tag;
      const content = field.content?.[0];
      const keep = tag === "Category" || tag === "GoodsType";
      if (
        !content ||
        (content.field_type !== "select" && !content.is_catalog && !keep)
      ) {
        continue;
      }
      const isCatalog =
        !keep && (content.is_catalog === true || tag === "Brand");
      if (isCatalog) {
        fields.push({
          tag,
          content: [{ field_type: "select", is_catalog: true }],
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
        content: [{ field_type: "select", is_catalog: false, values }],
      });
    }
    return { node: nf.node, fields };
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
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (cursor < items.length) {
          const item = items[cursor++];
          if (item !== undefined) {
            await fn(item);
          }
        }
      },
    );
    await Promise.all(workers);
  }
}
