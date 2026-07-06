const URL_RE = /https?:\/\/\S+/gi;

export type GenCommand = { links: string[] };

export function extractLinks(text: string): string[] {
    const matches = text.match(URL_RE);
    if (!matches) {
        return [];
    }
    return matches.map((url) => url.replace(/[.,;!?)\]]+$/, ''));
}

// null — это не команда gen; { links: [] } — gen без ссылок
export function parseGenCommand(text: string, botUsername: string): GenCommand | null {
    const mention = `@${botUsername}`.toLowerCase();
    const lower = text.toLowerCase();
    const idx = lower.indexOf(mention);
    if (idx === -1) {
        return null;
    }

    const after = text.slice(idx + mention.length).trimStart();
    if (!/^gen\b/i.test(after)) {
        return null;
    }

    const rest = after.replace(/^gen\b/i, '');
    return { links: extractLinks(rest) };
}
