// Единый источник правды по вёрстке карточек: примитивы -> типы токенов -> пер-слот спеки.
// Поля публичные static readonly — конфиг шарится между Graphics/Text/ImageGeneration.
// Дизайн авторится в 1200-пространстве (провалидировано против эталонов), рендерится на 1024
// (нативный размер фона от модели, без апскейла): px-токены пересчитываются через Style.px один раз.

export type TextStyle = {
    size: number;
    weight: number;
    color: string;
    leading?: number;
    letterSpacing?: number;
    shadow?: string;
};

export type BulletPreset = { size: number; leading: number };

// Оверфлоу: жёсткий кэп + одноступенчатый автофит (normal -> compact).
export type FitBlock = {
    normal: TextStyle;
    compact: BulletPreset;
    capNormal: number;
    capMax: number;
};

export class Style {
    static readonly CANVAS = { w: 1024, h: 1024 } as const;
    private static readonly BASE = 1200;

    // Пересчёт 1200-пространства дизайна в размер холста. Проценты (градиенты) не трогаем.
    static px(n: number): number {
        return Math.round((n * Style.CANVAS.w) / Style.BASE);
    }

    static readonly COLOR = {
        yellow: '#FFD600',
        black: '#1D1D1D',
        white: '#FFFFFF',
        icon: '#FDD408',
    } as const;

    static readonly FONT = { family: 'Onest', weights: [400, 500, 600, 700, 900] } as const;

    // Читаемость текста на AI-фото: сильный, но плавный многостоповый eased-скрим снизу (без text-shadow).
    static readonly SCRIM = {
        soft: 'linear-gradient(to bottom,rgba(12,10,8,0) 26%,rgba(12,10,8,0.12) 40%,rgba(12,10,8,0.34) 56%,rgba(12,10,8,0.6) 74%,rgba(12,10,8,0.85) 100%)',
    } as const;

    static readonly PAD = { x: Style.px(48), bottom: Style.px(72) } as const;

    static readonly BULLET = { char: '+', weight: 400, hangRatio: 0.75 } as const;

    // Динамический градиент (слот 4): start = blockTop - offset, но не выше floor.
    static readonly GRADIENT = { offset: Style.px(120), floor: Style.px(480) } as const;

    // Hero-укладка bbox товара (слот 1): вписать в maxW×maxH, центр по X, низ на bottomY.
    static readonly HERO = {
        maxW: Style.px(1080),
        maxH: Style.px(800),
        bottomY: Style.px(1180),
    } as const;

    // Лого справа-сверху — общий для слотов 2/3/4.
    static readonly LOGO_CORNER = {
        width: Style.px(280),
        top: Style.px(60),
        right: Style.px(64),
    } as const;

    static readonly SLOT2 = {
        title: {
            size: Style.px(100),
            weight: 900,
            color: Style.COLOR.white,
        } as TextStyle,
        titleGap: Style.px(16),
        bullets: {
            normal: {
                size: Style.px(40),
                leading: Style.px(66),
                weight: 700,
                color: Style.COLOR.yellow,
            },
            compact: { size: Style.px(36), leading: Style.px(54) },
            capNormal: 6,
            capMax: 8,
        } as FitBlock,
    };

    static readonly SLOT3 = {
        title: {
            size: Style.px(88),
            weight: 900,
            color: Style.COLOR.white,
        } as TextStyle,
        titleGap: Style.px(20),
        colors: {
            size: Style.px(38),
            weight: 700,
            color: Style.COLOR.yellow,
            letterSpacing: Style.px(-1),
        } as TextStyle,
    };

    static readonly SLOT4 = {
        gradientDensity: 0.78,
        title: {
            size: Style.px(92),
            weight: 900,
            color: Style.COLOR.white,
        } as TextStyle,
        titleGap: Style.px(16),
        bullets: {
            size: Style.px(40),
            leading: Style.px(66),
            weight: 700,
            color: Style.COLOR.yellow,
        } as TextStyle,
    };

    static readonly SLOT1 = {
        cornerPlusInset: Style.px(40),
        plusWidth: Style.px(28),
        caption: {
            size: Style.px(56),
            weight: 700,
            letterSpacing: Style.px(1),
            top: Style.px(120),
            maxWidth: Style.px(1000),
        } as const,
        brand: {
            size: Style.px(112),
            weight: 900,
            top: Style.px(198),
            maxWidth: Style.px(1080),
        } as const,
        logo: { left: Style.px(72), bottom: Style.px(160), width: Style.px(240) },
        badges: { left: Style.px(72), bottom: Style.px(72), h: Style.px(64), gap: Style.px(16) },
        // Правый нижний угол: белая полоса бренда + флаг.
        corner: {
            right: Style.px(72),
            bottom: Style.px(72),
            width: Style.px(120),
            fontSize: Style.px(24),
            letterSpacing: Style.px(2),
            padY: Style.px(7),
            padX: Style.px(4),
        },
    };

    // Оверфлоу-политика: обрезать до capMax, при N>capNormal перейти на compact-пресет.
    static fit(items: string[], block: FitBlock): { items: string[]; style: TextStyle } {
        const capped = items.slice(0, block.capMax);
        if (capped.length > block.capNormal) {
            return {
                items: capped,
                style: {
                    ...block.normal,
                    size: block.compact.size,
                    leading: block.compact.leading,
                },
            };
        }
        return { items: capped, style: block.normal };
    }
}
