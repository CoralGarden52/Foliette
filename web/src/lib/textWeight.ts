// Regular-only handwriting fonts need a gradual outline as well as CSS weight.
export function textStrokeWidth(weight: number, size: number): number {
  return Math.max(0, Math.min(500, weight - 400)) / 500 * size * .025;
}
