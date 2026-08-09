import type { Piece } from "../../engine/types";
import type { JstrisReplayConfig } from "./types";
import { Alea } from "./alea";
const STANDARD_PIECES: readonly Piece[] = ["I", "O", "T", "L", "J", "S", "Z"];
export class JstrisSevenBag {
  private bag: Piece[] = []; private readonly rng: Alea;
  constructor(seed: string | number) { this.rng = new Alea(seed); }
  next(): Piece { if (!this.bag.length) this.refill(); const piece = this.bag.shift(); if (!piece) throw new Error("Jstris 7-bag unexpectedly empty."); return piece; }
  private refill(): void {
    const remaining = [...STANDARD_PIECES]; this.bag = [];
    while (remaining.length) { const index = Math.floor(this.rng.next() * remaining.length); const [piece] = remaining.splice(index, 1); if (!piece) throw new Error("Invalid Jstris 7-bag index."); this.bag.push(piece); }
  }
}
export function createJstrisRandomizer(config: JstrisReplayConfig): JstrisSevenBag {
  const blockSet = Number(config.blocksSel ?? config.bbs ?? 0); const randomizer = Number(config.rnd ?? config.r ?? 0);
  if (blockSet !== 0) throw new Error(`Only the standard Jstris tetromino block set is supported; got ${blockSet}.`);
  if (randomizer !== 0) throw new Error(`Only Jstris seeded 7-bag is supported; got randomizer ${randomizer}.`);
  if (config.seed === undefined || config.seed === null) throw new Error("Jstris replay has no deterministic seed.");
  return new JstrisSevenBag(config.seed);
}


