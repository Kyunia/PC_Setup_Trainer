import type { StagedRecommendationResult } from "../setups/cooperativeQuery";
import type { SetupQuery } from "../setups/query";
import {
  RecommendationRequestCancelled,
  RecommendationWorkerSlot,
  type RecommendationWorkerTask,
} from "../setups/recommendationWorkerClient";

export type ReplayRecommendationJobState = "pending" | "running" | "cancelling";

interface ReplayRecommendationSubscriber {
  onStage: (result: StagedRecommendationResult) => void;
  onError: (reason: Error) => void;
}

interface ReplayRecommendationJob {
  key: string;
  query: SetupQuery;
  order: number;
  state: ReplayRecommendationJobState;
  subscribers: Set<ReplayRecommendationSubscriber>;
  onComplete: (result: StagedRecommendationResult) => void;
  latest?: StagedRecommendationResult;
  slot?: RecommendationWorkerSlotLike;
  task?: RecommendationWorkerTask;
}

export interface RecommendationWorkerSlotLike {
  readonly busy: boolean;
  warm(): void;
  dispose(): void;
  start(
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
  ): RecommendationWorkerTask;
}

/** Two persistent Workers: current PC wins; one prior PC may finish for cache. */
export class ReplayRecommendationPool {
  private readonly slots: readonly RecommendationWorkerSlotLike[];
  /** Only reusable pending/running jobs live here. Cancelling jobs are removed immediately. */
  private readonly jobs = new Map<string, ReplayRecommendationJob>();
  private readonly cancellingBySlot = new Map<RecommendationWorkerSlotLike, ReplayRecommendationJob>();
  private pendingCurrent: ReplayRecommendationJob | null = null;
  private currentKey: string | null = null;
  private nextOrder = 0;

  constructor(slots: readonly RecommendationWorkerSlotLike[] = [
    new RecommendationWorkerSlot(),
    new RecommendationWorkerSlot(),
  ]) {
    if (slots.length !== 2) throw new Error("Replay recommendation pool requires exactly two Worker slots.");
    this.slots = slots;
  }

  /** Best-effort prewarm. A failed slot remains lazy and can retry on start(). */
  warm(): void {
    for (const slot of this.slots) {
      try { slot.warm(); }
      catch { /* Lazy start will retry Worker creation. */ }
    }
  }

  request(
    key: string,
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
    onComplete: (result: StagedRecommendationResult) => void,
    onError: (reason: Error) => void,
  ): () => void {
    this.currentKey = key;
    if (this.pendingCurrent && this.pendingCurrent.key !== key) this.dropPending(this.pendingCurrent);

    let job = this.jobs.get(key);
    const subscriber: ReplayRecommendationSubscriber = { onStage, onError };
    if (!job) {
      job = {
        key,
        query,
        order: ++this.nextOrder,
        state: "pending",
        subscribers: new Set(),
        onComplete,
      };
      this.jobs.set(key, job);
      job.subscribers.add(subscriber);
      this.schedule(job);
    } else {
      job.subscribers.add(subscriber);
      if (job.latest) onStage(job.latest);
    }

    return () => { job?.subscribers.delete(subscriber); };
  }

  cancelAll(): void {
    this.currentKey = null;
    if (this.pendingCurrent) this.dropPending(this.pendingCurrent);
    for (const job of [...this.jobs.values()]) {
      job.subscribers.clear();
      if (job.state === "running") this.beginCancellation(job);
      else if (job.state === "pending") this.dropPending(job);
    }
  }

  dispose(): void {
    this.currentKey = null;
    this.pendingCurrent = null;
    for (const job of this.jobs.values()) job.subscribers.clear();
    this.jobs.clear();
    this.cancellingBySlot.clear();
    for (const slot of this.slots) slot.dispose();
  }

  private dropPending(job: ReplayRecommendationJob): void {
    if (this.pendingCurrent === job) this.pendingCurrent = null;
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    job.subscribers.clear();
  }

  private setPendingCurrent(job: ReplayRecommendationJob): void {
    if (this.pendingCurrent && this.pendingCurrent !== job) this.dropPending(this.pendingCurrent);
    job.state = "pending";
    this.pendingCurrent = job;
  }

  private beginCancellation(job: ReplayRecommendationJob): void {
    if (job.state !== "running" || !job.slot || !job.task) return;
    job.state = "cancelling";
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    job.subscribers.clear();
    this.cancellingBySlot.set(job.slot, job);
    job.task.cancel();
  }

  private schedule(job: ReplayRecommendationJob): void {
    const free = this.slots.find((slot) => !slot.busy && !this.cancellingBySlot.has(slot));
    if (free) {
      this.start(job, free);
      return;
    }
    if (this.cancellingBySlot.size > 0) {
      this.setPendingCurrent(job);
      return;
    }
    const oldestLowPriority = [...this.jobs.values()]
      .filter((candidate) => candidate.state === "running" && candidate.task && candidate.key !== this.currentKey)
      .sort((left, right) => left.order - right.order)[0];
    if (oldestLowPriority) this.beginCancellation(oldestLowPriority);
    this.setPendingCurrent(job);
  }

  private start(job: ReplayRecommendationJob, slot: RecommendationWorkerSlotLike): void {
    if (this.jobs.get(job.key) !== job || job.state === "cancelling") return;
    if (this.pendingCurrent === job) this.pendingCurrent = null;
    job.state = "running";
    job.slot = slot;

    let task: RecommendationWorkerTask;
    try {
      task = slot.start(job.query, (result) => {
        if (job.state === "cancelling") return;
        job.latest = result;
        for (const subscriber of job.subscribers) subscriber.onStage(result);
      });
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      for (const subscriber of job.subscribers) subscriber.onError(error);
      this.startPendingOn(slot);
      return;
    }
    job.task = task;

    void task.done.then((result) => {
      // Completion can legitimately win a cooperative-cancel race; keep the cache sink.
      job.onComplete(result);
    }).catch((reason) => {
      if (reason instanceof RecommendationRequestCancelled) return;
      const error = reason instanceof Error ? reason : new Error(String(reason));
      for (const subscriber of job.subscribers) subscriber.onError(error);
    }).finally(() => {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      if (this.cancellingBySlot.get(slot) === job) this.cancellingBySlot.delete(slot);
      this.startPendingOn(slot);
    });
  }

  private startPendingOn(slot: RecommendationWorkerSlotLike): void {
    const pending = this.pendingCurrent;
    if (!pending || slot.busy || this.cancellingBySlot.has(slot)) return;
    this.pendingCurrent = null;
    this.start(pending, slot);
  }
}
