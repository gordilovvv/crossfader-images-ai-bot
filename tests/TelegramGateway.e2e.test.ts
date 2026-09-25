import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Commands } from '../src/TelegramGateway/Commands.ts';
import { Telegram } from '../src/TelegramGateway/Telegram.ts';

const BOT = 'serega_bot';
const GROUP = -1003991469615;

test('e2e: TelegramGateway Commands — gen с одной ссылкой', () => {
    assert.deepEqual(Commands.parse(`@${BOT} gen https://supplier.kz/item/123`, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/item/123', avitoId: null, price: null }],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — ссылка avito после ссылки поставщика => avitoId', () => {
    const text = `@${BOT} gen https://supplier.kz/a https://www.avito.ru/astana/muzykalnye_instrumenty/yamaha_hs3_7450027995?utm_source=share&context=abc123 https://supplier.kz/b\nhttps://supplier.kz/c https://m.avito.ru/x/y_4634904544/#photo`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [
            { url: 'https://supplier.kz/a', avitoId: '7450027995', price: null },
            { url: 'https://supplier.kz/b', avitoId: null, price: null },
            { url: 'https://supplier.kz/c', avitoId: '4634904544', price: null },
        ],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — avito без поставщика впереди или вторая подряд => orphans (негативная ветка)', () => {
    const text = `@${BOT} gen https://avito.ru/a_1111111111 https://supplier.kz/b https://avito.ru/b_2222222222 https://avito.ru/c_3333333333`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/b', avitoId: '2222222222', price: null }],
        orphans: ['https://avito.ru/a_1111111111', 'https://avito.ru/c_3333333333'],
    });
});

test('e2e: TelegramGateway Commands — цена: число после ссылки, avito + цена, без ссылки впереди => orphans', () => {
    const text = `@${BOT} gen https://supplier.kz/a 279000 https://supplier.kz/b https://avito.ru/x_1234567890 285000 https://supplier.kz/c 1000 2000`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [
            { url: 'https://supplier.kz/a', avitoId: null, price: 279000 },
            { url: 'https://supplier.kz/b', avitoId: '1234567890', price: 285000 },
            { url: 'https://supplier.kz/c', avitoId: null, price: 1000 },
        ],
        orphans: ['2000'],
    });
    assert.deepEqual(Commands.parse(`@${BOT} gen 279000 https://supplier.kz/a`, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/a', avitoId: null, price: null }],
        orphans: ['279000'],
    });
    assert.deepEqual(Commands.parse(`@${BOT} gen https://supplier.kz/a 12 999999999 000`, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/a', avitoId: null, price: null }],
        orphans: ['12', '999999999', '000'],
    });
    assert.deepEqual(Commands.parse(`@${BOT} gen https://supplier.kz/a 1 279 000`, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/a', avitoId: null, price: 1279000 }],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — avito без номера объявления (категория, короткие цифры) — не avito-ссылка (негативная ветка)', () => {
    const text = `@${BOT} gen https://supplier.kz/b https://www.avito.ru/astana/muzykalnye_instrumenty/casio_px_s1100`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [
            { url: 'https://supplier.kz/b', avitoId: null, price: null },
            {
                url: 'https://www.avito.ru/astana/muzykalnye_instrumenty/casio_px_s1100',
                avitoId: null,
                price: null,
            },
        ],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — упоминание в середине сообщения', () => {
    const text = `Ребят, @${BOT} gen https://supplier.kz/x пожалуйста`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/x', avitoId: null, price: null }],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — регистр упоминания и команды не важен', () => {
    const text = `@${BOT.toUpperCase()} GEN https://supplier.kz/y`;

    assert.deepEqual(Commands.parse(text, BOT), {
        kind: 'gen',
        links: [{ url: 'https://supplier.kz/y', avitoId: null, price: null }],
        orphans: [],
    });
});

test('e2e: TelegramGateway Commands — gen без ссылок => { links: [] } (негативная ветка)', () => {
    assert.deepEqual(Commands.parse(`@${BOT} gen`, BOT), { kind: 'gen', links: [], orphans: [] });
});

test('e2e: TelegramGateway Commands — get/drop 42 и без числа', () => {
    assert.deepEqual(Commands.parse(`@${BOT} get 42`, BOT), { kind: 'get', id: 42 });
    assert.deepEqual(Commands.parse(`@${BOT} GET №7`, BOT), { kind: 'get', id: 7 });
    assert.deepEqual(Commands.parse(`@${BOT} get`, BOT), { kind: 'get', id: null });
    assert.deepEqual(Commands.parse(`@${BOT} drop 3`, BOT), { kind: 'drop', id: 3 });
    assert.deepEqual(Commands.parse(`@${BOT} drop`, BOT), { kind: 'drop', id: null });
});

test('e2e: TelegramGateway Commands — publish', () => {
    assert.deepEqual(Commands.parse(`@${BOT} publish`, BOT), { kind: 'publish' });
    assert.deepEqual(Commands.parse(`@${BOT} Publish пожалуйста`, BOT), { kind: 'publish' });
});

test('e2e: TelegramGateway Commands — не команда => null', () => {
    assert.equal(Commands.parse('просто болтаем про https://avito.ru/z', BOT), null);
    assert.equal(Commands.parse(`@${BOT} привет`, BOT), null);
    assert.equal(Commands.parse(`@${BOT} generate https://avito.ru/z`, BOT), null);
    assert.equal(Commands.parse(`@other_bot gen https://avito.ru/z`, BOT), null);
});

test('e2e: TelegramGateway Commands — extractLinks срезает хвостовую пунктуацию', () => {
    assert.deepEqual(
        Commands.extractLinks('смотри https://supplier.kz/1, и https://supplier.kz/2.').links,
        [
            { url: 'https://supplier.kz/1', avitoId: null, price: null },
            { url: 'https://supplier.kz/2', avitoId: null, price: null },
        ],
    );
    assert.deepEqual(Commands.extractLinks('текст без ссылок'), { links: [], orphans: [] });
});

test('e2e: TelegramGateway Commands — callback_data кнопок: encode → parse симметричны', () => {
    const cases = [
        { kind: 'xlsx', yes: true },
        { kind: 'xlsx', yes: false },
        { kind: 'publish', yes: true },
        { kind: 'publish', yes: false },
    ] as const;

    for (const cb of cases) {
        assert.deepEqual(Commands.parseCallback(Commands.callbackData(cb)), cb);
    }
});

test('e2e: TelegramGateway Commands — неизвестный callback_data => null (негативная ветка)', () => {
    assert.equal(Commands.parseCallback('ok:abc'), null);
    assert.equal(Commands.parseCallback('ok'), null);
    assert.equal(Commands.parseCallback('foo:1'), null);
    assert.equal(Commands.parseCallback(''), null);
});

// Гард группы: апдейты не из TELEGRAM_GROUP_ID глушатся middleware до хендлеров. botInfo задан руками, чтобы не звать getMe.
function fakeBot(groupId: number) {
    const tg = new Telegram('0:fake', groupId);
    tg.grammy.botInfo = {
        id: 1,
        is_bot: true,
        first_name: 'bot',
        username: BOT,
    } as typeof tg.grammy.botInfo;
    const calls: string[] = [];
    new Commands(tg, {
        onGen: async (links) => {
            calls.push(`gen ${links.map((l) => l.url).join(' ')}`);
        },
        onGet: async (id) => {
            calls.push(`get ${id}`);
        },
        onDrop: async (id) => {
            calls.push(`drop ${id}`);
        },
        onPublish: async () => {
            calls.push('publish');
        },
        onCallback: async (cb) => {
            calls.push(`callback ${cb?.kind}:${cb?.yes}`);
            return 'ok';
        },
    });
    return { tg, calls };
}

function textUpdate(updateId: number, chatId: number, text: string, type = 'supergroup') {
    return {
        update_id: updateId,
        message: {
            message_id: updateId,
            date: 0,
            chat: { id: chatId, type, title: 't' },
            from: { id: 7, is_bot: false, first_name: 'u' },
            text,
        },
    } as Parameters<Telegram['grammy']['handleUpdate']>[0];
}

test('e2e: TelegramGateway гард — команды из своей группы доходят до хендлеров', async () => {
    const { tg, calls } = fakeBot(GROUP);

    await tg.grammy.handleUpdate(textUpdate(1, GROUP, `@${BOT} gen https://supplier.kz/a`));
    await tg.grammy.handleUpdate(textUpdate(2, GROUP, `@${BOT} publish`));

    assert.deepEqual(calls, ['gen https://supplier.kz/a', 'publish']);
});

test('e2e: TelegramGateway гард — личка и чужие группы молчат (негативная ветка)', async () => {
    const { tg, calls } = fakeBot(GROUP);
    tg.grammy.api.config.use(() => {
        throw new Error('бот полез в API вне группы');
    });

    await tg.grammy.handleUpdate(textUpdate(1, 7, `@${BOT} gen https://supplier.kz/a`, 'private'));
    await tg.grammy.handleUpdate(textUpdate(3, GROUP + 1, `@${BOT} get 1`));
    await tg.grammy.handleUpdate({
        update_id: 5,
        inline_query: {
            id: '1',
            from: { id: 7, is_bot: false, first_name: 'u' },
            query: '',
            offset: '',
        },
    });
    await tg.grammy.handleUpdate({
        update_id: 4,
        callback_query: {
            id: '1',
            from: { id: 7, is_bot: false, first_name: 'u' },
            chat_instance: 'x',
            data: Commands.callbackData({ kind: 'xlsx', yes: true }),
            message: {
                message_id: 4,
                date: 0,
                chat: { id: 7, type: 'private', first_name: 'u' },
                text: 'q',
            },
        },
    });

    assert.deepEqual(calls, []);
});

test('e2e: TelegramGateway гард — TELEGRAM_GROUP_ID не число => падает на старте (негативная ветка)', () => {
    assert.throws(() => new Telegram('0:fake', Number('abc')), /TELEGRAM_GROUP_ID/);
});
