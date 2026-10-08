import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Gemma } from '../src/AI/Gemma4.ts';
import type { Listing } from '../src/Bot.ts';
import type { ParsedProduct } from '../src/Parser/Parser.ts';
import type { AvitoProducts } from '../src/XMLFeedAvito/AvitoProducts.ts';
import type { CategoryNode, NodeFields } from '../src/XMLFeedAvito/api/Schemas.ts';
import { CategoryLookup } from '../src/XMLFeedAvito/CategoryLookup.ts';
import { CategorySnapshot, type Snapshot } from '../src/XMLFeedAvito/CategorySnapshot.ts';
import { XMLBuilder } from '../src/XMLFeedAvito/XMLBuilder.ts';
import { measure, saveArtifact } from './helpers/e2e.ts';

const fixture = (name: string) =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const samples = fixture('category-samples.json').samples as Array<{
    name: string;
    expected: { Category: string; GoodsType: string; attrs: Record<string, string> };
}>;
const expectedOf = (name: string) => samples.find((s) => s.name === name)?.expected;

test('e2e: CategoryLookup — CA701 (объект парсера) → категория Avito [paid]', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const expected = expectedOf('Kawai CA701 B');
    assert.ok(expected, 'нет эталона Kawai CA701 B в category-samples');

    const { result } = await measure('classify CA701', () =>
        new CategoryLookup().classify(product),
    );

    // Сверка с боевым фидом Avito (эталон из category-samples), а не с логикой реализации.
    assert.equal(result.slug, 'pianino_royali_organy');
    assert.equal(result.category, expected.Category);
    assert.equal(result.goodsType, expected.GoodsType);
    // Все атрибуты оракула на месте (Brand + InstrumentType).
    for (const [tag, value] of Object.entries(expected.attrs)) {
        assert.equal(result.attrs[tag], value, `неверный ${tag}`);
    }
    // Подвид листа (single-select узла) заполнен, и нет протёкших лишних атрибутов сверх оракула+подвида.
    assert.ok(result.attrs.MusicKeyboards, 'подвид MusicKeyboards не заполнен');
    const allowed = new Set([...Object.keys(expected.attrs), 'MusicKeyboards']);
    for (const tag of Object.keys(result.attrs)) {
        assert.ok(allowed.has(tag), `лишний (протёкший) атрибут: ${tag}`);
    }
});

test('e2e: CategoryLookup — ничего не подошло на coarse → fail-fast (throw)', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const snapshot = snap([{ name: 'Транспорт', nested: [{ name: 'Автомобили', slug: 'avto' }] }], {
        avto: leafFields('Транспорт'),
    });
    const gemma = {
        askJson: async () => ({ ids: [] }),
    } as unknown as Gemma;

    await assert.rejects(
        () => new CategoryLookup(snapshot, gemma).classify(product),
        /ни один раздел не подошёл/,
    );
});

