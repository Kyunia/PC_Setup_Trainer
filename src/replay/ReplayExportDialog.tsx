import { useEffect, useMemo, useState } from "react";
import {
  REPLAY_TRANSFER_STORAGE_KEY,
  encodeReplayCode,
  replayFileName,
  replayToText,
  type ReplayData,
} from "./format";
import { encodeQpcr3Container } from "./qpcr3";

export type ReplayCodeResult = { code: string; error: null } | { code: ""; error: string };

export function safeEncodeReplayCode(replay: ReplayData): ReplayCodeResult {
  try {
    return { code: encodeReplayCode(replay), error: null };
  } catch (reason) {
    return { code: "", error: reason instanceof Error ? reason.message : "Replay encoding failed." };
  }
}

export function ReplayExportDialog({ replay, onClose }: { replay: ReplayData; onClose: () => void }) {
  const encoded = useMemo(() => safeEncodeReplayCode(replay), [replay]);
  const code = encoded.code;
  const recordCount = replay.version === 1 ? replay.frames.filter((frame) => frame.kind === "placement").length : replay.events.eventCount;
  const [message, setMessage] = useState(encoded.error ?? `${recordCount} replay ${replay.version === 1 ? "frames" : "lock events"} ready.`);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Replay code copied.");
    } catch {
      setMessage("Copy failed. Select the code and copy it manually.");
    }
  }

  function downloadText() {
    try {
      const url = URL.createObjectURL(new Blob([replayToText(replay)], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = replayFileName(replay);
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Replay TXT downloaded.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Replay TXT encoding failed.");
    }
  }

  function downloadBinary() {
    if (replay.version !== 3) return;
    try {
      const bytes = encodeQpcr3Container(replay);
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = replayFileName(replay).replace(/\.txt$/i, ".bin");
      anchor.click(); URL.revokeObjectURL(url); setMessage("QPCR3 binary downloaded.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "QPCR3 binary encoding failed.");
    }
  }

  function openViewer() {
    try {
      localStorage.setItem(REPLAY_TRANSFER_STORAGE_KEY, code);
    } catch {
      // The code remains available for manual paste if storage is unavailable.
    }
    window.open("/replay", "_blank", "noopener");
  }

  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog replay-export-dialog" role="dialog" aria-modal="true" aria-labelledby="replay-export-title">
      <header className="settings-header">
        <div><span>REPLAY</span><h2 id="replay-export-title">Export Current Run</h2><p>Copy a portable code, download a TXT file, or open this run in the replay viewer.</p></div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close replay export">×</button>
      </header>
      <div className="replay-export-content">
        <label htmlFor="replay-code">Replay Code</label>
        <textarea id="replay-code" readOnly value={code} onFocus={(event) => event.currentTarget.select()} />
      </div>
      <footer className="settings-footer">
        <p aria-live="polite">{message}</p>
        <div>
          <button type="button" disabled={encoded.error !== null} onClick={downloadText}>Download TXT</button>{replay.version === 3 && <button type="button" disabled={encoded.error !== null} onClick={downloadBinary}>Download BIN</button>}
          <button type="button" disabled={encoded.error !== null} onClick={copyCode}>Copy Code</button>
          <button type="button" disabled={encoded.error !== null} className="primary-button" onClick={openViewer}>Open Viewer</button>
        </div>
      </footer>
    </section>
  </div>;
}
