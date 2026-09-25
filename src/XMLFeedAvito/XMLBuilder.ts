import { createHash } from 'node:crypto';
import { perf } from '../AI/Utils.ts';
import type { Listing } from '../Bot.ts';
import type { AvitoProducts } from './AvitoProducts.ts';

// Фид = активные строки all.xlsx как есть + объявления плана (перезаписанная строка или новое): на Avito уезжают только изменения.
export class XMLBuilder {
    private static readonly ACTIVE = 'Активно';
    private static readonly MAX_IMAGES = 10;
    private static readonly INVISIBLE_RE = /[⁠​﻿]/g;
    private static readonly MULTI_SPLIT = /\s*\|\s*/;
    private static readonly SKIP_TAGS = new Set(['AvitoStatus', 'AvitoDateEnd', 'EMail']);
    private static readonly CDATA_TAGS = new Set(['Description', 'VideoFileURL']);
    // Общие поля объявления по docs/avito/xml-format.md; остальные колонки строки — категорийные, при перезаписи заменяются результатом классификатора (с логом).
    private static readonly COMMON_TAGS = new Set([
        'DateBegin',
        'DateEnd',
        'ListingFee',
        'AdStatus',
        'ManagerName',
        'ContactPhone',
        'ContactMethod',
        'InternetCalls',
        'CallsDevices',
        'Address',
        'Latitude',
        'Longitude',
        'SellerAddressID',
        'VideoURL',
        'VideoFileURL',
        'Delivery',
        'WeightForDelivery',
        'LengthForDelivery',
        'HeightForDelivery',
        'WidthForDelivery',
        'ReturnPolicy',
        'DeliverySubsidy',
        'Promo',
        'PromoAutoOptions',
        'PromoManualOptions',
        'Condition',
        'AdType',
        'CompanyName',
        'TargetAudience',
    ]);
    private static readonly GENERATED_TAGS = new Set([
        'Id',
        'AvitoId',
        'Category',
        'GoodsType',
        'Title',
        'Description',
        'Price',
        'ImageUrls',
    ]);
    // Поля магазина для нового объявления — самые частые значения all.xlsx.
    private static readonly STORE: Record<string, string> = {
        ListingFee: 'Package',
        Condition: 'Новое',
        Address: 'Астана, улица Кенесары, 8',
        ContactPhone: '79090105007',
        ContactMethod: 'В сообщениях',
        AdType: 'Товар приобретен на продажу',
        CompanyName: 'CROSSFADER',
        TargetAudience: 'Частные лица и бизнес',
    };