// Полных объектов парсера для остальных пар нет — входы собраны вручную так, как их извлёк бы парсер
// (title/specs/description реальных товаров). Часть кейсов адверсариальные: title/URL врут, суть — в specs/описании.
// Ассертим маршрутизацию (Category/GoodsType) + дискриминатор (InstrumentType/GuitarType/EquipmentType) против оракула.
const DISCRIMINATORS = ['InstrumentType', 'GuitarType', 'EquipmentType'];
const traps: Record<string, ParsedProduct> = {
    // Ловушка: радиосистема Avito кладёт в Аудио и видео / Микрофоны, не в муз.инструменты.
    'Sennheiser XSW 1-CI1-B(A)': trap(
        'радиосистема',
        'Sennheiser',
        'XSW 1-CI1-B',
        [
            ['Тип', 'беспроводная инструментальная радиосистема'],
            ['Диапазон', 'UHF 614-638 МГц'],
            ['Комплект', 'приёмник + поясной передатчик'],
        ],
        'Беспроводная радиосистема для подключения гитары/бас-гитары к усилителю без кабеля.',
    ),
    'Yamaha CLP-835': trap(
        'цифровое пианино',
        'Yamaha',
        'CLP-835',
        [
            ['Клавиши', '88 деревянных GrandTouch-S'],
            ['Полифония', '256'],
            ['Серия', 'Clavinova'],
        ],
        'Интерьерное цифровое пианино Clavinova CLP-835 с молоточковой механикой и роялем CFX/Bösendorfer.',
    ),
    // Ловушка: стойка лежит под klavishnye, но это аксессуар, а не Клавишные.
    'Yamaha L-200': trap(
        'стойка для цифрового пианино',
        'Yamaha',
        'L-200',
        [
            ['Тип', 'деревянная стойка-подставка'],
            ['Совместимость', 'для цифрового пианино P-225'],
        ],
        'Стойка L-200, разработанная специально для цифрового пианино P-225. Цвет чёрный.',
    ),
    // Ловушка: поставщик зовёт «акустическая», но по звукоснимателю/преампу это электроакустическая. Ответ в specs, не в тексте.
    'Yamaha A3R': trap(
        'акустическая гитара',
        'Yamaha',
        'A3R',
        [
            ['Корпус', 'дредноут с вырезом (cutaway)'],
            [
                'Электроника',
                'звукосниматель System66, преамп SRT2, разъём jack для подключения к комбику',
            ],
            ['Верхняя дека', 'массив ели, технология A.R.E.'],
        ],
        'Гитара серии A с фирменной обработкой древесины A.R.E. и встроенной системой усиления для сцены.',
    ),
    'Yamaha P-145 SET': trap(
        'цифровое пианино',
        'Yamaha',
        'P-145 SET',
        [
            ['Клавиши', '88 GHC молоточковая'],
            ['Комплект', 'со стойкой и педалью'],
        ],
        'Портативное цифровое пианино P-145 в комплекте со стойкой. Компактный корпус.',
    ),
    'Sabian SBR5002 2-pack': trap(
        'набор тарелок',
        'Sabian',
        'SBR5002 2-pack',
        [
            ['Состав', 'hi-hat 14" + crash/ride 18"'],
            ['Материал', 'латунь'],
        ],
        'Набор тарелок Sabian SBR из двух штук для ударной установки начинающего барабанщика.',
    ),
    'Yamaha MG12XU': trap(
        'микшерный пульт',
        'Yamaha',
        'MG12XU',
        [
            ['Каналы', '12'],
            ['Эффекты', 'SPX цифровые'],
            ['USB', 'аудиоинтерфейс'],
        ],
        'Аналоговый микшерный пульт на 12 каналов с USB-аудиоинтерфейсом и процессором эффектов SPX.',
    ),
    'Yamaha C40': trap(
        'классическая гитара',
        'Yamaha',
        'C40',
        [
            ['Струны', 'нейлон'],
            ['Мензура', '650 мм'],
            ['Корпус', 'ель / меранти'],
        ],
        'Классическая гитара C40 для начинающих. Нейлоновые струны, полноразмерный корпус, цвет чёрный.',
    ),
    'Yamaha Pacifica 012': trap(
        'электрогитара',
        'Yamaha',
        'Pacifica 012',
        [
            ['Звукосниматели', 'HSS, хамбакер + 2 сингла'],
            ['Тремоло', 'винтажное'],
            ['Мензура', '648 мм'],
        ],
        'Электрогитара Pacifica 012 конфигурации HSS с тремоло. Требует подключения к комбоусилителю.',
    ),
    // Ловушка: у поставщика плоский URL без категории — маршрут только из названия/описания.
    'Medeli AP33': trap(
        'комбоусилитель',
        'Medeli',
        'AP33',
        [
            ['Назначение', 'монитор для электронной ударной установки'],
            ['Мощность', '30 Вт'],
        ],
        'Комбоусилитель Medeli AP33 — персональный монитор для электронной ударной установки.',
    ),
    'Radial Pro48': trap(
        'директ-бокс',
        'Radial',
        'Pro48',
        [
            ['Тип', 'активный DI, фантомное питание 48В'],
            ['Вход', 'инструментальный Hi-Z'],
        ],
        'Активный директ-бокс Radial Pro48 для согласования инструментального сигнала со входом микшера.',
    ),
    'Yamaha MG10XUF': trap(
        'микшерный пульт',
        'Yamaha',
        'MG10XUF',
        [
            ['Каналы', '10'],
            ['Фейдеры', 'да'],
            ['USB', 'аудиоинтерфейс'],
        ],
        'Аналоговый микшерный пульт MG10XUF на 10 каналов с фейдерами и USB-аудиоинтерфейсом.',
    ),
};

