import { AvitoApi } from '../src/XMLFeedAvito/AvitoApi.ts';
import { CategorySnapshot } from '../src/XMLFeedAvito/CategorySnapshot.ts';

// Разовый rebuild справочника категорий Avito → data/category-snapshot.json.
// Запуск: node --env-file=.env scripts/build-category-snapshot.ts
const path = new URL('../data/category-snapshot.json', import.meta.url).pathname;
const snapshot = await CategorySnapshot.build(new AvitoApi());
CategorySnapshot.writeFile(path, snapshot);
console.log(
    `[build-category-snapshot] written ${Object.keys(snapshot.fields).length} leaves -> ${path}`,
);
