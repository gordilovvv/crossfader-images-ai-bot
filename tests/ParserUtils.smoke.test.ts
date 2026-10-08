import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDimensions, stripColorSuffix } from '../src/Parser/Utils.ts';

// Оффлайн: чистая логика без сети/Gemma. Режем только отдельный хвостовой токен из списка кодов цвета.
const STRIP_CASES: Array<[string, string]> = [
    ['CA701 B', 'CA701'],
    ['CA-701 B', 'CA-701'],
    ['CA701 WH', 'CA701'],
    ['CA701 WB', 'CA701'],
    ['CA701 EP', 'CA701'],
    ['VEXO108/B', 'VEXO108'],
    ['FP-30X BK', 'FP-30X'],
    ['YDP-165 WA', 'YDP-165'],
    ['LX-1 W/B', 'LX-1'],
    ['CA701 EP-W', 'CA701'],
    ['MONITOR-4', 'MONITOR-4'],
    ['SM7B', 'SM7B'],
    ['P-145B', 'P-145B'],
    ['SM58 LC', 'SM58 LC'],
    ['WH-1000XM5', 'WH-1000XM5'],
    ['B2', 'B2'],
    ['  CA701 B  ', 'CA701'],
];

test('smoke: stripColorSuffix — режет код цвета, не трогает ревизии и префиксы', () => {
    for (const [input, expected] of STRIP_CASES) {
        assert.equal(stripColorSuffix(input), expected, `«${input}»`);
    }
});

test('smoke: normalizeDimensions — мм → см, вес без изменений', () => {
    assert.deepEqual(normalizeDimensions({ w: 1450, h: 970, d: 495, unit: 'мм', weightKg: 76.5 }), {
        w: 145,
        h: 97,
        d: 49.5,
        unit: 'см',
        weightKg: 76.5,
    });
    assert.deepEqual(normalizeDimensions({ w: 145, h: 97, d: 49.5, unit: 'см', weightKg: 76.5 }), {
        w: 145,
        h: 97,
        d: 49.5,
        unit: 'см',
        weightKg: 76.5,
    });
    assert.deepEqual(normalizeDimensions({ w: 1450, h: 970, d: 495, unit: 'мм.', weightKg: 1 }), {
        w: 145,
        h: 97,
        d: 49.5,
        unit: 'см',
        weightKg: 1,
    });
    assert.deepEqual(normalizeDimensions({ w: 0, h: 0, d: 0, unit: 'mm', weightKg: 0 }), {
        w: 0,
        h: 0,
        d: 0,
        unit: 'см',
        weightKg: 0,
    });
});

test('smoke: normalizeDimensions — неизвестная единица → ошибка, не тихие см', () => {
    assert.throws(
        () => normalizeDimensions({ w: 10, h: 5, d: 2, unit: 'in', weightKg: 1 }),
        /неизвестная единица габаритов «in»/,
    );
});
