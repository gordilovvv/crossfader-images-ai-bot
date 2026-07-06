import { type GenerateContentResponse, GoogleGenAI, type Part } from '@google/genai';
import { env } from '../environment.ts';

export const genai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

export type RefImage = { bytes: Buffer; mimeType: string };

export function imagePart(bytes: Buffer, mimeType: string): Part {
    return { inlineData: { data: bytes.toString('base64'), mimeType } };
}

export function buildParts(prompt: string, images: RefImage[]): Part[] {
    return [...images.map((r) => imagePart(r.bytes, r.mimeType)), { text: prompt }];
}

export function extractImage(resp: GenerateContentResponse): Buffer {
    const parts = resp.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
        if (part.inlineData?.data) {
            return Buffer.from(part.inlineData.data, 'base64');
        }
    }
    const text = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(' ');
    throw new Error(`[AI] в ответе нет изображения${text ? `: ${text}` : ''}`);
}

export function extractText(resp: GenerateContentResponse): string {
    const text = resp.text?.trim();
    if (!text) {
        throw new Error('[AI] пустой текстовый ответ модели');
    }
    return text;
}

// Первый сбалансированный {...}: Gemma иногда дописывает мусор после JSON, наивный parse ломается
export function parseFirstJson(text: string): unknown {
    const cleaned = text.replace(/```json|```/g, '');
    const start = cleaned.indexOf('{');
    if (start === -1) {
        throw new Error('[AI] в ответе нет JSON-объекта');
    }
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (inStr) {
            if (esc) {
                esc = false;
            } else if (c === '\\') {
                esc = true;
            } else if (c === '"') {
                inStr = false;
            }
        } else if (c === '"') {
            inStr = true;
        } else if (c === '{') {
            depth++;
        } else if (c === '}' && --depth === 0) {
            return JSON.parse(cleaned.slice(start, i + 1));
        }
    }
    throw new Error('[AI] незакрытый JSON-объект в ответе');
}

export function perf(tag: string, op: string, start: bigint): void {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[${tag}] ${op} ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`);
}
