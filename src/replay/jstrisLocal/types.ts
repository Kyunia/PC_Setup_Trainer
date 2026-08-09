export interface JstrisReplayConfig {
  v?: number;
  seed?: string | number;
  r?: number;
  rnd?: number;
  bbs?: number;
  blocksSel?: number;
  bs?: number;
  softDropId?: number;
  m?: number;
  pmode?: number;
  gameEnd?: number;
  gameStart?: number;
  [key: string]: unknown;
}

export interface JstrisReplayObject {
  c: JstrisReplayConfig;
  d?: string;
  a?: Array<{ t: number; a: number; d?: number[] }>;
  map?: unknown;
  [key: string]: unknown;
}

export enum ActionCode {
  MoveLeft = 0, MoveRight = 1, DasLeft = 2, DasRight = 3,
  RotateLeft = 4, RotateRight = 5, Rotate180 = 6, HardDrop = 7,
  SoftDropBeginEnd = 8, GravityStep = 9, Hold = 10, GarbageAdd = 11,
  SolidGarbageAdd = 12, RedBarSet = 13, ArrMove = 14, Aux = 15,
}
export enum AuxCode { Afk = 0, BlockSet = 1, MoveTo = 2, Randomizer = 3, MatrixMod = 4, WideGarbageAdd = 5 }
export interface ReplayAction { t: number; a: ActionCode; d?: number[]; aux?: AuxCode }


