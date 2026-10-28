/** chart-math — the arithmetic of the over-time chart (axis ticks, label thinning, the path of a rounded column end), kept apart from the markup so it can be tested. */

export interface Axis {
  /** The top of the axis: a round number at or above the data. */
  readonly max: number;
  readonly ticks: ReadonlyArray<number>;
}

const NICE_STEPS: ReadonlyArray<number> = [1, 2, 5];

/** A round step (1, 2, 5 × 10ⁿ) that covers `max` in at most `maxTicks` intervals; an empty chart still gets a 0…1 axis. */
export function niceAxis(max: number, maxTicks = 4): Axis {
  // Counts are whole numbers, so a step never goes below 1.
  const target: number = Math.max(max, 1) / maxTicks;
  const magnitude: number = 10 ** Math.max(0, Math.floor(Math.log10(target)));
  const step: number = (NICE_STEPS.map((factor) => factor * magnitude).find((candidate) => candidate >= target) ?? 10 * magnitude);
  const top: number = Math.max(step, Math.ceil(max / step) * step);
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step) };
}

/** Every `n`th column gets a label so neighbouring labels never touch (`minGap` px between the centres of two labels). */
export function labelStride(count: number, plotWidth: number, minGap: number): number {
  if (count <= 1) return 1;
  const band: number = plotWidth / count;
  return Math.max(1, Math.ceil(minGap / band));
}

/** A column with its top corners rounded by `radius` and a square foot (the baseline), as one path. */
export function roundedTopPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r: number = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}
