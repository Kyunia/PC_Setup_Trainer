export const MAX_SEED_UTF8_BYTES = 200;

export function seedUtf8ByteLength(seed: string): number {
  return new TextEncoder().encode(seed).byteLength;
}

export function seedValidationError(seed: string): string | null {
  return seedUtf8ByteLength(seed) > MAX_SEED_UTF8_BYTES
    ? `Seed must be ${MAX_SEED_UTF8_BYTES} UTF-8 bytes or fewer.`
    : null;
}

export function assertValidSeed(seed: string): void {
  const error = seedValidationError(seed);
  if (error) throw new RangeError(error);
}
