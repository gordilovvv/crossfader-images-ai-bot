import { setTimeout as sleep } from 'node:timers/promises';
import { perf } from '../AI/Utils.ts';
import { type AutoloadItem, type AutoloadReport, AvitoApi, type ReportStats } from './AvitoApi.ts';
import { S3 } from './S3.ts';

// errors — только объявления плана из раздела ошибок отчёта.
export type PublishResult = {
    status: AutoloadReport['status'];
    stats: ReportStats;
    errors: AutoloadItem[];
};
export type OnTick = (min: number) => Promise<void>;

// Фид кладём туда же, куда первый бот, и запускаем автозагрузку: Avito закрывает отчёт ~3 часа.
export class AvitoUploader {
    // Тот же ключ, что у первого бота: ссылка на фид в профиле Avito не меняется.
    static readonly FEED_KEY = 'feed/avito-feed.xml';
    private static readonly POLL_MS = 60_000;
    private static readonly MAX_POLLS = 240;
    private static readonly TICK_EVERY = 30;
    private static readonly RETRIES = 3;

    private readonly api: AvitoApi;
    private readonly s3: S3;
    private readonly pollMs: number;

    // Подмена api/s3/интервала — только для теста: боевой upload публикует объявления.
    constructor(api = new AvitoApi(), s3 = new S3(), pollMs = AvitoUploader.POLL_MS) {
        this.api = api;
        this.s3 = s3;
        this.pollMs = pollMs;
    }

    async publish(xml: string, adIds: string[], onTick: OnTick): Promise<PublishResult> {
        const start = process.hrtime.bigint();
        const feedUrl = S3.publicUrl(AvitoUploader.FEED_KEY);
        const profile = await this.api.profile();
        const feeds = profile.feeds_data?.map((f) => f.feed_url) ?? [];
        console.log(
            `[AvitoUploader] профиль: autoload_enabled=${profile.autoload_enabled}, фиды: ${feeds.join(', ') || 'нет'}`,
        );
        if (feeds.length !== 1 || feeds[0] !== feedUrl) {
            throw new Error(
                `[AvitoUploader] в профиле Avito фиды ${feeds.join(', ') || 'не заданы'}, ожидали только ${feedUrl}`,
            );
        }
        const last = await this.retry(() => this.api.lastReport());
        if (last?.status === 'processing') {
            throw new Error(`[AvitoUploader] Avito ещё обрабатывает прошлую выгрузку № ${last.id}`);
        }
        const lastId = last?.id ?? null;
        console.log(
            `[AvitoUploader] последний отчёт: ${last ? `№ ${last.id} ${last.status}` : 'нет'}`,
        );
        // Без no-cache CDN Selectel может отдать Avito старую версию фида.
        await this.s3.upload(AvitoUploader.FEED_KEY, xml, 'text/xml', 'no-cache');
        console.log(`[AvitoUploader] фид ${xml.length}b загружен: ${feedUrl}`);
        try {
            // TODO: рестарт процесса во время ожидания оставит профиль включённым.
            await this.api.saveProfile({ ...profile, autoload_enabled: true });
            console.log('[AvitoUploader] автозагрузка включена');
            await this.api.upload();
            console.log('[AvitoUploader] выгрузка запущена, жду отчёт');
            const id = await this.waitReport(lastId, onTick);
            const { status, stats } = await this.retry(() => this.api.report(id));
            console.log(`[AvitoUploader] отчёт № ${id} ${status}: ${JSON.stringify(stats)}`);
            const plan = new Set(adIds);
            const allErrors = await this.retry(() => this.api.reportErrors(id));
            const errors = allErrors.filter((i) => plan.has(i.ad_id));
            console.log(
                `[AvitoUploader] ошибок в отчёте ${allErrors.length}, из плана ${errors.length}`,
            );
            perf('AvitoUploader', `publish ${adIds.length} ads → ${status}`, start);
            return { status, stats, errors };
        } finally {
            // TODO: сбой выключения затирает исходную ошибку/результат — писать в чат «профиль остался включён».
            await this.retry(() => this.api.saveProfile({ ...profile, autoload_enabled: false }));
            console.log('[AvitoUploader] автозагрузка выключена');
        }
    }

    // Наш отчёт — первый новый после lastId; дальше следим за ним по id, а не за последним.
    private async waitReport(lastId: number | null, onTick: OnTick): Promise<number> {
        let ours: number | null = null;
        for (let poll = 1; poll <= AvitoUploader.MAX_POLLS; poll++) {
            await sleep(this.pollMs);
            const id: number | null = ours;
            const report: AutoloadReport | null = await this.retry(() =>
                id === null ? this.api.lastReport() : this.api.report(id),
            );
            console.log(
                `[AvitoUploader] poll ${poll}: ${report ? `отчёт № ${report.id} ${report.status}` : 'отчёта нет'}`,
            );
            if (report && report.id !== lastId) {
                if (ours === null) {
                    console.log(`[AvitoUploader] наш отчёт № ${report.id}`);
                }
                ours = report.id;
                if (report.status !== 'processing') {
                    return report.id;
                }
            }
            if (poll % AvitoUploader.TICK_EVERY === 0) {
                await onTick(poll);
            }
        }
        throw new Error(
            `[AvitoUploader] отчёт автозагрузки не закрылся за ${AvitoUploader.MAX_POLLS} мин`,
        );
    }

    // Сеть до api.avito.ru рвётся: разовый сбой не должен ронять трёхчасовое ожидание.
    private async retry<T>(call: () => Promise<T>): Promise<T> {
        for (let attempt = 1; ; attempt++) {
            try {
                return await call();
            } catch (err) {
                if (attempt >= AvitoUploader.RETRIES) {
                    throw err;
                }
                console.error(`[AvitoUploader] попытка ${attempt} не удалась, повторяю`, err);
                await sleep(this.pollMs);
            }
        }
    }
}
