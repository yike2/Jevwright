import type { LiveMessage, Run, Step } from "./api.js";

export type LiveState = {
  run: Run | null;
  steps: Step[];
};

export function runStatusLabel(status: Run["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
  }
}

export function stepStatusLabel(status: Step["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "—";
  }

  if (ms < 1000) {
    return `${ms} ms`;
  }

  return `${(ms / 1000).toFixed(1)} s`;
}

export function liveUrl(baseUrl: string, runId: string, token: string): string {
  const httpUrl = new URL(baseUrl.replace(/\/$/, ""));
  const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${wsProtocol}//${httpUrl.host}${httpUrl.pathname}/runs/${runId}/live?token=${encodeURIComponent(token)}`;
}

export function runFileUrl(baseUrl: string, runId: string, path: string, token: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/runs/${runId}/files/${path}?token=${encodeURIComponent(token)}`;
}

export function applyLiveMessage(state: LiveState, message: LiveMessage): LiveState {
  switch (message.type) {
    case "snapshot":
      return {
        run: message.run,
        steps: [...message.steps],
      };

    case "step": {
      const existingIndex = state.steps.findIndex((step) => step.index === message.step.index);

      if (existingIndex >= 0) {
        const nextSteps = [...state.steps];
        nextSteps[existingIndex] = message.step;

        return {
          run: state.run,
          steps: nextSteps,
        };
      }

      const nextSteps = [...state.steps, message.step].sort((a, b) => a.index - b.index);
      return {
        run: state.run,
        steps: nextSteps,
      };
    }

    case "status":
      return {
        run: message.run,
        steps: [...state.steps],
      };
  }
}
