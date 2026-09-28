import pkg from '../package.json' with { type: 'json' };
import { Bot } from './Bot.ts';

console.log(`[main] ${pkg.name} v${pkg.version}`);

const bot = new Bot();
await bot.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
        await bot.stop();
        process.exit(0);
    });
}
