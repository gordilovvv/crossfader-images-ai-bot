import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ProductData } from '../src/Image/ImageGeneration.ts';
import { ProductDescription } from '../src/XMLFeedAvito/ProductDescription.ts';
import { assertBudget, measure, saveArtifact } from './helpers/e2e.ts';

const product = JSON.parse(
    readFileSync(new URL('./fixtures/product-ca701.json', import.meta.url), 'utf8'),
) as ProductData;
const category = {
    slug: 'pianino_royali_organy',
    category: 'Музыкальные инструменты',
    goodsType: 'Клавишные и синтезаторы',
    attrs: {},
};

test('e2e: ProductDescription.write — шаблон описания: эмодзи по категории, товарная часть от модели, футер магазина', async () => {
    const { result: ad, ms } = await measure('ProductDescription.write', () =>
        new ProductDescription().write(product, category),
    );
    await saveArtifact('description-ca701.html', ad.html);

    assert.equal(ad.title, 'Kawai CA701');
    assert.match(
        ad.html,
        /^<p>🎹 <strong>Kawai CA701 — [а-яё][^<]+\.<\/strong><\/p> <p><strong>Новый, оригинальный/,
    );
    assert.match(
        ad.html,
        /<p><strong>🔥 Kawai CA701<\/strong><\/p> <p>▪️ тип: [^<]+(<br\/> ▪️ [^<]+: [^<]+){1,5}<\/p> <p>⠀<\/p> <p>[^<]+<\/p> <p>⠀<\/p> <p>Подойдет для:<\/p> <p>✓ /,
    );
    assert.match(
        ad.html,
        /ПОЧЕМУ ЗАКАЗЫВАЮТ У НАС[\s\S]*ДОСТАВКА ПО РОССИИ[\s\S]*▪️ <strong>КИТ<\/strong>[\s\S]*💳 ОПЛАТА[\s\S]*📩 <strong>Напишите нам — /,
    );
    assert.doesNotMatch(ad.html, /▪️ ▪️|✓ ✓|<p><\/p>/);
    assert.doesNotMatch(
        ad.html,
        /[^&]<(?!\/?(p|br\/|strong)>)/,
        'в тексте нет неэкранированных тегов',
    );
    assert.ok(ad.html.length < 7500, `Description ${ad.html.length} символов`);
    assertBudget(ms, 20_000, 'ProductDescription.write');
});

test('e2e: ProductDescription.write — товар без бренда и модели => ошибка, не пустой Title (негативная ветка)', async () => {
    const empty = { ...product, identity: { ...product.identity, brand: '', model: '' } };

    await assert.rejects(new ProductDescription().write(empty, category), /пустой Title/);
});
