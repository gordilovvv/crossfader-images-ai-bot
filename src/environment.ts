import { z } from 'zod';

const schema = z.object({
    TELEGRAM_BOT_TOKEN: z.string(),
    TELEGRAM_GROUP_ID: z.string(),
});

export const env = schema.parse(process.env);
