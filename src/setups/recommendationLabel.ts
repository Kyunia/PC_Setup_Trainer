import type { Piece } from "../engine/types";
import { formatPieceSetForDisplay, normalizePieceNotationForDisplay } from "../engine/pieceDisplay";

const MIRROR_RELATION = /\s*\(\s*(?:⇔|↔|⟷|⟺|<[-=]+>)[^)]*\)/giu;
const MIRROR_CLASSIFICATION = /\s*\([^)]*\bMirror(?:able)?\b[^)]*\)/giu;
const PARENTHESIZED_FORM = /\s*\(\s*Form\s+\d+\s*\)/giu;
const FORM_CLASSIFICATION = /\s+Form\s+\d+\b/giu;
const STANDALONE_MIRRORABLE = /\s+Mirrorable\b\.?/giu;

/** 원본 이름은 보존하고 추천 버튼에 불필요한 분류 메모만 숨긴다. */
export function recommendationSetupLabel(
  displayName: string,
  saveTargets: readonly Piece[] = [],
): string {
  const cleaned = displayName
    .replace(MIRROR_RELATION, "")
    .replace(MIRROR_CLASSIFICATION, "")
    .replace(PARENTHESIZED_FORM, "")
    .replace(FORM_CLASSIFICATION, "")
    .replace(STANDALONE_MIRRORABLE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = normalizePieceNotationForDisplay(cleaned || displayName);
  const normalizedTargets = [...new Set(saveTargets)];
  return normalizedTargets.length > 0
    ? `${base} (save ${formatPieceSetForDisplay(normalizedTargets, "/")})`
    : base;
}
