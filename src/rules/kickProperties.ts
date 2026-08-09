import type { Orientation, Piece } from "../engine/types";

export interface KickCandidate {
  dx: number;
  dy: number;
  privilege: boolean;
}

export type Transition = `${Orientation}${Orientation}`;
export type KickTable = Record<string, KickCandidate[]>;

type RawEntry = { reference?: string; candidates?: KickCandidate[] };

export function parseKickProperties(source: string): KickTable {
  const raw = new Map<string, RawEntry>();
  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) throw new Error(`잘못된 kick properties 행: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (value.startsWith("&")) {
      raw.set(key, { reference: value.slice(1).trim() });
      continue;
    }
    const candidates: KickCandidate[] = [];
    const pattern = /\(\s*(@)?\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      candidates.push({ dx: Number(match[2]), dy: Number(match[3]), privilege: Boolean(match[1]) });
    }
    if (candidates.length === 0) throw new Error(`kick 후보가 없습니다: ${key}`);
    raw.set(key, { candidates });
  }

  const resolved: KickTable = {};
  function resolve(key: string, trail: Set<string>): KickCandidate[] {
    if (resolved[key]) return resolved[key];
    const entry = raw.get(key);
    if (!entry) throw new Error(`존재하지 않는 kick 참조: ${key}`);
    if (trail.has(key)) throw new Error(`순환 kick 참조: ${[...trail, key].join(" -> ")}`);
    const nextTrail = new Set(trail).add(key);
    const candidates = entry.reference ? resolve(entry.reference, nextTrail) : entry.candidates;
    if (!candidates) throw new Error(`kick을 해석할 수 없습니다: ${key}`);
    resolved[key] = candidates.map((candidate) => ({ ...candidate }));
    return resolved[key];
  }
  for (const key of raw.keys()) resolve(key, new Set());
  return resolved;
}

export function kickKey(piece: Piece, from: Orientation, to: Orientation): string {
  return `${piece}.${from}${to}`;
}