// Известный лимит: у листа mikrofony нет дискриминатора, «радиосистема» не встречается ни в одном enum,
// поэтому fold-механизм не помогает — это чисто семантический кросс-категорийный выбор ветки. Пользователь
// принял 16/17 без доменной подсказки в промпте (иначе overfit). Кейс сохранён как todo, а не удалён.
const KNOWN_LIMITATIONS: Record<string, string> = {
    'Sennheiser XSW 1-CI1-B(A)':
        'no-enum кросс-категория: инструментальная радиосистема без дискриминатора уходит в студийное оборудование',
};

// Товары, чей верный лист Avito НЕ имеет поля Brand (аксессуары, ударные, микрофоны) — Brand не должен проставляться.
const BRANDLESS = new Set(['Yamaha L-200', 'Sabian SBR5002 2-pack', 'Sennheiser XSW 1-CI1-B(A)']);

// Оракул неприменим: бренда (или его написания) нет в справочнике выбранного листа → по правилу «Другой».
const BRAND_OVERRIDE: Record<string, string> = {
    'Medeli AP33': 'Другой',
    'Radial Pro48': 'Другой',
};

for (const [name, product] of Object.entries(traps)) {
    const opts = KNOWN_LIMITATIONS[name] ? { todo: KNOWN_LIMITATIONS[name] } : {};
    test(`e2e: CategoryLookup — "${name}" → категория Avito [paid]`, opts, async () => {
        const expected = expectedOf(name);
        assert.ok(expected, `нет эталона ${name} в category-samples`);

        const { result } = await measure(`classify ${name}`, () =>
            new CategoryLookup().classify(product),
        );

        assert.equal(result.category, expected.Category, 'неверная Category');
        assert.equal(result.goodsType, expected.GoodsType, 'неверный GoodsType');
        for (const tag of DISCRIMINATORS) {
            if (expected.attrs[tag]) {
                assert.equal(result.attrs[tag], expected.attrs[tag], `неверный ${tag}`);
            }
        }
        // Brand: у листьев-аксессуаров/ударных/микрофонов Avito поля Brand нет — оракул там прописывает его ошибочно.
        // Где поле есть — Brand обязан быть проставлен из парсера; где нет — обязан отсутствовать (не протекать).
        if (BRANDLESS.has(name)) {
            assert.equal(
                result.attrs.Brand,
                undefined,
                'Brand не должен ставиться для категории без поля Brand',
            );
        } else {
            // Brand обязан быть значением справочника Avito этого листа; где оракул (боевой фид) знает бренд — ровно он.
            assert.ok(
                brandsOf(result.slug).includes(result.attrs.Brand as string),
                `Brand "${result.attrs.Brand}" нет в справочнике ${result.slug}`,
            );
            const expectedBrand = BRAND_OVERRIDE[name] ?? expected.attrs.Brand;
            if (expectedBrand) {
                assert.equal(result.attrs.Brand, expectedBrand, 'неверный Brand');
            }
        }
    });
}

// Резолв Brand по справочнику листа: Avito принимает только значения из своего каталога (иначе «Неправильно заполнен обязательный параметр — Бренд»).
const BRAND_CASES: Array<[raw: string, expected: string]> = [
    ['DAS AUDIO', 'Другой'],
    ['yamaha', 'Yamaha'],
    ['Allen & Heath', 'Allen&Heath'],
    ['', 'Без бренда'],
];
for (const [raw, expected] of BRAND_CASES) {
    test(`e2e: CategoryLookup — Brand "${raw}" → "${expected}" по справочнику листа`, async () => {
        const product = {
            ...(fixture('product-ca701.json') as ParsedProduct),
            identity: { title: 'студийный монитор', brand: raw, model: 'M-4', country: '' },
        };
        const snapshot = snap(
            [
                {
                    name: 'Хобби',
                    nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: 'zvuk' }] }],
                },
            ],
            { zvuk: brandLeaf('cat_zvuk') },
            { cat_zvuk: ['Yamaha', 'Allen&Heath', 'CAD Audio', 'Без бренда', 'Другой'] },
        );
        const result = await new CategoryLookup(snapshot, pickFirst()).classify(product);
        assert.equal(result.attrs.Brand, expected);
    });
}

test('e2e: CategoryLookup — необязательный Brand (required: false) всё равно резолвится по справочнику', async () => {
    const product = {
        ...(fixture('product-ca701.json') as ParsedProduct),
        identity: { title: 'студийный монитор', brand: 'yamaha', model: 'M-4', country: '' },
    };
    const leaf = brandLeaf('cat_zvuk');
    const brandField = leaf.fields.find((f) => f.tag === 'Brand')?.content?.[0];
    assert.ok(brandField);
    brandField.required = false;
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: 'zvuk' }] }] }],
        { zvuk: leaf },
        { cat_zvuk: ['Yamaha', 'Без бренда', 'Другой'] },
    );
    const result = await new CategoryLookup(snapshot, pickFirst()).classify(product);
    assert.equal(result.attrs.Brand, 'Yamaha');
});

