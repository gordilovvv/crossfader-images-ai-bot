import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { env } from '../src/environment.ts';
import { TaskWorker } from '../src/Worker/Worker.ts';
import { assertBudget, measure } from './helpers/e2e.ts';

const ROOT = path.join(import.meta.dirname, '..');
const WORKER_URL = new URL('../src/Worker/Worker.ts', import.meta.url).href;

const GROUP_ID = Number(env.TELEGRAM_GROUP_ID);

test('e2e: Worker — sendMessage в реальный чат из отдельного треда', async () => {
    const worker = new TaskWorker();
    try {
        const text = `serega-bot worker e2e — отправка из worker_threads`;

        const { result, ms } = await measure('worker.run sendMessage', () =>
            worker.run({ kind: 'sendMessage', chatId: GROUP_ID, text }),
        );

        assert.ok(Number.isInteger(result.messageId), 'нет message_id от Telegram');
        assert.ok(result.messageId > 0, 'невалидный message_id');
        console.log(`[e2e] доставлено message_id=${result.messageId} за ${Math.round(ms)}ms`);
    } finally {
        await worker.close();
    }
});

test('e2e: Worker — enqueue не морозит main-loop, тик идёт во время сетевой отправки', async () => {
    const worker = new TaskWorker();
    try {
        const enqueueStart = process.hrtime.bigint();
        const inFlight = worker.run({
            kind: 'sendMessage',
            chatId: GROUP_ID,
            text: 'serega-bot worker e2e — non-blocking check',
        });
        const enqueueMs = Number(process.hrtime.bigint() - enqueueStart) / 1e6;

        let ticks = 0;
        let done = false;
        inFlight.then(() => {
            done = true;
        });
        while (!done) {
            await new Promise((r) => setTimeout(r, 1));
            ticks += 1;
        }
        await inFlight;

        assertBudget(enqueueMs, 5, 'worker.run enqueue');
        assert.ok(ticks > 0, 'main-loop был заморожен во время сетевой отправки');
        console.log(`[e2e] enqueue=${enqueueMs.toFixed(2)}ms, тиков за отправку=${ticks}`);
    } finally {
        await worker.close();
    }
});

test('e2e: Worker — конкурентные таски: плохая реджектится, хорошая резолвится (изоляция по id)', async () => {
    const worker = new TaskWorker();
    try {
        const bad = worker.run({ kind: 'sendMessage', chatId: 1, text: 'должно упасть' });
        const good = worker.run({
            kind: 'sendMessage',
            chatId: GROUP_ID,
            text: 'параллельная хорошая таска',
        });

        const [badRes, goodRes] = await Promise.allSettled([bad, good]);

        assert.equal(badRes.status, 'rejected', 'плохая таска должна упасть');
        assert.match(
            (badRes as PromiseRejectedResult).reason.message,
            /chat not found|bad request|chat_id/i,
        );

        assert.equal(
            goodRes.status,
            'fulfilled',
            'хорошая таска не должна пострадать от ошибки соседней',
        );
        assert.ok((goodRes as PromiseFulfilledResult<{ messageId: number }>).value.messageId > 0);
    } finally {
        await worker.close();
    }
});

test('e2e: Worker — краш треда => fail-fast process.exit(1) (негативная ветка)', () => {
    const script = `
        import { TaskWorker } from '${WORKER_URL}';
        const tw = new TaskWorker();
        tw.run({ kind: 'sendMessage', chatId: ${GROUP_ID}, text: 'pending during crash' }).catch(() => {});
        const inner = Reflect.get(tw, 'worker');
        inner.postMessage(undefined);
    `;

    const { result: res, ms } = spawnSyncMeasured(script);

    assert.equal(
        res.status,
        1,
        `ожидался exit(1) при крахе треда, получено status=${res.status}, signal=${res.signal}`,
    );
    assert.match(res.stderr, /фатальный сбой треда/, 'нет лога фатального сбоя');
    console.log(`[e2e] fail-fast: exit=${res.status} за ${Math.round(ms)}ms`);
});

function spawnSyncMeasured(script: string) {
    const start = process.hrtime.bigint();
    const result = spawnSync(
        process.execPath,
        ['--env-file=.env', '--input-type=module', '-e', script],
        {
            cwd: ROOT,
            encoding: 'utf8',
        },
    );
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { result, ms };
}