    static build(catalog: AvitoProducts, listings: Listing[]): string {
        const start = process.hrtime.bigint();
        const rows: Record<string, string>[] = [];
        const placed = new Set<Listing>();
        for (const item of catalog.items) {
            const l = listings.find(
                (l) => XMLBuilder.adId(l) === item.id || l.existing?.avitoId === item.avitoId,
            );
            if (l) {
                rows.push(XMLBuilder.override(item.values, l));
                placed.add(l);
            } else if (item.values.AvitoStatus === XMLBuilder.ACTIVE) {
                rows.push(item.values);
            }
        }
        for (const l of listings) {
            if (placed.has(l)) {
                continue;
            }
            if (l.existing && rows.some((r) => r.Id === l.existing?.id)) {
                throw new Error(
                    `[XMLBuilder] в плане два листинга на объявление № ${l.existing.avitoId}`,
                );
            }
            if (l.existing) {
                throw new Error(
                    `[XMLBuilder] в all.xlsx нет строки объявления № ${l.existing.avitoId}`,
                );
            }
            rows.push(XMLBuilder.override(XMLBuilder.STORE, l));
        }
        const ids = new Set<string>();
        for (const row of rows) {
            if (ids.has(row.Id as string)) {
                throw new Error(`[XMLBuilder] в фиде два объявления с Id ${row.Id}`);
            }
            ids.add(row.Id as string);
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Ads target="Avito.ru" formatVersion="3">\n${rows.map(XMLBuilder.ad).join('\n')}\n</Ads>\n`;
        perf(
            'XMLBuilder',
            `build ${rows.length} ads (${catalog.items.length} in xlsx, ${listings.length} from plan)`,
            start,
        );
        return xml;
    }

    // Новому — хэш ссылки поставщика: повторный publish обновит объявление, а не создаст дубль.
    static adId(listing: Listing): string {
        return (
            listing.existing?.id ??
            createHash('sha1')
                .update(XMLBuilder.canonicalUrl(listing.url))
                .digest('hex')
                .slice(0, 16)
        );
    }

    // Одна ссылка в разных написаниях (http/https, www., ?query, #hash, слэш в конце) — один Id.
    private static canonicalUrl(raw: string): string {
        let u: URL;
        try {
            u = new URL(raw);
        } catch {
            throw new Error(`[XMLBuilder] невалидная ссылка поставщика: ${raw}`);
        }
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
        return `${host}${path}`;
    }

    private static override(base: Record<string, string>, l: Listing): Record<string, string> {
        if (!Number.isInteger(l.price) || l.price <= 0) {
            throw new Error(
                `[XMLBuilder] ${l.url}: Price должен быть целым числом рублей, получил ${l.price}`,
            );
        }
        const generated = [l.description.title, ...Object.values(l.category.attrs)];
        if (generated.some((v) => v.includes('|'))) {
            throw new Error(
                `[XMLBuilder] ${l.url}: «|» в Title/атрибуте — Avito прочтёт как множественный выбор`,
            );
        }
        const row: Record<string, string> = { Id: XMLBuilder.adId(l) };
        if (l.existing) {
            row.AvitoId = l.existing.avitoId;
        }
        const dropped: string[] = [];
        for (const [tag, value] of Object.entries(base)) {
            if (XMLBuilder.COMMON_TAGS.has(tag)) {
                row[tag] = value;
            } else if (!XMLBuilder.GENERATED_TAGS.has(tag) && !XMLBuilder.SKIP_TAGS.has(tag)) {
                dropped.push(tag);
            }
        }
        if (dropped.length > 0) {
            console.log(
                `[XMLBuilder] ${row.Id}: категорийные теги строки заменены: ${dropped.join(', ')}`,
            );
        }
        row.Category = l.category.category;
        if (l.category.goodsType) {
            row.GoodsType = l.category.goodsType;
        }
        Object.assign(row, l.category.attrs);
        row.Title = l.description.title;
        row.Description = l.description.html;
        row.Price = String(l.price);
        row.ImageUrls = l.imageUrls.join(' | ');
        return row;
    }

    private static ad(row: Record<string, string>): string {
        if (!/^[1-9]\d*$/.test(row.Price ?? '')) {
            throw new Error(
                `[XMLBuilder] ${row.Id}: Price «${row.Price}» — нужно целое число рублей`,
            );
        }
        const lines: string[] = [];
        for (const [tag, value] of Object.entries(row)) {
            if (tag === 'ImageUrls' || XMLBuilder.SKIP_TAGS.has(tag) || !value) {
                continue;
            }
            lines.push(
                XMLBuilder.CDATA_TAGS.has(tag)
                    ? XMLBuilder.cdata(tag, value)
                    : XMLBuilder.tag(tag, value),
            );
        }
        lines.push(XMLBuilder.images(row.Id as string, row.ImageUrls ?? ''));
        return `<Ad>\n${lines.map((s) => `  ${s}`).join('\n')}\n</Ad>`;
    }

    // Значение с «|» — множественный выбор Avito: <Option> на каждое.
    private static tag(name: string, value: string): string {
        const options = value.split(XMLBuilder.MULTI_SPLIT).filter(Boolean);
        if (options.length > 1) {
            const inner = options
                .map((o) => `    <Option>${XMLBuilder.escape(o)}</Option>`)
                .join('\n');
            return `<${name}>\n${inner}\n  </${name}>`;
        }
        return `<${name}>${XMLBuilder.escape(value)}</${name}>`;
    }

    // Невидимые символы (WORD JOINER и т.п.) обрезают описание на Avito; «]]>» внутри CDATA разбиваем.
    private static cdata(name: string, value: string): string {
        const clean = value.replace(XMLBuilder.INVISIBLE_RE, '').replace(/]]>/g, ']]]]><![CDATA[>');
        return `<${name}><![CDATA[${clean}]]></${name}>`;
    }

    private static images(id: string, raw: string): string {
        const urls = raw.split(XMLBuilder.MULTI_SPLIT).filter(Boolean);
        if (urls.length === 0 || urls.length > XMLBuilder.MAX_IMAGES) {
            throw new Error(
                `[XMLBuilder] ${id}: фото ${urls.length}, допустимо 1–${XMLBuilder.MAX_IMAGES}`,
            );
        }
        const inner = urls.map((u) => `    <Image url="${XMLBuilder.escape(u)}"/>`).join('\n');
        return `<Images>\n${inner}\n  </Images>`;
    }

    private static escape(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
