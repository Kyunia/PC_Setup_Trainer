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

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export class RecommendationWorkerSlot {
  private worker: Worker | null = null;
  private pending: PendingRequest | null = null;
  private activeRequestId: number | null = null;
  private readonly createWorker: () => Worker;

  constructor(createWorker: () => Worker = () => new Worker(new URL("./recommendation.worker.ts", import.meta.url), { type: "module" })) {
    this.createWorker = createWorker;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      const worker = this.createWorker();
      this.worker = worker;
      this.bindWorker(worker);
    }
    return this.worker;
  }

  warm(): void {
    this.ensureWorker();
  }

  private bindWorker(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<RecommendationWorkerMessage>) => {
      if (this.worker !== worker) return;
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
    worker.onerror = () => {
      if (this.worker !== worker) return;
      this.failAndReplace(worker, new Error("Recommendation Web Worker failed."));
    };
    worker.onmessageerror = () => {
      if (this.worker !== worker) return;
      this.failAndReplace(worker, new Error("Recommendation Web Worker returned an unreadable message."));
    };
  }

  private releaseWorker(worker: Worker): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    if (this.worker === worker) this.worker = null;
  }

  private failAndReplace(worker: Worker, reason: Error): void {
    if (this.worker !== worker) return;
    const pending = this.pending;
    this.pending = null;
    this.activeRequestId = null;
    this.releaseWorker(worker);
    try {
      this.ensureWorker();
    } catch {
      // Leave the slot empty. warm()/start() can retry creation later.
    }
    pending?.reject(reason);
  }

  get busy(): boolean {
    return this.activeRequestId !== null;
  }

  start(
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
    scopeOrLegacyCatalog?: SelectedRecommendationScope | readonly SetupVariant[],
  ): RecommendationWorkerTask {
    if (this.busy) throw new Error("Recommendation Worker is already busy.");
    const requestId = ++nextRequestId;
    let resolve!: (result: StagedRecommendationResult) => void;
    let reject!: (reason: Error) => void;
    const done = new Promise<StagedRecommendationResult>((accept, decline) => {
      resolve = accept;
      reject = decline;
    });
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (reason) {
      reject(asError(reason));
      return { requestId, done, cancel: () => undefined };
    }

    this.activeRequestId = requestId;
    this.pending = { onStage, resolve, reject };
    const scope: SelectedRecommendationScope | undefined = Array.isArray(scopeOrLegacyCatalog)
      ? {
          mode: "selected-bundles",
          bundles: [{
            bundleId: "legacy-selected-catalog",
            kind: "structured",
            cycle: query.cycle,
            catalog: [...scopeOrLegacyCatalog],
          }],
        }
      : scopeOrLegacyCatalog as SelectedRecommendationScope | undefined;
    try {
      worker.postMessage({
        type: "recommend",
        requestId,
        query,
        ...(scope ? { scope } : {}),
      });
    } catch (reason) {
      this.failAndReplace(worker, asError(reason));
    }
    return {
      requestId,
      done,
      cancel: () => {
        if (this.activeRequestId !== requestId || this.worker !== worker) return;
        try {
          worker.postMessage({ type: "cancel", requestId });
        } catch (reason) {
          this.failAndReplace(worker, asError(reason));
        }
      },
    };
  }

  dispose(): void {
    const pending = this.pending;
    this.pending = null;
    this.activeRequestId = null;
    const worker = this.worker;
    if (worker) this.releaseWorker(worker);
    pending?.reject(new RecommendationRequestCancelled());
  }
}
