import { chromium, type Page, type Browser as PwBrowser } from 'playwright';

// Жизненный цикл headless-браузера: warm-инстанс, перезапуск каждые N товаров (утечки/деградация chromium).
export class Browser {
    private static readonly RESTART_EVERY = 50;
    private static readonly BLOCK_TYPES = new Set(['font', 'media']);
    private static readonly BLOCK_URL =
        /google-analytics|googletagmanager|mc\.yandex|facebook|doubleclick|criteo|vk\.com/;
    private static readonly UA =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

    private browser: PwBrowser | null = null;
    private used = 0;

    private async ensure(): Promise<PwBrowser> {
        if (this.browser && this.used < Browser.RESTART_EVERY) {
            return this.browser;
        }
        if (this.browser) {
            await this.browser.close();
            this.used = 0;
        }
        this.browser = await chromium.launch({ headless: true });
        return this.browser;
    }

    async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
        const browser = await this.ensure();
        this.used++;
        const context = await browser.newContext({ userAgent: Browser.UA });
        await context.route('**/*', (route) => {
            const req = route.request();
            if (Browser.BLOCK_TYPES.has(req.resourceType()) || Browser.BLOCK_URL.test(req.url())) {
                return route.abort();
            }
            return route.continue();
        });
        const page = await context.newPage();
        try {
            return await fn(page);
        } finally {
            await context.close();
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
