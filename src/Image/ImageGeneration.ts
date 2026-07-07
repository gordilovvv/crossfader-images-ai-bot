import { NanoBanano } from '../AI/NanoBanano.ts';
import type { RefImage } from '../AI/Utils.ts';
import { loadCardPrompts } from './Promts.ts';

export type CardImage = { slot: number; name: string; image: Buffer };

// TODO: слот 2 — читаемость текста на светлом паркете решать тёмным scrim'ом кодом (не промптом)
export class ImageGeneration {
    private static readonly BACKGROUND_SLOTS = 5; // 6-я карточка общая, товар в ней не участвует

    private readonly nano = new NanoBanano();
    private readonly prompts = loadCardPrompts().slice(0, ImageGeneration.BACKGROUND_SLOTS);

    async generate(product: RefImage): Promise<CardImage[]> {
        const cards: CardImage[] = [];
        for (const card of this.prompts) {
            const image = await this.nano.generate(card.prompt, [product]);
            cards.push({ slot: card.slot, name: card.name, image });
        }
        return cards;
    }
}
