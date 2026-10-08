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
     * inner — слои внутри #stage. mode 'hero' — подтянуть жёлтый фон AI-картинки к цвету лого и уложить
     * bbox товара в полосу между заголовком и нижним рядом, стабильно при любом кадрировании модели.
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
                    const data = ctx.getImageData(0, 0, nw, nh);
                    const px = data.data;
                    // Цвет фона = медиана по рамке кадра (один пиксель хрупок: артефакт JPEG, край товара).
                    const ring: number[] = [];
                    for (let k = 0; k < nw; k += 4) {
                        ring.push(
                            k * 4,
                            ((nh - 1) * nw + k) * 4,
                            k * nw * 4,
                            (k * nw + nw - 1) * 4,
                        );
                    }
                    const median = (ch: number) =>
                        ring.map((i) => px[i + ch] ?? 0).sort((a, b) => a - b)[ring.length >> 1] ??
                        0;
                    const bg = [median(0), median(1), median(2)] as const;
                    const bgDiff =
                        Math.abs(bg[0] - hero.bg[0]) +
                        Math.abs(bg[1] - hero.bg[1]) +
                        Math.abs(bg[2] - hero.bg[2]);
                    if (bgDiff > hero.tol.none) {
                        throw new Error(
                            `[Graphics] hero: фон модели не жёлтый rgb(${bg.join(',')})`,
                        );
                    }
                    const [dr, dg, db] = [
                        hero.bg[0] - bg[0],
                        hero.bg[1] - bg[1],
                        hero.bg[2] - bg[2],
                    ];
                    const span = hero.tol.none - hero.tol.full;
                    // Фон модели дрейфует по оттенку: пиксели, близкие к фону, тянем к цвету лого; bbox = остальное.
                    let minX = nw;
                    let minY = nh;
                    let maxX = 0;
                    let maxY = 0;
                    for (let y = 0; y < nh; y++) {
                        for (let x = 0; x < nw; x++) {
                            const i = (y * nw + x) * 4;
                            const diff =
                                Math.abs(px[i] - bg[0]) +
                                Math.abs(px[i + 1] - bg[1]) +
                                Math.abs(px[i + 2] - bg[2]);
                            if (diff > hero.tol.none) {
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
                                continue;
                            }
                            if (diff <= hero.tol.full) {
                                px[i] = hero.bg[0];
                                px[i + 1] = hero.bg[1];
                                px[i + 2] = hero.bg[2];
                                continue;
                            }
                            const w = (hero.tol.none - diff) / span;
                            px[i] += dr * w;
                            px[i + 1] += dg * w;
                            px[i + 2] += db * w;
                        }
                    }
                    ctx.putImageData(data, 0, 0);
                    doc.querySelector('#stage').style.background =
                        `rgb(${hero.bg[0]},${hero.bg[1]},${hero.bg[2]})`;
                    const bw = maxX - minX;
                    const bh = maxY - minY;
                    if (bw < nw * 0.05 || bh < nh * 0.05) {
                        throw new Error(
                            `[Graphics] hero: товар не найден на фоне (bbox ${bw}×${bh})`,
                        );
                    }
                    if (bw > nw * 0.97 && bh > nh * 0.97) {
                        throw new Error(
                            '[Graphics] hero: товар занимает весь кадр, фон не отделить',
                        );
                    }
                    // Уложить bbox товара: вписать в maxW×(bottom-top), центр полосы по X и Y
                    const scale = Math.min(hero.maxW / bw, (hero.bottom - hero.top) / bh);
                    const tx = (hero.canvas - bw * scale) / 2;
                    const ty = hero.top + (hero.bottom - hero.top - bh * scale) / 2;
                    c.style.cssText = `position:absolute;width:${nw * scale}px;height:${nh * scale}px;left:${tx - minX * scale}px;top:${ty - minY * scale}px`;
                    img.replaceWith(c);
                },
                {
                    top: Style.HERO.top,
                    bottom: Style.HERO.bottom,
                    maxW: Style.HERO.maxW,
                    tol: Style.HERO.bgTolerance,
                    bg: Graphics.rgb(Style.COLOR.yellow),
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
#stage .logo svg,#stage .plus svg{display:block;width:100%;height:auto}
#stage .badge svg,#stage .flag svg{display:block;width:auto;height:100%}
</style></head><body><div id="stage">${inner}</div></body></html>`;
    }

    private static fontFaceCss(): string {
        return Graphics.FONTS.map(({ weight, file }) => {
            const uri = dataUri(readAsset(`fonts/${file}`), 'font/ttf');
            return `@font-face{font-family:Onest;font-weight:${weight};font-style:normal;src:url(${uri}) format('truetype')}`;
        }).join('\n');
    }

    /** Фон-слой из AI-картинки. */
    static bg(photo: Buffer): string {
        return `<img class="bg" src="${imageDataUri(photo)}">`;
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

    /** Плюсики по 4 углам. */
    static plusCorners(inset: number): string {
        const one = (pos: string) =>
            `<span class="plus" style="position:absolute;${pos};width:${Style.SLOT1.plusWidth}px">${Graphics.PLUS_SVG}</span>`;
        return [
            one(`top:${inset}px;left:${inset}px`),
            one(`top:${inset}px;right:${inset}px`),
            one(`bottom:${inset}px;left:${inset}px`),
            one(`bottom:${inset}px;right:${inset}px`),
        ].join('');
    }

    static rgb(hex: string): [number, number, number] {
        const n = Number.parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /** Жёлтая плашка-лого — контрастна на любом фоне (жёлтый бренда + чёрный текст). */
    static logo(pos: string, width: number): string {
        return `<span class="logo" style="position:absolute;${pos};width:${width}px">${Graphics.LOGO_SVG}</span>`;
    }

    static badgesRow(pos: string, height: number, gap: number): string {
        const badges = Graphics.BADGES.map(
            (svg) => `<span class="badge" style="height:${height}px">${svg}</span>`,
        ).join('');
        return `<div class="badges" style="position:absolute;${pos};display:flex;align-items:center;gap:${gap}px">${badges}</div>`;
    }

    /** Правый нижний угол карточки 1: прямоугольный флаг страны. Неизвестная страна -> ничего. */
    static flagCorner(country: string, pos: string): string {
        const entry = Countries.resolve(country);
        if (!entry) {
            return '';
        }
        const f = Style.SLOT1.flag;
        const inner = f.h - 2 * f.frame;
        return `<span class="flag" style="position:absolute;${pos};height:${f.h}px;width:${Math.round((inner * 4) / 3) + 2 * f.frame}px;padding:${f.frame}px;background:#fff;line-height:0">${readAsset(`flags/${entry.iso}.svg`).toString('utf8')}</span>`;
    }

    /** Статичная общая карточка 5 — готовый ассет, ничего не рендерим. */
    static card5(): Buffer {
        return Graphics.CARD5;
    }
}
