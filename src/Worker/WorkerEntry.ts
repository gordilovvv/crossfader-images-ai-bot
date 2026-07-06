import { parentPort } from 'node:worker_threads';
import { Bot as GrammyBot } from 'grammy';
import { env } from '../environment.ts';
import type { ResultEnvelope, TaskEnvelope, TaskResult, WorkerTask } from './Protocol.ts';

if (!parentPort) {
    throw new Error('[Worker] WorkerEntry запущен вне worker_threads');
}

const port = parentPort;
const bot = new GrammyBot(env.TELEGRAM_BOT_TOKEN);

port.on('message', async ({ id, task }: TaskEnvelope) => {
    try {
        const data = await run(task);
        port.postMessage({ id, ok: true, data } satisfies ResultEnvelope);
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        port.postMessage({ id, ok: false, error } satisfies ResultEnvelope);
    }
});

async function run(task: WorkerTask): Promise<TaskResult> {
    switch (task.kind) {
        case 'sendMessage': {
            const msg = await bot.api.sendMessage(task.chatId, task.text);
            return { messageId: msg.message_id };
        }
    }
}
