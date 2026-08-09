import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { GameSession } from "./engine/game";
import { normalizePieceNotationForDisplay } from "./engine/pieceDisplay";
import { PIECES, type GameAction, type GameState, type Piece } from "./engine/types";
import { InputController } from "./input/controller";
import { releaseGameplayButtonFocus } from "./input/buttonFocus";
import { loadInputSettings, saveInputSettings } from "./input/settings";
import { SettingsPanel } from "./input/SettingsPanel";
import { drawBoard, drawPiecePreview, drawSetupPreview } from "./render/canvas";
import { ReplayExportDialog } from "./replay/ReplayExportDialog";
import { ReplayRecorder } from "./replay/recorder";
import type { ReplayData } from "./replay/format";
import { setupCoverageForCycle } from "./setups/catalog";
import { cycle4ClassLabel } from "./setups/cycle4Catalog";
import { GuideUndoHistory, guideSegmentIdentity, type GuideSnapshot } from "./setups/guideHistory";
import { countSetupShadowWrongCells, shouldAutoHideSetupShadow } from "./setups/shadow";
import { resolveCycle3StagedSetup, splitsSetupCandidatesByPieceCount, type SetupCandidate } from "./setups/query";
import { recommendationSetupLabel } from "./setups/recommendationLabel";
import {
  RecommendationRequestCancelled,
  RecommendationWorkerSlot,
  type RecommendationWorkerTask,
} from "./setups/recommendationWorkerClient";
import type { SetupVariant } from "./setups/schema";
import { openPcSolver, pcSolverUrl, type PcSolverInput } from "./solver/pcSolver";
import "./styles.css";

const SETUP_SHADOW_STORAGE_KEY = "guided-pc-setup-shadow-v1";

function useLazyRef<T>(factory: () => T): MutableRefObject<T> {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = factory();
  return ref as MutableRefObject<T>;
}

