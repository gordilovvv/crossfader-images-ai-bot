import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Gemma } from '../AI/Gemma4.ts';
import { perf } from '../AI/Utils.ts';
import type { ParsedProduct } from '../Parser/Parser.ts';
import type { CategoryResult } from './CategoryLookup.ts';

// Title и Description фида. Товарную часть пишет модель (Body), шаблон магазина — константы здесь.
export type Description = { title: string; html: string };

export class ProductDescription {
    private static readonly PROMPT = readFileSync(
        new URL('./promts/description.md', import.meta.url),
        'utf8',
    );
    private static readonly Body = z.object({
        kind: z.string().min(10).max(120),
        benefit: z.string().min(60).max(420),
        bullets: z.array(z.string().trim().min(3).max(90)).min(2).max(6),
        fits: z.array(z.string().trim().min(3).max(60)).min(2).max(6),
    });
    private static readonly TITLE_MAX = 50;
    private static readonly DESCRIPTION_MAX = 7500;
    private static readonly BLANK = '<p>⠀</p>';
    private static readonly STOCK_LINE =
        'Новый, оригинальный, в заводской упаковке. Товар в наличии. Гарантия 12 месяцев.';
    private static readonly FOOTER = [
        '<p><strong>✅ ПОЧЕМУ ЗАКАЗЫВАЮТ У НАС</strong></p>',
        '<p><strong>Оригинальная техника</strong><br/> Продаем только новую технику в заводской упаковке.</p>',
        '<p><strong>Гарантия 12 месяцев</strong><br/> Предоставляем годовую гарантию от нашего сервисного центра <strong>CROSSFADER</strong>.</p>',
        '<p><strong>Товар в наличии</strong><br/> Не нужно ждать длительной поставки — оперативно оформляем и отправляем заказ.</p>',
        '<p><strong>Работаем официально</strong><br/> Юридическое лицо в России и Казахстане.</p>',
        '<p><strong>Чеки и документы</strong><br/> Предоставляем чек от магазина и закрывающие документы.</p>',
        '<p><strong>Поддержка на всех этапах</strong><br/> Поможем с выбором техники, оформлением заказа и ответим на вопросы после покупки.</p>',
        ProductDescription.BLANK,
        '<p><strong>🚚 ДОСТАВКА ПО РОССИИ И БЕЛАРУСИ</strong></p>',
        '<p>Отправляем заказы в любой город через:</p>',
        '<p>▪️ <strong>СДЭК</strong><br/> ▪️ <strong>ПЭК</strong></p>',
        '<p>Надежно упаковываем технику перед отправкой.</p>',
        ProductDescription.BLANK,
        '<p><strong>💳 ОПЛАТА</strong></p>',
        '<p><strong>Для физических лиц:</strong></p>',
        '<p>▪️ наличные<br/> ▪️ СБП<br/> ▪️ QR-код +12%<br/> ▪️ банковская карта +12%</p>',
        '<p>Оплата возможна в <strong>рублях, тенге, долларах и евро</strong>.</p>',
        '<p><strong>Для юридических лиц:</strong></p>',
        '<p>▪️ оплата на расчетный счет +12%<br/> ▪️ работаем в рублях и тенге<br/> ▪️ предоставляем закрывающие документы</p>',
        ProductDescription.BLANK,
        '<p>📩 <strong>Напишите нам или позвоните — проконсультируем, проверим наличие интересующего вас товара!</strong></p>',
    ].join(' ');
    // Ключ — GoodsType Avito (уровень 2 снапшота), запасной — Category.
    private static readonly EMOJI: Record<string, string> = {
        'Клавишные и синтезаторы': '🎹',
        'Гитары и другие струнные': '🎸',
        Ударные: '🥁',
        Духовые: '🎺',
        'Скрипки и другие смычковые': '🎻',
        'Аккордеоны, гармони, баяны': '🪗',
        'Для студии и концертов': '🎛️',
        Микрофоны: '🎤',
        Наушники: '🎧',
        'Акустика, колонки, сабвуферы': '🔊',
        'Усилители и ресиверы': '🔊',
        'Музыкальные центры, магнитолы': '🔊',
        'Кабели и адаптеры': '🔌',
    };
    private static readonly EMOJI_DEFAULT = '🎵';

