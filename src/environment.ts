import { z } from 'zod';

const schema = z.object({
    TELEGRAM_BOT_TOKEN: z.string(),
    TELEGRAM_GROUP_ID: z.string(),
    GOOGLE_AI_API_KEY: z.string(),
});

export const env = schema.parse(process.env);
