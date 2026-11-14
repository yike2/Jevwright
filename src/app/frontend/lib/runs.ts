import type { LiveMessage, Run, Step } from "./api.js";

export type LiveState = {
  run: Run | null;
  steps: Step[];
};

export function runStatusLabel(_status: Run["status"]): string {
  throw new Error("Not implemented");
}

export function stepStatusLabel(_status: Step["status"]): string {
  throw new Error("Not implemented");
}

export function formatDuration(_ms: number | null | undefined): string {
  throw new Error("Not implemented");
}

export function liveUrl(_baseUrl: string, _runId: string, _token: string): string {
  throw new Error("Not implemented");
}

export function runFileUrl(_baseUrl: string, _runId: string, _path: string, _token: string): string {
  throw new Error("Not implemented");
}

export function applyLiveMessage(_state: LiveState, _message: LiveMessage): LiveState {
  throw new Error("Not implemented");
}
