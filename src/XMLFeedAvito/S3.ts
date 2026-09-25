import {
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { perf } from '../AI/Utils.ts';
import { env } from '../environment.ts';

// Selectel S3: тот же бакет, что у первой версии бота (all.xlsx, картинки, фид).
export class S3 {
    private static readonly PUBLIC_DOMAIN = env.S3_PUBLIC_DOMAIN.replace(/\/+$/, '');

    private readonly client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });

    // Ключ ищем без учёта регистра: в бакете лежит storage/All.xlsx, в конфиге может быть all.xlsx.
    async download(key: string): Promise<Buffer> {
        const start = process.hrtime.bigint();
        const resp = await this.client.send(
            new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: await this.resolveKey(key) }),
        );
        if (!resp.Body) {
            throw new Error(`[S3] пустое тело ${key}`);
        }
        const bytes = Buffer.from(await resp.Body.transformToByteArray());
        perf('S3', `download ${key} ${bytes.length}b`, start);
        return bytes;
    }

    async upload(
        key: string,
        body: Buffer | string,
        contentType: string,
        cacheControl?: string,
    ): Promise<string> {
        const start = process.hrtime.bigint();
        await this.client.send(
            new PutObjectCommand({
                Bucket: env.S3_BUCKET,
                Key: key,
                Body: body,
                ContentType: contentType,
                CacheControl: cacheControl,
            }),
        );
        perf('S3', `upload ${key} ${body.length}b`, start);
        return S3.publicUrl(key);
    }

    private async resolveKey(key: string): Promise<string> {
        const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : '';
        const listed = await this.client.send(
            new ListObjectsV2Command({ Bucket: env.S3_BUCKET, Prefix: dir }),
        );
        const keys = (listed.Contents ?? []).map((o) => o.Key ?? '');
        const exact = keys.find((k) => k === key);
        const fold = keys.find((k) => k.toLowerCase() === key.toLowerCase());
        const found = exact ?? fold;
        if (!found) {
            throw new Error(`[S3] нет объекта ${key} (без учёта регистра) в ${dir || '/'}`);
        }
        return found;
    }

    static publicUrl(key: string): string {
        return `${S3.PUBLIC_DOMAIN}/${encodeURI(key.replace(/^\/+/, ''))}`;
    }
}
