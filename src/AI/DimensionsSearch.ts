import { z } from 'zod';
import type { Dimensions } from '../Parser/Utils.ts';
import { genai, parseFirstJson, perf } from './Utils.ts';

// Габариты/вес товара через Gemini с Google-поиском. Фолбэк, когда у поставщика их нет на странице.
export class DimensionsSearch {
    private static readonly MODEL = 'gemini-3.8-flash';
    private static readonly SCHEMA = z.object({
        w: z.number().nonnegative(),
        h: z.number().nonnegative(),
        d: z.number().nonnegative(),
        weightKg: z.number().nonnegative(),
    });
    private static readonly PROMPT = (title: string) =>
        `Найди официальные габариты и вес ТОЧНО для модели "${title}" по результатам поиска (сайт производителя приоритетнее магазинов).
Правила:
- Ширина (W), высота (H), глубина (D) — в сантиметрах, вес — в килограммах. Миллиметры переводи в см, дюймы в см, фунты в кг.
- Внимательно сопоставь оси: производители пишут и W×H×D, и H×W×D — смотри подписи, не порядок.
- Бери только значения, прямо подтверждённые для этого точного обозначения модели. Нет данных или модель не найдена — 0 в этом поле. Категорически НЕ переноси значения с других моделей линейки.
Строго JSON: {"w": 26.5, "h": 16.5, "d": 18, "weightKg": 3.2}. Только JSON.`;

    /** Дозаполняет нулевые поля; если всё уже есть — без вызова. */
    async fill(dims: Dimensions, title: string): Promise<Dimensions> {
        const missing = (['w', 'h', 'd', 'weightKg'] as const).filter((k) => !(dims[k] > 0));
        if (missing.length === 0 || !title.trim()) {
            return dims;
        }
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: DimensionsSearch.MODEL,
            contents: DimensionsSearch.PROMPT(title),
            // grounding несовместим с responseSchema — JSON парсим руками
            config: { tools: [{ googleSearch: {} }] },
        });
        const found = DimensionsSearch.SCHEMA.parse(parseFirstJson(resp.text ?? ''));
        const out = { ...dims };
        for (const k of missing) {
            out[k] = found[k];
        }
        perf(
            'DimensionsSearch',
            `${title} -> ${out.w}×${out.h}×${out.d} см, ${out.weightKg} кг`,
            start,
        );
        return out;
    }
}
