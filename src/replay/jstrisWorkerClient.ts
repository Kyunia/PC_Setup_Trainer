import type { ReplayDataV1 } from "./schema";
let requestId = 0;
export function convertJstrisInWorker(code: string): Promise<ReplayDataV1> {
  if (typeof Worker === "undefined") return import("./jstrisLocal").then(({ convertJstrisCodeToQpcr1 }) => convertJstrisCodeToQpcr1(code));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./jstris.worker.ts", import.meta.url), { type: "module" }); const id = ++requestId;
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; replay?: ReplayDataV1; error?: string }>) => {
      if (event.data.id !== id) return; cleanup();
      if (event.data.ok && event.data.replay) resolve(event.data.replay); else reject(new Error(event.data.error ?? "Jstris conversion failed."));
    };
    worker.onerror = () => { cleanup(); reject(new Error("Jstris replay Web Worker failed.")); };
    worker.postMessage({ id, code });
  });
}


