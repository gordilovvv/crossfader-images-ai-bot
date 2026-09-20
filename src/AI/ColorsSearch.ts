import { z } from 'zod';
import { genai, parseFirstJson, perf } from './Utils.ts';

// Цвета отделки товара через Gemini с Google-поиском. Фолбэк, когда парсер цвет не нашёл.
export class ColorsSearch {
    private static readonly MODEL = 'gemini-3.8-flash';
    private static readonly SCHEMA = z.object({ colors: z.array(z.string().min(1)) });
    private static readonly PROMPT = (title: string) =>
        `Определи официальные цвета отделки корпуса ТОЧНО для модели "${title}" по результатам поиска.
Правила:
- Используй только цвета, прямо подтверждённые для этого точного обозначения модели на страницах производителя/магазинов.
- Если точное обозначение модели не встречается в результатах поиска, или это несуществующая/незнакомая модель — верни {"colors": []}. Категорически НЕ переноси цвета с других моделей той же линейки/бренда.
Формат: базовые названия на английском с заглавной (Black, White, Rosewood...), оттенки одного цвета объединяй (Satin Black, Ebony Polish -> Black).
Строго JSON: {"colors": ["Black"]} или {"colors": []}. Только JSON.`;

    async search(title: string): Promise<string[]> {
        if (!title.trim()) {
            return [];
        }
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: ColorsSearch.MODEL,
            contents: ColorsSearch.PROMPT(title),
            // grounding несовместим с responseSchema — JSON парсим руками
            config: { tools: [{ googleSearch: {} }] },
        });
        const { colors } = ColorsSearch.SCHEMA.parse(parseFirstJson(resp.text ?? ''));
        const unique = [...new Set(colors.map((c) => c.trim()))].filter(Boolean);
        perf('ColorsSearch', `${title} -> [${unique.join(', ')}]`, start);
        return unique;
    }
}
