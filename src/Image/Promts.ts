import { readFileSync } from 'node:fs';
import type { ParsedProduct } from '../Parser/Parser.ts';

export type CardPrompt = { slot: number; name: string; prompt: string };

// 4 фона под слоты 1..4. Слот 5 общий — статичный PNG-ассет, моделью не генерится.
export class Prompts {
    private static readonly FILES = [
        '01-hero-yellow.md',
        '02-interior-specs.md',
        '03-interior-lifestyle.md',
        '04-dimensions.md',
    ] as const;
    private static readonly PLACEHOLDER = '{{PRODUCT}}';
    private static readonly TEMPLATES = Prompts.FILES.map((file) =>
        readFileSync(new URL(`./prompts/${file}`, import.meta.url), 'utf8').trim(),
    );
    // Якорь высоты относительно взрослого 175 см: image-модель держит сравнение лучше, чем сантиметры.
    private static readonly HEIGHT_ANCHORS: Array<[number, string]> = [
        [20, 'fits in one hand'],
        [45, 'about the size of a shoebox, smaller than a side table'],
        [75, 'knee-high to an adult'],
        [110, 'waist-high to an adult'],
        [150, 'chest-high to an adult'],
        [200, 'about as tall as an adult'],
        [Number.POSITIVE_INFINITY, 'taller than an adult'],
    ];

    static build(product: ParsedProduct): CardPrompt[] {
        const facts = Prompts.facts(product);
        return Prompts.TEMPLATES.map((tpl, i) => ({
            slot: i + 1,
            name: Prompts.FILES[i]!.replace(/\.md$/, ''),
            prompt: tpl.replace(Prompts.PLACEHOLDER, facts),
        }));
    }

    private static facts(p: ParsedProduct): string {
        const { w, h, d, weightKg } = p.dimensions;
        const anchor = Prompts.HEIGHT_ANCHORS.find(([max]) => h < max)![1];
        return [
            'PRODUCT FACTS (internal, never render as text):',
            `kind: ${p.identity.title} (Russian)`,
            `model: ${p.identity.brand} ${p.identity.model}`.trim(),
            w > 0 && h > 0 && d > 0 && `size: ${w}×${h}×${d} cm (W×H×D) — ${anchor}`,
            weightKg > 0 && `weight: ${weightKg} kg`,
            `placement: ${p.placement}`,
        ]
            .filter((line): line is string => typeof line === 'string')
            .join('\n');
    }
}
