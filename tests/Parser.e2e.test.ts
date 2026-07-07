import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser } from '../src/Parser/Browser.ts';
import type { ParsedProduct } from '../src/Parser/Parser.ts';
import { Parser } from '../src/Parser/Parser.ts';
import { measure, saveArtifact } from './helpers/e2e.ts';

const YMUSIC =
    'https://ymusic.kz/klavishnye-instrumenty/cifrovye-pianino-i-royali/interernye-cifrovye-pianino/ca-701-b/';
const STEPLINE = 'https://stepline.kz/products/nastennaya_akustika_audac_vexo108_b/';

// Фото-мусор: SEO-меты, чужие товары/иконки. Проверяем именно ВЫБОР Gemma (кандидаты-мусор — отдельный слой, smoke).
function assertCleanImages(urls: string[], junk: RegExp) {
    assert.ok(urls.length > 0, 'нет фото товара');
    assert.ok(urls.length <= 10, 'больше 10 фото');
    for (const u of urls) {
        assert.match(u, /^https?:\/\//, `URL не абсолютный: ${u}`);
        assert.doesNotMatch(u, junk, `в фото товара просочился мусор/чужой товар: ${u}`);
    }
}

// Описание должно быть настоящим on-page текстом, а не SEO-болванкой: длина + предметный маркер товара.
function assertRealDescription(html: string, marker: RegExp) {
    assert.ok(html.length > 120, `описание слишком короткое (SEO-обрезок?): "${html}"`);
    assert.match(html, marker, 'описание не содержит предметных фактов о товаре');
}

// dimensions — P0 задачи (единицы!). Для этих товаров габариты и вес указаны на странице.
function assertDimensions(d: ParsedProduct['dimensions']) {
    assert.ok(d.w > 0 && d.h > 0 && d.d > 0, `неполные габариты: ${JSON.stringify(d)}`);
    assert.ok(d.weightKg > 0, 'нет веса');
    assert.match(d.unit, /см|мм/, `неожиданная единица: ${d.unit}`);
}

test('e2e: Parser — ymusic KAWAI CA701 → факты со страницы [paid]', async () => {
    const browser = new Browser();
    try {
        const { result } = await measure('parseUrl ymusic', () =>
            new Parser(browser).parseUrl(YMUSIC),
        );
        await saveArtifact('parser-ymusic.json', JSON.stringify(result, null, 2));

        assert.equal(result.source.url, YMUSIC);
        assert.match(result.identity.brand, /kawai/i, 'бренд не KAWAI');
        assert.match(result.identity.model, /ca[\s-]?701/i, 'модель не CA701');
        assert.ok(result.identity.title.length > 0, 'пустой title');
        assert.ok(result.specs.length > 0, 'нет характеристик');
        assertCleanImages(result.images.source, /ydp|rp30|cx102|fifa|logo|banner/i);
        assertDimensions(result.dimensions);
        assertRealDescription(result.description.html, /динамик|акустическ|клавиш|Kawai/i);
    } finally {
        await browser.close();
    }
});

test('e2e: Parser — stepline AUDAC (другой поставщик) [paid]', async () => {
    const browser = new Browser();
    try {
        const { result } = await measure('parseUrl stepline', () =>
            new Parser(browser).parseUrl(STEPLINE),
        );
        await saveArtifact('parser-stepline.json', JSON.stringify(result, null, 2));

        assert.match(result.identity.brand, /audac/i, 'бренд не AUDAC');
        assertCleanImages(result.images.source, /fifa|logo|banner|ytimg|favicon/i);
        assertDimensions(result.dimensions);
        assertRealDescription(result.description.html, /VEXO|громкоговор|динамик|Вт|мощност/i);
    } finally {
        await browser.close();
    }
});

test('e2e: Parser — недостижимый хост падает (fail-fast)', async () => {
    const browser = new Browser();
    try {
        await assert.rejects(() =>
            new Parser(browser).parseUrl('https://no-such-host-xyz.invalid/product/'),
        );
    } finally {
        await browser.close();
    }
});
