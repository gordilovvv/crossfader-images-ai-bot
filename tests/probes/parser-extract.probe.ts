import { mkdirSync, writeFileSync } from 'node:fs';
import type { z } from 'zod';
import { Gemma } from '../../src/AI/Gemma4.ts';
import { Browser } from '../../src/Parser/Browser.ts';
import { Parser } from '../../src/Parser/Parser.ts';

// Проба извлечения фактов: результат parseUrl + точный промпт, ушедший в Gemma (перехват askJson, src не трогаем).
const url = process.argv[2] ?? 'https://stepline.kz/products/aktivniy_monitor_das_audio_monitor_4/';
const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'page';
const OUT = new URL('../output/probes/parser-extract/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const DIMS = /габар|размер|вес|ширин|высот|глуб|мм|см|кг/i;

const fmt = (t: [number, number]) => `${t[0]}s ${Math.round(t[1] / 1e6)}ms`;

const gemma = new Gemma();
let extractPrompt = '';
const askJson = gemma.askJson.bind(gemma);
gemma.askJson = <T>(prompt: string, schema: z.ZodType<T>, images?: Parameters<Gemma['askJson']>[2]) => {
    if (prompt.includes('ТАБЛИЦА ХАРАКТЕРИСТИК')) {
        extractPrompt = prompt;
    }
    return askJson(prompt, schema, images);
};

const browser = new Browser();
const start = process.hrtime();
try {
    const result = await new Parser(browser, gemma).parseUrl(url);
    console.log(`[probe] parser-extract parseUrl ${fmt(process.hrtime(start))}`);
    if (!extractPrompt) {
        throw new Error('промпт extract не перехвачен');
    }
    writeFileSync(new URL(`${slug}.prompt.txt`, OUT), extractPrompt);
    writeFileSync(new URL(`${slug}.result.json`, OUT), JSON.stringify(result, null, 2));
    console.log(
        JSON.stringify(
            {
                identity: result.identity,
                dimensions: result.dimensions,
                placement: result.placement,
                dimSpecs: result.specs.filter((s) => DIMS.test(s.label) || DIMS.test(s.value)),
            },
            null,
            2,
        ),
    );
    console.log(`[probe] parser-extract prompt ${extractPrompt.length} chars -> ${new URL(`${slug}.prompt.txt`, OUT).pathname}`);
} finally {
    await browser.close();
}
console.log(`[probe] parser-extract total ${fmt(process.hrtime(start))}`);
