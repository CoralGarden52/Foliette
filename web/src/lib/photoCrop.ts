import type { JournalPoint } from "../types";

export const MAX_CROP_POINTS = 1024;
const MIN_CROP_AREA = .0001;

export function photoCropPoint(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, aspect: number, clamp = false): JournalPoint | null {
  if (!(box.width > 0 && box.height > 0 && Number.isFinite(aspect) && aspect > 0)) return null;
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  const x = (clientX - box.left - (box.width - width) / 2) / width;
  const y = (clientY - box.top - (box.height - height) / 2) / height;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

function area(points: JournalPoint[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function simplify(points: JournalPoint[], tolerance: number): JournalPoint[] {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  let furthest = 0;
  let distance = tolerance;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const fraction = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy) / (dx * dx + dy * dy || 1)));
    const nextDistance = Math.hypot(point.x - first.x - fraction * dx, point.y - first.y - fraction * dy);
    if (nextDistance > distance) { distance = nextDistance; furthest = index; }
  }
  return furthest ? [...simplify(points.slice(0, furthest + 1), tolerance).slice(0, -1), ...simplify(points.slice(furthest), tolerance)] : [first, last];
}

export function finishPhotoCrop(points: JournalPoint[]): JournalPoint[] | null {
  if (points.length < 3 || points.length > 4096 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
  const loop = points.map(point => ({ ...point }));
  if (Math.hypot(loop[0].x - loop[loop.length - 1].x, loop[0].y - loop[loop.length - 1].y) < .0015) loop.pop();
  let tolerance = .0015;
  let result = simplify(loop, tolerance);
  while (result.length > MAX_CROP_POINTS) { tolerance *= 2; result = simplify(loop, tolerance); }
  return result.length >= 3 && area(result) > MIN_CROP_AREA ? result : null;
}

export function cropPathData(points: JournalPoint[], aspect = 1, closed = true): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x * aspect} ${point.y}`).join(" ") + (closed && points.length >= 3 ? "Z" : "");
}
