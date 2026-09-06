export interface NoiseOptions {
  /** Layers of detail; each octave doubles the frequency and halves the weight. */
  octaves: number;
  seed: number;
}

/** Small deterministic PRNG (mulberry32) so the same seed always gives the same texture. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Tileable fractal value noise, one byte per pixel, stretched to use the full 0..255 range.
 * The lattice wraps at the tile edge, so the texture repeats without a seam.
 */
export function noiseTile(size: number, { octaves, seed }: NoiseOptions): Uint8ClampedArray {
  const random = rng(seed);
  const values = new Float64Array(size * size);
  let amplitude = 1;
  let cells = 4;
  for (let o = 0; o < octaves; o++) {
    const lattice = Float64Array.from({ length: cells * cells }, () => random());
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / step;
      const y0 = Math.floor(gy);
      const ty = smooth(gy - y0);
      const y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const x0 = Math.floor(gx);
        const tx = smooth(gx - x0);
        const x1 = (x0 + 1) % cells;
        const top = lattice[y0 * cells + x0]! + (lattice[y0 * cells + x1]! - lattice[y0 * cells + x0]!) * tx;
        const bottom = lattice[y1 * cells + x0]! + (lattice[y1 * cells + x1]! - lattice[y1 * cells + x0]!) * tx;
        const i = y * size + x;
        values[i] = values[i]! + (top + (bottom - top) * ty) * amplitude;
      }
    }
    amplitude /= 2;
    cells = Math.min(cells * 2, size);
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const out = new Uint8ClampedArray(size * size);
  for (let i = 0; i < values.length; i++) out[i] = Math.round(((values[i]! - min) / range) * 255);
  return out;
}
