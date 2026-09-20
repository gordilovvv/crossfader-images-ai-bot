import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import { Gemma } from '../AI/Gemma4.ts';
import type { Browser } from './Browser.ts';
import { ImagePicker } from './ImagePicker.ts';
import {
    assembleCandidates,
    dedupeSpecs,
    Extract,
    type JsonLdProduct,
    parseJsonLdProduct,
    type RawImage,
    type RawSnapshot,
    snapshot,
} from './Utils.ts';

// document живёт в контексте браузера (page.evaluate); в tsconfig нет DOM-lib.
declare const document: any;

// Что отдаёт парсер: url -> факты со страницы (без Avito-классификации и цветов — их дописывает enricher-шаг).
export type ParsedProduct = {
    source: { url: string };
    identity: { title: string; brand: string; model: string; country: string };
    specs: Array<{ label: string; value: string }>;
    dimensions: { w: number; h: number; d: number; unit: string; weightKg: number };
    placement: Extract['placement'];
    contents: string[];
    images: { source: string[] };
    description: { html: string };
};

// url -> факты со страницы. Снапшот (Browser) + семантика (Gemma). Картинки Gemma выбирает по индексу, код резолвит URL.
export class Parser {
    private static readonly PROMPT = readFileSync(
        new URL('./promts/extract.md', import.meta.url),
        'utf8',
    );

    private readonly browser: Browser;
    private readonly gemma: Gemma;
    private readonly picker: ImagePicker;

    constructor(browser: Browser, gemma: Gemma = new Gemma()) {
        this.browser = browser;
        this.gemma = gemma;
        this.picker = new ImagePicker(browser, gemma);
    }

    async parseUrl(url: string): Promise<ParsedProduct> {
        const start = process.hrtime.bigint();
        const loaded: string[] = [];
        const snap = await this.browser.withPage(async (page) => {
            page.on('response', (resp) => {
                if ((resp.headers()['content-type'] ?? '').startsWith('image/')) {
                    loaded.push(resp.url());
                }
            });
            const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            if (resp && resp.status() >= 400) {
                throw new Error(`страница поставщика отдала HTTP ${resp.status()}`);
            }
            const s = await snapshot(page);
            await Parser.revealGallery(page).catch(() => {});
            return s;
        });

        const product = parseJsonLdProduct(snap.jsonLd);
        // Реально загруженные браузером картинки (network) — надёжнее скрапа атрибутов и часто это полноразмер главного фото.
        const netImages: RawImage[] = loaded.map((u) => ({ url: u, alt: '', hint: 5000 }));
        const candidates = assembleCandidates(product.images, snap.ogImage, [
            ...snap.domImages,
            ...netImages,
        ]);
        const [extract, images] = await Promise.all([
            this.gemma.askJson(Parser.buildPrompt(snap, product), Extract),
            this.picker.pick(candidates),
        ]);

        const specs = dedupeSpecs(extract.specs);
        const description = Parser.bestDescription(snap, product);

        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
            `[Parser] parseUrl ${images.length}img ${specs.length}specs ${candidates.length}cand ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`,
        );
        return {
            source: { url },
            identity: extract.identity,
            specs,
            dimensions: extract.dimensions,
            placement: extract.placement,
            contents: extract.contents,
            images: { source: images.slice(0, 10) },
            description: { html: description },
        };
    }

    // Описание берём детерминированно (не через Gemma — она копирует его в выход и тормозит). On-page блок > JSON-LD > meta.
    private static bestDescription(snap: RawSnapshot, product: JsonLdProduct): string {
        return (
            [snap.descriptionBlock, product.description, snap.metaDescription]
                .map((s) => s.trim())
                .sort((a, b) => b.length - a.length)[0] ?? ''
        );
    }

    private static buildPrompt(snap: RawSnapshot, product: JsonLdProduct): string {
        const table = snap.specsTable.map((s) => `${s.label}: ${s.value}`).join('\n');
        return `${Parser.PROMPT}
TITLE: ${snap.title}
OG_TITLE: ${snap.ogTitle}
JSON_LD_PRODUCT: name="${product.name}" brand="${product.brand}"

ТАБЛИЦА ХАРАКТЕРИСТИК (приоритет для specs):
${table}

ТЕКСТ СТРАНИЦЫ (fallback):
${snap.text}`;
    }

    // Best-effort: кликнуть по крупнейшему фото — сайты часто грузят полноразмер в лайтбокс по клику (ловим из network).
    private static async revealGallery(page: Page): Promise<void> {
        await page.evaluate(() => {
            let best: any = null;
            let area = 0;
            for (const img of document.querySelectorAll('img')) {
                const r = img.getBoundingClientRect();
                if (r.width * r.height > area) {
                    area = r.width * r.height;
                    best = img;
                }
            }
            if (best) {
                (best.closest('a') ?? best).click();
            }
        });
        await page.waitForTimeout(1500);
    }
}