    private readonly gemma: Gemma;

    constructor(gemma: Gemma = new Gemma()) {
        this.gemma = gemma;
    }

    async write(product: ParsedProduct, category: CategoryResult): Promise<Description> {
        const start = process.hrtime.bigint();
        const title = ProductDescription.title(product);
        const body = await this.gemma.askJson(
            ProductDescription.PROMPT + ProductDescription.facts(product),
            ProductDescription.Body,
        );
        const ad = {
            title,
            html: ProductDescription.html(title, ProductDescription.emoji(category), body),
        };
        perf('ProductDescription', `write "${title}" ${ad.html.length}ch`, start);
        return ad;
    }

    private static title(p: ParsedProduct): string {
        const title = `${p.identity.brand} ${p.identity.model}`
            .trim()
            .slice(0, ProductDescription.TITLE_MAX);
        if (!title) {
            throw new Error('[ProductDescription] у товара нет бренда и модели — пустой Title');
        }
        return title;
    }

    private static emoji(c: CategoryResult): string {
        return (
            ProductDescription.EMOJI[c.goodsType ?? ''] ??
            ProductDescription.EMOJI[c.category] ??
            ProductDescription.EMOJI_DEFAULT
        );
    }

    // Снимает маркер, если модель всё же его поставила; минус перед числом («-3 дБ») не трогает.
    private static clean(s: string): string {
        return s.replace(/^(?:\s|▪️|✓|•|(?:-|–|—)(?!\d))+/u, '').trim();
    }

    // Как в боевом фиде: каждая строка — <p>, списки — маркер + <br/> в одном <p>, пустая строка — <p>⠀</p>.
    private static html(
        name: string,
        emoji: string,
        b: z.infer<typeof ProductDescription.Body>,
    ): string {
        const esc = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/]]>/g, ']]&gt;');
        const item = (s: string) => esc(ProductDescription.clean(s));
        const list = (mark: string, items: string[]) =>
            `<p>${items.map((i) => `${mark} ${item(i)}`).join('<br/> ')}</p>`;
        const html = [
            `<p>${emoji} <strong>${esc(name)} — ${item(b.kind)}.</strong></p>`,
            `<p><strong>${ProductDescription.STOCK_LINE}</strong></p>`,
            `<p>${item(b.benefit)}</p>`,
            ProductDescription.BLANK,
            `<p><strong>🔥 ${esc(name)}</strong></p>`,
            list('▪️', b.bullets),
            '<p>Подойдет для:</p>',
            list('✓', b.fits),
            ProductDescription.BLANK,
            ProductDescription.FOOTER,
        ].join(' ');
        if (html.length > ProductDescription.DESCRIPTION_MAX) {
            throw new Error(
                `[ProductDescription] описание ${html.length} > ${ProductDescription.DESCRIPTION_MAX}`,
            );
        }
        return html;
    }

    private static facts(p: ParsedProduct): string {
        const d = p.dimensions;
        const dims = d.w && d.h ? `${d.w}×${d.h}×${d.d} ${d.unit}, ${d.weightKg} кг` : '—';
        const raw = p.description.html
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return `
title: ${p.identity.title}
brand: ${p.identity.brand}
model: ${p.identity.model}
country: ${p.identity.country || '—'}
dimensions: ${dims}
specs:
${p.specs.map((s) => `- ${s.label}: ${s.value}`).join('\n')}
contents: ${p.contents.join(', ') || '—'}
raw_description: ${raw.slice(0, 3000)}`;
    }
}
