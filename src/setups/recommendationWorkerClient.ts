import type { StagedRecommendationResult } from "./cooperativeQuery";
import type { SetupQuery } from "./query";
import type { RecommendationWorkerMessage } from "./recommendationWorkerProtocol";

export class RecommendationRequestCancelled extends Error {
  constructor() {
    super("Recommendation request cancelled.");
  }
}

export interface RecommendationWorkerTask {
  requestId: number;
  done: Promise<StagedRecommendationResult>;
  cancel(): void;
}

interface PendingRequest {
  onStage: (result: StagedRecommendationResult) => void;
  resolve: (result: StagedRecommendationResult) => void;
  reject: (reason: Error) => void;
}

let nextRequestId = 0;

export class RecommendationWorkerSlot {
  private readonly worker: Worker;
  private pending: PendingRequest | null = null;
  private activeRequestId: number | null = null;

  constructor() {
    this.worker = new Worker(new URL("./recommendation.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<RecommendationWorkerMessage>) => {
      const message = event.data;
      if (message.requestId !== this.activeRequestId || !this.pending) return;
      if (message.type === "stage") {
        const result: StagedRecommendationResult = {
          stage: message.stage,
          candidates: message.candidates,
          preferredCandidateId: message.preferredCandidateId,
          complete: message.complete,
        };
        this.pending.onStage(result);
        if (!message.complete) return;
        const pending = this.pending;
        this.pending = null;
        this.activeRequestId = null;
        pending.resolve(result);
        return;
      }
      const pending = this.pending;
      this.pending = null;
      this.activeRequestId = null;
      if (message.type === "cancelled") pending.reject(new RecommendationRequestCancelled());
      else pending.reject(new Error(message.error));
    };
    this.worker.onerror = () => {
      const pending = this.pending;
      this.pending = null;
      this.activeRequestId = null;
      pending?.reject(new Error("Recommendation Web Worker failed."));
    };
  }

  get busy(): boolean {
    return this.activeRequestId !== null;
  }

  start(query: SetupQuery, onStage: (result: StagedRecommendationResult) => void): RecommendationWorkerTask {
    if (this.busy) throw new Error("Recommendation Worker is already busy.");
    const requestId = ++nextRequestId;
    let resolve!: (result: StagedRecommendationResult) => void;
    let reject!: (reason: Error) => void;
    const done = new Promise<StagedRecommendationResult>((accept, decline) => {
      resolve = accept;
      reject = decline;
    });
    this.activeRequestId = requestId;
    this.pending = { onStage, resolve, reject };
    this.worker.postMessage({ type: "recommend", requestId, query });
    return {
      requestId,
      done,
      cancel: () => {
        if (this.activeRequestId === requestId) this.worker.postMessage({ type: "cancel", requestId });
      },
    };
  }
}

