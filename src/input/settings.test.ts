import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTION_LABELS, createBinding, DEFAULT_SETTINGS, displayCode, loadInputSettings, normalizeInputSettings, saveInputSettings, SDF_INFINITE, type InputSettings } from "./settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("input settings", () => {
  it("DAS, ARR, SDF를 허용 범위로 정규화한다", () => {
    expect(normalizeInputSettings({
      ...DEFAULT_SETTINGS,
      das: -10,
      arr: 999,
      sdf: Number.NaN,
    })).toMatchObject({ das: 0, arr: 200, sdf: 30 });
  });

  it("DAS 기본값은 160ms이고 SDF 최댓값은 무한을 뜻한다", () => {
    expect(DEFAULT_SETTINGS.das).toBe(160);
    expect(normalizeInputSettings({ ...DEFAULT_SETTINGS, sdf: SDF_INFINITE }).sdf).toBe(SDF_INFINITE);
    expect(normalizeInputSettings({ ...DEFAULT_SETTINGS, sdf: SDF_INFINITE + 100 }).sdf).toBe(SDF_INFINITE);
  });

  it("브라우저 key code를 읽기 쉬운 이름으로 표시한다", () => {
    expect(displayCode("ArrowLeft")).toBe("← Left");
    expect(displayCode("ShiftLeft")).toBe("Left Shift");
    expect(displayCode("Numpad0")).toBe("Num 0");
    expect(displayCode("KeyA")).toBe("A");
    expect(displayCode("Ctrl+KeyZ")).toBe("Ctrl + Z");
  });

  it("modifier와 일반 키를 하나의 조합키로 만든다", () => {
    expect(createBinding("KeyZ", { ctrlKey: true })).toBe("Ctrl+KeyZ");
    expect(createBinding("ArrowLeft", { ctrlKey: true, shiftKey: true })).toBe("Ctrl+Shift+ArrowLeft");
    expect(createBinding("ControlLeft", { ctrlKey: true })).toBe("ControlLeft");
  });

  it("동일 시드 재시작 기본 단축키를 제공한다", () => {
    expect(DEFAULT_SETTINGS.bindings.randomSeed).toBe("F4");
    expect(ACTION_LABELS.randomSeed).toBe("Restart (Same Seed)");
  });

  it("한 칸 내리기 기본 단축키를 제공한다", () => {
    expect(DEFAULT_SETTINGS.bindings.stepDown).toBe("KeyS");
  });

  it("Snapshot 종료 기본 단축키를 Esc로 표시한다", () => {
    expect(DEFAULT_SETTINGS.bindings.exitSnapshot).toBe("Escape");
    expect(displayCode(DEFAULT_SETTINGS.bindings.exitSnapshot)).toBe("Esc");
  });

  it("See Solve 기본 단축키를 제공한다", () => {
    expect(DEFAULT_SETTINGS.bindings.seeSolve).toBe("KeyV");
    expect(ACTION_LABELS.seeSolve).toBe("See Solve");
  });

  it("이전 저장 설정에 Snapshot 종료 키가 없어도 기본값을 복원한다", () => {
    const { exitSnapshot: _missing, seeSolve: _missingSolve, ...legacyBindings } = DEFAULT_SETTINGS.bindings;
    const legacy = { ...DEFAULT_SETTINGS, bindings: legacyBindings } as unknown as InputSettings;
    expect(normalizeInputSettings(legacy).bindings.exitSnapshot).toBe("Escape");
    expect(normalizeInputSettings(legacy).bindings.seeSolve).toBe("KeyV");

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => key === "guided-pc-input-v2" ? JSON.stringify(legacy) : null),
    });
    expect(loadInputSettings().bindings.exitSnapshot).toBe("Escape");
    expect(loadInputSettings().bindings.seeSolve).toBe("KeyV");
  });

  it("브라우저 저장소가 차단되어도 입력 설정 저장이 게임을 중단시키지 않는다", () => {
    vi.stubGlobal("localStorage", {
      setItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
    });

    expect(() => saveInputSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
