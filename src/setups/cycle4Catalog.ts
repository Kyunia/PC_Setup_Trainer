import rawClassIndex from "../../setups/cycle-4-class-index.json";
import rawILIJ from "../../setups/cycle-4-no-ilij-setups.json";
import rawILIJPolicy from "../../setups/cycle-4-no-ilij-policy.json";
import rawISIZ from "../../setups/cycle-4-no-isiz-setups.json";
import rawISIZPolicy from "../../setups/cycle-4-no-isiz-policy.json";
import rawLJ from "../../setups/cycle-4-no-lj-setups.json";
import rawLJPolicy from "../../setups/cycle-4-no-lj-policy.json";
import rawLSJZ from "../../setups/cycle-4-no-lsjz-setups.json";
import rawLSJZPolicy from "../../setups/cycle-4-no-lsjz-policy.json";
import rawLZJS from "../../setups/cycle-4-no-lzjs-setups.json";
import rawLZJSPolicy from "../../setups/cycle-4-no-lzjs-policy.json";
import rawOI from "../../setups/cycle-4-no-oi-setups.json";
import rawOIPolicy from "../../setups/cycle-4-no-oi-policy.json";
import rawOLOJ from "../../setups/cycle-4-no-oloj-setups.json";
import rawOLOJPolicy from "../../setups/cycle-4-no-oloj-policy.json";
import rawOSOZ from "../../setups/cycle-4-no-osoz-setups.json";
import rawOSOZPolicy from "../../setups/cycle-4-no-osoz-policy.json";
import rawSZ from "../../setups/cycle-4-no-sz-setups.json";
import rawSZPolicy from "../../setups/cycle-4-no-sz-policy.json";
import rawTI from "../../setups/cycle-4-no-ti-setups.json";
import rawTIPolicy from "../../setups/cycle-4-no-ti-policy.json";
import rawTLTJ from "../../setups/cycle-4-no-tltj-setups.json";
import rawTLTJPolicy from "../../setups/cycle-4-no-tltj-policy.json";
import rawTO from "../../setups/cycle-4-no-to-setups.json";
import rawTOPolicy from "../../setups/cycle-4-no-to-policy.json";
import rawTSTZ from "../../setups/cycle-4-no-tstz-setups.json";
import rawTSTZPolicy from "../../setups/cycle-4-no-tstz-policy.json";
import { normalizePieceNotationForDisplay } from "../engine/pieceDisplay";
import { PIECES, type Piece } from "../engine/types";
import { expandMirroredSetups, mirrorSetup } from "./mirror";
import { applyStructuredPolicyMetrics, type StructuredSetupPolicy } from "./policy";
import { expandBoxSetups } from "./rotation";
import type { SetupVariant } from "./schema";

type Cycle4Direction = "source-basis" | "horizontal-runtime-mirror";

interface Cycle4ClassDescriptor {
  classId: string;
  sourceFileClass: string;
  missingPieces: Piece[];
  sourceDirection: Cycle4Direction;
}

interface Cycle4ClassIndex {
  classes: Record<string, Cycle4ClassDescriptor>;
}

interface DirectionalPolicy extends StructuredSetupPolicy {
  metrics: Array<StructuredSetupPolicy["metrics"][number] & { direction?: string }>;
}

interface Cycle4Source {
  catalog: SetupVariant[];
  policy: DirectionalPolicy;
}

const sources: Record<string, Cycle4Source> = {
  "no-oi": { catalog: rawOI as SetupVariant[], policy: rawOIPolicy as unknown as DirectionalPolicy },
  "no-oloj": { catalog: rawOLOJ as SetupVariant[], policy: rawOLOJPolicy as unknown as DirectionalPolicy },
  "no-osoz": { catalog: rawOSOZ as SetupVariant[], policy: rawOSOZPolicy as unknown as DirectionalPolicy },
  "no-ilij": { catalog: rawILIJ as SetupVariant[], policy: rawILIJPolicy as unknown as DirectionalPolicy },
  "no-isiz": { catalog: rawISIZ as SetupVariant[], policy: rawISIZPolicy as unknown as DirectionalPolicy },
  "no-lj": { catalog: rawLJ as SetupVariant[], policy: rawLJPolicy as unknown as DirectionalPolicy },
  "no-lsjz": { catalog: rawLSJZ as SetupVariant[], policy: rawLSJZPolicy as unknown as DirectionalPolicy },
  "no-lzjs": { catalog: rawLZJS as SetupVariant[], policy: rawLZJSPolicy as unknown as DirectionalPolicy },
  "no-sz": { catalog: rawSZ as SetupVariant[], policy: rawSZPolicy as unknown as DirectionalPolicy },
  "no-tstz": { catalog: rawTSTZ as SetupVariant[], policy: rawTSTZPolicy as unknown as DirectionalPolicy },
  "no-to": { catalog: rawTO as SetupVariant[], policy: rawTOPolicy as unknown as DirectionalPolicy },
  "no-ti": { catalog: rawTI as SetupVariant[], policy: rawTIPolicy as unknown as DirectionalPolicy },
  "no-tltj": { catalog: rawTLTJ as SetupVariant[], policy: rawTLTJPolicy as unknown as DirectionalPolicy },
};

