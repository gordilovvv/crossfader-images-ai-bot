import { readFileSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright';
import { Countries } from './Countries.ts';
import { Style } from './Style.ts';

const ASSETS = new URL('./assets/', import.meta.url);

function readAsset(rel: string): Buffer {
    return readFileSync(new URL(rel, ASSETS));
}

function dataUri(buf: Buffer, mime: string): string {
    return `data:${mime};base64,${buf.toString('base64')}`;
}

// PNG/JPEG по magic-байтам — фон от модели приходит и тем, и тем.
export function imageDataUri(buf: Buffer): string {
    if (buf[0] === 0x89 && buf[1] === 0x50) {
        return dataUri(buf, 'image/png');
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
        return dataUri(buf, 'image/jpeg');
    }
    throw new Error('[Graphics] фон не PNG/JPEG');
}

// Рендер HTML-карточек в PNG через один переиспользуемый headless-браузер.
export class Graphics {
    static readonly SIZE = Style.CANVAS.w;
    static readonly YELLOW = '#FFD600';
    static readonly BLACK = '#1D1D1D';

    private static readonly FONTS: ReadonlyArray<{ weight: number; file: string }> = [
        { weight: 400, file: 'Onest-Regular.ttf' },
        { weight: 500, file: 'Onest-Medium.ttf' },
        { weight: 600, file: 'Onest-SemiBold.ttf' },
        { weight: 700, file: 'Onest-Bold.ttf' },
        { weight: 900, file: 'Onest-Black.ttf' },
    ];

    private static readonly LOGO_SVG = readAsset('logo.svg').toString('utf8');
    private static readonly PLUS_SVG = readAsset('plus.svg').toString('utf8');
    // Бейджи бывают только на жёлтой обложке — прозрачная капсула мылится, делаем solid тёмной под белый текст.
    private static readonly BADGES = ['badge_original', 'badge_delivery', 'badge_quality'].map(
        (name) =>
            readAsset(`${name}.svg`)
                .toString('utf8')
                .replace('fill="white" fill-opacity="0.15"', 'fill="#1D1D1D" fill-opacity="1"'),
    );
    private static readonly CARD5 = readAsset('card-general.jpg');

    private browser: Browser | undefined;
    private page: Page | undefined;

    private async ready(): Promise<Page> {
        if (!this.page) {
            this.browser = await chromium.launch();
            this.page = await this.browser.newPage({
                viewport: { width: Graphics.SIZE, height: Graphics.SIZE },
                deviceScaleFactor: 1,
            });
        }
        return this.page;
    }

    async close(): Promise<void> {
        await this.browser?.close();
        this.browser = undefined;
        this.page = undefined;
    }

    /**
     * inner — слои внутри #stage. mode 'hero' — залить #stage цветом фона AI-картинки и уложить
     * bbox товара (он на сплошном жёлтом) в зону под заголовком, стабильно при любом кадрировании модели.
     */
    async render(inner: string, mode: 'plain' | 'hero' = 'plain'): Promise<Buffer> {
        const page = await this.ready();
        await page.setContent(Graphics.skeleton(inner), { waitUntil: 'load' });
        await page.evaluate(
            () =>
                (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } })
                    .document.fonts.ready,
        );
        if (mode === 'hero') {
            await page.evaluate(
                async (hero) => {
                    const doc = (globalThis as unknown as { document: any }).document;
                    const img = doc.querySelector('#stage .bg');
                    if (!img) {
                        return;
                    }
                    await img.decode();
                    const nw = img.naturalWidth;
                    const nh = img.naturalHeight;
                    const c = doc.createElement('canvas');
                    c.width = nw;
                    c.height = nh;
                    const ctx = c.getContext('2d');
                    if (!ctx) {
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    const px = ctx.getImageData(0, 0, nw, nh).data;
                    const bg = [px[0], px[1], px[2]];
                    doc.querySelector('#stage').style.background =
                        `rgb(${bg[0]},${bg[1]},${bg[2]})`;
                    // bbox товара = пиксели, заметно отличные от фона
                    let minX = nw;
                    let minY = nh;
                    let maxX = 0;
                    let maxY = 0;
                    for (let y = 0; y < nh; y += 2) {
                        for (let x = 0; x < nw; x += 2) {
                            const i = (y * nw + x) * 4;
                            const diff =
                                Math.abs(px[i] - bg[0]) +
                                Math.abs(px[i + 1] - bg[1]) +
                                Math.abs(px[i + 2] - bg[2]);
                            if (diff > 90) {
                                if (x < minX) {
                                    minX = x;
                                }
                                if (x > maxX) {
                                    maxX = x;
                                }
                                if (y < minY) {
                                    minY = y;
                                }
                                if (y > maxY) {
                                    maxY = y;
                                }
                            }
                        }
                    }
                    const bw = Math.max(1, maxX - minX);
                    const bh = Math.max(1, maxY - minY);
                    // Уложить bbox товара: центр по X, низ на bottomY, размер в пределах maxW×maxH
                    const scale = Math.min(hero.maxW / bw, hero.maxH / bh);
                    const tx = (hero.canvas - bw * scale) / 2;
                    const ty = hero.bottomY - bh * scale;
                    img.style.width = `${nw * scale}px`;
                    img.style.height = 'auto';
                    img.style.left = `${tx - minX * scale}px`;
                    img.style.top = `${ty - minY * scale}px`;
                    img.style.transform = 'none';
                },
                {
                    maxW: Style.HERO.maxW,
                    maxH: Style.HERO.maxH,
                    bottomY: Style.HERO.bottomY,
                    canvas: Graphics.SIZE,
                },
            );
        }
        // Автофит: ужать шрифт заголовков, вылезающих за data-fit-max.
        await page.evaluate(() => {
            const g = globalThis as unknown as {
                document: any;
                getComputedStyle: (el: any) => { fontSize: string };
            };
            for (const el of g.document.querySelectorAll('[data-fit-max]')) {
                const max = Number(el.dataset.fitMax);
                let size = Number.parseFloat(g.getComputedStyle(el).fontSize);
                while (el.scrollWidth > max && size > 24) {
                    size -= 2;
                    el.style.fontSize = `${size}px`;
                }
            }
        });
        // Градиент bottom-блока привязываем к его верху (после автофита высота блока финальна).
        await page.evaluate(
            ({ offset, floor, size }) => {
                const g = globalThis as unknown as { document: any };
                const block = g.document.getElementById('txtblock');
                const scrim = g.document.getElementById('scrim');
                if (!block || !scrim) {
                    return;
                }
                const start = Math.max(floor, block.offsetTop - offset);
                const pct = ((start / size) * 100).toFixed(1);
                scrim.style.background = `linear-gradient(to bottom,rgba(0,0,0,0) ${pct}%,rgba(0,0,0,${scrim.dataset.density}) 100%)`;
            },
            { offset: Style.GRADIENT.offset, floor: Style.GRADIENT.floor, size: Graphics.SIZE },
        );
        return page.screenshot({ type: 'png' });
    }

    private static skeleton(inner: string): string {
        return `<!doctype html><html><head><meta charset="utf-8"><style>
${Graphics.fontFaceCss()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${Graphics.SIZE}px;height:${Graphics.SIZE}px}
#stage{position:relative;width:${Graphics.SIZE}px;height:${Graphics.SIZE}px;overflow:hidden;background:#000;font-family:Onest,sans-serif;-webkit-font-smoothing:antialiased}
#stage .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
#stage .badge svg,#stage .logo svg,#stage .flag svg,#stage .plus svg{display:block;width:100%;height:auto}
</style></head><body><div id="stage">${inner}</div></body></html>`;
    }

    private static fontFaceCss(): string {
        return Graphics.FONTS.map(({ weight, file }) => {
            const uri = dataUri(readAsset(`fonts/${file}`), 'font/ttf');
            return `@font-face{font-family:Onest;font-weight:${weight};font-style:normal;src:url(${uri}) format('truetype')}`;
        }).join('\n');
    }

    /** Фон-слой из AI-картинки. hero — товар в нижних 2/3, верх добираем заливкой (см. sampleBg). */
    static bg(photo: Buffer, hero = false): string {
        const uri = imageDataUri(photo);
        // hero: реальную укладку товара делает render(mode:'hero') по bbox; тут только базовое позиционирование.
        const style = hero ? 'position:absolute;bottom:0;left:0;object-fit:contain' : '';
        return `<img class="bg" src="${uri}"${style ? ` style="${style}"` : ''}>`;
    }

    /** Тёмный градиент снизу под читаемость текста. top — верх зоны затемнения (px), max — плотность 0..1. */
    static scrimBottom(top: number, max = 0.75): string {
        const pct = ((top / Graphics.SIZE) * 100).toFixed(1);
        return `<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) ${pct}%,rgba(0,0,0,${max}) 100%)"></div>`;
    }

    /** Лёгкий eased-скрим на весь кадр (проценты resolution-independent). Контраст добивает text-shadow. */
    static scrimSoft(): string {
        return `<div style="position:absolute;inset:0;background:${Style.SCRIM.soft}"></div>`;
    }

    /** Динамический градиент: фон ставит render по верху #txtblock. density кладём в data-атрибут. */
    static scrimDynamic(density: number): string {
        return `<div id="scrim" data-density="${density}" style="position:absolute;inset:0"></div>`;
    }

    /** Bottom-якорный текст-блок: заголовок+буллеты стопкой едут вверх от нижнего поля. */
    static textBlockBottom(inner: string): string {
        return `<div id="txtblock" style="position:absolute;left:${Style.PAD.x}px;right:${Style.PAD.x}px;bottom:${Style.PAD.bottom}px">${inner}</div>`;
    }

    /** Плюсики по 4 углам, нижние приглушены. */
    static plusCorners(inset = 40): string {
        const one = (pos: string, op: number) =>
            `<span class="plus" style="position:absolute;${pos};width:${Style.SLOT1.plusWidth}px;opacity:${op}">${Graphics.PLUS_SVG}</span>`;
        return [
            one(`top:${inset}px;left:${inset}px`, 1),
            one(`top:${inset}px;right:${inset}px`, 1),
            one(`bottom:${inset}px;left:${inset}px`, 0.35),
            one(`bottom:${inset}px;right:${inset}px`, 0.35),
        ].join('');
    }

    /** Жёлтая плашка-лого — контрастна на любом фоне (жёлтый бренда + чёрный текст). */
    static logo(pos: string, width: number): string {
        return `<span class="logo" style="position:absolute;${pos};width:${width}px">${Graphics.LOGO_SVG}</span>`;
    }

    static badgesRow(pos: string, height = 70, gap = 24): string {
        const badges = Graphics.BADGES.map(
            (svg) => `<span class="badge" style="height:${height}px">${svg}</span>`,
        ).join('');
        return `<div class="badges" style="position:absolute;${pos};display:flex;align-items:center;gap:${gap}px">${badges}</div>`;
    }

    /** Правый нижний угол карточки 1: белая полоса с брендом + прямоугольный флаг (без скруглений/плашки). Неизвестная страна -> только бренд-полоса. */
    static brandCountryCorner(brand: string, country: string, pos: string): string {
        const entry = Countries.resolve(country);
        const flag = entry
            ? `<span class="flag" style="display:block;line-height:0">${readAsset(`flags/${entry.iso}.svg`).toString('utf8')}</span>`
            : '';
        const c = Style.SLOT1.corner;
        return `<div style="position:absolute;${pos};width:${c.width}px">
<div style="background:#fff;text-align:center;font-weight:800;font-size:${c.fontSize}px;letter-spacing:${c.letterSpacing}px;color:${Graphics.BLACK};padding:${c.padY}px ${c.padX}px">${brand.toUpperCase()}</div>
${flag}
</div>`;
    }

    /** Статичная общая карточка 5 — готовый ассет, ничего не рендерим. */
    static card5(): Buffer {
        return Graphics.CARD5;
    }
}
