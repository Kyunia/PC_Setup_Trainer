import { decodeBase64 } from "./base64";
import { BitReader } from "./bitReader";
import { ActionCode, AuxCode, type JstrisReplayObject, type ReplayAction } from "./types";

export function decodeReplayActions(replay: JstrisReplayObject, maxActions = 2_000_000): ReplayAction[] {
  const version = Number(replay.c.v ?? 0);
  if (!(version >= 3 && version < 4)) throw new Error(`Unsupported Jstris replay version ${version}.`);
  if (typeof replay.d !== "string" || replay.d.length === 0) throw new Error("Jstris V3 replay has no action stream.");
  const reader = new BitReader(decodeBase64(replay.d)); const actions: ReplayAction[] = [];
  let previousLow = 0; let epoch = 0;
  while (true) {
    if (actions.length >= maxActions) throw new Error(`Jstris replay exceeds the ${maxActions} action safety limit.`);
    if (reader.remaining < 12) {
      if (!reader.remainingBitsAreZero()) throw new Error("Jstris V3 action stream has a non-zero truncated tail.");
      break;
    }
    const low = reader.required(12, "timestamp");
    if (low === 0xfff) {
      if (!reader.remainingBitsAreZero()) throw new Error("Jstris V3 action stream has non-zero data after its terminator.");
      break;
    }
    if (low < previousLow) epoch += 1; previousLow = low;
    const actionCode = reader.required(4, "action code") as ActionCode;
    const action: ReplayAction = { t: 4094 * epoch + low, a: actionCode };
    switch (actionCode) {
      case ActionCode.GarbageAdd: action.d = [reader.required(5, "garbage line count"), reader.required(4, "garbage hole")]; break;
      case ActionCode.RedBarSet: action.d = [reader.required(5, "red bar")]; break;
      case ActionCode.ArrMove: action.d = [reader.required(1, "ARR direction")]; break;
      case ActionCode.Aux: {
        const aux = reader.required(4, "AUX code") as AuxCode; action.aux = aux;
        switch (aux) {
          case AuxCode.Afk: {
            const duration = reader.required(16, "AFK duration"); action.d = [duration];
            previousLow += duration % 4094;
            if (previousLow >= 4094) { previousLow -= 4094; epoch += 1; }
            epoch += Math.floor(duration / 4094); break;
          }
          case AuxCode.BlockSet: action.d = [reader.required(1, "block-set scope"), reader.required(4, "block-set ID")]; break;
          case AuxCode.MoveTo: action.d = [reader.required(4, "absolute x") - 3, reader.required(5, "absolute y") - 12]; break;
          case AuxCode.Randomizer: action.d = [reader.required(1, "randomizer reset"), reader.required(5, "randomizer ID")]; break;
          case AuxCode.MatrixMod: action.d = [reader.required(4, "matrix operation"), reader.required(5, "matrix data")]; break;
          case AuxCode.WideGarbageAdd: action.d = [reader.required(5, "wide garbage line count"), reader.required(4, "wide garbage hole"), reader.required(3, "wide garbage width"), reader.required(1, "wide garbage inversion")]; break;
          default: throw new Error(`Unknown Jstris V3 AUX action ${aux}.`);
        }
        break;
      }
      default:
        if (actionCode < ActionCode.MoveLeft || actionCode > ActionCode.Aux) throw new Error(`Unknown Jstris action code ${actionCode}.`);
    }
    actions.push(action);
  }
  return actions;
}


