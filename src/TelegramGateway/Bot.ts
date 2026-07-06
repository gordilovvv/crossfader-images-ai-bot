import { Bot as GrammyBot } from 'grammy';
import { parseGenCommand } from './Utils.ts';

export type ProcessLinks = (links: string[]) => Promise<string[]>;

export type BotDeps = {
    token: string;
    groupId: number;
    processLinks: ProcessLinks;
};

/**
 * Ловит команду /get {link} в заранее определенном чате
 */
export class TelegramBot {
    private readonly bot: GrammyBot;
    private readonly groupId: number;
    private readonly processLinks: ProcessLinks;
    private readonly subscribers = new Set<number>();

    constructor(deps: BotDeps) {
        this.bot = new GrammyBot(deps.token);
        this.groupId = deps.groupId;
        this.processLinks = deps.processLinks;
        this.registerHandlers();
    }

    subscribe(chatId: number): void {
        this.subscribers.add(chatId);
    }

    unsubscribe(chatId: number): void {
        this.subscribers.delete(chatId);
    }

    async sendMessage(chatId: number, text: string): Promise<void> {
        await this.bot.api.sendMessage(chatId, text);
    }

    async start(): Promise<void> {
        const start = process.hrtime.bigint();
        this.bot
            .start({
                drop_pending_updates: true,
                onStart: (info) => {
                    const ms = Number(process.hrtime.bigint() - start) / 1e6;
                    console.log(
                        `[TelegramGateway] @${info.username} polling started ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
                    );
                },
            })
            .catch((err) => {
                console.error('[TelegramGateway] polling crashed', err);
                process.exit(1);
            });
    }

    async stop(): Promise<void> {
        await this.bot.stop();
    }

    private registerHandlers(): void {
        this.bot.on('message:text', async (ctx) => {
            if (ctx.chat.id !== this.groupId) {
                return;
            }

            const cmd = parseGenCommand(ctx.message.text, ctx.me.username);
            if (!cmd) {
                return;
            }

            if (cmd.links.length === 0) {
                await ctx.reply(`Укажи ссылку: @${ctx.me.username} gen <ссылка>`);
                return;
            }

            const results = await this.processLinks(cmd.links);
            await this.broadcast(results);
        });
    }

    private async broadcast(links: string[]): Promise<void> {
        if (links.length === 0) {
            return;
        }
        const text = links.join('\n');
        await Promise.all([...this.subscribers].map((chatId) => this.sendMessage(chatId, text)));
    }
}
