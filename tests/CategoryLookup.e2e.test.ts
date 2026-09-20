import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Gemma } from '../src/AI/Gemma4.ts';
import type { ParsedProduct } from '../src/Parser/Parser.ts';
import type { CategoryNode, NodeFields } from '../src/XMLFeedAvito/AvitoApi.ts';
import { CategoryLookup } from '../src/XMLFeedAvito/CategoryLookup.ts';
import { CategorySnapshot, type Snapshot } from '../src/XMLFeedAvito/CategorySnapshot.ts';
import { measure } from './helpers/e2e.ts';

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
            assert.equal(
                result.attrs.Brand,
                product.identity.brand,
                'Brand passthrough отсутствует/неверен',
            );
        }
    });
}

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
            { tag: 'Category', content: [{ values: [{ value: 'Музыкальные инструменты' }] }] },
            {
                tag: 'GuitarType',
                content: [
                    {
                        field_type: 'select',
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

test('e2e: CategorySnapshot — пустой/битый снапшот → fail-fast (throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catsnap-'));
    const path = join(dir, 'empty.json');
    writeFileSync(path, JSON.stringify({ tree: [], fields: {} }));
    assert.throws(() => CategorySnapshot.loadFile(path), /пустой или битый/);
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
        }),
    );
    assert.throws(() => CategorySnapshot.loadFile(path), /нет полей для/);
});

function snap(tree: CategoryNode[], fields: Record<string, NodeFields>): Snapshot {
    return { tree, fields };
}

function leafFields(category: string): NodeFields {
    return {
        node: { name: 'leaf', slug: 'leaf' },
        fields: [{ tag: 'Category', content: [{ values: [{ value: category }] }] }],
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