// Фоллбэк строго по смыслу: реальный бренд → только «Другой», пустой → только «Без бренда». Подмена одного другим — ложные данные в фиде.
test('e2e: CategoryLookup — бренда нет в справочнике, «Другой» там тоже нет → fail-fast (throw)', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: 'zvuk' }] }] }],
        { zvuk: brandLeaf('cat_zvuk') },
        { cat_zvuk: ['Yamaha', 'Без бренда'] },
    );
    await assert.rejects(
        () => new CategoryLookup(snapshot, pickFirst()).classify(product),
        /«Другой» там тоже нет/,
    );
});

test('e2e: CategoryLookup — пустой бренд, «Без бренда» в справочнике нет → fail-fast (throw)', async () => {
    const product = {
        ...(fixture('product-ca701.json') as ParsedProduct),
        identity: { title: 'монитор', brand: '', model: '', country: '' },
    };
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: 'zvuk' }] }] }],
        { zvuk: brandLeaf('cat_zvuk') },
        { cat_zvuk: ['Yamaha', 'Другой'] },
    );
    await assert.rejects(
        () => new CategoryLookup(snapshot, pickFirst()).classify(product),
        /«Без бренда» там тоже нет/,
    );
});

test('e2e: CategoryLookup — коллизия нормализации (GAP/Gap): точное совпадение без учёта регистра, иначе throw', async () => {
    const tree = [
        { name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: 'zvuk' }] }] },
    ];
    const brands = { cat_zvuk: ['G.A.P.', 'Gap', 'Другой'] };
    const withBrand = (brand: string) => ({
        ...(fixture('product-ca701.json') as ParsedProduct),
        identity: { title: 'x', brand, model: '', country: '' },
    });
    const lookup = new CategoryLookup(
        snap(tree, { zvuk: brandLeaf('cat_zvuk') }, brands),
        pickFirst(),
    );
    assert.equal((await lookup.classify(withBrand('GAP'))).attrs.Brand, 'Gap');
    await assert.rejects(() => lookup.classify(withBrand('g-a-p')), /неоднозначен/);
});

// Интеграция на реальном листе Avito: справочник zvukovoe из настоящего снапшота → Brand «Другой» → XMLBuilder пишет его в фид.
test('e2e: CategoryLookup+XMLBuilder — DAS AUDIO на реальном листе zvukovoe → <Brand>Другой</Brand>', async () => {
    const real = realSnapshot();
    const leaf = real.fields.zvukovoe_i_dj_oborudovanie as NodeFields;
    const product = {
        ...(fixture('product-ca701.json') as ParsedProduct),
        identity: {
            title: 'студийный монитор',
            brand: 'DAS AUDIO',
            model: 'MONITOR-4',
            country: '',
        },
    };
    const snapshot = snap(
        [
            {
                name: 'Хобби',
                nested: [{ name: 'Музыка', nested: [{ name: 'Звук', slug: leaf.node.slug }] }],
            },
        ],
        { [leaf.node.slug]: leaf },
        real.brands,
    );
    const gemma = {
        askJson: async (prompt: string) =>
            prompt.includes('КАНДИДАТЫ')
                ? { id: 1, attrs: { EquipmentType: 'Студийные мониторы' } }
                : { ids: [1] },
    } as unknown as Gemma;
    const category = await new CategoryLookup(snapshot, gemma).classify(product);
    assert.equal(category.attrs.Brand, 'Другой');

    const xml = XMLBuilder.build({ items: [] } as unknown as AvitoProducts, [
        {
            id: 1,
            url: 'https://example-supplier.ru/das-audio-monitor-4',
            product: product as unknown as Listing['product'],
            category,
            description: { title: 'DAS Audio Monitor-4', html: '<p>Студийный монитор.</p>' },
            cards: [],
            imageUrls: ['https://example.com/1.png'],
            price: 45_000,
            existing: null,
        },
    ]);
    assert.match(xml, /<Brand>Другой<\/Brand>/);
    assert.match(xml, /<EquipmentType>Студийные мониторы<\/EquipmentType>/);
    await saveArtifact('brand-check-drugoi.xml', xml);
});

