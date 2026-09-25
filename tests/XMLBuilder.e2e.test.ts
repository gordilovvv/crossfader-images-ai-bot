import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Listing } from '../src/Bot.ts';
import type { ProductData } from '../src/Image/ImageGeneration.ts';
import { type AvitoProduct, AvitoProducts } from '../src/XMLFeedAvito/AvitoProducts.ts';
import { XMLBuilder } from '../src/XMLFeedAvito/XMLBuilder.ts';
import { assertBudget, measure, saveArtifact } from './helpers/e2e.ts';

const S3 =
    'https://f0669e0b-9b5a-4b8b-be0d-f055b6e54f89.selstorage.ru/cards/01K5X7ZQ9J8W1M2N3P4R5S6T7V';

const product = JSON.parse(
    readFileSync(new URL('./fixtures/product-ca701.json', import.meta.url), 'utf8'),
) as ProductData;
const catalog = AvitoProducts.parse(readFileSync(new URL('./fixtures/all.xlsx', import.meta.url)));
const active = catalog.items.filter((it) => it.values.AvitoStatus === 'Активно');
const guitar = active.find((it) => it.values.GuitarType) as AvitoProduct;
const removed = catalog.items.find((it) => it.values.AvitoStatus !== 'Активно') as AvitoProduct;
assert.ok(guitar && removed, 'в all.xlsx нужны активная гитара и снятая строка');

function listing(over: Partial<Listing>): Listing {
    return {
        id: 1,
        url: 'https://kawai.ru/catalog/ca701?color=black&x=1',
        product,
        category: {
            slug: 'pianino_royali_organy',
            category: 'Музыкальные инструменты',
            goodsType: 'Клавишные и синтезаторы',
            attrs: { MusicKeyboards: 'Пианино, рояли, органы', Brand: 'Kawai' },
        },
        description: {
            title: 'Kawai CA701 B',
            html: '<p>🎹 <strong>Kawai CA701 B — цифровое пианино.</strong></p> <p>Клавиатура Grand Feel III &amp; звук SK-EX. Скидки ]]> нет.⁠</p>',
        },
        cards: [],
        imageUrls: [1, 2, 3, 4, 5, 6].map((n) => `${S3}/${n}.png`),
        price: 279_000,
        existing: null,
        ...over,
    };
}

function ads(xml: string): string[] {
    return xml.match(/<Ad>[\s\S]*?<\/Ad>/g) ?? [];
}

function byId(xml: string, id: string): string {
    const ad = ads(xml).filter((a) => a.includes(`<Id>${id}</Id>`));
    assert.equal(ad.length, 1, `объявление ${id} ровно одно`);
    return ad[0] as string;
}

function tiny(items: AvitoProduct[]): AvitoProducts {
    return { items } as AvitoProducts;
}

