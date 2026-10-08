import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Listing } from '../src/Bot.ts';
import { Messages } from '../src/TelegramGateway/Messages.ts';
import { AvitoUploader } from '../src/XMLFeedAvito/AvitoUploader.ts';
import { AvitoApi } from '../src/XMLFeedAvito/api/AvitoApi.ts';
import type {
    AutoloadItem,
    AutoloadProfile,
    AutoloadReport,
    ReportStats,
} from '../src/XMLFeedAvito/api/Schemas.ts';
import { S3 } from '../src/XMLFeedAvito/S3.ts';
import { XMLBuilder } from '../src/XMLFeedAvito/XMLBuilder.ts';
import { measure } from './helpers/e2e.ts';

const api = new AvitoApi();
const FEED_URL = S3.publicUrl(AvitoUploader.FEED_KEY);

// Боевой upload публикует объявления: сценарии ожидания гоняем на подменённом Avito, S3 не трогаем.
class FakeAvito {
    calls: string[] = [];
    reports: (AutoloadReport | null)[];
    failUpload = false;
    failPolls = 0;
    failOff = 0;
    profileFeeds = [FEED_URL];

    constructor(reports: (AutoloadReport | null)[]) {
        this.reports = reports;
    }
    async profile(): Promise<AutoloadProfile> {
        this.calls.push('profile');
        return {
            autoload_enabled: false,
            report_email: null,
            schedule: [],
            feeds_data: this.profileFeeds.map((feed_url) => ({ feed_name: '', feed_url })),
        };
    }
    async saveProfile(p: AutoloadProfile): Promise<void> {
        this.calls.push(p.autoload_enabled ? 'on' : 'off');
        if (!p.autoload_enabled && this.failOff > 0) {
            this.failOff--;
            throw new Error('fetch failed: ConnectTimeout');
        }
    }
    async upload(): Promise<void> {
        this.calls.push('upload');
        if (this.failUpload) {
            throw new Error('[AvitoApi] upload 429: не чаще раза в час');
        }
    }
    async lastReport(): Promise<AutoloadReport | null> {
        return this.next('last');
    }
    async report(id: number): Promise<AutoloadReport & { stats: ReportStats }> {
        const r = await this.next(`report(${id})`);
        assert.equal(r?.id, id, 'по id спрашиваем только свой отчёт');
        return { ...(r as AutoloadReport), stats: { sections_stats: 7, successful: 5, error: 2 } };
    }
    async reportErrors(id: number): Promise<AutoloadItem[]> {
        this.calls.push(`errors(${id})`);
        const why = [{ type: 'error', title: 'Нет фото', description: '' }];
        return [
            { ad_id: 'id-3', messages: why },
            { ad_id: 'not-in-plan', messages: why },
        ];
    }
    private async next(op: string): Promise<AutoloadReport | null> {
        this.calls.push(op);
        if (this.failPolls > 0 && this.calls.includes('upload')) {
            this.failPolls--;
            throw new Error('fetch failed: ConnectTimeout');
        }
        return this.reports.shift() ?? null;
    }
}

function uploader(fake: FakeAvito, uploads: string[]): AvitoUploader {
    const s3 = {
        upload: async (key: string, _body: string, type: string, cache: string) =>
            uploads.push(`${key} ${type} ${cache}`),
    } as unknown as S3;
    return new AvitoUploader(fake as unknown as AvitoApi, s3, 1);
}

test('e2e: AvitoApi — профиль смотрит только на фид бота; отчёт: статус, счётчики, ошибки', async () => {
    const { result: profile } = await measure('AvitoApi.profile', () => api.profile());
    assert.deepEqual(
        profile.feeds_data?.map((f) => f.feed_url),
        [FEED_URL],
    );

    const { result: last } = await measure('AvitoApi.lastReport', () => api.lastReport());
    assert.ok(last && last.id > 0);
    const { result: report } = await measure('AvitoApi.report', () => api.report(last.id));
    assert.equal(report.id, last.id);
    assert.equal(report.status, last.status);
    const { sections_stats: total = 0, successful = 0, error = 0 } = report.stats;
    assert.ok(
        total > 0 && successful > 0 && successful + error <= total,
        JSON.stringify(report.stats),
    );

    const { result: errors } = await measure('AvitoApi.reportErrors', () =>
        api.reportErrors(last.id),
    );
    assert.equal(errors.length, error, 'все объявления раздела ошибок собраны постранично');
    assert.ok(errors.every((e) => e.ad_id && e.messages.some((m) => m.type === 'error')));
});

