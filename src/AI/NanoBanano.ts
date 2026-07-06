import { buildParts, extractImage, genai, perf, type RefImage } from './Utils.ts';

// Google flash images (gemini-3.1-flash-image): генерит сцену по промпту, опц. правит референсы (image-to-image)
export class NanoBanano {
    private static readonly MODEL = 'gemini-3.1-flash-image';

    async generate(prompt: string, refs: RefImage[] = []): Promise<Buffer> {
        const start = process.hrtime.bigint();
        const resp = await genai.models.generateContent({
            model: NanoBanano.MODEL,
            contents: buildParts(prompt, refs),
        });
        const image = extractImage(resp);
        perf('NanoBanano', `generate ${image.length}b`, start);
        return image;
    }
}
