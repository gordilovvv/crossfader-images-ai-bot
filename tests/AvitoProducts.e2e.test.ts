import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AvitoProducts } from '../src/XMLFeedAvito/AvitoProducts.ts';
import { assertBudget, measure } from './helpers/e2e.ts';

const XLSX = readFileSync(new URL('./fixtures/all.xlsx', import.meta.url));

test('e2e: AvitoProducts.parse — all.xlsx (2127 строк) укладывается в бюджет', async () => {
    const { result: catalog, ms } = await measure('AvitoProducts.parse', () =>
        AvitoProducts.parse(XLSX),
    );

    assert.ok(catalog.items.length > 2000, `строк: ${catalog.items.length}`);
    assert.ok(catalog.items.every((it) => it.id && it.values.Id === it.id));
    assertBudget(ms, 3000, 'AvitoProducts.parse');
});

test('e2e: AvitoProducts.byAvitoId — находит строку по номеру объявления', () => {
    const hit = AvitoProducts.parse(XLSX).byAvitoId('7450027995');

    assert.ok(hit);
    assert.equal(hit.title, 'Yamaha HS3');
    assert.match(hit.price, /^\d+$/);
});

test('e2e: AvitoProducts.byAvitoId — незнакомый номер => null (негативная ветка)', () => {
    assert.equal(AvitoProducts.parse(XLSX).byAvitoId('1'), null);
    assert.equal(AvitoProducts.parse(XLSX).byAvitoId(''), null);
});

test('e2e: AvitoProducts.parse — пустой/мусорный буфер => ошибка, а не пустой каталог (негативная ветка)', () => {
    assert.throws(() => AvitoProducts.parse(Buffer.alloc(0)), /нет ни одной строки/);
    assert.throws(() => AvitoProducts.parse(Buffer.from('not an xlsx')), /нет ни одной строки/);
});
