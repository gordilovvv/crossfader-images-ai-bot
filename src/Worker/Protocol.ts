export type WorkerTask = { kind: 'sendMessage'; chatId: number; text: string };

export type TaskResult = { messageId: number };

export type TaskEnvelope = { id: string; task: WorkerTask };

export type ResultEnvelope =
    | { id: string; ok: true; data: TaskResult }
    | { id: string; ok: false; error: string };
