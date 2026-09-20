import { Bot as GrammyBot, GrammyError, InlineKeyboard, InputFile } from 'grammy';
import type { InputRichMessage } from 'grammy/types';
import { perf } from '../AI/Utils.ts';

export type Button = { text: string; data: string };

// Фото для rich-сообщения: в markdown ссылка tg://photo?id=<id>, байты уходят multipart'ом (Telegram не тянет наш S3-хост).
export type RichPhoto = { id: string; bytes: Buffer; name: string };

export type Rich = { markdown: string; photos: RichPhoto[] };

// Транспорт: отправка сообщений в одну группу, polling, retry на 429. Команды ловит Commands.
export class Telegram {
    private static readonly RETRIES = 3;
    private static readonly SEEN = '👍';

    readonly grammy: GrammyBot;
    readonly groupId: number;

    constructor(token: string, groupId: number) {
        this.grammy = new GrammyBot(token);
        this.groupId = groupId;
    }

    async sendText(text: string, buttons: Button[][] = []): Promise<void> {
        await this.grammy.api.sendMessage(this.groupId, text, {
            reply_markup: Telegram.keyboard(buttons),
        });
    }

    async sendRich(rich: Rich): Promise<void> {
        await Telegram.withRetry(() =>
            this.grammy.api.sendRichMessage(this.groupId, Telegram.richMessage(rich)),
        );
    }

    async react(messageId: number): Promise<void> {
        await this.grammy.api.setMessageReaction(this.groupId, messageId, [
            { type: 'emoji', emoji: Telegram.SEEN },
        ]);
    }

    async start(): Promise<void> {
        const start = process.hrtime.bigint();
        this.grammy
            .start({
                drop_pending_updates: true,
                onStart: (info) => perf('Telegram', `@${info.username} polling started`, start),
            })
            .catch((err) => {
                console.error('[Telegram] polling crashed', err);
                process.exit(1);
            });
    }

    async stop(): Promise<void> {
        await this.grammy.stop();
    }

    // Поле media появилось в Bot API 10.3, в типах grammY 1.44 его ещё нет — отсюда cast.
    private static richMessage(rich: Rich): InputRichMessage {
        const media = rich.photos.map((p) => ({
            id: p.id,
            media: { type: 'photo', media: new InputFile(p.bytes, p.name) },
        }));
        return { markdown: rich.markdown, media } as InputRichMessage;
    }

    // Telegram отвечает 429 с retry_after на тяжёлые rich-сообщения — ждём и повторяем, иначе ошибка наверх.
    private static async withRetry<T>(call: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await call();
            } catch (err) {
                const retryAfter =
                    err instanceof GrammyError ? err.parameters.retry_after : undefined;
                if (retryAfter === undefined || attempt >= Telegram.RETRIES) {
                    throw err;
                }
                console.log(`[Telegram] 429, жду ${retryAfter}s`);
                await new Promise((r) => setTimeout(r, retryAfter * 1000));
            }
        }
    }

    private static keyboard(rows: Button[][]): InlineKeyboard {
        const kb = new InlineKeyboard();
        for (const row of rows) {
            for (const b of row) {
                kb.text(b.text, b.data);
            }
            kb.row();
        }
        return kb;
    }
}
