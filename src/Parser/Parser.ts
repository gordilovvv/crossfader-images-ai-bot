/*
=== Финальный объект парсера под Avito (спека) ===

1) Ходит ли парсер в gemini за цветами, если не достал? — НЕТ.
   - Цвета нужны только картинке №3 («Доступные цвета: black, white, rosewood»).
     В Avito-фиде цветов нет вообще (проверено по реальному фиду и докам).
   - В коде нет gemini с веб-доступом (grounding/googleSearch не подключён).
     «Спросить у gemini доступные цвета» — отдельный AI-шаг, не работа парсера. файл COlorsSearch
   - Парсер тупой и тестируемый: url -> факты со страницы. Не нашёл цвет -> [],
     дозаполнит enrichment-шаг. (Но парсер использует snapshot и gemma чтобы доатсть все, не по классам или еще чему то сайты разные поставщиков)

2) Хватает ли данных в фиде?
   - Базовый минимум да: Id, Title, Description, Images, Address, Category,
     GoodsType, AdType, Condition, Price + Brand, InstrumentType, Model, TargetAudience.
   - Категорийные поля под гитары/пианино/комбики берём из Avito API:
     GET /autoload/v1/user-docs/node/{slug}/fields (описан в docs/avito/autoload.md).

3) Принцип: ПАРСЕР НЕ ЗНАЕТ таксономию Avito.
   Он заполняет только сырьё со страницы. Классификацию (avito) и colors дописывает
   отдельный AI-шаг (enricher). Разделение зашито в типы, чтобы полузаполненный
   продукт не пролез в XML-генератор.

Секции 1:1 ложатся на требования картинок из FigJam:
   identity -> заголовки/бренд, specs -> характеристики, dimensions -> карт. габаритов,
   contents -> комплектация, colors -> карт. цветов.

 где живёт классификация GoodsType/InstrumentType вот тут src/XMLFeedAvito/CategoryLookup.ts (но ээти все штуки будут вызывать уже перед сбором xml)
*/

// Что отдаёт ПАРСЕР (url -> факты, без Avito, без цветов): @TODO interface
export type ParsedProduct = {
    source: { url: string };
    identity: { title: string; brand: string; model: string; vendor: string; country: string };
    specs: Array<{ label: string; value: string }>;
    dimensions: { w: number; h: number; d: number; unit: string; weightKg: number };
    contents: string[];
    images: { source: string[] };
    description: { html: string };
};

// Что отдаёт ENRICHER (AI-шаг после парсера) — только его принимает XML-генератор: @TODO interface
export type ProductData = ParsedProduct & {
    avito: {
        category: string;
        goodsType: string;
        instrumentType: string;
        condition: string;
        adType: string;
        price: number;
    };
    colors: string[];
};
