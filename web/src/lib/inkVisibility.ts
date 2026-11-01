import type { InkItem, Item, JournalPoint } from "../types";
import { segmentDistance } from "./journalGeometry";

function coveredByErasure(item: InkItem): boolean {
  return item.points.every((point, index) => item.erasures.some(erasure => {
    const margin = erasure.size / 2 - (item.size / 2 + 1) * Math.max(1, 1 / erasure.scaleY);
    if (margin < 0) return false;
    const first = { x: point.x, y: point.y / erasure.scaleY };
    const previous = item.points[Math.max(0, index - 1)];
    const last = { x: previous.x, y: previous.y / erasure.scaleY };
    return erasure.points.some((sample, sampleIndex) => {
      const previousSample = erasure.points[Math.max(0, sampleIndex - 1)];
      const start = { x: sample.x, y: sample.y / erasure.scaleY };
      const end = { x: previousSample.x, y: previousSample.y / erasure.scaleY };
      return segmentDistance(first, start, end) < margin && segmentDistance(last, start, end) < margin;
    });
  }));
}

function drawStroke(context: CanvasRenderingContext2D, points: JournalPoint[], size: number, cap: CanvasLineCap) {
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.lineWidth = size;
    context.lineCap = cap;
    context.lineJoin = "round";
    context.stroke();
  }
}

const visibility = new WeakMap<InkItem, boolean>();

export function hasVisibleInk(item: InkItem): boolean {
  const cached = visibility.get(item);
  if (cached !== undefined) return cached;
  const visible = measureVisibleInk(item);
  visibility.set(item, visible);
  return visible;
}

function measureVisibleInk(item: InkItem): boolean {
  if (!item.erasures.length) return true;
  if (coveredByErasure(item)) return false;
  const width = Math.ceil(item.sourceW);
  const height = Math.ceil(item.sourceH);
  const resolution = width * height <= 1_048_576 && Math.max(width, height) <= 2048 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, 1024) * resolution;
  canvas.height = Math.min(height, 1024) * resolution;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;
  try {
    for (let top = 0; top < height; top += 1024) {
      for (let left = 0; left < width; left += 1024) {
        const tileWidth = Math.min(1024, item.sourceW - left);
        const tileHeight = Math.min(1024, item.sourceH - top);
        const center = { x: left + tileWidth / 2, y: top + tileHeight / 2 };
        const radius = Math.hypot(tileWidth, tileHeight) / 2 + item.size / 2;
        if (!item.points.some((point, index) => segmentDistance(center, point, item.points[Math.max(0, index - 1)]) <= radius)) continue;
        context.resetTransform();
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(resolution, resolution);
        context.translate(-left, -top);
        context.beginPath();
        context.rect(left, top, tileWidth, tileHeight);
        context.clip();
        context.globalCompositeOperation = "source-over";
        drawStroke(context, item.points, item.size, item.brush === "highlighter" ? "butt" : "round");
        context.globalCompositeOperation = "destination-out";
        for (const erasure of item.erasures) {
          context.save();
          context.scale(1, erasure.scaleY);
          drawStroke(context, erasure.points.map(point => ({ x: point.x, y: point.y / erasure.scaleY })), erasure.size, "round");
          context.restore();
        }
        context.restore();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let offset = 3; offset < pixels.length; offset += 4) {
          if (pixels[offset] > 0) return true;
        }
      }
    }
    return false;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function removeErasedInk(items: Item[]): Item[] {
  const remaining = items.filter(item => item.kind !== "ink" || hasVisibleInk(item));
  return remaining.length === items.length ? items : remaining;
}
