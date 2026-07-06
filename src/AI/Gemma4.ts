import type { GenerateContentConfig, Schema } from '@google/genai';
import { z } from 'zod';
import { buildParts, extractText, genai, parseFirstJson, perf, type RefImage } from './Utils.ts';

// Gemma (текст/vision) — «мозг» по схеме: достаёт объект/параметры со страницы и т.п.
export class Gemma {
    private static readonly MODEL = 'gemma-4-26b-a4b-it';
    private static readonly FALLBACK = 'gemma-4-31b-it';

    async ask(prompt: string, images: RefImage[] = []): Promise<string> {
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: Gemma.MODEL,
            contents: buildParts(prompt, images),
        });
        const text = extractText(resp);
        perf('Gemma', `ask ${text.length}ch`, start);
        return text;
    }

    // Структурированный вывод по Zod-схеме. 1 ретрай с эскалацией на большую модель, потом fail-fast.
    async askJson<T>(prompt: string, schema: z.ZodType<T>, images: RefImage[] = []): Promise<T> {
        const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
        delete jsonSchema.$schema;
        const config: GenerateContentConfig = {
            responseMimeType: 'application/json',
            responseSchema: jsonSchema as unknown as Schema,
            temperature: 0,
            maxOutputTokens: 2048,
        };
        const call = (model: string, extra = '') =>
            genai.models.generateContent({
                model,
                contents: buildParts(prompt + extra, images),
                config,
            });

        const start = process.hrtime.bigint();
        const first = schema.safeParse(parseFirstJson(extractText(await call(Gemma.MODEL))));
        if (first.success) {
            perf('Gemma', 'askJson', start);
            return first.data;
        }

        const retry = await call(
            Gemma.FALLBACK,
            `\nПредыдущий ответ не прошёл валидацию: ${first.error.message}. Верни только исправленный JSON.`,
        );
        const data = schema.parse(parseFirstJson(extractText(retry)));
        perf('Gemma', 'askJson retry', start);
        return data;
    }
}
