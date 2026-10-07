import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { RefImage } from '../src/AI/Utils.ts';
import { type CardImage, ImageGeneration, type ProductData } from '../src/Image/ImageGeneration.ts';
import { Prompts } from '../src/Image/Promts.ts';
import { imageExt, measure, saveArtifact } from './helpers/e2e.ts';

function fixture(name: string): ProductData {
    return JSON.parse(
        readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
    ) as ProductData;
}

function photo(file: string): RefImage {
    return {
        bytes: readFileSync(new URL(`./refs/${file}`, import.meta.url)),
        mimeType: 'image/png',
    };
}

async function assertCards(prefix: string, cards: CardImage[], slots: number[]) {
    assert.deepEqual(
        cards.map((c) => c.slot),
        slots,
        'набор и порядок слотов',
    );
    for (const card of cards) {
        const ext = imageExt(card.image);
        assert.ok(ext, `слот ${card.slot} (${card.name}): не PNG/JPEG`);
        assert.ok(
            card.image.length > 10000,
            `слот ${card.slot} (${card.name}): картинка подозрительно мала ${card.image.length}b`,
        );
        await saveArtifact(`${prefix}-card-${card.slot}-${card.name}.${ext}`, card.image);
    }
}

test('e2e: Prompts — блок фактов товара подставлен в слоты 2/3, остальные без изменений', () => {
    const prompts = Prompts.build(fixture('product-audac'));
    for (const p of prompts) {
        assert.doesNotMatch(p.prompt, /\{\{PRODUCT\}\}/, `слот ${p.slot}: плейсхолдер не заменён`);
    }
    for (const slot of [2, 3]) {
        const p = prompts[slot - 1]!.prompt;
        assert.match(p, /placement: wall/, `слот ${slot}: нет placement`);
        assert.match(p, /24\.4×42\.5×25\.6 cm/, `слот ${slot}: нет габаритов`);
        assert.match(p, /shoebox/, `слот ${slot}: нет якоря высоты`);
        assert.match(
            p,
            /markings remain exactly as in the reference photo[^\n]*$/,
            `слот ${slot}: бейдж не последней строкой`,
        );
    }
    for (const slot of [1, 4]) {
        assert.doesNotMatch(
            prompts[slot - 1]!.prompt,
            /PRODUCT FACTS/,
            `слот ${slot}: лишний блок`,
        );
    }
});

test('e2e: ImageGeneration — пианино (floor) → 5 карточек [paid]', async () => {
    const { result: cards } = await measure('generate KAWAI', () =>
        new ImageGeneration().generate(fixture('product-ca701'), photo('raw.png')),
    );
    await assertCards('kawai', cards, [1, 2, 3, 4, 5]);
});

test('e2e: ImageGeneration — настенная колонка (wall) → 5 карточек [paid]', async () => {
    const { result: cards } = await measure('generate AUDAC', () =>
        new ImageGeneration().generate(fixture('product-audac'), photo('raw-audac.png')),
    );
    await assertCards('audac', cards, [1, 2, 3, 4, 5]);
});
