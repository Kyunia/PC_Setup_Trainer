/// <reference lib="webworker" />

import { querySetupsStagedCooperative } from "./cooperativeQuery";
import type { CooperativeSearchControl } from "./reachability";
import type {
  RecommendationWorkerCommand,
  RecommendationWorkerMessage,
  RecommendationWorkerRequest,
} from "./recommendationWorkerProtocol";

const NODE_CHECK_INTERVAL = 2_048;
const SLICE_BUDGET_MS = 50;

class RecommendationCancelled extends Error {}

const cancelled = new Set<number>();
const queued: RecommendationWorkerRequest[] = [];
let activeRequestId: number | null = null;

function send(message: RecommendationWorkerMessage): void {
  self.postMessage(message);
}

function createControl(requestId: number): CooperativeSearchControl {
  let nodeCount = 0;
  let sliceStartedAt = performance.now();
  return {
    onNode(): Promise<void> | void {
      nodeCount += 1;
      if (nodeCount % NODE_CHECK_INTERVAL !== 0) return;
      if (cancelled.has(requestId)) throw new RecommendationCancelled();
      if (performance.now() - sliceStartedAt < SLICE_BUDGET_MS) return;
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          sliceStartedAt = performance.now();
          if (cancelled.has(requestId)) reject(new RecommendationCancelled());
          else resolve();
        }, 0);
      });
    },
  };
}

async function run(request: RecommendationWorkerRequest): Promise<void> {
  activeRequestId = request.requestId;
  try {
    const control = createControl(request.requestId);
    await querySetupsStagedCooperative(request.query, control, (result) => {
      if (cancelled.has(request.requestId)) throw new RecommendationCancelled();
      send({ type: "stage", requestId: request.requestId, ...result });
    });
  } catch (reason) {
    if (reason instanceof RecommendationCancelled || cancelled.has(request.requestId)) {
      send({ type: "cancelled", requestId: request.requestId });
    } else {
      send({
        type: "error",
        requestId: request.requestId,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  } finally {
    cancelled.delete(request.requestId);
    activeRequestId = null;
    const next = queued.shift();
    if (next) void run(next);
  }
}

self.onmessage = (event: MessageEvent<RecommendationWorkerCommand>) => {
  const command = event.data;
  if (command.type === "cancel") {
    cancelled.add(command.requestId);
    const queuedIndex = queued.findIndex(({ requestId }) => requestId === command.requestId);
    if (queuedIndex >= 0) {
      queued.splice(queuedIndex, 1);
      cancelled.delete(command.requestId);
      send({ type: "cancelled", requestId: command.requestId });
    }
    return;
  }
  if (activeRequestId === null) void run(command);
  else queued.push(command);
};

