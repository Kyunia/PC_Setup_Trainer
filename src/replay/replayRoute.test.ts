import { describe, expect, it } from "vitest";
import { jstrisReplayUrlFromViewerPath } from "./replayRoute";

describe("replay viewer route", () => {
  it("converts a numeric replay path to a Jstris replay URL", () => {
    expect(jstrisReplayUrlFromViewerPath("/replay/92072007"))
      .toBe("https://jstris.jezevec10.com/replay/92072007");
    expect(jstrisReplayUrlFromViewerPath("/replay/92072007/"))
      .toBe("https://jstris.jezevec10.com/replay/92072007");
  });

  it("rejects non-numeric and oversized identifiers", () => {
    expect(jstrisReplayUrlFromViewerPath("/replay/live/abc123")).toBeNull();
    expect(jstrisReplayUrlFromViewerPath("/replay/abc123")).toBeNull();
    expect(jstrisReplayUrlFromViewerPath(`/replay/${"1".repeat(33)}`)).toBeNull();
    expect(jstrisReplayUrlFromViewerPath("/replay")).toBeNull();
  });
});
