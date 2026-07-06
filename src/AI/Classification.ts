import { z } from 'zod';
import { extractText, genai, perf } from './Utils.ts';

export const ObjectSize = z.enum(['big', 'small']);
export type ObjectSize = z.infer<typeof ObjectSize>;

// Дешёвая модель: габарит товара (big/small) для композиции картинок; нераспознанное → 'big' (осознанный дефолт)
export class Classification {
    private static readonly MODEL = 'gemini-3.1-flash-lite';
    private static readonly PROMPT =
        `Товар крупногабаритный (пианино, комбоусилитель, барабаны) или небольшой (наушники, педаль, микрофон, кабель)?
Ответь строго одним словом: big или small.

Товар: `;

    async classify(title: string, description = ''): Promise<ObjectSize> {
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: Classification.MODEL,
            contents: `${Classification.PROMPT}${title}\n${description}`.trim(),
        });
        const raw = extractText(resp)
            .toLowerCase()
            .replace(/[^a-z]/g, '');
        perf('Classification', `classify -> ${raw}`, start);

        const parsed = ObjectSize.safeParse(raw);
        if (!parsed.success) {
            console.log(`[Classification] нераспознанный габарит "${raw}", fallback -> big`);
            return 'big';
        }
        return parsed.data;
    }
}
