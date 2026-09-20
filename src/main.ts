import { Bot } from './Bot.ts';

const bot = new Bot();
await bot.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
        await bot.stop();
        process.exit(0);
    });
}
