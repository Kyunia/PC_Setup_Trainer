import { describe, expect, it } from "vitest";
import type { SetupCandidate } from "./query";
import { GuideUndoHistory } from "./guideHistory";

describe("GuideUndoHistory", () => {
  it("하드드롭 직전의 후보·선택·단계 상태를 LIFO 순서로 복원한다", () => {
    const history = new GuideUndoHistory();
    const firstCandidates = [{ setup: { id: "legs" } }] as unknown as SetupCandidate[];
    const secondCandidates = [{ setup: { id: "hills" } }] as unknown as SetupCandidate[];

    history.push({ candidates: firstCandidates, selectedId: "legs", guideDone: false });
    history.push({ candidates: secondCandidates, selectedId: "hills", guideDone: true });

    expect(history.pop()).toMatchObject({ selectedId: "hills", guideDone: true });
    expect(history.pop()).toMatchObject({ selectedId: "legs", guideDone: false });
    expect(history.pop()).toBeNull();
  });

  it("재시작 시 기존 런의 가이드 이력을 폐기한다", () => {
    const history = new GuideUndoHistory();
    history.push({ candidates: [], selectedId: "legs", guideDone: false });
    history.clear();
    expect(history.pop()).toBeNull();
  });

  it("저장 후 원본 후보 배열이 바뀌어도 스냅샷은 유지된다", () => {
    const history = new GuideUndoHistory();
    const candidates = [{ setup: { id: "legs" } }] as unknown as SetupCandidate[];
    history.push({ candidates, selectedId: "legs", guideDone: false });
    candidates.length = 0;
    expect(history.pop()?.candidates).toHaveLength(1);
  });

  it("동일 후보 목록을 여러 place에서 참조할 때 배열 복사본을 재사용한다", () => {
    const history = new GuideUndoHistory();
    const candidates = [{ setup: { id: "legs" } }] as unknown as SetupCandidate[];
    history.push({ candidates, selectedId: "legs", guideDone: false });
    history.push({ candidates, selectedId: "legs", guideDone: true });

    const second = history.pop();
    const first = history.pop();
    expect(second?.candidates).toBe(first?.candidates);
    expect(second?.candidates).not.toBe(candidates);
  });
});
