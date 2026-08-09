import { useEffect, useState } from "react";
import {
  ACTION_LABELS,
  DEFAULT_SETTINGS,
  INPUT_ACTIONS,
  INPUT_LIMITS,
  createBinding,
  displayCode,
  isModifierCode,
  normalizeInputSettings,
  type InputAction,
  type InputSettings,
} from "./settings";
import "./settingsPanel.css";

export function SettingsPanel({ settings, onChange, onClose }: {
  settings: InputSettings;
  onChange: (settings: InputSettings) => void;
  onClose: () => void;
}) {
  const [capturing, setCapturing] = useState<InputAction | null>(null);
  const [message, setMessage] = useState("Changes are saved automatically.");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && capturing === null) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [capturing, onClose]);

  function applyBinding(action: InputAction, binding: string) {
    const duplicate = INPUT_ACTIONS.find((other) => other !== action && settings.bindings[other] === binding);
    const bindings = { ...settings.bindings, [action]: binding };
    if (duplicate) {
      bindings[duplicate] = settings.bindings[action];
      setMessage(`Swapped keys for ${ACTION_LABELS[action]} and ${ACTION_LABELS[duplicate]}.`);
    } else {
      setMessage(`Changed ${ACTION_LABELS[action]} to ${displayCode(binding)}.`);
    }
    setCapturing(null);
    onChange({ ...settings, bindings });
  }

  function captureKeyDown(action: InputAction, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (capturing !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (isModifierCode(event.code)) {
      setMessage("Press a key to combine, or release to use the modifier alone.");
      return;
    }
    applyBinding(action, createBinding(event.code, event));
  }

  function captureKeyUp(action: InputAction, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (capturing !== action || !isModifierCode(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    applyBinding(action, event.code);
  }

  function updateSpeed(key: "das" | "arr" | "sdf", value: number) {
    const next = normalizeInputSettings({ ...settings, [key]: value });
    onChange(next);
    setMessage(`Set ${key.toUpperCase()} to ${next[key]}${key === "sdf" ? " cells/s" : "ms"}.`);
  }

  function resetDefaults() {
    onChange({ ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings } });
    setCapturing(null);
    setMessage("Restored default controls and speed.");
  }

  const speedFields = [
    { key: "das" as const, label: "DAS", description: "Delay before horizontal key repeat starts", unit: "ms" },
    { key: "arr" as const, label: "ARR", description: "Repeat interval after DAS · 0 = instant", unit: "ms" },
    { key: "sdf" as const, label: "SDF", description: "Soft drop speed", unit: "cells/s" },
  ];

  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="controls-title">
      <header className="settings-header">
        <div><span>SETTINGS</span><h2 id="controls-title">Game Controls</h2><p>Click a key field, then press the desired key or Ctrl/Alt/Shift combo.</p></div>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close game controls">×</button>
      </header>
      <div className="control-content">
        <section className="binding-section" aria-labelledby="binding-title">
          <h3 id="binding-title">Key Bindings</h3>
          <div className="bindings-grid">
            {INPUT_ACTIONS.map((action) => <div className="binding-row" key={action}>
              <label htmlFor={`binding-${action}`}>{ACTION_LABELS[action]}</label>
              <button id={`binding-${action}`} type="button" className={capturing === action ? "key-capture capturing" : "key-capture"}
                aria-pressed={capturing === action} onClick={() => { setMessage("Press a key."); setCapturing(action); }}
                onKeyDown={(event) => captureKeyDown(action, event)} onKeyUp={(event) => captureKeyUp(action, event)}>
                {capturing === action ? "Press a key…" : displayCode(settings.bindings[action])}
              </button>
            </div>)}
          </div>
        </section>
        <section className="speed-section" aria-labelledby="speed-title">
          <h3 id="speed-title">Movement Speed</h3>
          <div className="speed-controls">{speedFields.map((field) => <div className="speed-control" key={field.key}>
            <div className="speed-label"><label htmlFor={`speed-${field.key}`}>{field.label}</label><span>{field.description}</span></div>
            <div className="speed-inputs">
              <input id={`speed-${field.key}`} type="range" min={INPUT_LIMITS[field.key].min} max={INPUT_LIMITS[field.key].max}
                value={settings[field.key]} onChange={(event) => updateSpeed(field.key, Number(event.target.value))} />
              <input type="number" aria-label={`${field.label} value`} min={INPUT_LIMITS[field.key].min} max={INPUT_LIMITS[field.key].max}
                value={settings[field.key]} onChange={(event) => updateSpeed(field.key, Number(event.target.value))} />
              <span>{field.unit}</span>
            </div>
          </div>)}</div>
        </section>
      </div>
      <footer className="settings-footer"><p aria-live="polite">{message}</p><div><button type="button" onClick={resetDefaults}>Reset Defaults</button><button type="button" className="primary-button" onClick={onClose}>Done</button></div></footer>
    </section>
  </div>;
}