const pieceOrder = new Map(PIECES.map((piece, index) => [piece, index]));

export function cycle4PiecePairKey(pieces: readonly Piece[]): string {
  if (pieces.length !== 2 || pieces[0] === pieces[1]) return "";
  return [...pieces]
    .sort((left, right) => pieceOrder.get(left)! - pieceOrder.get(right)!)
    .join("");
}

function policyForDirection(policy: DirectionalPolicy, direction: Cycle4Direction): StructuredSetupPolicy {
  const wantsMirror = direction === "horizontal-runtime-mirror";
  const setupIdsWithMirrorMetric = new Set(
    policy.metrics
      .filter(({ direction: metricDirection }) => metricDirection?.startsWith("mirror-class-"))
      .map(({ setupId }) => setupId),
  );
  const metrics = policy.metrics.filter(({ setupId, direction: metricDirection }) => {
    const isMirror = metricDirection?.startsWith("mirror-class-") ?? false;
    if (!wantsMirror) return !isMirror;
    // 원문이 미러 class의 별도 수치를 준 setup만 그 값을 사용한다.
    // 별도 수치가 없는 setup은 source 수치가 좌우 공통이라는 뜻으로 보존한다.
    return isMirror || !setupIdsWithMirrorMetric.has(setupId);
  });
  return { ...policy, metrics };
}

function materializeClass(descriptor: Cycle4ClassDescriptor): SetupVariant[] {
  const source = sources[descriptor.sourceFileClass];
  if (!source) throw new Error(`4회차 source class가 없습니다: ${descriptor.sourceFileClass}`);

  const directed = applyStructuredPolicyMetrics(
    source.catalog,
    policyForDirection(source.policy, descriptor.sourceDirection),
  );
  if (descriptor.sourceDirection === "horizontal-runtime-mirror") {
    return expandBoxSetups(directed.map(mirrorSetup));
  }

  // 누락쌍 자체가 좌우반전에 닫혀 있는 class는 source geometry를 보존하면서
  // 누락된 반대 방향만 파생한다. 이미 GIF frame에 있으면 geometry key로 중복 제거된다.
  const mirroredMissing = descriptor.missingPieces.map((piece) => {
    if (piece === "J") return "L";
    if (piece === "L") return "J";
    if (piece === "S") return "Z";
    if (piece === "Z") return "S";
    return piece;
  });
  const materialized = cycle4PiecePairKey(mirroredMissing) === cycle4PiecePairKey(descriptor.missingPieces)
    ? expandMirroredSetups(directed)
    : directed;
  return expandBoxSetups(materialized);
}

const classIndex = rawClassIndex as unknown as Cycle4ClassIndex;
const descriptors = Object.entries(classIndex.classes);
const runtimeByPair = new Map<string, SetupVariant[]>();
const labelByPair = new Map<string, string>();

for (const [label, descriptor] of descriptors) {
  const key = cycle4PiecePairKey(descriptor.missingPieces);
  if (!key || runtimeByPair.has(key)) throw new Error(`잘못되거나 중복된 4회차 누락쌍: ${label}`);
  runtimeByPair.set(key, materializeClass(descriptor));
  labelByPair.set(key, label);
}

if (runtimeByPair.size !== 21) {
  throw new Error(`4회차 정상 누락쌍은 21개여야 합니다: ${runtimeByPair.size}`);
}

export const cycle4SourceCatalog = Object.values(sources).flatMap(({ catalog }) => catalog);
export const cycle4RuntimeCatalog = [...runtimeByPair.values()].flat();

export function setupsForCycle4Class(missingPieces: readonly Piece[]): SetupVariant[] {
  return runtimeByPair.get(cycle4PiecePairKey(missingPieces)) ?? [];
}

export function cycle4ClassLabel(missingPieces: readonly Piece[]): string | undefined {
  const label = labelByPair.get(cycle4PiecePairKey(missingPieces));
  return label ? normalizePieceNotationForDisplay(label) : undefined;
}
