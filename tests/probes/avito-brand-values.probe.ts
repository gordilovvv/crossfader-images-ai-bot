import { AvitoApi } from '../../src/XMLFeedAvito/api/AvitoApi.ts';

// Сырое поле Brand листа: откуда Avito отдаёт справочник брендов (values_link_*), чтобы его скачать и закэшировать.
const slug = process.argv[2] ?? 'zvukovoe_i_dj_oborudovanie';
const start = process.hrtime.bigint();
const json = await new AvitoApi().nodeFields(slug);
const ms = Number(process.hrtime.bigint() - start) / 1e6;
console.log(`[probe] fields(${slug}) ${Math.floor(ms / 1000)}s ${Math.round(ms % 1000)}ms`);
console.log(
    JSON.stringify(
        json.fields.find((f) => f.tag === 'Brand'),
        null,
        2,
    ),
);
