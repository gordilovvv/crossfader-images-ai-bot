import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLinks, parseGenCommand } from '../src/TelegramGateway/Utils.ts';
import { assertBudget, measure } from './helpers/e2e.ts';

const BOT = 'serega_bot';

test('e2e: TelegramGateway Utils — gen с одной ссылкой', async () => {
    const text = `@${BOT} gen https://www.avito.ru/item/123`;

    const { result: cmd, ms } = await measure('parseGenCommand одна ссылка', () =>
        parseGenCommand(text, BOT),
    );

    assert.ok(cmd, 'команда не распознана');
    assert.deepEqual(cmd.links, ['https://www.avito.ru/item/123']);
    assertBudget(ms, 50, 'parseGenCommand');
});

test('e2e: TelegramGateway Utils — gen с массивом ссылок', () => {
    const text = `@${BOT} gen https://avito.ru/a https://avito.ru/b\nhttps://avito.ru/c`;

    const cmd = parseGenCommand(text, BOT);

    assert.ok(cmd);
    assert.deepEqual(cmd.links, ['https://avito.ru/a', 'https://avito.ru/b', 'https://avito.ru/c']);
});

test('e2e: TelegramGateway Utils — упоминание в середине сообщения', () => {
    const text = `Ребят, @${BOT} gen https://avito.ru/x пожалуйста`;

    const cmd = parseGenCommand(text, BOT);

    assert.ok(cmd);
    assert.deepEqual(cmd.links, ['https://avito.ru/x']);
});

test('e2e: TelegramGateway Utils — регистр упоминания и gen не важен', () => {
    const text = `@${BOT.toUpperCase()} GEN https://avito.ru/y`;

    const cmd = parseGenCommand(text, BOT);

    assert.ok(cmd);
    assert.deepEqual(cmd.links, ['https://avito.ru/y']);
});

test('e2e: TelegramGateway Utils — обычное сообщение без команды => null', () => {
    assert.equal(parseGenCommand('просто болтаем про https://avito.ru/z', BOT), null);
    assert.equal(parseGenCommand(`@${BOT} привет`, BOT), null);
    assert.equal(parseGenCommand(`@other_bot gen https://avito.ru/z`, BOT), null);
});

test('e2e: TelegramGateway Utils — gen без ссылок => { links: [] } (негативная ветка)', () => {
    const cmd = parseGenCommand(`@${BOT} gen`, BOT);

    assert.deepEqual(cmd, { links: [] });
});

test('e2e: TelegramGateway Utils — extractLinks срезает хвостовую пунктуацию', () => {
    assert.deepEqual(extractLinks('смотри https://avito.ru/1, и https://avito.ru/2.'), [
        'https://avito.ru/1',
        'https://avito.ru/2',
    ]);
    assert.deepEqual(extractLinks('текст без ссылок'), []);
});

// --- Ниже — сценарии, требующие живого Telegram (polling, отправка). Без токена не гоняются. ---

test('e2e: TelegramGateway Bot — polling получает gen и рассылает подписчикам', {
    skip: 'нужен живой Telegram-токен и группа; сеть в этом прогоне недоступна',
}, () => {});

test('e2e: TelegramGateway Bot — ручка sendMessage доставляет сообщение в чат', {
    skip: 'нужен живой Telegram-токен; sendMessage бьёт в bot.api',
}, () => {});

test('e2e: TelegramGateway Bot — start/stop управляет жизненным циклом polling', {
    skip: 'нужен живой Telegram-токен; bot.start() открывает long-polling к Telegram',
}, () => {});
