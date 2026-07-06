import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBudget, measure } from './helpers/e2e.ts';

// Шаблон e2e-теста. Скопируй, замени <module> и удали skip.
test('e2e: <module> — <что проверяем>', { skip: 'шаблон' }, async () => {
    // 1. Arrange: подготовь входные данные (реальные, без моков)
    const input = {};

    // 2. Act: вызови модуль с замером
    const { result, ms } = await measure('<module> <операция>', async () => {
        return input; // await someModule.run(input)
    });

    // 3. Assert логики: конечный результат тот, что ждём
    assert.ok(result, 'результат пустой');

    // 4. Assert перфа: укладываемся в бюджет
    assertBudget(ms, 5_000, '<module> <операция>');
});
