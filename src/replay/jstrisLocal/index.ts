import { MAX_REPLAY_INPUT_SIZE, validateReplayDataV1, type ReplayDataV1 } from "../format";
import { decodeReplayActions } from "./actions";
import { decodeJstrisReplayCode } from "./decode";
import { simulateJstrisToQpcr1 } from "./simulator";
export function convertJstrisCodeToQpcr1(input: string): ReplayDataV1 {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_REPLAY_INPUT_SIZE) throw new Error("Jstris replay input is empty or too large.");
  const replay = decodeJstrisReplayCode(trimmed); const actions = decodeReplayActions(replay);
  return validateReplayDataV1(simulateJstrisToQpcr1(replay, actions));
}


