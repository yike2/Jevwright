export type JudgeResult = { ok: true; probability: number } | { ok: false; reason: string; probability?: number };
