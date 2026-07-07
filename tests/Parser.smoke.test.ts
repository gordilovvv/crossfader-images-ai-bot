import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assembleCandidates, parseJsonLdProduct } from '../src/Parser/Utils.ts';

// Оффлайн-смок выявления кандидатов-картинок: сырьё из fixtures (без сети/Gemma), чистая логика assembleCandidates.
// Ловит регрессию фильтра/дедупа. Дрейф вёрстки сайта ловит живой e2e (Parser.e2e), не этот тест.
function candidateUrls(slug: string): string[] {
    const raw = JSON.parse(
        readFileSync(new URL(`./fixtures/raw-${slug}.json`, import.meta.url), 'utf8'),
    );
    const product = parseJsonLdProduct(raw.snap.jsonLd);
    return assembleCandidates(product.images, raw.snap.ogImage, raw.snap.domImages).map(
        (c) => c.url,
    );
}

// По подстроке пути, не полному URL (устойчиво к смене ресайза/CDN-хэша). recall и precision раздельно.
const CASES = [
    {
        slug: 'ymusic',
        recall: ['img_ca701_bb', 'img_ca701_slide'],
        precision: ['/50/50/', 'fifa', 'logo', 'guaranty', 'payment'],
    },
    {
        slug: 'stepline',
        recall: ['314ce12a', 'ac8d81ad'],
        precision: ['fifa', 'guaranty', 'payment', 'favicon'],
    },
];

for (const c of CASES) {
    test(`smoke: Parser кандидаты — ${c.slug} recall (фото товара не потеряны)`, () => {
        const urls = candidateUrls(c.slug);
        for (const sub of c.recall) {
            assert.ok(
                urls.some((u) => u.includes(sub)),
                `recall: фото товара "${sub}" пропало из кандидатов`,
            );
        }
    });

    test(`smoke: Parser кандидаты — ${c.slug} precision (мусор отфильтрован)`, () => {
        const urls = candidateUrls(c.slug);
        for (const sub of c.precision) {
            assert.ok(
                !urls.some((u) => u.includes(sub)),
                `precision: мусор "${sub}" просочился в кандидаты`,
            );
        }
    });
}

test('smoke: Parser кандидаты — дедуп по файлу (нет размерных дублей)', () => {
    const urls = candidateUrls('ymusic');
    const keys = urls.map((u) => (u.split('?')[0] ?? u).split('/').pop());
    assert.equal(keys.length, new Set(keys).size, 'один файл попал в кандидаты в разных размерах');
});
