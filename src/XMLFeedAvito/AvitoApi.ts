import { z } from "zod";
import { env } from "../environment.ts";

// Узел дерева категорий Avito. slug есть у каждого узла, но fields отдаёт только истинный лист (без nested).
export type CategoryNode = {
  name: string;
  slug?: string | undefined;
  nested?: CategoryNode[] | undefined;
};

export type FieldContent = {
  field_type?: "input" | "select" | "checkbox" | undefined;
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

export class AvitoApi {
  private static readonly BASE = "https://api.avito.ru";
  private static readonly TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

  private static readonly CategoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(
    () =>
      z.object({
        name: z.string(),
        slug: z.string().optional(),
        nested: z.array(AvitoApi.CategoryNodeSchema).optional(),
      }),
  );
  private static readonly TreeOut = z.object({
    categories: z.array(AvitoApi.CategoryNodeSchema),
  });
  private static readonly FieldValue = z
    .object({ value: z.string().optional() })
    .loose();
  private static readonly FieldContentSchema = z
    .object({
      field_type: z.enum(["input", "select", "checkbox"]).optional(),
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

  private token: { value: string; expiresAt: number } | null = null;

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.AVITO_CLIENT_ID,
      client_secret: env.AVITO_CLIENT_SECRET,
    });
    const res = await fetch(`${AvitoApi.BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

  async tree(): Promise<CategoryNode[]> {
    const res = await this.get("/autoload/v1/user-docs/tree");
    if (!res.ok) {
      throw new Error(`[AvitoApi] tree ${res.status}: ${await res.text()}`);
    }
    return AvitoApi.TreeOut.parse(await res.json()).categories;
  }

  async nodeFields(slug: string): Promise<NodeFields> {
    const res = await this.get(`/autoload/v1/user-docs/node/${slug}/fields`);
    if (!res.ok) {
      throw new Error(
        `[AvitoApi] fields(${slug}) ${res.status}: ${await res.text()}`,
      );
    }
    return AvitoApi.FieldsOut.parse(await res.json());
  }

  // Значения select-поля, вынесенные в отдельную ручку (values_link_json). Тот же формат: {values:[{value}]}.
  async valuesFromLink(url: string): Promise<string[]> {
    const path = url.replace(AvitoApi.BASE, "");
    const res = await this.get(path);
    if (!res.ok) {
      throw new Error(
        `[AvitoApi] values(${path}) ${res.status}: ${await res.text()}`,
      );
    }
    const parsed = z
      .object({ values: z.array(AvitoApi.FieldValue) })
      .parse(await res.json());
    return parsed.values
      .map((v) => v.value)
      .filter((v): v is string => Boolean(v));
  }
}
