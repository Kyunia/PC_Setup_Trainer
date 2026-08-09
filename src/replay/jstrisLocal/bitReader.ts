export class BitReader {
  private bitOffset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get position(): number { return this.bitOffset; }
  get remaining(): number { return this.bytes.length * 8 - this.bitOffset; }
  read(bitCount: number): number | null {
    if (!Number.isInteger(bitCount) || bitCount < 0 || bitCount > 31) throw new RangeError(`Invalid bit count: ${bitCount}`);
    if (this.remaining < bitCount) return null;
    let value = 0;
    for (let i = 0; i < bitCount; i += 1) {
      const absolute = this.bitOffset + i; const byte = this.bytes[absolute >>> 3];
      if (byte === undefined) throw new Error("Jstris action bit reader overflow.");
      value = (value << 1) | ((byte >>> (7 - (absolute & 7))) & 1);
    }
    this.bitOffset += bitCount; return value >>> 0;
  }
  required(bitCount: number, label: string): number {
    const value = this.read(bitCount);
    if (value === null) throw new Error(`Unexpected end of Jstris replay stream while reading ${label} at bit ${this.bitOffset}.`);
    return value;
  }
  remainingBitsAreZero(): boolean {
    while (this.remaining > 0) if (this.required(1, "trailing padding") !== 0) return false;
    return true;
  }
}


