/// <reference lib="webworker" />
import { convertJstrisCodeToQpcr1 } from "./jstrisLocal";
interface ConvertRequest { id: number; code: string }
self.onmessage = (event: MessageEvent<ConvertRequest>) => {
  const { id, code } = event.data;
  try { self.postMessage({ id, ok: true, replay: convertJstrisCodeToQpcr1(code) }); }
  catch (error) { self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
};