test('e2e: CategorySnapshot — Brand-лист без справочника (нет каталога / каталог не в brands) → fail-fast инвариант (throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catsnap-'));
    const tree = [{ name: 'Звук', slug: 'zvuk' }];
    const noKey = join(dir, 'no-key.json');
    writeFileSync(
        noKey,
        JSON.stringify({ tree, fields: { zvuk: brandLeaf('cat_zvuk') }, brands: {} }),
    );
    assert.throws(() => CategorySnapshot.loadFile(noKey), /нет справочника брендов/);

    const noCatalog = join(dir, 'no-catalog.json');
    const leaf = brandLeaf('cat_zvuk');
    delete leaf.fields[1]?.content?.[0]?.catalog;
    writeFileSync(
        noCatalog,
        JSON.stringify({ tree, fields: { zvuk: leaf }, brands: { cat_zvuk: ['Yamaha'] } }),
    );
    assert.throws(() => CategorySnapshot.loadFile(noCatalog), /нет справочника брендов/);
});

test('e2e: CategoryLookup — лист не подошёл (id=0) → fail-fast (throw)', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Лист', slug: 'x' }] }] }],
        { x: leafFields('Музыкальные инструменты') },
    );
    const gemma = {
        askJson: async (prompt: string) =>
            prompt.includes('КАНДИДАТЫ') ? { id: 0 } : { ids: [1] },
    } as unknown as Gemma;

    await assert.rejects(
        () => new CategoryLookup(snapshot, gemma).classify(product),
        /не подошёл ни к одному кандидату/,
    );
});

test('e2e: CategoryLookup — дискриминатор вне enum узла → fail-fast (throw)', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const fields: NodeFields = {
        node: { name: 'Гитары', slug: 'g' },
        fields: [
            {
                tag: 'Category',
                content: [{ required: true, values: [{ value: 'Музыкальные инструменты' }] }],
            },
            {
                tag: 'GuitarType',
                content: [
                    {
                        field_type: 'select',
                        required: true,
                        values: [{ value: 'Классическая' }, { value: 'Электрогитара' }],
                    },
                ],
            },
        ],
    };
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Гитары', slug: 'g' }] }] }],
        { g: fields },
    );
    const gemma = {
        askJson: async (prompt: string) =>
            prompt.includes('КАНДИДАТЫ')
                ? { id: 1, attrs: { GuitarType: 'Балалайка' } }
                : { ids: [1] },
    } as unknown as Gemma;

    await assert.rejects(
        () => new CategoryLookup(snapshot, gemma).classify(product),
        /нет в допустимых/,
    );
});

// Необязательные общие поля Avito (Color, Promo…) — не дискриминаторы: модель их не заполняет, в attrs они не попадают.
test('e2e: CategoryLookup — необязательное select-поле (required: false) не требуется и не попадает в attrs', async () => {
    const product = fixture('product-ca701.json') as ParsedProduct;
    const fields: NodeFields = {
        node: { name: 'Гитары', slug: 'g' },
        fields: [
            {
                tag: 'Category',
                content: [{ required: true, values: [{ value: 'Музыкальные инструменты' }] }],
            },
            {
                tag: 'GuitarType',
                content: [
                    {
                        field_type: 'select',
                        required: true,
                        values: [{ value: 'Классическая' }, { value: 'Электрогитара' }],
                    },
                ],
            },
            {
                tag: 'Color',
                content: [
                    {
                        field_type: 'select',
                        required: false,
                        values: [{ value: 'Чёрный' }, { value: 'Белый' }],
                    },
                ],
            },
        ],
    };
    const snapshot = snap(
        [{ name: 'Хобби', nested: [{ name: 'Музыка', nested: [{ name: 'Гитары', slug: 'g' }] }] }],
        { g: fields },
    );
    let finePrompt = '';
    const gemma = {
        askJson: async (prompt: string) => {
            if (!prompt.includes('КАНДИДАТЫ')) {
                return { ids: [1] };
            }
            finePrompt = prompt;
            return { id: 1, attrs: { GuitarType: 'Электрогитара' } };
        },
    } as unknown as Gemma;

    const result = await new CategoryLookup(snapshot, gemma).classify(product);
    assert.deepEqual(result.attrs, { GuitarType: 'Электрогитара' });
    assert.ok(!finePrompt.includes('Color'), 'необязательное поле Color попало в кандидаты модели');
});