test('e2e: AvitoUploader — свой отчёт по id, сбои опроса, тик раз в 30, ошибки только плана, профиль OFF', async () => {
    const fake = new FakeAvito([
        { id: 10, status: 'success' },
        { id: 10, status: 'success' },
        ...Array.from({ length: 30 }, () => ({ id: 11, status: 'processing' as const })),
        { id: 11, status: 'success_warning' },
        { id: 11, status: 'success_warning' },
    ]);
    fake.failPolls = 2;
    fake.failOff = 1;
    const uploads: string[] = [];
    const ticks: number[] = [];
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);

    const result = await uploader(fake, uploads).publish('<Ads/>', ids, async (m) => {
        ticks.push(m);
    });

    assert.equal(result.status, 'success_warning');
    assert.deepEqual(result.stats, { sections_stats: 7, successful: 5, error: 2 });
    assert.deepEqual(
        result.errors.map((e) => e.ad_id),
        ['id-3'],
        'ошибки вне плана отброшены',
    );
    assert.deepEqual(uploads, [`${AvitoUploader.FEED_KEY} text/xml no-cache`], 'фид без кеша CDN');
    assert.deepEqual(ticks, [30]);
    const i = fake.calls.indexOf('upload');
    assert.deepEqual(fake.calls.slice(0, i + 1), ['profile', 'last', 'on', 'upload']);
    assert.ok(fake.calls.includes('report(11)'), 'после появления нового отчёта опрос по id');
    assert.deepEqual(
        fake.calls.slice(-4),
        ['report(11)', 'errors(11)', 'off', 'off'],
        'OFF с ретраем',
    );
});

test('e2e: AvitoUploader — негативы: чужой фид в профиле, идёт чужая выгрузка, отказ upload, таймаут', async () => {
    const foreign = new FakeAvito([]);
    foreign.profileFeeds = [FEED_URL, 'https://example.com/other.xml'];
    const uploads: string[] = [];
    await assert.rejects(
        uploader(foreign, uploads).publish('<Ads/>', ['a'], async () => {}),
        /ожидали только/,
    );
    assert.deepEqual(foreign.calls, ['profile'], 'ни S3, ни профиль не тронуты');
    assert.deepEqual(uploads, []);

    const busy = new FakeAvito([{ id: 9, status: 'processing' }]);
    const busyUploads: string[] = [];
    await assert.rejects(
        uploader(busy, busyUploads).publish('<Ads/>', ['a'], async () => {}),
        /ещё обрабатывает прошлую выгрузку № 9/,
    );
    assert.deepEqual(busy.calls, ['profile', 'last'], 'чужая выгрузка идёт — профиль не трогаем');
    assert.deepEqual(busyUploads, []);

    const refused = new FakeAvito([{ id: 10, status: 'success' }]);
    refused.failUpload = true;
    await assert.rejects(
        uploader(refused, []).publish('<Ads/>', ['a'], async () => {}),
        /раза в час/,
    );
    assert.equal(refused.calls.at(-1), 'off', 'профиль выключен и при отказе');

    const stuck = new FakeAvito([{ id: 10, status: 'success' }]);
    stuck.reports.push(
        ...Array.from({ length: 240 }, () => ({ id: 11, status: 'processing' as const })),
    );
    await assert.rejects(
        uploader(stuck, []).publish('<Ads/>', ['a'], async () => {}),
        /не закрылся за 240 мин/,
    );
    assert.equal(stuck.calls.at(-1), 'off');
});

test('e2e: Messages.published — сводка по фиду, новые/обновлённые из плана, ошибки плана', () => {
    const plan = [1, 2, 3].map(
        (id) =>
            ({
                id,
                url: `https://ymusic.kz/p${id}/`,
                description: { title: `Kawai ${id}`, html: '' },
                existing: id === 3 ? {} : null,
            }) as Listing,
    );
    const bad = XMLBuilder.adId(plan[1] as Listing);
    const stats = { sections_stats: 1386, successful: 1329, not_publish: 52, error: 5 };
    const errors: AutoloadItem[] = [
        {
            ad_id: bad,
            messages: [
                { type: 'warning', title: 'Связано по номеру', description: '' },
                { type: 'error', title: 'Неправильно заполнен параметр — Бренд.', description: '' },
            ],
        },
    ];
    assert.equal(
        Messages.published(plan, { status: 'success_warning', stats, errors }),
        [
            '✅ Avito: выгрузка готова, есть замечания',
            'Всего в фиде: 1386 · опубликовано 1329 · снято 52',
            'Из плана: 2 новых, 1 обновлено',
            '❌ Ошибок: 5, из них в плане 1:',
            '  № 2 Kawai 2 — Неправильно заполнен параметр — Бренд.',
            'План очищен.',
        ].join('\n'),
    );
    const clean = Messages.published(plan, {
        status: 'success',
        stats: { sections_stats: 3, successful: 3 },
        errors: [],
    });
    assert.match(
        clean,
        /^✅ Avito: выгрузка готова\nВсего в фиде: 3 · опубликовано 3 · снято 0\n.*\nОшибок нет\nПлан очищен\.$/,
    );
    assert.match(Messages.published(plan, { status: 'error', stats, errors }), /План остался\.$/);
    assert.equal(Messages.stillWaiting(30), '⏳ Avito ещё обрабатывает фид: 30 мин.');
    assert.equal(Messages.stillWaiting(90), '⏳ Avito ещё обрабатывает фид: 1 ч 30 мин.');
});
