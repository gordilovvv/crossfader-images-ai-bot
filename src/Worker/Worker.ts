import { Worker } from 'node:worker_threads';
import { ulid } from 'ulid';
import type { ResultEnvelope, TaskEnvelope, TaskResult, WorkerTask } from './Protocol.ts';

const ENTRY = new URL('./WorkerEntry.ts', import.meta.url);

type Pending = { resolve: (r: TaskResult) => void; reject: (e: Error) => void };

export class TaskWorker {
    private readonly worker: Worker;
    private readonly pending = new Map<string, Pending>();
    private closing = false;

    constructor() {
        this.worker = new Worker(ENTRY);
        this.worker.on('message', (r: ResultEnvelope) => this.onResult(r));
        this.worker.on('error', (err) => this.onFatal(err));
        this.worker.on('exit', (code) => {
            if (code !== 0 && !this.closing) {
                this.onFatal(new Error(`worker exited code ${code}`));
            }
        });
    }

    run(task: WorkerTask): Promise<TaskResult> {
        const id = ulid();
        return new Promise<TaskResult>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, task } satisfies TaskEnvelope);
        });
    }

    async close(): Promise<void> {
        this.closing = true;
        await this.worker.terminate();
    }

    private onResult(r: ResultEnvelope): void {
        const p = this.pending.get(r.id);
        if (!p) {
            return;
        }
        this.pending.delete(r.id);
        if (r.ok) {
            p.resolve(r.data);
        } else {
            p.reject(new Error(r.error));
        }
    }

    private onFatal(err: Error): void {
        console.error('[Worker] фатальный сбой треда', err);
        process.exit(1);
    }
}