test('e2e: CategorySnapshot — пустой/битый снапшот → fail-fast (throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catsnap-'));
    const empty = join(dir, 'empty.json');
    writeFileSync(empty, JSON.stringify({ tree: [], fields: {}, brands: {} }));
    assert.throws(() => CategorySnapshot.loadFile(empty), /пустой или битый/);
    // Структурно битый: справочник брендов строкой, а не списком.
    const broken = join(dir, 'broken.json');
    writeFileSync(
        broken,
        JSON.stringify({
            tree: [{ name: 'Звук', slug: 'zvuk' }],
            fields: { zvuk: brandLeaf('c') },
            brands: { c: 'Yamaha' },
        }),
    );
    assert.throws(() => CategorySnapshot.loadFile(broken), /пустой или битый/);
    // Снапшот прошлого формата: без brands и без required у полей.
    const legacy = join(dir, 'legacy.json');
    writeFileSync(
        legacy,
        JSON.stringify({
            tree: [{ name: 'Звук', slug: 'zvuk' }],
            fields: {
                zvuk: {
                    node: { name: 'Звук', slug: 'zvuk' },
                    fields: [
                        {
                            tag: 'Category',
                            content: [{ values: [{ value: 'Музыкальные инструменты' }] }],
                        },
                        { tag: 'Brand', content: [{ field_type: 'select', is_catalog: true }] },
                    ],
                },
            },
        }),
    );
    assert.throws(() => CategorySnapshot.loadFile(legacy), /пустой или битый снапшот/);
});

test('e2e: CategorySnapshot — лист дерева без полей → fail-fast инвариант (throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catsnap-'));
    const path = join(dir, 'missing-fields.json');
    // Лист "g" есть в дереве, но отсутствует в fields — при classify он молча выпал бы из кандидатов.
    writeFileSync(
        path,
        JSON.stringify({
            tree: [{ name: 'Гитары', slug: 'g' }],
            fields: { other: leafFields('X') },
            brands: {},
        }),
    );
    assert.throws(() => CategorySnapshot.loadFile(path), /нет полей для/);
});

function snap(
    tree: CategoryNode[],
    fields: Record<string, NodeFields>,
    brands: Record<string, string[]> = {},
): Snapshot {
    return { tree, fields, brands };
}

function leafFields(category: string): NodeFields {
    return {
        node: { name: 'leaf', slug: 'leaf' },
        fields: [{ tag: 'Category', content: [{ required: true, values: [{ value: category }] }] }],
    };
}

function trap(
    title: string,
    brand: string,
    model: string,
    specs: [string, string][],
    html: string,
): ParsedProduct {
    return {
        source: { url: '' },
        identity: { title, brand, model, country: '' },
        specs: specs.map(([label, value]) => ({ label, value })),
        dimensions: { w: 0, h: 0, d: 0, unit: 'см', weightKg: 0 },
        placement: 'floor',
        contents: [],
        images: { source: [] },
        description: { html },
    };
}

function brandLeaf(catalog: string): NodeFields {
    return {
        node: { name: 'Звук', slug: 'zvuk' },
        fields: [
            {
                tag: 'Category',
                content: [{ required: true, values: [{ value: 'Музыкальные инструменты' }] }],
            },
            {
                tag: 'Brand',
                content: [{ field_type: 'select', is_catalog: true, required: true, catalog }],
            },
        ],
    };
}

// Gemma-заглушка: на coarse берёт первый узел, на fine — первого кандидата.
function pickFirst(): Gemma {
    return {
        askJson: async (prompt: string) =>
            prompt.includes('КАНДИДАТЫ') ? { id: 1 } : { ids: [1] },
    } as unknown as Gemma;
}

// Реальный снапшот нужен только trap-тестам и интеграции — грузим лениво, чтобы моковые тесты от него не зависели.
let cached: Snapshot | null = null;
function realSnapshot(): Snapshot {
    cached ??= CategorySnapshot.loadFile(
        new URL('../data/category-snapshot.json', import.meta.url).pathname,
    );
    return cached;
}
function brandsOf(slug: string): string[] {
    const real = realSnapshot();
    const catalog = real.fields[slug]?.fields.find((f) => f.tag === 'Brand')?.content?.[0]?.catalog;
    assert.ok(catalog, `у листа ${slug} нет каталога Brand`);
    return real.brands[catalog] ?? [];
}
