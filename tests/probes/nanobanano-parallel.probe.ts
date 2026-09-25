import { mkdirSync, writeFileSync } from 'node:fs';
import { NanoBanano } from '../../src/AI/NanoBanano.ts';

const OUT = new URL('../output/probes/nanobanano-parallel/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const prompts = [
    'Studio photo of a black digital piano on a white background',
    'Studio photo of a red electric guitar on a white background',
    'Studio photo of a drum kit on a white background',
    'Studio photo of studio headphones on a white background',
    'Studio photo of a DJ controller on a white background',
];

const nb = new NanoBanano();
const start = process.hrtime();
const results = await Promise.allSettled(
    prompts.map(async (p, i) => {
        const t = process.hrtime();
        const img = await nb.generate(p);
        writeFileSync(new URL(`${i + 1}.png`, OUT), img);
        const [s, ns] = process.hrtime(t);
        console.log(`[probe] img#${i + 1} ok ${img.length}b ${s}s ${Math.round(ns / 1e6)}ms`);
    }),
);
results.forEach((r, i) => {
    if (r.status === 'rejected') console.log(`[probe] img#${i + 1} FAIL ${String(r.reason).slice(0, 300)}`);
});
const [s, ns] = process.hrtime(start);
const ok = results.filter((r) => r.status === 'fulfilled').length;
console.log(`[probe] parallel ${ok}/${prompts.length} ${s}s ${Math.round(ns / 1e6)}ms`);
