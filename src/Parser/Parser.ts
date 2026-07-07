import { readFileSync } from 'node:fs';
import { Gemma } from '../AI/Gemma4.ts';
import type { Browser } from './Browser.ts';
import {
    assembleCandidates,
    dedupeSpecs,
    Extract,
    formatCandidates,
    type ImageCandidate,
    type JsonLdProduct,
    parseJsonLdProduct,
    type RawSnapshot,
    snapshot,
} from './Utils.ts';

// Что отдаёт парсер: url -> факты со страницы (без Avito-классификации и цветов — их дописывает enricher-шаг).
export type ParsedProduct = {
    source: { url: string };
    identity: { title: string; brand: string; model: string; country: string };
    specs: Array<{ label: string; value: string }>;
    dimensions: { w: number; h: number; d: number; unit: string; weightKg: number };
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

    constructor(browser: Browser, gemma: Gemma = new Gemma()) {
        this.browser = browser;
        this.gemma = gemma;
    }

    async parseUrl(url: string): Promise<ParsedProduct> {
        const start = process.hrtime.bigint();
        const snap = await this.browser.withPage(async (page) => {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            return snapshot(page);
        });

        const product = parseJsonLdProduct(snap.jsonLd);
        const candidates = assembleCandidates(product.images, snap.ogImage, snap.domImages);
        const extract = await this.gemma.askJson(
            Parser.buildPrompt(snap, product, candidates),
            Extract,
        );

        const images: string[] = [];
        for (const i of new Set(extract.imageIndexes)) {
            const picked = candidates[i]?.url;
            if (picked) {
                images.push(picked);
            }
        }

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

    private static buildPrompt(
        snap: RawSnapshot,
        product: JsonLdProduct,
        candidates: ImageCandidate[],
    ): string {
        const table = snap.specsTable.map((s) => `${s.label}: ${s.value}`).join('\n');
        return `${Parser.PROMPT}
TITLE: ${snap.title}
OG_TITLE: ${snap.ogTitle}
JSON_LD_PRODUCT: name="${product.name}" brand="${product.brand}"

ТАБЛИЦА ХАРАКТЕРИСТИК (приоритет для specs):
${table}

ТЕКСТ СТРАНИЦЫ (fallback):
${snap.text}

КАНДИДАТЫ-КАРТИНКИ (index alt url):
${formatCandidates(candidates)}`;
    }
}
