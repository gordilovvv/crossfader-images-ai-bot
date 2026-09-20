import * as XLSX from "xlsx";
import { perf } from "../AI/Utils.ts";

// Строка all.xlsx: заголовки листа = XML-теги Avito, values — все колонки как есть (для фида).
export type AvitoProduct = {
  id: string;
  avitoId: string;
  title: string;
  price: string;
  values: Record<string, string>;
};

// Существующие бъявления на Avito. Тянется на каждую генерацию, в памяти не живёт.
export class AvitoProducts {
  // U+2060 WORD JOINER ломает Avito-описания — вычищаем при разборе (унаследовано от первой версии).
  private static readonly WORD_JOINER_RE = /⁠/g;

  readonly items: AvitoProduct[];

  private constructor(items: AvitoProduct[]) {
    this.items = items;
  }

  static parse(xlsx: Buffer): AvitoProducts {
    const start = process.hrtime.bigint();
    const workbook = XLSX.read(xlsx, { type: "buffer", raw: false });
    const name = workbook.SheetNames[0];
    const sheet = name ? workbook.Sheets[name] : undefined;
    if (!sheet) {
      throw new Error("[AvitoProducts] в all.xlsx нет листов");
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    const items: AvitoProduct[] = [];
    for (const row of rows) {
      const values: Record<string, string> = {};
      for (const [tag, raw] of Object.entries(row)) {
        const value = String(raw)
          .replace(AvitoProducts.WORD_JOINER_RE, "")
          .trim();
        if (value) {
          values[tag.trim()] = value;
        }
      }
      if (!values.Id) {
        continue;
      }
      items.push({
        id: values.Id,
        avitoId: values.AvitoId ?? "",
        title: values.Title ?? "",
        price: values.Price ?? "",
        values,
      });
    }
    if (items.length === 0) {
      throw new Error("[AvitoProducts] в all.xlsx нет ни одной строки с Id");
    }
    perf("AvitoProducts", `parse ${items.length} объявлений`, start);
    return new AvitoProducts(items);
  }

  // Ссылка на Avito ведёт на объявление, число в конце URL — его AvitoId.
  byAvitoId(avitoId: string): AvitoProduct | null {
    return this.items.find((it) => it.avitoId === avitoId) ?? null;
  }
}
