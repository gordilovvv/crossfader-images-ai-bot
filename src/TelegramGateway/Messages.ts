import type { Listing } from '../Bot.ts';
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
    static readonly XLSX_STALE = 'Обнови all.xlsx в Selectel и тегни снова.';

    static readonly TOAST = {
        go: 'Поехали',
        ok: 'Ок',
        alreadyAnswered: 'Уже ответил',
        publishTodo: 'Публикация пока не подключена',
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

    static xlsxQuestion(): Question {
        return {
            text: 'all.xlsx в Selectel актуальный?',
            buttons: Messages.yesNo('xlsx', '✅ Да'),
        };
    }

    static publishQuestion(plan: Listing[]): Question {
        const items = plan.map((l) => `№ ${l.id} ${l.description.title}`).join(', ');
        return {
            text: `К выгрузке ${plan.length}: ${items}.\nAvito обрабатывает ~1.5 часа.`,
            buttons: Messages.yesNo('publish', '✅ Да, выложить'),
        };
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