function loadSetupShadowPreference(): boolean {
  try {
    return localStorage.getItem(SETUP_SHADOW_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSetupShadowPreference(showSetupShadow: boolean): void {
  try {
    localStorage.setItem(SETUP_SHADOW_STORAGE_KEY, showSetupShadow ? "on" : "off");
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}

function PiecePreview({ piece, label }: { piece: Piece | null; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawPiecePreview(ref.current, piece); }, [piece]);
  return <div className="piece-preview">{label && <span>{label}</span>}<canvas ref={ref} aria-label={piece ?? "empty"} /></div>;
}

function SetupPreview({ setup }: { setup: SetupVariant }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawSetupPreview(ref.current, setup); }, [setup]);
  return <canvas ref={ref} className="setup-preview" aria-label={`${normalizePieceNotationForDisplay(setup.displayName)}${setup.formLabel ? ` ${normalizePieceNotationForDisplay(setup.formLabel)} form` : ""} setup shape`} />;
}

function setupOptionLabel(candidate: SetupCandidate): string {
  return recommendationSetupLabel(candidate.setup.displayName, candidate.qbSaveTargets);
}

function targetCompleted(state: GameState, setup: SetupVariant): boolean {
  return setup.placements.every((placement) => placement.cells.every(({ x, y }) => state.board[y]?.[x] === placement.piece));
}

export default function App() {
  const session = useLazyRef(() => new GameSession());
  const replayRecorder = useLazyRef(() => new ReplayRecorder(session.current.placementHistory));
  const canvas = useRef<HTMLCanvasElement>(null);
  const [revision, setRevision] = useState(0);
  const [resetNonce, setResetNonce] = useState(0);
  const [seedInput, setSeedInput] = useState(session.current.state.seed);
  const [queueJumpInput, setQueueJumpInput] = useState("");
  const [queueJumpStatus, setQueueJumpStatus] = useState({ text: "Enter 1–7 minos to jump by bag position.", error: false });
  const [settings, setSettings] = useState(loadInputSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayExport, setReplayExport] = useState<ReplayData | null>(null);
  const [showSetupShadow, setShowSetupShadow] = useState(loadSetupShadowPreference);
  const [candidates, setCandidates] = useState<SetupCandidate[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guideDone, setGuideDone] = useState(false);
  const [stagedInstruction, setStagedInstruction] = useState<string | undefined>();
  const guideState = useRef<GuideSnapshot>({ candidates: [], selectedId: null, guideDone: false, stagedInstruction: undefined });
  const guideHistory = useLazyRef(() => new GuideUndoHistory());
  const recommendationWorker = useLazyRef(() => new RecommendationWorkerSlot());
  const recommendationTask = useRef<RecommendationWorkerTask | null>(null);
  const recommendationGeneration = useRef(0);
  const restoredGuideSegment = useRef<string | null>(null);
  const state = session.current.state;
  const coverage = setupCoverageForCycle(state.run.cycle);
  const pcSolverInput = useMemo<PcSolverInput>(() => ({
    board: state.board,
    active: state.active.piece,
    hold: state.hold,
    next: state.bag.queue,
  }), [state.active.piece, state.bag.queue, state.board, state.hold]);
  const pcSolverAvailable = useMemo(() => pcSolverUrl(pcSolverInput) !== null, [pcSolverInput]);

  useEffect(() => {
    guideState.current = { candidates, selectedId, guideDone, stagedInstruction };
  }, [candidates, selectedId, guideDone, stagedInstruction]);

  const dispatch = useCallback((action: GameAction) => {
    const guideBeforeAction = action === "hardDrop" ? guideState.current : null;
    const changed = session.current.dispatch(action);
    if (changed) {
      if (action === "hardDrop" && guideBeforeAction) guideHistory.current.push(guideBeforeAction);
      if (action === "undo") {
        const restored = guideHistory.current.pop();
        if (restored) {
          setCandidates(restored.candidates);
          setSelectedId(restored.selectedId);
          setGuideDone(restored.guideDone);
          setStagedInstruction(restored.stagedInstruction);
          restoredGuideSegment.current = guideSegmentIdentity(session.current.state);
        }
      }
      if (action === "restart" || action === "randomSeed") {
        guideHistory.current.clear();
        restoredGuideSegment.current = null;
        setResetNonce((value) => value + 1);
      }
      if (action === "randomSeed") setSeedInput(session.current.state.seed);
      setRevision((value) => value + 1);
    }
    return changed;
  }, []);

  useEffect(() => {
    if (settingsOpen || replayExport) return;
    const controller = new InputController(dispatch, settings);
    return () => controller.destroy();
  }, [dispatch, replayExport, settings, settingsOpen]);

  useEffect(() => { saveInputSettings(settings); }, [settings]);
  useEffect(() => { saveSetupShadowPreference(showSetupShadow); }, [showSetupShadow]);

  const segmentKey = `${state.seed}:${state.run.pcCount}:${state.run.cycle}:${resetNonce}`;
  useEffect(() => {
    const current = session.current.state;
    const currentIdentity = guideSegmentIdentity(current);
    const generation = ++recommendationGeneration.current;
    const previousTask = recommendationTask.current;
    if (previousTask) previousTask.cancel();
    if (restoredGuideSegment.current === currentIdentity) {
      restoredGuideSegment.current = null;
      setRecommendationLoading(false);
      return;
    }
    restoredGuideSegment.current = null;
    const snapshot = {
      cycle: current.run.cycle,
      board: current.board.map((row) => [...row]),
      active: current.active.piece,
      hold: current.hold,
      next: [...current.bag.queue.slice(0, 5)],
      holdAvailable: true,
    };
    setCandidates([]);
    setSelectedId(null);
    setRecommendationLoading(true);
    setGuideDone(false);
    setStagedInstruction(undefined);
    const launch = () => {
      if (recommendationGeneration.current !== generation) return;
      const task = recommendationWorker.current.start(snapshot, (result) => {
        if (recommendationGeneration.current !== generation) return;
        setCandidates(result.candidates);
        if (result.stage === "primary") {
          setRecommendationLoading(false);
          setSelectedId(result.preferredCandidateId);
        }
        else setSelectedId((selected) => selected && result.candidates.some(({ setup }) => setup.id === selected)
          ? selected
          : result.preferredCandidateId);
      });
      recommendationTask.current = task;
      void task.done.catch((reason) => {
        if (!(reason instanceof RecommendationRequestCancelled)
          && recommendationGeneration.current === generation) {
          setRecommendationLoading(false);
          console.error(reason);
        }
      }).finally(() => {
        if (recommendationTask.current?.requestId === task.requestId) recommendationTask.current = null;
      });
    };
    if (previousTask) void previousTask.done.catch(() => undefined).finally(launch);
    else launch();
  }, [segmentKey]);

  const selected = useMemo(() => candidates.find(({ setup }) => setup.id === selectedId)?.setup ?? null, [candidates, selectedId]);
  const splitCandidateSections = splitsSetupCandidatesByPieceCount(state.run.cycle);
  const qbCandidates = useMemo(() => candidates.filter(({ qbCondition }) => qbCondition !== undefined), [candidates]);
  const showQbCandidateSection = state.run.cycle === 7 || qbCandidates.length > 0;
  const showCategorizedCandidates = splitCandidateSections || showQbCandidateSection;
  const candidateSections = useMemo(() => {
    if (!showCategorizedCandidates) return [];
    const standardCandidates = candidates.filter(({ qbCondition }) => qbCondition === undefined);
    const sections = [
      { label: "4P+ Setups", candidates: standardCandidates.filter(({ setup }) => setup.placements.length >= 4) },
      { label: "3P Setups", candidates: standardCandidates.filter(({ setup }) => setup.placements.length === 3) },
    ];
    const otherCandidates = standardCandidates.filter(({ setup }) => setup.placements.length < 3);
    if (otherCandidates.length > 0) sections.push({ label: "Other Setups", candidates: otherCandidates });
    return sections;
  }, [candidates, showCategorizedCandidates]);
  useEffect(() => {
    if (!selected || guideDone || !targetCompleted(session.current.state, selected)) return;
    const current = session.current.state;
    const staged = resolveCycle3StagedSetup({
      cycle: current.run.cycle,
      board: current.board,
      active: current.active.piece,
      hold: current.hold,
      next: current.bag.queue.slice(0, 5),
      holdAvailable: !current.holdUsedThisTurn,
    }, selected);
    if (!staged) {
      setGuideDone(true);
      return;
    }
    setStagedInstruction(staged.instruction);
    if (staged.action === "solve-from-precondition") {
      setGuideDone(true);
      return;
    }
    if (!staged.candidate) return;
    setCandidates((currentCandidates) => [
      staged.candidate!,
      ...currentCandidates.filter(({ setup }) => setup.id !== selected.id && setup.id !== staged.candidate!.setup.id),
    ]);
    setSelectedId(staged.candidate.setup.id);
  }, [revision, selected, guideDone]);

  const setupShadowAutoHidden = selected
    ? shouldAutoHideSetupShadow(state.board, selected, state.run.piecesLockedSinceLastPc)
    : false;
  const setupShadowVisible = showSetupShadow && !guideDone && !setupShadowAutoHidden;

  useEffect(() => {
    if (canvas.current) drawBoard(canvas.current, state, selected, setupShadowVisible);
  }, [revision, selected, setupShadowVisible, state]);

  function restartWithSeed() {
    session.current.setSeed(seedInput);
    guideHistory.current.clear();
    restoredGuideSegment.current = null;
    setSeedInput(session.current.state.seed);
    setResetNonce((value) => value + 1);
    setRevision((value) => value + 1);
  }

  function jumpToQueue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const target = session.current.jumpToQueue(queueJumpInput);
      guideHistory.current.clear();
      restoredGuideSegment.current = null;
      setQueueJumpInput(target.normalized);
      setResetNonce((value) => value + 1);
      setRevision((value) => value + 1);

      let classLabel = target.normalized;
      const distinct = new Set(target.pieces);
      if (target.cycle === 4 && distinct.size === 5) {
        const missing = PIECES.filter((piece) => !distinct.has(piece));
        classLabel = `No ${cycle4ClassLabel(missing) ?? missing.join("")}`;
      } else if (target.cycle === 6 && distinct.size === 6) {
        classLabel = `No ${PIECES.find((piece) => !distinct.has(piece)) ?? "?"}`;
      }
      setQueueJumpStatus({ text: `Moved to ${classLabel} · Cycle ${target.cycle}.`, error: false });
    } catch (reason) {
      setQueueJumpStatus({ text: reason instanceof Error ? reason.message : "Could not read that queue.", error: true });
    }
  }

  const wrongCells = selected && !guideDone ? countSetupShadowWrongCells(state.board, selected) : 0;

  return <main className="app-shell" onPointerUpCapture={releaseGameplayButtonFocus}>
    <header className="topbar">
      <div><h1>GUIDED PC MODE</h1><p>JST180 · SEE7 · 7-BAG</p></div>
      <a href="/replay.html">Replay Viewer</a>
    </header>

    <section className="game-layout">
      <aside className="hold-column">
        <PiecePreview piece={state.hold} label="HOLD" />
      </aside>

      <div className="field-column">
        <canvas ref={canvas} className="board-canvas" aria-label="10-column 20-row Tetris field" />
        <div className={`status-line ${state.run.status === "failed" ? "failed" : ""}`}>{state.run.message}</div>
        <div className="main-actions">
          <button
            type="button"
            className="pc-solver-action"
            disabled={!pcSolverAvailable}
            title={pcSolverAvailable ? "Open the settled field and seven-piece queue in PC Solver." : "A complete seven-piece queue and encodable field are required."}
            onClick={() => { openPcSolver(pcSolverInput); }}
          >PC Solver</button>
          <button type="button" onClick={() => dispatch("undo")}>Undo</button>
          <button type="button" onClick={() => dispatch("restart")}>Restart</button>
          <button type="button" onClick={() => setReplayExport(replayRecorder.current.export(session.current.state))}>Export</button>
          <button type="button" onClick={() => setSettingsOpen(true)}>Controls</button>
        </div>
      </div>

      <aside className="next-column">
        <div className="next-list"><span>NEXT</span>{state.bag.queue.slice(0, 5).map((piece, index) => <PiecePreview key={`${index}-${piece}`} piece={piece} />)}</div>
        <div className="side-stats" aria-label="Run progress">
          <span><small>CYCLE</small><b>{state.run.cycle}</b></span>
          <span><small>PC</small><b>{state.run.pcCount}</b></span>
          <span><small>MINOS</small><b>{state.run.piecesLockedSinceLastPc}/10</b></span>
        </div>
      </aside>

      <aside className="guide-column">
        <div className="guide-heading">
          <div><span>{selected ? `${selected.placements.length}P GUIDE` : "SETUP GUIDE"}</span><h2>{guideDone ? "Solve Phase" : selected ? normalizePieceNotationForDisplay(selected.displayName) : recommendationLoading ? "Loading…" : "No Suggestion"}</h2></div>
          <div className="guide-heading-actions">
            <span className="phase-badge">{guideDone ? "SOLVE" : "SETUP"}</span>
            <button
              type="button"
              className={`setup-shadow-toggle ${showSetupShadow ? "enabled" : ""} ${setupShadowAutoHidden && showSetupShadow ? "auto-hidden" : ""}`}
              aria-pressed={showSetupShadow}
              aria-label={`${showSetupShadow ? "Hide" : "Show"} setup shadow on board`}
              title={setupShadowAutoHidden && showSetupShadow ? "Free placement detected after 3P. Undo to 2P to restore the shadow." : undefined}
              onClick={() => setShowSetupShadow((visible) => !visible)}
            >
              <span className="setup-shadow-toggle-label">SETUP SHADOW</span>
              <strong className="setup-shadow-toggle-state">{setupShadowAutoHidden && showSetupShadow ? "AUTO OFF" : showSetupShadow ? "ON" : "OFF"}</strong>
            </button>
          </div>
        </div>
        <p className="coverage-note">{coverage.setupCount > 0
          ? `Cycle ${state.run.cycle}: ${coverage.logicalSetupCount} setups · ${coverage.setupCount} placements · ${coverage.runtimeVariantCount} available · partial catalog`
          : coverage.logicalSetupCount > 0
            ? `Cycle ${state.run.cycle}: data promoted · awaiting recommendation link`
            : `Cycle ${state.run.cycle}: data not registered`}</p>
        {selected ? <>
          <SetupPreview setup={selected} />
          <p className="setup-meta">{selected.solveRate !== undefined ? `PC Rate ${selected.solveRate}% · ` : ""}Priority {selected.priority ?? 0} · Difficulty {selected.difficulty}/5 · {selected.saves !== undefined ? `${selected.saveMetricKind === "project-priority" ? "Save Priority" : "Saves"} ${selected.saves}${selected.saveMetricKind === "project-priority" ? "" : "%"} · ` : ""}{selected.reviewStatus === "draft" ? "Unreviewed" : "Reviewed"}</p>
          {stagedInstruction && <p className="policy-note">{stagedInstruction}</p>}
          {!guideDone && wrongCells > 0 && <p className="warning">{wrongCells} cell(s) differ from the target. Undo recommended.</p>}
          <ol className="plan-list">{candidates.find(({ setup }) => setup.id === selected.id)?.plan.steps.map((step, index) =>
            <li key={`${index}-${step.piece}`}>{step.action === "hold" ? `${step.piece} Hold` : `${step.piece} Place`}</li>)}</ol>
        </> : <p className="empty-copy">{recommendationLoading
          ? "Reading the PC-start queue and finding buildable setups…"
          : coverage.setupCount > 0
          ? `No buildable candidates found in the current ${coverage.setupCount} placements and their mirrors for this queue. Unexplored setups may exist. Free practice continues.`
          : coverage.logicalSetupCount > 0
            ? `Cycle ${state.run.cycle} setup data has been promoted but is not yet linked to the recommendation engine. Free practice continues.`
            : `Cycle ${state.run.cycle} setup data is not yet registered. Free practice continues.`}</p>}

        {showCategorizedCandidates && candidates.length > 0
          ? <div className="candidate-list candidate-sections">{candidateSections.map((section) => <section className="candidate-group" key={section.label}>
              <h3><span>{section.label}</span><small>{section.candidates.length}</small></h3>
              {section.candidates.length > 0
                ? section.candidates.map((candidate) => <button key={candidate.setup.id} type="button" className={selectedId === candidate.setup.id ? "selected" : ""} onClick={() => { setSelectedId(candidate.setup.id); setGuideDone(false); setStagedInstruction(undefined); }}>{setupOptionLabel(candidate)}</button>)
                : <p className="candidate-empty">No buildable setups</p>}
              {section.label === "3P Setups" && showQbCandidateSection && <div className="qb-candidate-group">
                <h3><span>QB Setups</span><small>{qbCandidates.length}</small></h3>
                {qbCandidates.length > 0
                  ? qbCandidates.map((candidate) => <button key={candidate.setup.id} type="button" className={selectedId === candidate.setup.id ? "selected" : ""} onClick={() => { setSelectedId(candidate.setup.id); setGuideDone(false); setStagedInstruction(undefined); }}>{setupOptionLabel(candidate)}</button>)
                  : <p className="candidate-empty">No QB setup for this queue</p>}
              </div>}
            </section>)}</div>
          : candidates.length > 1 && <div className="candidate-list"><h3>{candidates.length} Candidates</h3>{candidates.map((candidate) =>
              <button key={candidate.setup.id} type="button" className={selectedId === candidate.setup.id ? "selected" : ""} onClick={() => { setSelectedId(candidate.setup.id); setGuideDone(false); setStagedInstruction(undefined); }}>{setupOptionLabel(candidate)}</button>)}</div>}
        <form className="queue-jump-panel" onSubmit={jumpToQueue}>
          <label>QUEUE JUMP<input value={queueJumpInput} maxLength={20} placeholder="TS or TOSIZ" onChange={(event) => setQueueJumpInput(event.target.value.toUpperCase())} /></label>
          <button type="submit">Go</button>
          <p className={queueJumpStatus.error ? "error" : ""} aria-live="polite">{queueJumpStatus.text}</p>
        </form>
        <div className="seed-panel"><label>SEED <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} /></label><button type="button" onClick={restartWithSeed}>Apply</button><button type="button" onClick={() => dispatch("randomSeed")}>Random</button></div>
      </aside>
    </section>
    {settingsOpen && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {replayExport && <ReplayExportDialog replay={replayExport} onClose={() => setReplayExport(null)} />}
  </main>;
}
