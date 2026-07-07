import { z } from 'zod';

const schema = z.object({
    TELEGRAM_BOT_TOKEN: z.string(),
    TELEGRAM_GROUP_ID: z.string(),
    GOOGLE_AI_API_KEY: z.string(),
    AVITO_CLIENT_ID: z.string(),
    AVITO_CLIENT_SECRET: z.string(),
});

export const env = schema.parse(process.env);
