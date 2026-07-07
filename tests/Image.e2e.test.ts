import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { RefImage } from '../src/AI/Utils.ts';
import { ImageGeneration, type ProductData } from '../src/Image/ImageGeneration.ts';
import { imageExt, measure, saveArtifact } from './helpers/e2e.ts';

test('e2e: ImageGeneration — ProductData + фото → 6 карточек с текстом/графикой [paid]', async () => {
    const product = JSON.parse(
        readFileSync(new URL('./fixtures/product-ca701.json', import.meta.url), 'utf8'),
    ) as ProductData;
    const raw = readFileSync(new URL('./refs/raw.png', import.meta.url));
    const photo: RefImage = { bytes: raw, mimeType: 'image/png' };

    const { result: cards } = await measure('generate 6 карточек', () =>
        new ImageGeneration().generate(product, photo),
    );

    assert.equal(cards.length, 6, 'ждём ровно 6 карточек');
    assert.deepEqual(
        cards.map((c) => c.slot),
        [1, 2, 3, 4, 5, 6],
        'слоты по порядку 1..6',
    );

    for (const card of cards) {
        const ext = imageExt(card.image);
        assert.ok(ext, `слот ${card.slot} (${card.name}): не PNG/JPEG`);
        assert.ok(
            card.image.length > 10000,
            `слот ${card.slot} (${card.name}): картинка подозрительно мала ${card.image.length}b`,
        );
        await saveArtifact(`card-${card.slot}-${card.name}.${ext}`, card.image);
    }
});
