export const MIN_CANVAS_SCALE = .001;
export const MAX_CANVAS_SCALE = 3;

export function parseZoomPercent(value: string): number | null {
  const normalized = value.trim().replace(/[%％]$/, "").trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, percent / 100));
}

export function formatZoomPercent(scale: number): string {
  return String(Math.round(scale * 1000) / 10);
}
