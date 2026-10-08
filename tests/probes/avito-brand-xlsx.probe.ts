import { env } from '../../src/environment.ts';
import { AvitoProducts } from '../../src/XMLFeedAvito/AvitoProducts.ts';
import { S3 } from '../../src/XMLFeedAvito/S3.ts';

const TARGET = '8026210502';
const DAS_RE = /das\s*audio|d\.a\.s\./i;

const t0 = process.hrtime();
const products = AvitoProducts.parse(await new S3().download(env.AVITO_EXCEL_S3_KEY));
const [s, ns] = process.hrtime(t0);
console.log(`[avito-brand-xlsx] all.xlsx download+parse ${products.items.length} ads ${s}s ${Math.round(ns / 1e6)}ms`);

const headers = new Set<string>();
for (const it of products.items) Object.keys(it.values).forEach((k) => headers.add(k));
console.log('\n== headers ==\n' + [...headers].join(', '));

const status = (v: Record<string, string>) =>
    v.AvitoStatus ?? v.Status ?? v['Статус'] ?? v.AdStatus ?? '?';

console.log(`\n== 1. avitoId ${TARGET} ==`);
const target = products.byAvitoId(TARGET);
if (target) {
    const { Description, ...rest } = target.values;
    console.log(JSON.stringify(rest, null, 2));
    console.log(`Description length: ${Description?.length ?? 0}`);
} else {
    console.log('НЕ НАЙДЕНО');
    const loose = products.items.filter((it) => Object.values(it.values).some((v) => v.includes(TARGET)));
    console.log(`подстрока ${TARGET} в любых полях: ${loose.map((it) => it.id).join(', ') || 'нет'}`);
}

console.log('\n== 2. DAS AUDIO ==');
const das = products.items.filter((it) => DAS_RE.test(it.title) || DAS_RE.test(it.values.Brand ?? ''));
for (const it of das) {
    console.log(`${it.id} | ${it.avitoId} | ${it.title} | Brand=${it.values.Brand ?? '<пусто>'} | status=${status(it.values)} | ${it.values.Category ?? ''} / ${it.values.GoodsType ?? ''}`);
}

const count = (items: typeof products.items) => {
    const m = new Map<string, number>();
    for (const it of items) {
        const b = it.values.Brand ?? '<пусто>';
        m.set(b, (m.get(b) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n== 3. Brand среди DAS AUDIO (${das.length}) ==`);
for (const [b, n] of count(das)) console.log(`${n}\t${b}`);

const all = count(products.items);
console.log(`\n== 4. топ-10 Brand по каталогу (${products.items.length}, уникальных ${all.length}) ==`);
for (const [b, n] of all.slice(0, 10)) console.log(`${n}\t${b}`);
console.log(`«Другой»: ${all.find(([b]) => b === 'Другой')?.[1] ?? 0}`);
