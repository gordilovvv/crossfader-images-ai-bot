import { ulid } from 'ulid';
import { ColorsSearch } from './AI/ColorsSearch.ts';
import { perf, type RefImage } from './AI/Utils.ts';
import { env } from './environment.ts';
import { type CardImage, ImageGeneration, type ProductData } from './Image/ImageGeneration.ts';
import { Browser } from './Parser/Browser.ts';
import { Parser } from './Parser/Parser.ts';
import { type Callback, Commands, type GenLink } from './TelegramGateway/Commands.ts';
import { Messages, type Question } from './TelegramGateway/Messages.ts';
import { Preview } from './TelegramGateway/Preview.ts';
import { Telegram } from './TelegramGateway/Telegram.ts';
import { type AvitoProduct, AvitoProducts } from './XMLFeedAvito/AvitoProducts.ts';
import { CategoryLookup, type CategoryResult } from './XMLFeedAvito/CategoryLookup.ts';
import { type Description, ProductDescription } from './XMLFeedAvito/ProductDescription.ts';
import { S3 } from './XMLFeedAvito/S3.ts';

export type Listing = {
    id: number;
    url: string;
    product: ProductData;
    category: CategoryResult;
    description: Description;
    cards: CardImage[];
    imageUrls: string[];
    price: number;
    existing: AvitoProduct | null;
};

type State = 'idle' | 'generating' | 'publishing';

export class Bot {
    private static readonly FRESH_MS = 60 * 60 * 1000;
    private static readonly FETCH_TIMEOUT_MS = 30_000;

    private readonly tg = new Telegram(env.TELEGRAM_BOT_TOKEN, Number(env.TELEGRAM_GROUP_ID));
    private readonly s3 = new S3();
    private readonly browser = new Browser();
    private readonly parser = new Parser(this.browser);
    private readonly colors = new ColorsSearch();
    private readonly lookup = new CategoryLookup();
    private readonly images = new ImageGeneration();
    private readonly descriptions = new ProductDescription();

    private readonly listings = new Map<number, Listing>();
    private readonly queue: GenLink[] = [];
    private current: GenLink | null = null;
    private pendingLinks: GenLink[] = [];
    private lastGenAt: number | null = null;
    private nextId = 1;
    private state: State = 'idle';

    constructor() {
        new Commands(this.tg, {
            onGen: (links, orphans, messageId) => this.gen(links, orphans, messageId),
            onGet: (id) => this.get(id),
            onDrop: (id) => this.drop(id),
            onPublish: () => this.publish(),
            onCallback: (cb) => this.callback(cb),
        });
    }

    async start(): Promise<void> {
        await this.tg.start();
    }

    async stop(): Promise<void> {
        await this.tg.stop();
        await this.browser.close();
    }

    private async gen(links: GenLink[], orphans: string[], messageId: number): Promise<void> {
        if (orphans.length > 0) {
            await this.tg.sendText(Messages.orphanAvito(orphans));
            return;
        }
        if (links.length === 0) {
            await this.tg.sendText(Messages.NEED_LINK);
            return;
        }
        const noPrice = links.filter((l) => l.avitoId === null && l.price === null);
        if (noPrice.length > 0) {
            await this.tg.sendText(Messages.needPrice(noPrice.map((l) => l.url)));
            return;
        }
        if (this.state === 'publishing') {
            await this.tg.sendText(Messages.PUBLISHING);
            return;
        }
        await this.tg.react(messageId);
        const fresh = this.lastGenAt !== null && Date.now() - this.lastGenAt < Bot.FRESH_MS;
        if (fresh) {
            await this.enqueue(links);
            return;
        }
        // Вопрос один на все ссылки, пока висит: второй gen докидывает ссылки, а не перезаписывает.
        const asked = this.pendingLinks.length > 0;
        this.pendingLinks.push(...links);
        if (!asked) {
            await this.ask(Messages.xlsxQuestion());
        }
    }

    private busy(url: string): boolean {
        return this.current?.url === url || this.queue.some((j) => j.url === url);
    }

    private async enqueue(links: GenLink[]): Promise<void> {
        for (const link of links) {
            if (this.busy(link.url)) {
                await this.tg.sendText(Messages.alreadyQueued(link.url));
                continue;
            }
            this.queue.push(link);
        }
        void this.drain();
    }

    private async drain(): Promise<void> {
        if (this.state !== 'idle') {
            return;
        }
        this.state = 'generating';
        try {
            for (let job = this.queue.shift(); job; job = this.queue.shift()) {
                this.current = job;
                await this.process(job);
            }
        } finally {
            this.current = null;
            this.state = 'idle';
        }
    }

