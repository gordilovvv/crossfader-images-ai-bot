import { readFileSync } from 'node:fs';

const DIR = new URL('./promts/', import.meta.url);

export type CardPrompt = { slot: number; name: string; prompt: string };

const FILES = [
    '01-hero-yellow.md',
    '02-interior-specs.md',
    '03-interior-lifestyle.md',
    '04-dimensions-yellow.md',
    '05-closeup-detail.md',
    '06-brand-general.md',
] as const;

export function loadCardPrompts(): CardPrompt[] {
    return FILES.map((file, i) => ({
        slot: i + 1,
        name: file.replace(/\.md$/, ''),
        prompt: readFileSync(new URL(file, DIR), 'utf8').trim(),
    }));
}
