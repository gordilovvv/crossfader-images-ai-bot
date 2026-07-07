import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';
import { z } from 'zod';
import { buildParts, extractText, genai, parseFirstJson, perf, type RefImage } from './Utils.ts';

// Gemma (текст/vision) — «мозг» по схеме: достаёт объект/параметры со страницы и т.п.
export class Gemma {
    private static readonly MODEL = 'gemma-4-26b-a4b-it';
    private static readonly FALLBACK = 'gemma-4-31b-it';

    private readonly model: string;
    private readonly fallback: string;

    constructor(model: string = Gemma.MODEL, fallback: string = Gemma.FALLBACK) {
        this.model = model;
        this.fallback = fallback;
    }

    async ask(prompt: string, images: RefImage[] = []): Promise<string> {
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: this.model,
            contents: buildParts(prompt, images),
        });
        const text = extractText(resp);
        perf('Gemma', `ask ${text.length}ch`, start);
        return text;
    }

    // Структурированный вывод по Zod-схеме. Схему даём текстом в промпте (responseSchema раздувает выход до MAX_TOKENS
    // и тормозит на этой модели). JSON-mime + parseFirstJson + zod-валидация; 1 ретрай на большую модель, потом fail-fast.
    async askJson<T>(prompt: string, schema: z.ZodType<T>, images: RefImage[] = []): Promise<T> {
        const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
        delete jsonSchema.$schema;
        const shape = `\n\nВерни JSON строго по этой JSON-схеме, без markdown:\n${JSON.stringify(jsonSchema)}`;
        const config: GenerateContentConfig = {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 8192,
        };
        const call = (model: string, extra = '') =>
            genai.models.generateContent({
                model,
                contents: buildParts(prompt + shape + extra, images),
                config,
            });

        const start = process.hrtime.bigint();
        const firstResp = await call(this.model);
        Gemma.assertNotTruncated(firstResp);
        let reason: string;
        try {
            const first = schema.safeParse(parseFirstJson(extractText(firstResp)));
            if (first.success) {
                perf('Gemma', 'askJson', start);
                return first.data;
            }
            reason = `не прошёл валидацию: ${first.error.message}`;
        } catch (err) {
            reason = err instanceof Error ? err.message : String(err);
        }

        const retryResp = await call(
            this.fallback,
            `\nПредыдущий ответ ${reason}. Верни только валидный JSON без markdown.`,
        );
        Gemma.assertNotTruncated(retryResp);
        const data = schema.parse(parseFirstJson(extractText(retryResp)));
        perf('Gemma', 'askJson retry', start);
        return data;
    }

    // Обрыв по лимиту токенов — не ошибка качества: эскалация на большую модель обрежется так же. Fail-fast.
    private static assertNotTruncated(resp: GenerateContentResponse): void {
        if (resp.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            throw new Error(
                '[AI] ответ обрезан по maxOutputTokens — сократи схему выхода или входные данные',
            );
        }
    }
}
