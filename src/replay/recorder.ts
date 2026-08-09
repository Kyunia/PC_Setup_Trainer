import type { GameState } from "../engine/types";
import type { PlacementHistory } from "../engine/placementHistory";
import { createReplayV3Data } from "./qpcr3";
import type { ReplayDataV3 } from "./schema";

/** Serializes the engine-owned placement log without maintaining a second history. */
export class ReplayRecorder {
  constructor(private readonly history: PlacementHistory) {}

  /**
   * `currentState` is accepted for call-site compatibility but intentionally ignored.
   * QPCR3 ends immediately after the last authoritative lock event; unfinished
   * movement/rotation/HOLD input is not part of the recording.
   */
  export(_currentState?: GameState): ReplayDataV3 {
    return createReplayV3Data(this.history.initialState(), this.history.eventLog());
  }
}
