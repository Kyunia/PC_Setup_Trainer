import type { StagedRecommendationResult } from "./cooperativeQuery";
import type { SetupQuery } from "./query";
import type { RecommendationWorkerMessage } from "./recommendationWorkerProtocol";
import type { SelectedRecommendationScope } from "./recommendationScope";
import type { SetupVariant } from "./schema";

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
  private worker: Worker;
  private pending: PendingRequest | null = null;
  private activeRequestId: number | null = null;
  private readonly createWorker: () => Worker;

  constructor(createWorker: () => Worker = () => new Worker(new URL("./recommendation.worker.ts", import.meta.url), { type: "module" })) {
    this.createWorker = createWorker;
    this.worker = this.createWorker();
    this.bindWorker();
  }

  private bindWorker(): void {
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
      this.failAndReplace(new Error("Recommendation Web Worker failed."));
    };
    this.worker.onmessageerror = () => {
      this.failAndReplace(new Error("Recommendation Web Worker returned an unreadable message."));
    };
  }

  private failAndReplace(reason: Error): void {
    const pending = this.pending;
    this.pending = null;
    this.activeRequestId = null;
    this.worker.terminate();
    this.worker = this.createWorker();
    this.bindWorker();
    pending?.reject(reason);
  }

  get busy(): boolean {
    return this.activeRequestId !== null;
  }

  start(
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
    scopeOrLegacyCatalog?: SelectedRecommendationScope | SetupVariant[],
  ): RecommendationWorkerTask {
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
    const scope: SelectedRecommendationScope | undefined = Array.isArray(scopeOrLegacyCatalog)
      ? {
          mode: "selected-bundles",
          bundles: [{
            bundleId: "legacy-selected-catalog",
            kind: "structured",
            cycle: query.cycle,
            catalog: scopeOrLegacyCatalog,
          }],
        }
      : scopeOrLegacyCatalog;
    try {
      this.worker.postMessage({
        type: "recommend",
        requestId,
        query,
        ...(scope ? { scope } : {}),
      });
    } catch (reason) {
      this.failAndReplace(reason instanceof Error ? reason : new Error(String(reason)));
    }
    return {
      requestId,
      done,
      cancel: () => {
        if (this.activeRequestId === requestId) this.worker.postMessage({ type: "cancel", requestId });
      },
    };
  }
}
