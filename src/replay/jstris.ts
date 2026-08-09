import { MAX_REPLAY_INPUT_SIZE, type ReplayDataV1 } from "./format";
import { convertJstrisInWorker } from "./jstrisWorkerClient";

const JSTRIS_HOST = "jstris.jezevec10.com";

function jstrisDataUrl(input: string): string | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.hostname !== JSTRIS_HOST && !url.hostname.endsWith(`.${JSTRIS_HOST}`)) throw new Error("Only jstris.jezevec10.com replay links are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "replay") throw new Error("Invalid Jstris replay link.");
  const live = parts[1] === "live"; const id = live ? parts[2] : parts[1];
  if (!id || !/^[A-Za-z0-9]+$/.test(id) || id.length > 32) throw new Error("Invalid Jstris replay link.");
  return `/api/jstris-replay?id=${encodeURIComponent(id)}&type=${live ? 1 : 0}`;
}

async function replayCodeFromInput(input: string, fetcher: typeof fetch): Promise<string> {
  const dataUrl = jstrisDataUrl(input);
  if (!dataUrl) return input.trim();
  try {
    const response = await fetcher(dataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    if (text.length > MAX_REPLAY_INPUT_SIZE) throw new Error("too large");
    return text.trim();
  } catch {
    throw new Error("Could not load this Jstris replay URL. Copy its raw replay code and paste that code instead.");
  }
}

export async function importJstrisReplay(input: string, fetcher: typeof fetch = fetch): Promise<ReplayDataV1> {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_REPLAY_INPUT_SIZE) throw new Error("Jstris replay input is empty or too large.");
  return convertJstrisInWorker(await replayCodeFromInput(trimmed, fetcher));
}
