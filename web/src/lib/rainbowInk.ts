import type { JournalPoint } from "../types";
import { RAINBOW_PALETTE } from "../data/journal";

const palette = RAINBOW_PALETTE.map(color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)));

export function rainbowColor(distance: number) {
  const position = ((distance % 240 + 240) % 240) / 240 * palette.length;
  const index = Math.floor(position);
  const fraction = position - index;
  const start = palette[index];
  const end = palette[(index + 1) % palette.length];
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * fraction));
  return `rgb(${channels.join(" ")})`;
}

// Color follows distance travelled, so curves and loops keep changing color.
export function rainbowSegments(points: JournalPoint[]) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const step = Math.max(4, lengths.reduce((sum, length) => sum + length, 0) / 4096);
  const segments: { start: JournalPoint; end: JournalPoint; color: string }[] = [];
  let distance = 0;
  lengths.forEach((length, index) => {
    const start = points[index];
    const end = points[index + 1];
    const count = Math.ceil(length / step);
    const at = (fraction: number) => ({ x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction });
    for (let sample = 0; sample < count; sample++) {
      segments.push({ start: at(sample / count), end: at((sample + 1) / count), color: rainbowColor(distance + length * (sample + .5) / count) });
    }
    distance += length;
  });
  return segments;
}
