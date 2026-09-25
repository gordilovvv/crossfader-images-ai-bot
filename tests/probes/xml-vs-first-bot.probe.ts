import { readFileSync } from 'node:fs';
import { AvitoProducts } from '../../src/XMLFeedAvito/AvitoProducts.ts';
import { XMLBuilder } from '../../src/XMLFeedAvito/XMLBuilder.ts';

// Наш фид из all.xlsx (без плана) против живого фида первого бота: состав объявлений и потеговое сравнение общих.
const FEED_URL = 'https://f0669e0b-9b5a-4b8b-be0d-f055b6e54f89.selstorage.ru/feed/avito-feed.xml';

const catalog = AvitoProducts.parse(readFileSync(new URL('../fixtures/all.xlsx', import.meta.url)));
const start = process.hrtime.bigint();
const ours = XMLBuilder.build(catalog, []);
const theirs = await (await fetch(FEED_URL)).text();
const ms = Number(process.hrtime.bigint() - start) / 1e6;
console.log(`[probe] build+fetch ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`);

type Ad = Map<string, string>;
function parse(xml: string): Map<string, Ad> {
    const out = new Map<string, Ad>();
    for (const block of xml.match(/<Ad>[\s\S]*?<\/Ad>/g) ?? []) {
        const ad: Ad = new Map();
        const tagRe = /^ {2}<([A-Za-z0-9]+)>([\s\S]*?)<\/\1>|^ {2}<Images>([\s\S]*?)<\/Images>/gm;
        for (const m of block.matchAll(tagRe)) {
            if (m[3] !== undefined) {
                ad.set('Images', (m[3].match(/url="[^"]+"/g) ?? []).join(' '));
            } else {
                ad.set(m[1] as string, (m[2] as string).replace(/\s+/g, ' ').trim());
            }
        }
        out.set(ad.get('Id') ?? '', ad);
    }
    return out;
}

const a = parse(ours);
const b = parse(theirs);
const onlyOurs = [...a.keys()].filter((id) => !b.has(id));
const onlyTheirs = [...b.keys()].filter((id) => !a.has(id));
const common = [...a.keys()].filter((id) => b.has(id));
console.log(
    `[probe] наш фид: ${a.size} объявлений, первый бот: ${b.size}, общих: ${common.length}`,
);
console.log(
    `[probe] только у нас: ${onlyOurs.length}, только у первого бота: ${onlyTheirs.length}`,
);

const tagDiff = new Map<
    string,
    { onlyOurs: number; onlyTheirs: number; differ: number; sample: string }
>();
let identical = 0;
for (const id of common) {
    const x = a.get(id) as Ad;
    const y = b.get(id) as Ad;
    let same = true;
    for (const tag of new Set([...x.keys(), ...y.keys()])) {
        const d = tagDiff.get(tag) ?? { onlyOurs: 0, onlyTheirs: 0, differ: 0, sample: '' };
        const vx = x.get(tag);
        const vy = y.get(tag);
        if (vx === vy) {
            continue;
        }
        same = false;
        if (vx === undefined) {
            d.onlyTheirs++;
        } else if (vy === undefined) {
            d.onlyOurs++;
        } else {
            d.differ++;
            if (!d.sample) {
                d.sample = `${id}: «${vx.slice(0, 60)}» vs «${vy.slice(0, 60)}»`;
            }
        }
        tagDiff.set(tag, d);
    }
    if (same) {
        identical++;
    }
}
console.log(`[probe] общих объявлений совпало тег-в-тег: ${identical} из ${common.length}`);
for (const [tag, d] of [...tagDiff].sort(
    (p, q) =>
        q[1].differ +
        q[1].onlyOurs +
        q[1].onlyTheirs -
        (p[1].differ + p[1].onlyOurs + p[1].onlyTheirs),
)) {
    console.log(
        `[probe]   ${tag}: разные=${d.differ} только у нас=${d.onlyOurs} только у них=${d.onlyTheirs} ${d.sample}`,
    );
}
const status = new Map<string, number>();
for (const id of onlyTheirs) {
    const s = catalog.items.find((it) => it.id === id)?.values.AvitoStatus ?? 'нет в all.xlsx';
    status.set(s, (status.get(s) ?? 0) + 1);
}
console.log('[probe] только у первого бота — статус в all.xlsx:', Object.fromEntries(status));
