import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { GenerateContentResponse } from '@google/genai';
import { z } from 'zod';
import { Classification } from '../src/AI/Classification.ts';
import { ColorsSearch } from '../src/AI/ColorsSearch.ts';
import { Gemma } from '../src/AI/Gemma4.ts';
import { NanoBanano } from '../src/AI/NanoBanano.ts';
import { extractImage, extractText, parseFirstJson } from '../src/AI/Utils.ts';
import { imageExt, measure, saveArtifact } from './helpers/e2e.ts';

test('e2e: Classification — крупный товар → big [paid]', async () => {
    const clf = new Classification();
    const { result } = await measure('classify пианино', () =>
        clf.classify('KAWAI CA 701', 'цифровое пианино, 88 деревянных клавиш'),
    );
    assert.equal(result, 'big');
});

test('e2e: Classification — небольшой товар → small [paid]', async () => {
    const clf = new Classification();
    const { result } = await measure('classify наушники', () =>
        clf.classify('Sony WH-1000XM5', 'беспроводные наушники'),
    );
    assert.equal(result, 'small');
});

test('e2e: Gemma — отвечает по факту [paid]', async () => {
    const gemma = new Gemma();
    const { result } = await measure('gemma факт', () =>
        gemma.ask('Сколько клавиш у стандартного акустического пианино? Ответь только числом.'),
    );
    assert.match(result, /88/);
});

const Product = z.object({
    name: z.string().min(1),
    brand: z.string().min(1),
    country: z.string().nullable(),
    keys: z.number().nullable(),
    colors: z.array(z.string()),
    characteristics: z.array(z.string()).max(8),
});

test('e2e: Gemma.askJson — сырой дамп страницы → валидный объект товара [paid]', async () => {
    const raw = readFileSync(new URL('./fixtures/raw-ca701.json', import.meta.url), 'utf8').slice(
        0,
        12000,
    );
    const prompt = `Извлеки данные товара строго по схеме. characteristics — не более 8 самых важных, каждая коротко. keys — число клавиш если муз.инструмент иначе null.\n\nСырой контент страницы:\n${raw}`;

    const { result } = await measure('gemma askJson', () => new Gemma().askJson(prompt, Product));

    assert.equal(result.brand, 'KAWAI');
    assert.equal(result.keys, 88);
    assert.ok(result.colors.length > 0, 'не извлёк цвета');
    assert.ok(
        result.characteristics.length > 0 && result.characteristics.length <= 8,
        'характеристики вне [1..8]',
    );
});

test('e2e: ColorsSearch — цвета KAWAI CA 701 через Google-поиск [paid]', async () => {
    const { result } = await measure('colors ca701', () =>
        new ColorsSearch().search('KAWAI CA 701 цифровое пианино'),
    );
    const lower = result.map((c) => c.toLowerCase());
    for (const expected of ['black', 'white', 'rosewood']) {
        assert.ok(lower.includes(expected), `нет цвета ${expected}: [${result.join(', ')}]`);
    }
    assert.equal(new Set(lower).size, lower.length, 'дубли цветов');
});

test('e2e: ColorsSearch — несуществующая модель реального бренда → [], не выдумка [paid]', async () => {
    const { result } = await measure('colors фейк-модель', () =>
        new ColorsSearch().search('KAWAI CA 99999 цифровое пианино'),
    );
    assert.deepEqual(
        result,
        [],
        `перенёс цвета линейки на несуществующую модель: [${result.join(', ')}]`,
    );
});

test('e2e: ColorsSearch — пустой ввод → [] без вызова модели', async () => {
    assert.deepEqual(await new ColorsSearch().search('   '), []);
});

test('e2e: parseFirstJson — берёт первый объект, игнорит мусор после', () => {
    assert.deepEqual(parseFirstJson('```json\n{"a":1,"s":"}"}\n```\nлишний текст'), {
        a: 1,
        s: '}',
    });
    assert.deepEqual(parseFirstJson('{"a":1}\n{"b":2}'), { a: 1 });
    assert.throws(() => parseFirstJson('нет объекта'), /нет JSON-объекта/);
    assert.throws(() => parseFirstJson('{"a":1'), /незакрытый JSON/);
});

test('e2e: extractText/extractImage — пустой ответ модели падает', () => {
    // как реальный пустой ответ SDK: .text агрегирует parts -> '' , parts пуст
    const empty = {
        text: '',
        candidates: [{ content: { parts: [] } }],
    } as unknown as GenerateContentResponse;
    assert.throws(() => extractText(empty), /пустой текстовый ответ/);
    assert.throws(() => extractImage(empty), /нет изображения/);
});

test('e2e: NanoBanano — генерит картинку [paid]', async () => {
    const nano = new NanoBanano();
    const { result } = await measure('nano генерация', () =>
        nano.generate('Фотография красного яблока на деревянном столе, студийный свет, 1:1'),
    );

    assert.ok(result.length > 1000, `картинка подозрительно мала: ${result.length}b`);
    const ext = imageExt(result);
    assert.ok(ext, 'ответ не PNG/JPEG');
    await saveArtifact(`ai-nano-apple.${ext}`, result);
});
