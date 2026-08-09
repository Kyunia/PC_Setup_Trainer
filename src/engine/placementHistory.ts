import type { GameState } from "./types";
import { applyPlacementEvent, copyGameState, type PlacementEvent } from "./placement";

export interface PlacementHistoryCheckpoint {
  eventIndex: number;
  state: GameState;
}

/**
 * Authoritative place log shared by live Undo and replay export.
 * Only PC-start states persist; the active PC keeps an at-most-11-state hot cache.
 */
export class PlacementHistory {
  private initial: GameState;
  private events: PlacementEvent[] = [];
  private checkpoints: PlacementHistoryCheckpoint[] = [];
  private hotStartEventIndex = 0;
  private hotStates: GameState[] = [];

  constructor(initial: GameState) {
    this.initial = copyGameState(initial);
    this.checkpoints = [{ eventIndex: 0, state: copyGameState(initial) }];
    this.hotStates = [copyGameState(initial)];
  }

  reset(initial: GameState): void {
    this.initial = copyGameState(initial);
    this.events = [];
    this.checkpoints = [{ eventIndex: 0, state: copyGameState(initial) }];
    this.hotStartEventIndex = 0;
    this.hotStates = [copyGameState(initial)];
  }

  record(event: PlacementEvent, before: GameState, after: GameState): void {
    this.events.push({ ...event });
    this.hotStates.push(copyGameState(after));
    if (after.run.pcCount > before.run.pcCount) {
      const eventIndex = this.events.length;
      this.checkpoints.push({ eventIndex, state: copyGameState(after) });
      this.hotStartEventIndex = eventIndex;
      this.hotStates = [copyGameState(after)];
    }
  }

  undo(): GameState | null {
    if (this.events.length === 0) return null;
    const targetEventCount = this.events.length - 1;
    this.events.pop();
    this.checkpoints = this.checkpoints.filter(({ eventIndex }) => eventIndex <= targetEventCount);

    if (targetEventCount >= this.hotStartEventIndex && this.hotStates.length > 1) {
      this.hotStates.pop();
      return copyGameState(this.hotStates[this.hotStates.length - 1]!);
    }

    const checkpoint = this.checkpoints[this.checkpoints.length - 1]!;
    this.hotStartEventIndex = checkpoint.eventIndex;
    this.hotStates = [copyGameState(checkpoint.state)];
    let state = copyGameState(checkpoint.state);
    for (let eventIndex = checkpoint.eventIndex; eventIndex < targetEventCount; eventIndex += 1) {
      state = applyPlacementEvent(state, this.events[eventIndex]!, eventIndex).after;
      this.hotStates.push(copyGameState(state));
    }
    return copyGameState(state);
  }

  turnStartState(): GameState {
    return copyGameState(this.hotStates[this.hotStates.length - 1]!);
  }

  initialState(): GameState {
    return copyGameState(this.initial);
  }

  eventLog(): PlacementEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  pcCheckpoints(): PlacementHistoryCheckpoint[] {
    return this.checkpoints.map(({ eventIndex, state }) => ({ eventIndex, state: copyGameState(state) }));
  }

  /** Exposed for bounded tests and diagnostics, not replay serialization. */
  runtimeShape(): { events: number; checkpoints: number; hotStates: number } {
    return { events: this.events.length, checkpoints: this.checkpoints.length, hotStates: this.hotStates.length };
  }
}
