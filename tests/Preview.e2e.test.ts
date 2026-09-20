import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Listing } from '../src/Bot.ts';
import { Messages } from '../src/TelegramGateway/Messages.ts';
import { Preview } from '../src/TelegramGateway/Preview.ts';

function listing(over: Partial<Listing> = {}): Listing {
    return {
        id: 7,
        url: 'https://supplier.kz/p/1',
        product: {
            source: { url: 'https://supplier.kz/p/1' },
            identity: {
                title: 'Цифровое пианино',
                brand: 'Kawai',
                model: 'CA701 B',
                country: 'JP',
            },
            specs: [],
            dimensions: { w: 0, h: 0, d: 0, unit: 'см', weightKg: 0 },
            placement: 'floor',
            contents: [],
            images: { source: [] },
            description: { html: '' },
            colors: [],
        } as unknown as Listing['product'],
        category: {
            slug: 'pianino_royali_organy',
            category: 'Музыкальные инструменты',
            goodsType: 'Клавишные и синтезаторы',
            attrs: { InstrumentType: 'Цифровое пианино', Brand: 'Kawai' },
        },
        description: {
            title: 'Kawai CA701 B',
            html: '<p>🎹 <strong>Kawai CA701 B — пианино.</strong></p> <p>Польза &amp; факт_1 *x* &lt;Wood&gt;.</p> <p>▪️ a<br/> ▪️ b</p>',
        },
        cards: [
            { slot: 1, name: '01', image: Buffer.from('a') },
            { slot: 6, name: '06', image: Buffer.from('b') },
        ],
        imageUrls: [],
        price: 279000,
        existing: {
            id: '4634904544',
            avitoId: '4634904544',
            title: 'Kawai CA701',
            price: '279000',
            values: {},
        },
        ...over,
    };
}

test('e2e: Preview.rich — превью «как на Avito»: заголовок, цена, слайдшоу, характеристики, описание, кнопки', () => {
    const rich = Preview.rich(listing());

    assert.match(rich.markdown, /^# Kawai CA701 B\n## 279 000 ₽/);
    assert.match(
        rich.markdown,
        /<tg-slideshow>[\s\S]*tg:\/\/photo\?id=card1[\s\S]*card6[\s\S]*<\/tg-slideshow>/,
    );
    assert.match(
        rich.markdown,
        /\*\*Характеристики:\*\* Новое · Клавишные и синтезаторы · Цифровое пианино · Kawai/,
    );
    assert.match(
        rich.markdown,
        /<details>[\s\S]*🎹 \*\*Kawai CA701 B — пианино\.\*\*\n\nПольза & факт\\_1 \\\*x\\\* \\<Wood\\>\.\n\n▪️ a\n\n▪️ b\n\n<\/details>/,
    );
    assert.match(rich.markdown, /обновит объявление № 4634904544/);
    assert.deepEqual(
        rich.photos?.map((p) => p.id),
        ['card1', 'card6'],
    );
});

test('e2e: Preview.rich — новый товар с ценой из команды', () => {
    const rich = Preview.rich(listing({ existing: null, price: 85000 }));

    assert.match(rich.markdown, /## 85 000 ₽/);
    assert.match(rich.markdown, /новое объявление/);
});

test('e2e: Preview.rich — переопределённая цена показывает старую из all.xlsx', () => {
    const rich = Preview.rich(listing({ price: 285000 }));

    assert.match(rich.markdown, /## 285 000 ₽/);
    assert.match(rich.markdown, /обновит объявление № 4634904544 \(было 279 000 ₽\)/);
    assert.doesNotMatch(Preview.rich(listing()).markdown, /было/);
});

test('e2e: Messages.publishQuestion — список номеров и кнопки Да/Нет', () => {
    const q = Messages.publishQuestion([listing(), listing({ id: 8, existing: null })]);

    assert.match(q.text, /^К выгрузке 2: № 7 Kawai CA701 B, № 8 Kawai CA701 B\./);
    assert.deepEqual(
        q.buttons[0]?.map((b) => b.data),
        ['publish:yes', 'publish:no'],
    );
});
