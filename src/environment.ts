import { z } from 'zod';

const schema = z.object({
    TELEGRAM_BOT_TOKEN: z.string(),
    TELEGRAM_GROUP_ID: z.string(),
    GOOGLE_AI_API_KEY: z.string(),
    AVITO_CLIENT_ID: z.string(),
    AVITO_CLIENT_SECRET: z.string(),
    S3_ENDPOINT: z.string(),
    S3_REGION: z.string(),
    S3_BUCKET: z.string(),
    S3_ACCESS_KEY: z.string(),
    S3_SECRET_KEY: z.string(),
    S3_PUBLIC_DOMAIN: z.string(),
    AVITO_EXCEL_S3_KEY: z.string(),
});

export const env = schema.parse(process.env);
