import type { InkItem, Item, JournalPoint, JournalSettings, TapeItem } from "../types";

export const MAX_INK_POINTS = 2048;
export const MAX_ERASURE_POINTS = 4096;
export function toItemPoint(point: JournalPoint, item: TapeItem | InkItem): JournalPoint {
  const radians = -item.rot * Math.PI / 180;
  const offsetX = point.x - item.x - item.w / 2;
  const offsetY = point.y - item.y - item.h / 2;
  return { x: (offsetX * Math.cos(radians) - offsetY * Math.sin(radians) + item.w / 2) * item.sourceW / item.w, y: (offsetX * Math.sin(radians) + offsetY * Math.cos(radians) + item.h / 2) * item.sourceH / item.h };
}
export function fromItemPoint(point: JournalPoint, item: TapeItem | InkItem): JournalPoint {
  const radians = item.rot * Math.PI / 180;
  const offsetX = point.x * item.w / item.sourceW - item.w / 2;
  const offsetY = point.y * item.h / item.sourceH - item.h / 2;
  return { x: item.x + item.w / 2 + offsetX * Math.cos(radians) - offsetY * Math.sin(radians), y: item.y + item.h / 2 + offsetX * Math.sin(radians) + offsetY * Math.cos(radians) };
}
export function createTape(start: JournalPoint, end: JournalPoint, width: number, style: JournalSettings): Omit<TapeItem, "id" | "z"> | null {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 8) return null;
  return { kind: "tape", x: (start.x + end.x - length) / 2, y: (start.y + end.y - width) / 2, w: length, h: width, sourceW: length, sourceH: width, rot: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI, pattern: style.pattern, color: style.tapeColor, accentColor: "#fffdf6", opacity: style.tapeOpacity, edge: "straight", edgeSize: style.edgeSize };
}
export function createInk(points: JournalPoint[], style: JournalSettings): Omit<InkItem, "id" | "z"> {
  const padding = style.size / 2 + 1;
  const left = Math.min(...points.map(point => point.x)) - padding;
  const top = Math.min(...points.map(point => point.y)) - padding;
  const width = Math.max(...points.map(point => point.x)) - left + padding;
  const height = Math.max(...points.map(point => point.y)) - top + padding;
  return { kind: "ink", x: left, y: top, w: width, h: height, sourceW: width, sourceH: height, rot: 0, opacity: style.brush === "marker" ? .65 : style.brush === "highlighter" ? .3 : 1, brush: style.brush, color: style.color, size: style.size, points: points.map(point => ({ x: point.x - left, y: point.y - top })), erasures: [] };
}
export function segmentDistance(point: JournalPoint, start: JournalPoint, end: JournalPoint): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const fraction = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / (deltaX * deltaX + deltaY * deltaY || 1)));
  return Math.hypot(point.x - start.x - fraction * deltaX, point.y - start.y - fraction * deltaY);
}
function segmentsTouch(first: JournalPoint, last: JournalPoint, start: JournalPoint, end: JournalPoint, radius: number): boolean {
  const cross = (origin: JournalPoint, point: JournalPoint, target: JournalPoint) => (point.x - origin.x) * (target.y - origin.y) - (point.y - origin.y) * (target.x - origin.x);
  if (cross(first, last, start) * cross(first, last, end) < 0 && cross(start, end, first) * cross(start, end, last) < 0) return true;
  return Math.min(segmentDistance(first, start, end), segmentDistance(last, start, end), segmentDistance(start, first, last), segmentDistance(end, first, last)) <= radius;
}
export function eraseInk(items: Item[], points: JournalPoint[], diameter: number): { items: Item[]; changed: boolean; limited: boolean } {
  let changed = false;
  let limited = false;
  if (!points.length) return { items, changed, limited };
  const eraseBounds = { left: Math.min(...points.map(point => point.x)) - diameter / 2, right: Math.max(...points.map(point => point.x)) + diameter / 2, top: Math.min(...points.map(point => point.y)) - diameter / 2, bottom: Math.max(...points.map(point => point.y)) + diameter / 2 };
  const updated = items.map(item => {
    if (item.kind !== "ink") return item;
    const radius = diameter / 2 + item.size * Math.max(item.w / item.sourceW, item.h / item.sourceH) / 2;
    const angle = item.rot * Math.PI / 180;
    const halfWidth = (Math.abs(item.w * Math.cos(angle)) + Math.abs(item.h * Math.sin(angle))) / 2;
    const halfHeight = (Math.abs(item.w * Math.sin(angle)) + Math.abs(item.h * Math.cos(angle))) / 2;
    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.h / 2;
    if (eraseBounds.right < centerX - halfWidth || eraseBounds.left > centerX + halfWidth || eraseBounds.bottom < centerY - halfHeight || eraseBounds.top > centerY + halfHeight) return item;
    const world = item.points.map(point => fromItemPoint(point, item));
    const hit = world.some((point, index) => points.some((sample, sampleIndex) => segmentsTouch(point, world[Math.max(0, index - 1)], sample, points[Math.max(0, sampleIndex - 1)], radius)));
    if (!hit) return item;
    const remaining = MAX_ERASURE_POINTS - item.erasures.reduce((count, erasure) => count + erasure.points.length, 0);
    if (points.length > remaining) limited = true;
    if (remaining <= 0) return item;
    const trace = { points: points.slice(0, remaining).map(point => toItemPoint(point, item)), size: diameter * item.sourceW / item.w, scaleY: item.sourceH / item.h / (item.sourceW / item.w) };
    const covered = trace.points.every((point, index) => {
      const previous = trace.points[Math.max(0, index - 1)];
      return item.erasures.some(erasure => {
        const margin = erasure.size / 2 - trace.size / 2 * Math.max(1, trace.scaleY / erasure.scaleY);
        if (margin < -.00001) return false;
        const first = { x: point.x, y: point.y / erasure.scaleY };
        const last = { x: previous.x, y: previous.y / erasure.scaleY };
        return erasure.points.some((sample, sampleIndex) => {
          const start = { x: sample.x, y: sample.y / erasure.scaleY };
          const end = { x: erasure.points[Math.max(0, sampleIndex - 1)].x, y: erasure.points[Math.max(0, sampleIndex - 1)].y / erasure.scaleY };
          return segmentDistance(first, start, end) <= margin + .00001 && segmentDistance(last, start, end) <= margin + .00001;
        });
      });
    });
    if (covered) return item;
    changed = true;
    return { ...item, erasures: [...item.erasures, trace] };
  });
  return { items: changed ? updated : items, changed, limited };
}
