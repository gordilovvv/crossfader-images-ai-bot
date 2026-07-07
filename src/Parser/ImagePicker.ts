import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Gemma } from '../AI/Gemma4.ts';
import type { Browser } from './Browser.ts';
import { fileKey, type ImageCandidate } from './Utils.ts';

// document живёт в контексте браузера (page.evaluate); в tsconfig нет DOM-lib.
declare const document: any;

export const PickResult = z.object({
    items: z
        .array(
            z.object({
                index: z.number(),
                is_product: z.boolean().default(true),
                whole_product: z.boolean().default(false),
                view: z
                    .enum(['front', 'three_quarter', 'side', 'back', 'top', 'detail', 'other'])
                    .default('other'),
                is_accessory_or_box: z.boolean().default(false),
                clean_background: z.boolean().default(false),
            }),
        )
        .default([]),
});
export type PickResult = z.infer<typeof PickResult>;

type Measured = ImageCandidate & { w: number; h: number };
type Ranked = Measured & { score: number };

// Выбор фото ГЛАЗАМИ, а не по alt/url: реальные пиксели (замер) + vision-оценка ракурса. Возвращает url'ы hero-first.
export class ImagePicker {
    private static readonly PROMPT = readFileSync(
        new URL('./promts/pick-images.md', import.meta.url),
        'utf8',
    );
    private static readonly MEASURE_CAP = 16;
    private static readonly MIN_SIDE = 500;
    private static readonly CELL = 320;
    private static readonly LOAD_TIMEOUT = 15_000;
    // Порог доп-добычи полноразмера (совет fable): длинная сторона < 800 → апгрейдим, < 512 → референс плох.
    private static readonly HERO_TARGET = 800;
    private static readonly HERO_BAD = 512;
    private static readonly FETCH_CAP = 8_000_000;
    // Токены размера для подстановки в size-сегмент URL (числа + слова-«оригинал»). Схема выводится из самого URL.
    private static readonly SIZE_TOKENS = [
        '4096',
        '2560',
        '2048',
        '1600',
        '1200',
        '1024',
        '800',
        'orig',
        'original',
        'source',
        'full',
        'master',
        'big',
        '0',
        '00',
    ];
    private static readonly VIEW_SCORE: Record<string, number> = {
        front: 4,
        three_quarter: 3,
        side: 2,
        top: 1,
        other: 0,
        detail: -3,
        back: -3,
    };

    private readonly browser: Browser;
    private readonly gemma: Gemma;

    constructor(browser: Browser, gemma: Gemma = new Gemma()) {
        this.browser = browser;
        this.gemma = gemma;
    }