    // Ошибка одного товара — в чат и дальше по очереди: юзер видит причину и кидает ссылку снова.
    private async process(link: GenLink): Promise<void> {
        const start = process.hrtime.bigint();
        try {
            const listing = await this.build(link);
            await this.tg.sendRich(Preview.rich(listing));
            const old = [...this.listings.values()].find((l) => l.url === link.url);
            if (old) {
                this.listings.delete(old.id);
                await this.tg.sendText(Messages.replaced(old.id, listing.id));
            }
            this.listings.set(listing.id, listing);
            this.lastGenAt = Date.now();
            perf('Bot', `gen № ${listing.id} ${listing.description.title}`, start);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.error(`[Bot] gen ${link.url} failed`, err);
            await this.tg.sendText(Messages.failed(link.url, reason));
        }
    }

    private async build({ url, avitoId, price }: GenLink): Promise<Listing> {
        const [existing, parsed] = await Promise.all([
            this.existing(avitoId),
            this.parser.parseUrl(url),
        ]);
        const finalPrice = price ?? Number(existing?.price.replace(/\s/g, ''));
        if (!(finalPrice > 0)) {
            throw new Error(
                `в all.xlsx нет цены у № ${avitoId} («${existing?.price}»), укажи её: gen ${url} <ссылка avito> 279000`,
            );
        }
        const photoUrl = parsed.images.source[0];
        if (!photoUrl) {
            throw new Error('у поставщика нет фото товара');
        }
        const [photo, colors, category] = await Promise.all([
            Bot.fetchImage(photoUrl),
            this.colors.search(`${parsed.identity.brand} ${parsed.identity.model}`),
            this.lookup.classify(parsed),
        ]);
        const product: ProductData = { ...parsed, colors };
        const [cards, description] = await Promise.all([
            this.images.generate(product, photo),
            this.descriptions.write(product, category),
        ]);
        const folder = `cards/${ulid()}`;
        const imageUrls = await Promise.all(
            cards.map((c) => this.s3.upload(`${folder}/${c.slot}.png`, c.image, 'image/png')),
        );
        return {
            id: this.nextId++,
            url,
            product,
            category,
            description,
            cards,
            imageUrls,
            price: finalPrice,
            existing,
        };
    }

    private async existing(avitoId: string | null): Promise<AvitoProduct | null> {
        if (avitoId === null) {
            return null;
        }
        const item = AvitoProducts.parse(await this.s3.download(env.AVITO_EXCEL_S3_KEY)).byAvitoId(
            avitoId,
        );
        if (!item) {
            throw new Error(`в all.xlsx нет объявления № ${avitoId}`);
        }
        return item;
    }

    private async get(id: number | null): Promise<void> {
        const listing = id === null ? null : this.listings.get(id);
        if (!listing) {
            await this.tg.sendText(Messages.unknownListing(id, 'get'));
            return;
        }
        await this.tg.sendRich(Preview.rich(listing));
    }

    private async drop(id: number | null): Promise<void> {
        const listing = id === null ? null : this.listings.get(id);
        if (!listing) {
            await this.tg.sendText(Messages.unknownListing(id, 'drop'));
            return;
        }
        this.listings.delete(listing.id);
        await this.tg.sendText(Messages.dropped(listing.id, listing.description.title));
    }

    private async publish(): Promise<void> {
        if (this.state === 'generating') {
            await this.tg.sendText(Messages.GENERATING);
            return;
        }
        const plan = [...this.listings.values()];
        if (plan.length === 0) {
            await this.tg.sendText(Messages.PLAN_EMPTY);
            return;
        }
        await this.ask(Messages.publishQuestion(plan));
    }

    private async callback(cb: Callback | null): Promise<string> {
        switch (cb?.kind) {
            case 'xlsx':
                return this.xlsxAnswer(cb.yes);
            case 'publish':
                // TODO: publish — all.xlsx + план → XML → S3 → trigger автозагрузки → poll отчёта (отдельная задача)
                return cb.yes ? Messages.TOAST.publishTodo : Messages.TOAST.publishLater;
            default:
                return Messages.TOAST.unknownButton;
        }
    }

    private async xlsxAnswer(yes: boolean): Promise<string> {
        const links = this.pendingLinks;
        this.pendingLinks = [];
        if (!yes) {
            await this.tg.sendText(Messages.XLSX_STALE);
            return Messages.TOAST.ok;
        }
        if (links.length === 0) {
            return Messages.TOAST.alreadyAnswered;
        }
        this.lastGenAt = Date.now();
        await this.enqueue(links);
        return Messages.TOAST.go;
    }

    private async ask(q: Question): Promise<void> {
        await this.tg.sendText(q.text, q.buttons);
    }

    private static async fetchImage(url: string): Promise<RefImage> {
        const resp = await fetch(url, { signal: AbortSignal.timeout(Bot.FETCH_TIMEOUT_MS) });
        if (!resp.ok) {
            throw new Error(`фото товара не скачалось: ${resp.status} ${url}`);
        }
        const mimeType = resp.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
        return { bytes: Buffer.from(await resp.arrayBuffer()), mimeType };
    }
}
