import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NanoBanano } from '../../src/AI/NanoBanano.ts';
import type { Graphics } from '../../src/Image/Graphics.ts';
import { ImageGeneration, type ProductData } from '../../src/Image/ImageGeneration.ts';
import { Prompts } from '../../src/Image/Promts.ts';

// Проба слота 1: сырой фон модели -> card1. Цвет фона мерить снаружи: magick <png> -format '%[pixel:p{0,0}]' info:
const OUT = new URL('../output/probes/hero-card1/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const CASES = [
    { name: 'kawai', fixture: 'product-ca701', ref: 'raw.png' },
    { name: 'audac', fixture: 'product-audac', ref: 'raw-audac.png' },
];
const reuse = process.argv.includes('--reuse');

const nb = new NanoBanano();
const start = process.hrtime();
await Promise.all(
    CASES.map(async ({ name, fixture, ref }) => {
        const product = JSON.parse(
            readFileSync(new URL(`../fixtures/${fixture}.json`, import.meta.url), 'utf8'),
        ) as ProductData;
        const bgFile = new URL(`${name}-bg.png`, OUT);
        let bg: Buffer;
        const t = process.hrtime();
        if (reuse) {
            bg = readFileSync(bgFile);
        } else {
            const prompt = Prompts.build(product)[0];
            if (!prompt) {
                throw new Error('нет промпта слота 1');
            }
            bg = await nb.generate(prompt.prompt, [
                {
                    bytes: readFileSync(new URL(`../refs/${ref}`, import.meta.url)),
                    mimeType: 'image/png',
                },
            ]);
            writeFileSync(bgFile, bg);
        }
        const [s1, ns1] = process.hrtime(t);
        console.log(`[probe] ${name} bg ${bg.length}b ${s1}s ${Math.round(ns1 / 1e6)}ms`);
        const t2 = process.hrtime();
        const ig = new ImageGeneration() as unknown as {
            card1: (p: ProductData, bg: Buffer) => Promise<Buffer>;
            graphics: Graphics;
        };
        const card = await ig.card1(product, bg);
        await ig.graphics.close();
        writeFileSync(new URL(`${name}-card1.png`, OUT), card);
        const [s2, ns2] = process.hrtime(t2);
        console.log(`[probe] ${name} card1 ${card.length}b ${s2}s ${Math.round(ns2 / 1e6)}ms`);
    }),
);
const [s, ns] = process.hrtime(start);
console.log(`[probe] total ${s}s ${Math.round(ns / 1e6)}ms`);
