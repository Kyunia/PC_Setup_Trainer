import { decompressFromEncodedURIComponent, LzDecompressionLimitError } from "./lzString";
import type { JstrisReplayObject } from "./types";
const MAX_DECOMPRESSED_JSON = 2_000_000;
function parseReplayJson(json: string): JstrisReplayObject {
  if (new TextEncoder().encode(json).byteLength > MAX_DECOMPRESSED_JSON) throw new Error("Jstris replay payload is too large.");
  let parsed: unknown; try { parsed = JSON.parse(json); } catch { throw new Error("Jstris replay payload is not valid JSON."); }
  if (!parsed || typeof parsed !== "object" || !("c" in parsed) || !(parsed as { c?: unknown }).c || typeof (parsed as { c?: unknown }).c !== "object") throw new Error('Jstris replay JSON does not contain config key "c".');
  return parsed as JstrisReplayObject;
}
export function decodeJstrisReplayCode(code: string): JstrisReplayObject {
  const trimmed = code.trim(); if (!trimmed) throw new Error("Jstris replay code is empty.");
  if (trimmed.startsWith("{")) return parseReplayJson(trimmed);
  let json: string | null;
  try { json = decompressFromEncodedURIComponent(trimmed, MAX_DECOMPRESSED_JSON); }
  catch (reason) {
    if (reason instanceof LzDecompressionLimitError) throw new Error("Jstris replay payload is too large.");
    throw reason;
  }
  if (!json) throw new Error("Invalid Jstris URI-safe LZ replay code.");
  return parseReplayJson(json);
}

