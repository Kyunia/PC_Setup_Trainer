import type { StagedRecommendationResult } from "../setups/cooperativeQuery";
import type { SetupQuery } from "../setups/query";
import {
  RecommendationRequestCancelled,
  RecommendationWorkerSlot,
  type RecommendationWorkerTask,
} from "../setups/recommendationWorkerClient";

interface ReplayRecommendationJob {
  key: string;
  query: SetupQuery;
  order: number;
  listeners: Set<(result: StagedRecommendationResult) => void>;
  onComplete: (result: StagedRecommendationResult) => void;
  onError: (reason: Error) => void;
  latest?: StagedRecommendationResult;
  slot?: RecommendationWorkerSlotLike;
  task?: RecommendationWorkerTask;
}

export interface RecommendationWorkerSlotLike {
  readonly busy: boolean;
  start(
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
  ): RecommendationWorkerTask;
}

/** Two persistent Workers: current PC wins; one prior PC may finish for cache. */
export class ReplayRecommendationPool {
  private readonly slots: readonly RecommendationWorkerSlotLike[];
  private readonly jobs = new Map<string, ReplayRecommendationJob>();
  private pending: ReplayRecommendationJob | null = null;
  private currentKey: string | null = null;
  private nextOrder = 0;

  constructor(slots: readonly RecommendationWorkerSlotLike[] = [
    new RecommendationWorkerSlot(),
    new RecommendationWorkerSlot(),
  ]) {
    if (slots.length !== 2) throw new Error("Replay recommendation pool requires exactly two Worker slots.");
    this.slots = slots;
  }

  request(
    key: string,
    query: SetupQuery,
    onStage: (result: StagedRecommendationResult) => void,
    onComplete: (result: StagedRecommendationResult) => void,
    onError: (reason: Error) => void,
  ): () => void {
    this.currentKey = key;
    if (this.pending && this.pending.key !== key) {
      this.jobs.delete(this.pending.key);
      this.pending = null;
    }
    let job = this.jobs.get(key);
    if (!job) {
      job = {
        key,
        query,
        order: ++this.nextOrder,
        listeners: new Set(),
        onComplete,
        onError,
      };
      this.jobs.set(key, job);
      this.schedule(job);
    }
    job.listeners.add(onStage);
    if (job.latest) onStage(job.latest);
    return () => { job?.listeners.delete(onStage); };
  }

  cancelAll(): void {
    this.currentKey = null;
    this.pending = null;
    for (const job of this.jobs.values()) job.task?.cancel();
    this.jobs.clear();
  }

  private schedule(job: ReplayRecommendationJob): void {
    const free = this.slots.find((slot) => !slot.busy);
    if (free) {
      this.start(job, free);
      return;
    }
    const oldestLowPriority = [...this.jobs.values()]
      .filter((candidate) => candidate.task && candidate.key !== this.currentKey)
      .sort((left, right) => left.order - right.order)[0];
    if (oldestLowPriority) oldestLowPriority.task?.cancel();
    this.pending = job;
  }

  private start(job: ReplayRecommendationJob, slot: RecommendationWorkerSlotLike): void {
    if (!this.jobs.has(job.key)) return;
    job.slot = slot;
    const task = slot.start(job.query, (result) => {
      job.latest = result;
      for (const listener of job.listeners) listener(result);
    });
    job.task = task;
    void task.done.then((result) => {
      job.onComplete(result);
    }).catch((reason) => {
      if (!(reason instanceof RecommendationRequestCancelled)) job.onError(reason instanceof Error ? reason : new Error(String(reason)));
    }).finally(() => {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      const pending = this.pending;
      if (pending) {
        this.pending = null;
        this.start(pending, slot);
      }
    });
  }
}