test('e2e: XMLBuilder.build — all.xlsx (2111 строк) + план (новое, перезапись активной, возврат снятой) => валидный Avito XML', async () => {
    const plan = [
        listing({ id: 1 }),
        listing({ id: 2, url: 'https://ymusic.ru/kawai-ca701', existing: guitar, price: 299_000 }),
        listing({ id: 3, url: 'https://stepline.ru/kawai-ca701', existing: removed }),
    ];

    const { result: xml, ms } = await measure('XMLBuilder.build', () =>
        XMLBuilder.build(catalog, plan),
    );
    const file = await saveArtifact('avito-feed.xml', xml);
    execFileSync('xmllint', ['--noout', file]);

    // Состав: активные как есть + новое + возвращённая снятая; остальные снятые не попали.
    assert.equal(ads(xml).length, active.length + 2);
    assert.ok(
        xml.startsWith(
            '<?xml version="1.0" encoding="UTF-8"?>\n<Ads target="Avito.ru" formatVersion="3">\n',
        ),
    );
    assert.ok(
        !xml.includes('<AvitoStatus>') &&
            !xml.includes('<EMail>') &&
            !xml.includes('<AvitoDateEnd>'),
    );
    assert.ok(!/^ {2}<[A-Za-z]+><\/[A-Za-z]+>$/m.test(xml), 'нет пустых тегов');

    // Нетронутая строка: все колонки как есть, ImageUrls «a|b» → Images, Purpose «a|b» → Option, Description в CDATA.
    const multiImg = active.find(
        (it) => it !== guitar && it.values.ImageUrls?.includes('|') && !it.values.Purpose,
    ) as AvitoProduct;
    const asIs = byId(xml, multiImg.id);
    assert.equal(
        (asIs.match(/<Image url="/g) ?? []).length,
        multiImg.values.ImageUrls?.split('|').length,
    );
    assert.ok(
        asIs.includes(
            `<Description><![CDATA[${multiImg.values.Description?.replace(/​/g, '')}]]></Description>`,
        ),
    );
    const purpose = active.find((it) => it.values.Purpose?.includes('|')) as AvitoProduct;
    assert.match(
        byId(xml, purpose.id),
        /<Purpose>\n( {4}<Option>[^<]+<\/Option>\n){2,} {2}<\/Purpose>/,
    );

    // Перезапись гитары пианино: Id/AvitoId и поля магазина из строки, категорийные теги гитары ушли, всё остальное новое.
    const replaced = byId(xml, guitar.id);
    assert.ok(replaced.includes(`<AvitoId>${guitar.avitoId}</AvitoId>`));
    assert.ok(replaced.includes(`<Address>${guitar.values.Address}</Address>`));
    assert.ok(!replaced.includes('<GuitarType>') && !replaced.includes('<MusicGuitars>'));
    assert.ok(replaced.includes('<GoodsType>Клавишные и синтезаторы</GoodsType>'));
    assert.ok(replaced.includes('<MusicKeyboards>Пианино, рояли, органы</MusicKeyboards>'));
    assert.ok(
        replaced.includes('<Title>Kawai CA701 B</Title>') &&
            replaced.includes('<Price>299000</Price>'),
    );
    assert.ok(!replaced.includes('imageSlug=') && replaced.includes(`<Image url="${S3}/1.png"/>`));
    assert.ok(
        replaced.includes('Скидки ]]]]><![CDATA[> нет.</p>]]></Description>'),
        '«]]>» разбит, WORD JOINER вычищен',
    );

    // Новое: Id — хэш ссылки, без AvitoId, поля магазина дефолтные.
    const fresh = byId(xml, XMLBuilder.adId(plan[0] as Listing));
    assert.match(fresh, /<Id>[0-9a-f]{16}<\/Id>/);
    assert.ok(
        !fresh.includes('<AvitoId>') && fresh.includes('<ContactPhone>79090105007</ContactPhone>'),
    );
    assert.equal((fresh.match(/<Image url="/g) ?? []).length, 6);

    // Снятая строка из плана вернулась со своим Id/AvitoId.
    assert.ok(byId(xml, removed.id).includes(`<AvitoId>${removed.avitoId}</AvitoId>`));

    assertBudget(ms, 1000, 'XMLBuilder.build');
});

test('e2e: XMLBuilder.build — Id строки сменился: существующее находим по AvitoId; повторный publish не дублирует', () => {
    const renamed = { ...guitar, id: 'new-1' };
    const xml = XMLBuilder.build(tiny([guitar, removed]), [listing({ existing: renamed })]);
    assert.equal(ads(xml).length, 1, 'гитара перезаписана, снятая не попала');
    assert.match(byId(xml, 'new-1'), /<AvitoId>\d+<\/AvitoId>/);

    const twice = XMLBuilder.build(tiny([guitar]), [listing({ price: 280_000 })]);
    assert.equal(ads(twice).length, 2);
    assert.ok(byId(twice, XMLBuilder.adId(listing({}))).includes('<Price>280000</Price>'));

    // Одна ссылка в разных написаниях — один Id; другой путь — другой.
    const canon = XMLBuilder.adId(listing({ url: 'http://kawai.ru/catalog/ca701' }));
    assert.equal(
        XMLBuilder.adId(listing({ url: 'https://www.kawai.ru/catalog/ca701/?color=black#x' })),
        canon,
    );
    assert.equal(XMLBuilder.adId(listing({ url: 'https://KAWAI.ru/catalog/ca701' })), canon);
    assert.notEqual(XMLBuilder.adId(listing({ url: 'https://kawai.ru/catalog/ca901' })), canon);
    assert.notEqual(XMLBuilder.adId(listing({ url: 'https://kawai.ru/' })), canon);
});

test('e2e: XMLBuilder.build — негативные ветки: дубль в плане/xlsx, existing не в xlsx, 0 и 11 фото (план и строка), цена, «|» в Title', () => {
    const base = tiny([guitar]);
    const noImg = {
        ...guitar,
        values: Object.fromEntries(
            Object.entries(guitar.values).filter(([k]) => k !== 'ImageUrls'),
        ),
    };

    assert.throws(
        () => XMLBuilder.build(base, [listing({}), listing({ id: 2 })]),
        /два объявления с Id/,
    );
    assert.throws(
        () => XMLBuilder.build(tiny([guitar, { ...guitar, avitoId: '1' }]), []),
        /два объявления с Id/,
    );
    assert.throws(
        () => XMLBuilder.build(base, [listing({ existing: removed })]),
        /нет строки объявления/,
    );
    assert.throws(() => XMLBuilder.build(base, [listing({ imageUrls: [] })]), /фото 0/);
    assert.throws(
        () => XMLBuilder.build(base, [listing({ imageUrls: Array(11).fill(`${S3}/1.png`) })]),
        /фото 11/,
    );
    assert.throws(() => XMLBuilder.build(tiny([noImg]), []), /фото 0/);
    const manyImg = {
        ...guitar,
        values: { ...guitar.values, ImageUrls: Array(11).fill('http://a.ru/1.jpg').join(' | ') },
    };
    assert.throws(() => XMLBuilder.build(tiny([manyImg]), []), /фото 11/);
    assert.throws(
        () =>
            XMLBuilder.build(
                tiny([{ ...guitar, values: { ...guitar.values, Price: '16 500' } }]),
                [],
            ),
        /Price «16 500»/,
    );
    assert.throws(
        () =>
            XMLBuilder.build(base, [
                listing({ description: { title: 'Yamaha P-125 | чёрный', html: '<p>x</p>' } }),
            ]),
        /«\|» в Title/,
    );
    assert.throws(
        () =>
            XMLBuilder.build(base, [
                listing({
                    category: { ...listing({}).category, attrs: { Brand: 'Kawai | Yamaha' } },
                }),
            ]),
        /«\|» в Title/,
    );
    assert.throws(
        () =>
            XMLBuilder.build(base, [
                listing({ existing: guitar }),
                listing({ id: 2, existing: guitar }),
            ]),
        /два листинга на объявление/,
    );
    assert.throws(() => XMLBuilder.build(base, [listing({ price: 1999.5 })]), /целым числом/);
    assert.throws(() => XMLBuilder.adId(listing({ url: 'not a url' })), /невалидная ссылка/);
});
