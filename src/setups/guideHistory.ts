import type { GameState } from "../engine/types";
import type { SetupCandidate } from "./query";

export interface GuideSnapshot {
  candidates: SetupCandidate[];
  selectedId: string | null;
  guideDone: boolean;
  stagedInstruction?: string;
}

/**
 * GameSession의 하드드롭 이력과 나란히 유지되는 오른쪽 셋업 가이드 이력이다.
 * 엔진 상태와 UI 추천 상태를 분리하되 undo 단위는 정확히 일치시킨다.
 * 같은 후보 목록은 한 번만 복사하여 place마다 큰 배열을 중복 저장하지 않는다.
 */
export class GuideUndoHistory {
  private snapshots: GuideSnapshot[] = [];
  private candidateCopies = new WeakMap<SetupCandidate[], SetupCandidate[]>();

  private candidatesFor(snapshot: GuideSnapshot): SetupCandidate[] {
    const existing = this.candidateCopies.get(snapshot.candidates);
    if (existing) return existing;
    const copy = [...snapshot.candidates];
    this.candidateCopies.set(snapshot.candidates, copy);
    return copy;
  }

  push(snapshot: GuideSnapshot): void {
    this.snapshots.push({ ...snapshot, candidates: this.candidatesFor(snapshot) });
  }

  pop(): GuideSnapshot | null {
    const snapshot = this.snapshots.pop();
    return snapshot ? { ...snapshot } : null;
  }

  clear(): void {
    this.snapshots = [];
    this.candidateCopies = new WeakMap();
  }
}

export function guideSegmentIdentity(state: GameState): string {
  return `${state.seed}:${state.run.pcCount}:${state.run.cycle}`;
}
