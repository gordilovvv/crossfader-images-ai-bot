import { readFileSync } from 'node:fs';

const DIR = new URL('./prompts/', import.meta.url);

export type CardPrompt = { slot: number; name: string; prompt: string };

// 5 фонов под слоты 1..5. Слот 6 общий — статичный PNG-ассет, моделью не генерится.
const FILES = [
    '01-hero-yellow.md',
    '02-interior-specs.md',
    '03-interior-lifestyle.md',
    '04-dimensions.md',
    '05-closeup-detail.md',
] as const;

export function loadCardPrompts(): CardPrompt[] {
    return FILES.map((file, i) => ({
        slot: i + 1,
        name: file.replace(/\.md$/, ''),
        prompt: readFileSync(new URL(file, DIR), 'utf8').trim(),
    }));
}
