export class Alea {
  private s0: number; private s1: number; private s2: number; private c = 1;
  constructor(...seeds: Array<string | number>) {
    const mash = createMash(); this.s0 = mash(" "); this.s1 = mash(" "); this.s2 = mash(" ");
    for (const seed of seeds.length ? seeds : [Date.now()]) {
      const text = String(seed); this.s0 -= mash(text); if (this.s0 < 0) this.s0 += 1;
      this.s1 -= mash(text); if (this.s1 < 0) this.s1 += 1; this.s2 -= mash(text); if (this.s2 < 0) this.s2 += 1;
    }
  }
  next(): number { const t = 2_091_639 * this.s0 + this.c * 2.3283064365386963e-10; this.s0 = this.s1; this.s1 = this.s2; this.c = t | 0; this.s2 = t - this.c; return this.s2; }
}
function createMash(): (data: string) => number {
  let n = 0xefc8249d;
  return (data: string): number => {
    for (let i = 0; i < data.length; i += 1) { n += data.charCodeAt(i); let h = 0.02519603282416938 * n; n = h >>> 0; h -= n; h *= n; n = h >>> 0; h -= n; n += h * 0x100000000; }
    return (n >>> 0) * 2.3283064365386963e-10;
  };
}


