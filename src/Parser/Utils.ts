import type { Page } from 'playwright';
import { z } from 'zod';

// document/window живут в контексте браузера (page.evaluate); в tsconfig нет DOM-lib.
declare const document: any;
declare const window: any;

export type RawImage = { url: string; alt: string; hint: number };

export type RawSnapshot = {
    title: string;
    ogTitle: string;
    ogImage: string;
    metaDescription: string;
    descriptionBlock: string;
    jsonLd: string;
    specsTable: Array<{ label: string; value: string }>;
    text: string;
    domImages: RawImage[];
};

export type ImageCandidate = { index: number; url: string; alt: string };

// Что достаёт Gemma: семантика (факты). Картинки выбирает ImagePicker по пикселям, описание берём детерминированно.
// Без responseSchema модель иногда опускает soft-поля → .default() терпит пропуск (парсер толерантен к сырью).
export const Extract = z.object({
    identity: z
        .object({
            title: z.string().default(''),
            brand: z.string().default(''),
            model: z.string().default(''),
            country: z.string().default(''),
        })
        .prefault({}),
    specs: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .max(30)
        .default([]),
    dimensions: z
        .object({
            w: z.number().default(0),
            h: z.number().default(0),
            d: z.number().default(0),
            unit: z.string().default('см'),
            weightKg: z.number().default(0),
        })
        .prefault({}),
    placement: z.enum(['floor', 'wall', 'desk', 'handheld']).default('floor'),
    contents: z.array(z.string()).max(30).default([]),
});
export type Extract = z.infer<typeof Extract>;

const TEXT_CAP = 6_000;
const MAX_CANDIDATES = 40;
const IMG_EXT = /\.(jpe?g|png|webp|avif)(\?|$)/i;
// Не фото товара: баннеры/лого/иконки/платёжки/промо — режем по ключам пути, не по размеру (fable: naturalWidth ненадёжен).
const BANNER =
    /banner|logo|sprite|icon|payment|placeholder|no[-_]?image|guaranty|promo|ads?\/|captcha|fifa|favicon|flags?\//i;

