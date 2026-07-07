// Текстовые слои карточек: позиционированные заголовки (с автофитом под ширину) и буллет-списки.
// Автофит выполняет Graphics.render по атрибуту data-fit-max (ужимает шрифт вылезающего span).
// Абсолютные методы (heading/bullets/line) — для top-якорных слотов (1, 5);
// flow-методы (*Flow) — для укладки внутри bottom-якорного блока (слоты 2/3/4).

import { Style, type TextStyle } from './Style.ts';

type HeadingOpts = {
    top: number;
    size: number;
    color: string;
    weight?: number;
    left?: number; // если задан — выравнивание влево от left; иначе по центру канвы
    maxWidth: number;
    letterSpacing?: number;
};

type BulletsOpts = {
    left: number;
    top: number;
    size: number;
    color: string;
    lineHeight: number;
    weight?: number;
    maxWidth: number;
};

export class Text {
    static esc(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private static bulletRows(items: string[], size: number, leading: number): string {
        // Висячий «+»: текст выровнен по левой линии колонки, маркер вылезает влево (абсолютом, чтобы не срезался).
        const marker = Math.round(size * Style.BULLET.hangRatio);
        return items
            .map(
                (it) =>
                    `<div style="position:relative;line-height:${leading}px"><span style="position:absolute;left:-${marker}px;top:0;font-weight:${Style.BULLET.weight}">${Style.BULLET.char}</span><span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Text.esc(it.toUpperCase())}</span></div>`,
            )
            .join('');
    }

    static heading(text: string, o: HeadingOpts): string {
        const container =
            o.left === undefined
                ? `left:0;width:100%;text-align:center`
                : `left:${o.left}px;right:0;text-align:left`;
        const span =
            `font-weight:${o.weight ?? 900};font-size:${o.size}px;color:${o.color};` +
            `line-height:1.02;white-space:nowrap;display:inline-block` +
            (o.letterSpacing ? `;letter-spacing:${o.letterSpacing}px` : '');
        return `<div style="position:absolute;${container};top:${o.top}px">
<span data-fit-max="${o.maxWidth}" style="${span}">${Text.esc(text.toUpperCase())}</span>
</div>`;
    }

    static bullets(items: string[], o: BulletsOpts): string {
        return `<div style="position:absolute;left:${o.left}px;top:${o.top}px;max-width:${o.maxWidth}px;
font-weight:${o.weight ?? 700};font-size:${o.size}px;color:${o.color}">${Text.bulletRows(items, o.size, o.lineHeight)}</div>`;
    }

    // Одиночная строка без автофита (для «Доступные цвета», «Произведено в …»).
    // lineHeight — задаёт высоту строки: для верт. центровки строки по высоте соседнего блока (лого).
    static line(text: string, o: HeadingOpts & { right?: number; lineHeight?: number }): string {
        const pos =
            o.right !== undefined
                ? `right:${o.right}px;text-align:right`
                : `left:${o.left ?? 0}px;text-align:left`;
        const style =
            `font-weight:${o.weight ?? 700};font-size:${o.size}px;color:${o.color};` +
            `white-space:nowrap` +
            (o.lineHeight ? `;line-height:${o.lineHeight}px` : '') +
            (o.letterSpacing ? `;letter-spacing:${o.letterSpacing}px` : '');
        return `<div style="position:absolute;${pos};top:${o.top}px;${style}">${Text.esc(text.toUpperCase())}</div>`;
    }

    // --- flow-варианты для bottom-якорного блока (без position:absolute) ---

    static headingFlow(text: string, o: TextStyle & { maxWidth: number }): string {
        const span =
            `font-weight:${o.weight};font-size:${o.size}px;color:${o.color};` +
            `line-height:1.02;white-space:nowrap;display:inline-block` +
            (o.letterSpacing ? `;letter-spacing:${o.letterSpacing}px` : '') +
            (o.shadow ? `;text-shadow:${o.shadow}` : '');
        return `<div style="text-align:left"><span data-fit-max="${o.maxWidth}" style="${span}">${Text.esc(text.toUpperCase())}</span></div>`;
    }

    static bulletsFlow(items: string[], o: TextStyle): string {
        const shadow = o.shadow ? `;text-shadow:${o.shadow}` : '';
        return `<div style="font-weight:${o.weight};font-size:${o.size}px;color:${o.color}${shadow}">${Text.bulletRows(items, o.size, o.leading ?? o.size)}</div>`;
    }

    static lineFlow(text: string, o: TextStyle & { maxWidth: number }): string {
        const style =
            `font-weight:${o.weight};font-size:${o.size}px;color:${o.color};white-space:nowrap` +
            (o.letterSpacing ? `;letter-spacing:${o.letterSpacing}px` : '') +
            (o.shadow ? `;text-shadow:${o.shadow}` : '');
        return `<div data-fit-max="${o.maxWidth}" style="${style}">${Text.esc(text.toUpperCase())}</div>`;
    }

    static gap(px: number): string {
        return `<div style="height:${px}px"></div>`;
    }
}
