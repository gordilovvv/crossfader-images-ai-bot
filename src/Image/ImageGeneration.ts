import { NanoBanano } from '../AI/NanoBanano.ts';
import type { RefImage } from '../AI/Utils.ts';
import { perf } from '../AI/Utils.ts';
import type { ParsedProduct } from '../Parser/Parser.ts';
import { Graphics } from './Graphics.ts';
import { Prompts } from './Promts.ts';
import { Style } from './Style.ts';
import { Text } from './Text.ts';

// Вход ImageGeneration = факты парсера + цвета из enricher-шага.
export type ProductData = ParsedProduct & { colors: string[] };

export type CardImage = { slot: number; name: string; image: Buffer };

/*
Пайплайн карточки: модель генерит только ФОН-фото (без текста) -> код кладёт HTML-слои
(scrim/лого/бейджи/текст) поверх -> Playwright снимает 1200×1200 PNG. Карточка 6 общая — статичный ассет.
Шаблон вёрстки (координаты, цвета, ассеты) описан в методах cardN ниже; жёлтый бренда #FFD600, шрифт Onest, всё КАПСОМ.
*/

export class ImageGeneration {
    private static readonly TEXT_W = Style.CANVAS.w - Style.PAD.x * 2;
    private static readonly LOGO_CORNER =
        `right:${Style.LOGO_CORNER.right}px;top:${Style.LOGO_CORNER.top}px`;

    private readonly nano = new NanoBanano();
    private readonly graphics = new Graphics();

    async generate(product: ProductData, photo: RefImage): Promise<CardImage[]> {
        const start = process.hrtime.bigint();
        try {
            const prompts = Prompts.build(product);
            const backgrounds = await Promise.all(
                prompts.map((card) => this.nano.generate(card.prompt, [photo])),
            );
            const builders = [this.card1, this.card2, this.card3, this.card4] as const;
            const cards: CardImage[] = [];
            for (let i = 0; i < builders.length; i++) {
                const card = prompts[i];
                const bg = backgrounds[i];
                const build = builders[i];
                if (!card || !bg || !build) {
                    throw new Error(`[ImageGeneration] нет фона для слота ${i + 1}`);
                }
                const image = await build.call(this, product, bg);
                cards.push({ slot: card.slot, name: card.name, image });
            }
            cards.push({ slot: 5, name: '05-brand-general', image: Graphics.card5() });
            perf(
                'ImageGeneration',
                `${cards.length} карточек (${product.identity.brand} ${product.identity.model})`,
                start,
            );
            return cards;
        } finally {
            await this.graphics.close();
        }
    }

    private get brandModel(): (p: ProductData) => string {
        return (p) => `${p.identity.brand} ${p.identity.model}`.trim();
    }

    /** Обложка: жёлтый фон, заголовок сверху, товар в полосе между ним и нижним рядом лого+бейджи, флаг справа. */
    private async card1(p: ProductData, bg: Buffer): Promise<Buffer> {
        const s1 = Style.SLOT1;
        const inner = [
            Graphics.bg(bg),
            Graphics.plusCorners(s1.cornerPlusInset),
            Text.heading(p.identity.title, {
                top: s1.caption.top,
                size: s1.caption.size,
                weight: s1.caption.weight,
                color: Style.COLOR.black,
                maxWidth: s1.caption.maxWidth,
                letterSpacing: s1.caption.letterSpacing,
            }),
            Text.heading(this.brandModel(p), {
                top: s1.brand.top,
                size: s1.brand.size,
                weight: s1.brand.weight,
                color: Style.COLOR.black,
                maxWidth: s1.brand.maxWidth,
            }),
            Graphics.logo(`left:${s1.logo.left}px;bottom:${s1.logo.bottom}px`, s1.logo.width),
            Graphics.badgesRow(
                `left:${s1.badges.left}px;bottom:${s1.badges.bottom}px`,
                s1.badges.h,
                s1.badges.gap,
            ),
            Graphics.flagCorner(
                p.identity.country,
                `right:${s1.flag.right}px;bottom:${s1.flag.bottom}px`,
            ),
        ].join('');
        return this.graphics.render(inner, 'hero');
    }

    /** Характеристики: AI-интерьер, статический скрим, лого справа-сверху, bottom-блок заголовок+буллеты. */
    private async card2(p: ProductData, bg: Buffer): Promise<Buffer> {
        const s2 = Style.SLOT2;
        const specs = p.specs.map((sp) => `${sp.label} ${sp.value}`);
        const fit = Style.fit(specs, s2.bullets);
        const block = Graphics.textBlockBottom(
            Text.headingFlow(this.brandModel(p), {
                ...s2.title,
                maxWidth: ImageGeneration.TEXT_W,
            }) +
                Text.gap(s2.titleGap) +
                Text.bulletsFlow(fit.items, fit.style),
        );
        const inner = [
            Graphics.bg(bg),
            Graphics.scrimSoft(),
            Graphics.logo(ImageGeneration.LOGO_CORNER, Style.LOGO_CORNER.width),
            block,
        ].join('');
        return this.graphics.render(inner);
    }

    /** Lifestyle: AI с человеком, bottom-блок заголовок + строка «Доступные цвета». */
    private async card3(p: ProductData, bg: Buffer): Promise<Buffer> {
        const s3 = Style.SLOT3;
        const colorsLine = p.colors.length
            ? Text.gap(s3.titleGap) +
              Text.lineFlow(`Доступные цвета: ${p.colors.join(', ')}`, {
                  ...s3.colors,
                  maxWidth: ImageGeneration.TEXT_W,
              })
            : '';
        const block = Graphics.textBlockBottom(
            Text.headingFlow(this.brandModel(p), {
                ...s3.title,
                maxWidth: ImageGeneration.TEXT_W,
            }) + colorsLine,
        );
        const inner = [
            Graphics.bg(bg),
            Graphics.scrimSoft(),
            Graphics.logo(ImageGeneration.LOGO_CORNER, Style.LOGO_CORNER.width),
            block,
        ].join('');
        return this.graphics.render(inner);
    }

    /** Габариты: тёмный AI-фон, динамический скрим, заголовок ГАБАРИТЫ, буллеты Ш/В/Г/Вес в ММ/КГ. */
    private async card4(p: ProductData, bg: Buffer): Promise<Buffer> {
        const d = p.dimensions;
        const mm = (cm: number) => String(Math.round(cm * 10));
        const kg = String(d.weightKg).replace('.', ',');
        const bullets = [
            `Ширина: ${mm(d.w)} мм`,
            `Высота: ${mm(d.h)} мм`,
            `Глубина: ${mm(d.d)} мм`,
            `Вес: ${kg} кг`,
        ];
        const block = Graphics.textBlockBottom(
            Text.headingFlow('Габариты', {
                ...Style.SLOT4.title,
                maxWidth: ImageGeneration.TEXT_W,
            }) +
                Text.gap(Style.SLOT4.titleGap) +
                Text.bulletsFlow(bullets, Style.SLOT4.bullets),
        );
        const inner = [
            Graphics.bg(bg),
            Graphics.scrimDynamic(Style.SLOT4.gradientDensity),
            Graphics.logo(ImageGeneration.LOGO_CORNER, Style.LOGO_CORNER.width),
            block,
        ].join('');
        return this.graphics.render(inner);
    }
}