// Generic-сбор без привязки к классам: стандарты (title/og/JSON-LD), таблица характеристик, текст, кандидаты-картинки.
export async function snapshot(page: Page): Promise<RawSnapshot> {
    await autoScroll(page);
    return page.evaluate(
        ({ textCap, imgExtSrc }) => {
            const imgExt = new RegExp(imgExtSrc, 'i');
            const abs = (u: string): string => {
                try {
                    return new URL(u, window.location.href).href;
                } catch {
                    return '';
                }
            };
            const meta = (name: string): string => {
                const nodes = document.querySelectorAll('meta');
                for (const el of nodes) {
                    if (el.getAttribute('property') === name || el.getAttribute('name') === name) {
                        return el.getAttribute('content') ?? '';
                    }
                }
                return '';
            };
            // Размер-подсказка из URL: /1100/900/, _800x600, /w/norm/100/ → берём максимум чисел в пути.
            const hintOf = (u: string): number => {
                const nums = ((u.split('?')[0] ?? u).match(/\d{2,4}/g) ?? []).map(Number);
                return nums.length ? Math.max(...nums) : 0;
            };
            const largestFromSrcset = (srcset: string): string => {
                let best = '';
                let bestW = -1;
                for (const part of srcset.split(',')) {
                    const [url, w] = part.trim().split(/\s+/);
                    if (!url) {
                        continue;
                    }
                    const width = w ? Number.parseInt(w, 10) : 0;
                    if (width >= bestW) {
                        bestW = width;
                        best = url;
                    }
                }
                return best;
            };

            const imgMap = new Map<string, string>();
            const addImg = (raw: string, alt = ''): void => {
                if (!raw || raw.startsWith('data:') || raw.endsWith('.svg') || !imgExt.test(raw)) {
                    return;
                }
                const url = abs(raw);
                if (!url) {
                    return;
                }
                const key = url.split('?')[0] ?? url;
                if (!imgMap.has(key) || (alt && !imgMap.get(key))) {
                    imgMap.set(key, alt);
                }
            };

            for (const img of document.images) {
                addImg(img.currentSrc || img.src, img.alt ?? '');
                if (img.srcset) {
                    addImg(largestFromSrcset(img.srcset), img.alt ?? '');
                }
            }
            // Generic: любой атрибут любого элемента, значение которого похоже на image-URL (data-src, href, srcset, style, ...).
            for (const el of document.querySelectorAll('*')) {
                for (const attr of el.attributes) {
                    const v = attr.value;
                    if (!v || !imgExt.test(v)) {
                        continue;
                    }
                    for (const piece of v.split(',')) {
                        addImg(piece.trim().split(/\s+/)[0]);
                    }
                }
            }

            const domImages: Array<{ url: string; alt: string; hint: number }> = [];
            for (const [url, alt] of imgMap) {
                domImages.push({ url, alt, hint: hintOf(url) });
            }
            domImages.sort((a, b) => b.hint - a.hint);

            // Характеристики: пары из таблиц/списков определений (generic, без классов) → чисто, без мусора innerText.
            const specsTable: Array<{ label: string; value: string }> = [];
            const pushPair = (label: string, value: string): void => {
                const l = label.trim().replace(/\s+/g, ' ');
                const val = value.trim().replace(/\s+/g, ' ');
                if (l && val && l.length < 60 && val.length < 200) {
                    specsTable.push({ label: l, value: val });
                }
            };
            for (const row of document.querySelectorAll('tr')) {
                const cells = row.querySelectorAll('th, td');
                if (cells.length === 2) {
                    pushPair(cells[0].innerText ?? '', cells[1].innerText ?? '');
                }
            }
            for (const dl of document.querySelectorAll('dl')) {
                const dts = dl.querySelectorAll('dt');
                const dds = dl.querySelectorAll('dd');
                for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
                    pushPair(dts[i].innerText ?? '', dds[i].innerText ?? '');
                }
            }

            // Описание товара: настоящий on-page блок (не SEO-meta). Generic по id/itemprop/классу, берём самый длинный текст.
            let descriptionBlock = '';
            const descNodes = document.querySelectorAll(
                '[itemprop="description"], #description, [id*="descript" i], [class*="descript" i]',
            );
            for (const el of descNodes) {
                const t = (el.innerText ?? '').trim();
                if (t.length > descriptionBlock.length) {
                    descriptionBlock = t;
                }
            }

            const ldNodes = document.querySelectorAll('script[type="application/ld+json"]');
            const ld: string[] = [];
            for (const n of ldNodes) {
                if (n.textContent) {
                    ld.push(n.textContent);
                }
            }

            const main = document.querySelector('main') ?? document.body;
            return {
                title: document.title,
                ogTitle: meta('og:title'),
                ogImage: meta('og:image'),
                metaDescription: meta('og:description') || meta('description'),
                descriptionBlock: descriptionBlock.replace(/\n{3,}/g, '\n\n').slice(0, textCap),
                jsonLd: ld.join('\n'),
                specsTable: specsTable.slice(0, 40),
                text: main.innerText.replace(/\n{3,}/g, '\n\n').slice(0, textCap),
                domImages: domImages.slice(0, 60),
            };
        },
        { textCap: TEXT_CAP, imgExtSrc: IMG_EXT.source },
    );
}

async function autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            let y = 0;
            const timer = setInterval(() => {
                window.scrollTo(0, y);
                y += 800;
                if (y >= (document.scrollingElement?.scrollHeight ?? 0)) {
                    clearInterval(timer);
                    resolve();
                }
            }, 80);
        });
    });
    await page.waitForTimeout(1000);
}

export type JsonLdProduct = { name: string; brand: string; description: string; images: string[] };

// Приоритетный источник — schema.org Product (стандарт, не хрупкий селектор): имя/бренд/описание/картинки.
export function parseJsonLdProduct(jsonLd: string): JsonLdProduct {
    const empty: JsonLdProduct = { name: '', brand: '', description: '', images: [] };
    for (const block of jsonLd.split('\n')) {
        if (!block.trim()) {
            continue;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(block);
        } catch {
            continue;
        }
        const product = findProduct(parsed);
        if (product) {
            return product;
        }
    }
    return empty;
}

