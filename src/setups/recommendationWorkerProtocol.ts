import type { SetupCandidate, SetupQuery } from "./query";
import type { RecommendationStage } from "./cooperativeQuery";

export interface RecommendationWorkerRequest {
  type: "recommend";
  requestId: number;
  query: SetupQuery;
}

export interface RecommendationWorkerCancel {
  type: "cancel";
  requestId: number;
}

export type RecommendationWorkerCommand = RecommendationWorkerRequest | RecommendationWorkerCancel;

export interface RecommendationWorkerStageMessage {
  type: "stage";
  requestId: number;
  stage: RecommendationStage;
  candidates: SetupCandidate[];
  preferredCandidateId: string | null;
  complete: boolean;
}

export interface RecommendationWorkerCancelledMessage {
  type: "cancelled";
  requestId: number;
}

export interface RecommendationWorkerErrorMessage {
  type: "error";
  requestId: number;
  error: string;
}

export type RecommendationWorkerMessage =
  | RecommendationWorkerStageMessage
  | RecommendationWorkerCancelledMessage
  | RecommendationWorkerErrorMessage;

