import { useId, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { JournalPoint, PhotoItem } from "../types";
import { cropPathData, finishPhotoCrop, photoCropPoint } from "../lib/photoCrop";
import { Button, Modal } from "./ui";

export function PhotoCropDialog({ item, onClose, onApply }: {
  item: PhotoItem;
  onClose: () => void;
  onApply: (path: JournalPoint[] | undefined, aspect: number) => void;
}) {
  const [aspect, setAspect] = useState(item.aspectRatio || item.w / item.h);
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState<JournalPoint[]>(item.cropPath || []);
  const [preview, setPreview] = useState(Boolean(item.cropPath));
  const [error, setError] = useState("");
  const gesture = useRef<{ pointer: number; points: JournalPoint[]; previous: JournalPoint[] } | null>(null);
  const clipId = `crop-preview-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const cancelGesture = () => {
    if (gesture.current) setPoints(gesture.current.previous);
    gesture.current = null;
  };
  const pointOf = (event: PointerEvent<SVGSVGElement>, clamp = false) => photoCropPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), aspect, clamp);
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault();
    const point = pointOf(event, true);
    if (!point) return;
    const last = active.points[active.points.length - 1];
    const box = event.currentTarget.getBoundingClientRect();
    if (Math.hypot((point.x - last.x) * box.width, (point.y - last.y) * box.height) < 1.5) return;
    if (active.points.length < 4096) active.points.push(point);
    else active.points[active.points.length - 1] = point;
    setPoints([...active.points]);
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    move(event);
    const result = finishPhotoCrop(gesture.current.points);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (result) { setPoints(result); setPreview(true); setError(""); }
    else { setPoints([]); setError("请圈出一个完整区域，范围太小无法裁剪"); }
  };

  return <Modal open title="自由裁剪相片" onClose={onClose} width="max-w-4xl" footer={<>
    <Button variant="ghost" onClick={onClose}>取消</Button>
    <Button variant="mint" disabled={!ready} onClick={() => { cancelGesture(); setPoints([]); setPreview(false); setError(""); }}>重新绘制</Button>
    <Button disabled={!ready || !preview} onClick={() => onApply(points, aspect)}>确认裁剪</Button>
  </>}>
    <p className="mb-3 text-sm text-[var(--color-ink-soft)]">{preview ? "圈外区域已变透明，可确认裁剪或重新绘制。" : "用鼠标或单指沿保留区域画一圈，松开后自动闭合。"}</p>
    <div className="photo-crop-workspace">
      <img src={item.src} alt="待裁剪原相片" draggable={false} className="photo-crop-original" style={{ opacity: preview ? 0 : 1 }} onLoad={event => { const image = event.currentTarget; setAspect(image.naturalWidth / image.naturalHeight); setReady(true); }} onError={() => { setReady(false); setError("原相片加载失败，请关闭后重试"); }} />
      <svg className="photo-crop-surface" role="img" aria-label="相片裁剪绘制区域" viewBox={`0 0 ${aspect} 1`} preserveAspectRatio="xMidYMid meet" style={{ cursor: ready && !preview ? "crosshair" : "default" }}
        onPointerDown={event => {
          if (!ready || preview || event.button !== 0) return;
          if (!event.isPrimary) { cancelGesture(); setError("请用单指圈选照片"); return; }
          const point = pointOf(event);
          if (!point) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { pointer: event.pointerId, points: [point], previous: points };
          setPoints([point]); setError("");
        }} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} onDragStart={event => event.preventDefault()}>
        <defs><clipPath id={clipId}><path d={cropPathData(points, aspect)} fillRule="evenodd" clipRule="evenodd" /></clipPath></defs>
        <rect width={aspect} height="1" fill="transparent" />
        {preview && <image href={item.src} width={aspect} height="1" preserveAspectRatio="none" clipPath={`url(#${clipId})`} />}
        {points.length > 0 && <path d={cropPathData(points, aspect, preview)} fill={preview ? "none" : "#78876c22"} fillRule="evenodd" stroke="#596b50" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray={preview ? "5 4" : undefined} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
      </svg>
      {!ready && !error && <span className="photo-crop-loading">正在载入原相片 …</span>}
    </div>
    <div className="mt-3 flex min-h-6 items-center justify-between gap-3">
      <p role="status" className="text-sm text-[var(--color-ink-soft)]">{error || (preview ? "原图会保留，裁剪后可再次调整或恢复。" : "圈内保留，圈外透明。")}</p>
      {item.cropPath && <Button size="sm" variant="ghost" onClick={() => onApply(undefined, aspect)}>恢复原图</Button>}
    </div>
  </Modal>;
}
