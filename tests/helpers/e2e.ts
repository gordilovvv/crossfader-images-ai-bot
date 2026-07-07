import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function imageExt(buf: Buffer): 'png' | 'jpg' | null {
    if (buf.subarray(0, 4).equals(PNG_MAGIC)) {
        return 'png';
    }
    if (buf.subarray(0, 3).equals(JPEG_MAGIC)) {
        return 'jpg';
    }
    return null;
}

type Measured<T> = { result: T; ms: number };

export async function measure<T>(label: string, fn: () => T | Promise<T>): Promise<Measured<T>> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[e2e] ${label}: ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`);
    return { result, ms };
}

export async function saveArtifact(name: string, data: string | Buffer): Promise<string> {
    const dir = path.join(import.meta.dirname, '..', 'output');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await writeFile(file, data);
    console.log(`[e2e] артефакт: ${file}`);
    return file;
}

export function assertBudget(ms: number, budgetMs: number, label: string) {
    assert.ok(ms <= budgetMs, `[e2e] ${label}: ${Math.round(ms)}ms > бюджет ${budgetMs}ms`);
}
