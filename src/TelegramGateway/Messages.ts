import type { Listing } from '../Bot.ts';
import type { PublishResult } from '../XMLFeedAvito/AvitoUploader.ts';
import { XMLBuilder } from '../XMLFeedAvito/XMLBuilder.ts';
import { Commands } from './Commands.ts';
import type { Button } from './Telegram.ts';

export type Question = { text: string; buttons: Button[][] };

// Все тексты, которые видит менеджер, кроме rich-превью (это Preview): ответы в чат, вопросы с кнопками, всплывашки.
export class Messages {
    static readonly NEED_LINK =
        'Укажи ссылку: gen <ссылка поставщика> <цена> — новое объявление, gen <ссылка поставщика> <ссылка avito> — обновить существующее.';
    static readonly PUBLISHING = 'Идёт выгрузка на Avito. Кидай ссылку после.';
    static readonly GENERATING = 'Ещё генерю. Дождись превью, потом publish.';
    static readonly PLAN_EMPTY = 'Превью нет — выкладывать нечего.';
    static readonly UPLOAD_OFF =
        'Выгрузка на Avito выключена (AVITO_FEED_UPLOAD=false). Вот фид, который ушёл бы на Avito. План остался.';
    static readonly XLSX_STALE = 'Обнови all.xlsx в Selectel и тегни снова.';

    static readonly TOAST = {
        go: 'Поехали',
        ok: 'Ок',
        alreadyAnswered: 'Уже ответил',
        busy: 'Бот занят, нажми позже',
        publishLater: 'Ок, план остаётся до следующего publish',
        unknownButton: 'Не понял кнопку',
    } as const;

    static unknownListing(id: number | null, cmd: 'get' | 'drop'): string {
        return id === null
            ? `Укажи номер: ${cmd} <номер превью>`
            : `Не помню № ${id}. Кинь ссылку поставщика через gen.`;
    }

    static dropped(id: number, title: string): string {
        return `№ ${id} ${title} убран из плана.`;
    }

    static replaced(oldId: number, newId: number): string {
        return `№ ${oldId} заменён на № ${newId}.`;
    }

    static needPrice(urls: string[]): string {
        return `Новому товару нужна цена: ${urls.map((u) => `gen ${u} 279000`).join('; ')}`;
    }

    static orphanAvito(tokens: string[]): string {
        return `Не к чему прикрепить: ${tokens.join(', ')}. Формат: gen <поставщик> <avito или цена 100–99 999 999>.`;
    }

    static alreadyQueued(url: string): string {
        return `Уже делаю: ${url}`;
    }

    static failed(url: string, reason: string): string {
        return `❌ Не получилось: ${url}\n\n${reason}\n\nКинь ссылку ещё раз.`;
    }

    static noCredits(url: string): string {
        return `💳 Не получилось: ${url}\n\nНедостаточно кредитов на балансе Google AI для генерации (402 RESOURCE_EXHAUSTED). Пополни баланс в AI Studio и кинь ссылку ещё раз.`;
    }

    static xlsxQuestion(): Question {
        return {
            text: 'all.xlsx в Selectel актуальный?',
            buttons: Messages.yesNo('xlsx', '✅ Да'),
        };
    }

    static publishQuestion(plan: Listing[]): Question {
        const items = plan.map((l) => `№ ${l.id} ${l.description.title}`).join(', ');
        return {
            text: `К выгрузке ${plan.length}: ${items}.\nAvito обрабатывает ~3 часа, отпишусь каждые 30 минут.`,
            buttons: Messages.yesNo('publish', '✅ Да, выложить'),
        };
    }

    static stillWaiting(min: number): string {
        const h = Math.floor(min / 60);
        return `⏳ Avito ещё обрабатывает фид: ${h > 0 ? `${h} ч ` : ''}${min % 60} мин.`;
    }

    static publishFailed(reason: string): string {
        return `❌ Выгрузка не удалась\n\n${reason}\n\nПлан остался, повтори publish позже.`;
    }

    static published(plan: Listing[], { status, stats, errors }: PublishResult): string {
        const head = {
            success: '✅ Avito: выгрузка готова',
            success_warning: '✅ Avito: выгрузка готова, есть замечания',
            error: '❌ Avito: отчёт с ошибкой',
            processing: '⏳ Avito: отчёт ещё не закрыт',
        }[status];
        const fresh = plan.filter((l) => !l.existing).length;
        const byId = new Map(plan.map((l) => [XMLBuilder.adId(l), l]));
        const planErrors = errors.map((e) => {
            const l = byId.get(e.ad_id);
            const why = e.messages.find((m) => m.type === 'error');
            return `  № ${l?.id} ${l?.description.title} — ${why?.title || why?.description || 'без описания'}`;
        });
        const errorCount = stats.error ?? 0;
        return [
            head,
            `Всего в фиде: ${stats.sections_stats ?? 0} · опубликовано ${stats.successful ?? 0} · снято ${stats.not_publish ?? 0}`,
            `Из плана: ${fresh} новых, ${plan.length - fresh} обновлено`,
            errorCount === 0
                ? 'Ошибок нет'
                : `❌ Ошибок: ${errorCount}, из них в плане ${planErrors.length}${planErrors.length > 0 ? ':' : ''}`,
            ...planErrors,
            status === 'error' ? 'План остался.' : 'План очищен.',
        ].join('\n');
    }

    private static yesNo(kind: 'xlsx' | 'publish', yesText: string): Button[][] {
        return [
            [
                { text: yesText, data: Commands.callbackData({ kind, yes: true }) },
                { text: '❌ Нет', data: Commands.callbackData({ kind, yes: false }) },
            ],
        ];
    }
}
