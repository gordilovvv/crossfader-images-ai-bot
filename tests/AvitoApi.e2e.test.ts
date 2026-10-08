import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AvitoApi } from '../src/XMLFeedAvito/api/AvitoApi.ts';
import { measure } from './helpers/e2e.ts';

// Справочник брендов Avito с зеркала autoload.avito.ru: плоский каталог и вложенный (бренд → серия → модель).
test('e2e: AvitoApi.catalogValues — плоский каталог звукового оборудования → бренды верхнего уровня', async () => {
    const { result } = await measure('catalog zvukovoe', () =>
        new AvitoApi().catalogValues('lifestyle_katalog_brendov_zvukovoe_i_djoborudovanie'),
    );
    assert.ok(result.length > 100, `слишком мало брендов: ${result.length}`);
    for (const v of ['Yamaha', 'Allen&Heath', 'Без бренда', 'Другой']) {
        assert.ok(result.includes(v), `нет ${v}`);
    }
});

test('e2e: AvitoApi.catalogValues — вложенный каталог гитар → только бренды, без серий и моделей', async () => {
    const { result } = await measure('catalog gitary', () =>
        new AvitoApi().catalogValues('brendy_gitar'),
    );
    assert.ok(result.includes('Yamaha') && result.includes('Другой'));
    assert.ok(
        !result.includes('Leaf') && !result.includes('ALP-863'),
        'серия/модель протекли в бренды',
    );
    assert.equal(new Set(result).size, result.length, 'дубликаты брендов');
});

test('e2e: AvitoApi.catalogName — имя файла из values_link_xml; чужая ссылка → throw', () => {
    assert.equal(
        AvitoApi.catalogName('https://avito.ru/web/1/catalogs/content/feed/brendy_gitar.xml'),
        'brendy_gitar',
    );
    assert.throws(
        () => AvitoApi.catalogName('https://avito.ru/web/1/catalogs/x'),
        /неожиданная ссылка/,
    );
});

test('e2e: AvitoApi.catalogValues — несуществующий каталог → throw со статусом', async () => {
    await assert.rejects(
        () => new AvitoApi().catalogValues('net_takogo_kataloga_123'),
        /catalog\(net_takogo_kataloga_123\) 404/,
    );
});
