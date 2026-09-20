import type { Listing } from '../Bot.ts';
import type { Rich, RichPhoto } from './Telegram.ts';

// Превью «как на Avito» rich-сообщением: заголовок → цена → галерея → характеристики → описание → подвал с номером.
export class Preview {
    static rich(l: Listing): Rich {
        const photos = Preview.photos(l);
        return { markdown: Preview.markdown(l, photos), photos };
    }

    private static photos(l: Listing): RichPhoto[] {
        return l.cards.map((c) => ({ id: `card${c.slot}`, bytes: c.image, name: `${c.name}.png` }));
    }

    private static markdown(l: Listing, photos: RichPhoto[]): string {
        const price = `${Preview.money(l.price)} ₽`;
        const status = l.existing
            ? `обновит объявление № ${l.existing.avitoId}${Preview.wasPrice(l)}`
            : 'новое объявление';
        const gallery = photos.map((p) => `![](tg://photo?id=${p.id})`).join('\n');
        const specs = Preview.specs(l);
        const description = Preview.htmlToMarkdown(l.description.html);
        const category = [l.category.category, l.category.goodsType].filter(Boolean).join(' › ');
        return `# ${Preview.escape(l.description.title)}
## ${price}

<tg-slideshow>

${gallery}

</tg-slideshow>

${specs}

<details><summary>Описание — читать полностью</summary>

${description}

</details>

---
${category} · № ${l.id} · ${status} · [страница поставщика](${l.url})`;
    }

    // Только значения: тег Avito менеджеру ни о чём, значение говорит само за себя.
    private static specs(l: Listing): string {
        const values = ['Новое', l.category.goodsType, ...Object.values(l.category.attrs)].filter(
            Boolean,
        );
        return `**Характеристики:** ${values.join(' · ')}`;
    }

    // Description фида → markdown превью: <p> и <br/> — абзацы (одиночный перенос Telegram схлопывает), <strong> жирный, текст экранирован.
    private static htmlToMarkdown(html: string): string {
        return html
            .split(/(<[^>]+>)/)
            .map((part) => {
                switch (part) {
                    case '<p>':
                    case '':
                        return '';
                    case '</p>':
                        return '\n\n';
                    case '<br/>':
                        return '\n\n';
                    case '<strong>':
                    case '</strong>':
                        return '**';
                    default:
                        return part.startsWith('<')
                            ? ''
                            : Preview.escape(Preview.unescapeHtml(part));
                }
            })
            .join('')
            .replace(/\n[ \t]+/g, '\n')
            .trim();
    }

    private static unescapeHtml(s: string): string {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    private static escape(s: string): string {
        return s.replace(/[\\`*_[\]<>#]/g, '\\$&');
    }

    // Цена переопределена командой — показать старую, чтобы опечатка была видна до выгрузки.
    private static wasPrice(l: Listing): string {
        const old = Number(l.existing?.price.replace(/\s/g, ''));
        return old > 0 && old !== l.price ? ` (было ${Preview.money(old)} ₽)` : '';
    }

    private static money(n: number): string {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
}