function findProduct(node: unknown): JsonLdProduct | null {
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findProduct(item);
            if (found) {
                return found;
            }
        }
        return null;
    }
    if (!node || typeof node !== 'object') {
        return null;
    }
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
    if (isProduct) {
        return {
            name: typeof obj.name === 'string' ? obj.name : '',
            brand: readBrand(obj.brand),
            description: typeof obj.description === 'string' ? obj.description : '',
            images: readImages(obj.image),
        };
    }
    for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
        const found = findProduct(obj[key]);
        if (found) {
            return found;
        }
    }
    return null;
}

function readBrand(brand: unknown): string {
    if (typeof brand === 'string') {
        return brand;
    }
    if (
        brand &&
        typeof brand === 'object' &&
        typeof (brand as { name?: unknown }).name === 'string'
    ) {
        return (brand as { name: string }).name;
    }
    return '';
}

function readImages(image: unknown): string[] {
    const out: string[] = [];
    const push = (v: unknown): void => {
        if (typeof v === 'string') {
            out.push(v);
        } else if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
            out.push((v as { url: string }).url);
        }
    };
    if (Array.isArray(image)) {
        image.forEach(push);
    } else {
        push(image);
    }
    return out;
}

// Одно фото в разных размерах = один файл в разных size-папках. Ключ дедупа — имя файла, не полный путь.
export function fileKey(url: string): string {
    const path = (url.split('?')[0] ?? url).split('#')[0] ?? url;
    return path.split('/').pop() ?? url;
}

// Приоритет: JSON-LD image → og:image → DOM-харвест (агрессивный: любой атрибут). Фильтр баннеров, дедуп по файлу (крупнейший вариант), сорт.
export function assembleCandidates(
    jsonLdImages: string[],
    ogImage: string,
    domImages: RawImage[],
): ImageCandidate[] {
    const ordered: RawImage[] = [
        ...jsonLdImages.map((url) => ({ url, alt: '', hint: 9999 })),
        ...(ogImage ? [{ url: ogImage, alt: '', hint: 9998 }] : []),
        ...domImages,
    ];
    const best = new Map<string, RawImage>();
    for (const img of ordered) {
        if (!img.url || BANNER.test(img.url) || !IMG_EXT.test(img.url)) {
            continue;
        }
        const key = fileKey(img.url);
        const cur = best.get(key);
        if (!cur || img.hint > cur.hint) {
            best.set(key, img);
        }
    }
    return [...best.values()]
        .sort((a, b) => b.hint - a.hint)
        .slice(0, MAX_CANDIDATES)
        .map((img, index) => ({ index, url: img.url, alt: img.alt }));
}

export function dedupeSpecs(
    specs: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
    const seen = new Set<string>();
    const out: Array<{ label: string; value: string }> = [];
    for (const s of specs) {
        const key = s.label.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(s);
        }
    }
    return out;
}

// Коды цвета/отделки в хвосте модели: "CA701 B", "VEXO108/B", "FP-30X BK". Только отдельный токен из известного списка —
// приклеенные буквы ("SM7B", "P-145B") не трогаем: там это чаще ревизия, чем цвет.
const COLOR_CODES = new Set(['B', 'BK', 'W', 'WH', 'WE', 'WB', 'WA', 'R', 'EP', 'PE', 'PW']);

// Цикл: двойной код ("LX-1 W/B", "CA701 EP-W") срезаем целиком, а не наполовину.
export function stripColorSuffix(model: string): string {
    const m = model.trim().match(/^(.*\d.*?)[\s/-]+([A-Za-z]{1,3})$/);
    if (!m || !COLOR_CODES.has(m[2]!.toUpperCase())) {
        return model.trim();
    }
    return stripColorSuffix(m[1]!);
}

export type Dimensions = Extract['dimensions'];

// Downstream считает в см; Gemma иногда отдаёт как на странице ("мм"). Чужая единица — ошибка, а не тихие ×10.
export function normalizeDimensions(d: Dimensions): Dimensions {
    const unit = d.unit.trim().replace(/\.$/, '').toLowerCase();
    const k = /^(mm|мм)$/.test(unit) ? 0.1 : /^(cm|см|)$/.test(unit) ? 1 : null;
    if (k === null) {
        throw new Error(`[Parser] неизвестная единица габаритов «${d.unit}»`);
    }
    const cm = (v: number) => Math.round(v * k * 10) / 10;
    return { w: cm(d.w), h: cm(d.h), d: cm(d.d), unit: 'см', weightKg: d.weightKg };
}