    async pick(candidates: ImageCandidate[]): Promise<string[]> {
        if (candidates.length === 0) {
            return [];
        }
        const start = process.hrtime.bigint();
        const grid = candidates.slice(0, ImagePicker.MEASURE_CAP);
        const { dims, shot } = await this.measureAndShoot(grid);
        const measured: Measured[] = grid.map((c) => ({
            ...c,
            w: dims[c.index]?.w ?? 0,
            h: dims[c.index]?.h ?? 0,
        }));

        const vision = await this.gemma.askJson(ImagePicker.PROMPT, PickResult, [
            { bytes: shot, mimeType: 'image/png' },
        ]);
        const seen = new Map(vision.items.map((it) => [it.index, it]));

        const ranked: Ranked[] = [];
        for (const m of measured) {
            const v = seen.get(m.index);
            if (m.w === 0 || (v && !v.is_product)) {
                continue;
            }
            ranked.push({ ...m, score: ImagePicker.score(v) });
        }

        const deduped = ImagePicker.dedupeByFile(ranked);
        const big = deduped.filter((r) => Math.min(r.w, r.h) >= ImagePicker.MIN_SIDE);
        const pool = (big.length ? big : deduped).sort(
            (a, b) => b.score - a.score || b.w * b.h - a.w * a.h,
        );

        const urls = pool.slice(0, 10).map((r) => r.url);
        if (urls[0]) {
            const up = await ImagePicker.upgradeHero(urls[0]);
            urls[0] = up.url;
            if (up.lowRes) {
                console.log(`[ImagePicker] low-res hero ${up.long}px — референс мелкий для i2i`);
            }
        }
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
            `[ImagePicker] ${candidates.length}cand -> ${urls.length}pick ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
        );
        return urls;
    }

    // Verified size-upgrade: подставляем крупные токены в числовой size-сегмент URL, принимаем только реально
    // большую картинку той же пропорции и заметно тяжелее (guard от плейсхолдера/подмены). Иначе — исходный.
    private static async upgradeHero(
        url: string,
    ): Promise<{ url: string; long: number; lowRes: boolean }> {
        const base = await ImagePicker.fetchImage(url);
        if (!base) {
            return { url, long: 0, lowRes: true };
        }
        let bestUrl = url;
        let bestArea = base.w * base.h;
        let bestLong = Math.max(base.w, base.h);
        const aspect = base.w / base.h;
        if (bestLong < ImagePicker.HERO_TARGET) {
            const variants = ImagePicker.sizeVariants(url).slice(0, 24);
            const fetched = await Promise.all(variants.map((v) => ImagePicker.fetchImage(v)));
            for (const cand of fetched) {
                if (!cand) {
                    continue;
                }
                const long = Math.max(cand.w, cand.h);
                const sameShape = Math.abs(cand.w / cand.h - aspect) / aspect < 0.03;
                if (
                    sameShape &&
                    long > bestLong &&
                    cand.area > bestArea &&
                    cand.bytes > base.bytes * 1.2
                ) {
                    bestArea = cand.area;
                    bestLong = long;
                    bestUrl = cand.url;
                }
            }
        }
        return { url: bestUrl, long: bestLong, lowRes: bestLong < ImagePicker.HERO_BAD };
    }

    // Варианты URL с бо́льшим размером: подмена каждого чисто-числового сегмента пути и WxH в имени файла.
    private static sizeVariants(url: string): string[] {
        let u: URL;
        try {
            u = new URL(url);
        } catch {
            return [];
        }
        const segs = u.pathname.split('/');
        const out = new Set<string>();
        for (let i = 0; i < segs.length; i++) {
            if (/^\d{1,4}$/.test(segs[i] ?? '')) {
                for (const t of ImagePicker.SIZE_TOKENS) {
                    const s = [...segs];
                    s[i] = t;
                    out.add(`${u.origin}${s.join('/')}${u.search}`);
                }
            }
        }
        const wh = (segs[segs.length - 1] ?? '').match(/(\d{2,4})x(\d{2,4})/);
        if (wh) {
            for (const t of ['2048x2048', '1600x1600', '1200x1200']) {
                out.add(url.replace(wh[0], t));
            }
        }
        out.delete(url);
        return [...out];
    }

    private static async fetchImage(
        url: string,
    ): Promise<{ url: string; w: number; h: number; area: number; bytes: number } | null> {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(ImagePicker.LOAD_TIMEOUT) });
            if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
                return null;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > ImagePicker.FETCH_CAP) {
                return null;
            }
            const dims = ImagePicker.dimsFromBytes(buf);
            if (!dims) {
                return null;
            }
            return { url, w: dims.w, h: dims.h, area: dims.w * dims.h, bytes: buf.length };
        } catch {
            return null;
        }
    }

    // Размеры из байтов без зависимостей: PNG (IHDR) и JPEG (SOF-маркеры). Прочее -> null.
    private static dimsFromBytes(b: Buffer): { w: number; h: number } | null {
        if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
            return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
        }
        if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
            let o = 2;
            while (o + 9 < b.length) {
                if (b[o] !== 0xff) {
                    o++;
                    continue;
                }
                const marker = b[o + 1] ?? 0;
                if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                    return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
                }
                o += 2 + b.readUInt16BE(o + 2);
            }
        }
        return null;
    }

    private static score(v: PickResult['items'][number] | undefined): number {
        if (!v) {
            return 0;
        }
        let s = ImagePicker.VIEW_SCORE[v.view] ?? 0;
        if (v.whole_product) {
            s += 3;
        }
        if (v.clean_background) {
            s += 1;
        }
        if (v.is_accessory_or_box) {
            s -= 6;
        }
        return s;
    }

    // Один файл в разных size-папках = один кадр. Оставляем вариант с максимальной реальной площадью.
    private static dedupeByFile(items: Ranked[]): Ranked[] {
        const best = new Map<string, Ranked>();
        for (const it of items) {
            const key = fileKey(it.url);
            const cur = best.get(key);
            if (!cur || it.w * it.h > cur.w * cur.h) {
                best.set(key, it);
            }
        }
        return [...best.values()];
    }

    private async measureAndShoot(
        grid: ImageCandidate[],
    ): Promise<{ dims: Record<number, { w: number; h: number }>; shot: Buffer }> {
        const cells = grid
            .map(
                (c) =>
                    `<div class="cell"><div class="num">${c.index}</div><img data-i="${c.index}" src="${c.url}"></div>`,
            )
            .join('');
        const html = `<!doctype html><meta charset="utf8"><style>
body{margin:0;background:#fff;font-family:Arial;display:flex;flex-wrap:wrap;gap:4px;padding:4px}
.cell{position:relative;width:${ImagePicker.CELL}px;height:${ImagePicker.CELL}px;background:#f2f2f2;display:flex;align-items:center;justify-content:center}
.cell img{max-width:100%;max-height:100%;object-fit:contain}
.num{position:absolute;left:0;top:0;background:#e11;color:#fff;font-size:34px;font-weight:800;padding:2px 12px;z-index:2}
</style><body>${cells}</body>`;

        return this.browser.withPage(async (page) => {
            await page
                .setContent(html, { waitUntil: 'load', timeout: ImagePicker.LOAD_TIMEOUT })
                .catch(() => {});
            const list = await page.evaluate(() => {
                const out: Array<{ index: number; w: number; h: number }> = [];
                for (const img of document.querySelectorAll('img')) {
                    out.push({
                        index: Number(img.getAttribute('data-i')),
                        w: img.naturalWidth,
                        h: img.naturalHeight,
                    });
                }
                return out;
            });
            const dims: Record<number, { w: number; h: number }> = {};
            for (const d of list) {
                dims[d.index] = { w: d.w, h: d.h };
            }
            const shot = await page.screenshot({ fullPage: true });
            return { dims, shot };
        });
    }
}
