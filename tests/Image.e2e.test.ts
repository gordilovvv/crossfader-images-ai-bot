import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { RefImage } from '../src/AI/Utils.ts';
import { ImageGeneration } from '../src/Image/ImageGeneration.ts';
import { imageExt, measure, saveArtifact } from './helpers/e2e.ts';

test('e2e: ImageGeneration — из фото товара → 5 фонов-карточек [paid]', async () => {
    const raw = readFileSync(new URL('./refs/raw.png', import.meta.url));
    const product: RefImage = { bytes: raw, mimeType: 'image/png' };

    const { result: cards } = await measure('generate 5 фонов', () =>
        new ImageGeneration().generate(product),
    );

    assert.equal(cards.length, 5, 'ждём ровно 5 карточек (6-я общая не генерится)');

    for (const card of cards) {
        const ext = imageExt(card.image);
        assert.ok(ext, `слот ${card.slot} (${card.name}): ответ не PNG/JPEG`);
        assert.ok(
            card.image.length > 10000,
            `слот ${card.slot} (${card.name}): картинка подозрительно мала ${card.image.length}b`,
        );
        await saveArtifact(`image-${card.name}.${ext}`, card.image);
    }
});
