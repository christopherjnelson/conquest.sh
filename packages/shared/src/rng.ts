import { randomBytes } from "node:crypto";

/**
 * SFC32 (Small Fast Counting) seeded PRNG.
 * Public domain algorithm by Chris Doty-Humphrey.
 * Returns a function compatible with Math.random (returns [0, 1)).
 *
 * The seed is 16 bytes (four 32-bit words). Using crypto.randomBytes
 * per match gives each game a unique, unpredictable seed so territory
 * distribution and combat rolls are not reproducible by clients.
 */
export function makeSfc32(seed: Uint8Array): () => number {
  if (seed.length < 16) {
    throw new Error("sfc32 requires at least 16 seed bytes");
  }
  const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
  let a = view.getUint32(0, true);
  let b = view.getUint32(4, true);
  let c = view.getUint32(8, true);
  let d = view.getUint32(12, true);

  // Warm up the generator
  for (let i = 0; i < 20; i++) {
    const t = (a + b + d) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    c = (c + t) >>> 0;
    // discard t
    void t;
  }

  return (): number => {
    const t = (a + b + d) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    c = (c + t) >>> 0;
    return t / 0x100000000;
  };
}

/**
 * Generate a fresh random 16-byte seed using crypto.randomBytes.
 */
export function generateRngSeed(): Uint8Array {
  return randomBytes(16);
}

/**
 * Fisher–Yates in-place shuffle driven by the provided PRNG.
 */
export function fisherYatesShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Create a shuffleFn closure that uses the provided PRNG.
 */
export function makeShuffleFn(rng: () => number): <T>(arr: T[]) => T[] {
  return <T>(arr: T[]): T[] => fisherYatesShuffle([...arr], rng);
}
