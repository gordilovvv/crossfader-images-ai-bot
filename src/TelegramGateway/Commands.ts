import type { Telegram } from './Telegram.ts';

// Токены после ссылки поставщика: ссылка avito.ru → avitoId (обновить объявление), число → price в рублях.
export type GenLink = { url: string; avitoId: string | null; price: number | null };

// orphans — ссылки avito без ссылки поставщика перед ними (или вторая подряд): не выполняем, показываем юзеру.
export type Command =
    | { kind: 'gen'; links: GenLink[]; orphans: string[] }
    | { kind: 'get'; id: number | null }
    | { kind: 'drop'; id: number | null }
    | { kind: 'publish' };

export type Callback = { kind: 'xlsx'; yes: boolean } | { kind: 'publish'; yes: boolean };

export type Handlers = {
    // messageId — сообщение с командой, на него бот ставит реакцию.
    onGen: (links: GenLink[], orphans: string[], messageId: number) => Promise<void>;
    onGet: (id: number | null) => Promise<void>;
    onDrop: (id: number | null) => Promise<void>;
    onPublish: () => Promise<void>;
    // Возвращает текст всплывашки для answerCallbackQuery.
    onCallback: (cb: Callback | null) => Promise<string>;
};

// Ловит `@bot gen|get|drop|publish` и кнопки в группе, парсит и зовёт Handlers. Кодирует callback_data кнопок.
export class Commands {
    private static readonly URL_RE = /^https?:\/\//i;
    private static readonly AVITO_RE =
        /^https?:\/\/(?:www\.|m\.)?avito\.ru\/[^?#]*_(\d{8,})\/?(?:[?#]|$)/i;
    private static readonly NUMBER_RE = /^\d+$/;
    private static readonly PRICE_MIN = 100;
    private static readonly PRICE_MAX = 99_999_999;

    constructor(tg: Telegram, handlers: Handlers) {
        tg.grammy.on('message:text', async (ctx) => {
            if (ctx.chat.id !== tg.groupId) {
                return;
            }
            const cmd = Commands.parse(ctx.message.text, ctx.me.username);
            if (!cmd) {
                return;
            }
            switch (cmd.kind) {
                case 'gen':
                    await handlers.onGen(cmd.links, cmd.orphans, ctx.message.message_id);
                    return;
                case 'get':
                    await handlers.onGet(cmd.id);
                    return;
                case 'drop':
                    await handlers.onDrop(cmd.id);
                    return;
                case 'publish':
                    await handlers.onPublish();
                    return;
            }
        });

        tg.grammy.on('callback_query:data', async (ctx) => {
            if (ctx.chat?.id !== tg.groupId) {
                await ctx.answerCallbackQuery();
                return;
            }
            const toast = await handlers.onCallback(Commands.parseCallback(ctx.callbackQuery.data));
            await ctx.answerCallbackQuery({ text: toast });
        });
    }

    // null — сообщение не к боту или неизвестная команда. gen без ссылок → { links: [] }, get/drop без числа → { id: null }.
    static parse(text: string, botUsername: string): Command | null {
        const mention = `@${botUsername}`.toLowerCase();
        const idx = text.toLowerCase().indexOf(mention);
        if (idx === -1) {
            return null;
        }
        const after = text.slice(idx + mention.length).trimStart();
        const word = after.match(/^(gen|get|drop|publish)\b/i)?.[1]?.toLowerCase();
        const rest = word ? after.slice(word.length) : '';
        switch (word) {
            case 'gen':
                return { kind: 'gen', ...Commands.extractLinks(rest) };
            case 'get':
            case 'drop': {
                const id = rest.match(/\d+/)?.[0];
                return { kind: word, id: id ? Number(id) : null };
            }
            case 'publish':
                return { kind: 'publish' };
            default:
                return null;
        }
    }

    // Ссылка avito.ru и цена прикрепляются к предыдущей ссылке поставщика; прочие слова игнорируем. «279 000» — одно число.
    static extractLinks(text: string): { links: GenLink[]; orphans: string[] } {
        const links: GenLink[] = [];
        const orphans: string[] = [];
        const glued = text.replace(/\b(\d{1,3}(?: \d{3})+)\b/g, (m) => m.replace(/ /g, ''));
        for (const raw of glued.split(/\s+/)) {
            const token = raw.replace(/[.,;!?)\]]+$/, '');
            const last = links.at(-1);
            const avitoId = token.match(Commands.AVITO_RE)?.[1];
            if (avitoId !== undefined) {
                if (last && last.avitoId === null) {
                    last.avitoId = avitoId;
                } else {
                    orphans.push(token);
                }
            } else if (Commands.URL_RE.test(token)) {
                links.push({ url: token, avitoId: null, price: null });
            } else if (Commands.NUMBER_RE.test(token)) {
                const price = Number(token);
                const ok = price >= Commands.PRICE_MIN && price <= Commands.PRICE_MAX;
                if (ok && last && last.price === null) {
                    last.price = price;
                } else {
                    orphans.push(token);
                }
            }
        }
        return { links, orphans };
    }

    // callback_data = `${kind}:${yes|no}`.
    static parseCallback(data: string): Callback | null {
        const [kind, yes] = data.split(':');
        if ((kind !== 'xlsx' && kind !== 'publish') || (yes !== 'yes' && yes !== 'no')) {
            return null;
        }
        return { kind, yes: yes === 'yes' };
    }

    static callbackData(cb: Callback): string {
        return `${cb.kind}:${cb.yes ? 'yes' : 'no'}`;
    }
}
