import rawClassIndex from "../../setups/cycle-5-class-index.json";
import rawILIJ from "../../setups/cycle-5-ilij-setups.json";
import rawILIJPolicy from "../../setups/cycle-5-ilij-policy.json";
import rawISIZ from "../../setups/cycle-5-isiz-setups.json";
import rawISIZPolicy from "../../setups/cycle-5-isiz-policy.json";
import rawLJ from "../../setups/cycle-5-lj-setups.json";
import rawLJPolicy from "../../setups/cycle-5-lj-policy.json";
import rawLSJZ from "../../setups/cycle-5-lsjz-setups.json";
import rawLSJZPolicy from "../../setups/cycle-5-lsjz-policy.json";
import rawLZJS from "../../setups/cycle-5-lzjs-setups.json";
import rawLZJSPolicy from "../../setups/cycle-5-lzjs-policy.json";
import rawOI from "../../setups/cycle-5-oi-setups.json";
import rawOIPolicy from "../../setups/cycle-5-oi-policy.json";
import rawOLOJ from "../../setups/cycle-5-oloj-setups.json";
import rawOLOJPolicy from "../../setups/cycle-5-oloj-policy.json";
import rawOSOZ from "../../setups/cycle-5-osoz-setups.json";
import rawOSOZPolicy from "../../setups/cycle-5-osoz-policy.json";
import rawSZ from "../../setups/cycle-5-sz-setups.json";
import rawSZPolicy from "../../setups/cycle-5-sz-policy.json";
import rawTI from "../../setups/cycle-5-ti-setups.json";
import rawTIPolicy from "../../setups/cycle-5-ti-policy.json";
import rawTLTJ from "../../setups/cycle-5-tltj-setups.json";
import rawTLTJPolicy from "../../setups/cycle-5-tltj-policy.json";
import rawTO from "../../setups/cycle-5-to-setups.json";
import rawTOPolicy from "../../setups/cycle-5-to-policy.json";
import rawTSTZ from "../../setups/cycle-5-tstz-setups.json";
import rawTSTZPolicy from "../../setups/cycle-5-tstz-policy.json";
import { formatPieceSetForDisplay } from "../engine/pieceDisplay";
import type { Piece } from "../engine/types";
import { cycle5PiecePairKey } from "./cycle5Context";
import { expandMirroredSetups, mirrorPiece, mirrorSetup } from "./mirror";
import { applyStructuredPolicyMetrics, type StructuredSetupPolicy } from "./policy";
import { expandBoxSetups } from "./rotation";
import type { SetupVariant } from "./schema";

type Cycle5Direction = "source-basis" | "horizontal-runtime-mirror";

interface Cycle5ClassDescriptor {
  classId: string;
  sourceFileClass: string;
  firstBagPieces: [Piece, Piece];
  sourceDirection: Cycle5Direction;
}

interface Cycle5ClassIndex {
  classes: Record<string, Cycle5ClassDescriptor>;
}

interface Cycle5Source {
  catalog: SetupVariant[];
  policy: StructuredSetupPolicy;
}

const sources: Record<string, Cycle5Source> = {
  tltj: { catalog: rawTLTJ as SetupVariant[], policy: rawTLTJPolicy as unknown as StructuredSetupPolicy },
  ti: { catalog: rawTI as SetupVariant[], policy: rawTIPolicy as unknown as StructuredSetupPolicy },
  to: { catalog: rawTO as SetupVariant[], policy: rawTOPolicy as unknown as StructuredSetupPolicy },
  tstz: { catalog: rawTSTZ as SetupVariant[], policy: rawTSTZPolicy as unknown as StructuredSetupPolicy },
  oi: { catalog: rawOI as SetupVariant[], policy: rawOIPolicy as unknown as StructuredSetupPolicy },
  lj: { catalog: rawLJ as SetupVariant[], policy: rawLJPolicy as unknown as StructuredSetupPolicy },
  ilij: { catalog: rawILIJ as SetupVariant[], policy: rawILIJPolicy as unknown as StructuredSetupPolicy },
  oloj: { catalog: rawOLOJ as SetupVariant[], policy: rawOLOJPolicy as unknown as StructuredSetupPolicy },
  isiz: { catalog: rawISIZ as SetupVariant[], policy: rawISIZPolicy as unknown as StructuredSetupPolicy },
  osoz: { catalog: rawOSOZ as SetupVariant[], policy: rawOSOZPolicy as unknown as StructuredSetupPolicy },
  lsjz: { catalog: rawLSJZ as SetupVariant[], policy: rawLSJZPolicy as unknown as StructuredSetupPolicy },
  lzjs: { catalog: rawLZJS as SetupVariant[], policy: rawLZJSPolicy as unknown as StructuredSetupPolicy },
  sz: { catalog: rawSZ as SetupVariant[], policy: rawSZPolicy as unknown as StructuredSetupPolicy },
};

function materializeClass(descriptor: Cycle5ClassDescriptor): SetupVariant[] {
  const source = sources[descriptor.sourceFileClass];
  if (!source) throw new Error(`5회차 source class가 없습니다: ${descriptor.sourceFileClass}`);

  // 7P 설명용 합성 geometry는 line-clear timeline이 복원될 때까지 런타임에서 제외한다.
  const runtimeEligible = source.catalog.filter((setup) => setup.runtimeEligible !== false);
  const directed = applyStructuredPolicyMetrics(runtimeEligible, source.policy);
  if (descriptor.sourceDirection === "horizontal-runtime-mirror") {
    return expandBoxSetups(directed.map(mirrorSetup));
  }

  const mirroredPair = descriptor.firstBagPieces.map(mirrorPiece) as [Piece, Piece];
  const materialized = cycle5PiecePairKey(mirroredPair) === cycle5PiecePairKey(descriptor.firstBagPieces)
    ? expandMirroredSetups(directed)
    : directed;
  return expandBoxSetups(materialized);
}

const classIndex = rawClassIndex as unknown as Cycle5ClassIndex;
const runtimeByPair = new Map<string, SetupVariant[]>();
const labelByPair = new Map<string, string>();

for (const descriptor of Object.values(classIndex.classes)) {
  const key = cycle5PiecePairKey(descriptor.firstBagPieces);
  if (!key || runtimeByPair.has(key)) throw new Error(`잘못되거나 중복된 5회차 class pair: ${key}`);
  runtimeByPair.set(key, materializeClass(descriptor));
  labelByPair.set(key, formatPieceSetForDisplay(descriptor.firstBagPieces, "/"));
}

if (runtimeByPair.size !== 21) {
  throw new Error(`정상 5회차 서로 다른 첫 두 미노 class는 21개여야 합니다: ${runtimeByPair.size}`);
}

export const cycle5SourceCatalog = Object.values(sources).flatMap(({ catalog }) => catalog);
export const cycle5RuntimeCatalog = [...runtimeByPair.values()].flat();

export function setupsForCycle5Class(classPieces: readonly Piece[]): SetupVariant[] {
  return runtimeByPair.get(cycle5PiecePairKey(classPieces)) ?? [];
}

export function cycle5ClassLabel(classPieces: readonly Piece[]): string | undefined {
  return labelByPair.get(cycle5PiecePairKey(classPieces));
}
