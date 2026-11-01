import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Maximize2, Move, RotateCw } from "lucide-react";
import type { Item, JournalSettings, PhotoItem, StickerItem, TextItem, WallDoc } from "../types";
import { JournalItemView } from "./JournalItemView";
import { PhotoFrame } from "./PhotoFrame";
import { TextStickerView } from "./TextStickerView";
import { useJournalGesture } from "../lib/useJournalGesture";
import { DESIGN_W } from "../data/layouts";
import { DECO_MAP } from "../data/decorations";
import { FONT_MAP } from "../data/fonts";
import { textStrokeWidth } from "../lib/textWeight";
import { TEXT_STICKER_MAP } from "../data/textStickers";
import { backgroundStyle, VIGNETTE_STYLE } from "../data/backgrounds";
import { clamp, cn } from "../lib/utils";

/* ------------------------------ 照片相框 ------------------------------- */

/* ------------------------------- 贴纸 --------------------------------- */
function StickerView({ item }: { item: StickerItem }) {
  if (item.shape) {
    const deco = DECO_MAP[item.shape];
    if (deco) return <>{deco.draw()}</>;
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundImage: item.src ? `url("${item.src}")` : undefined,
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/* ------------------------------- 文字 --------------------------------- */
function TextView({
  item, editing, onChange, onFinishEdit,
}: {
  item: TextItem;
  editing: boolean;
  onChange: (patch: Partial<TextItem>) => void;
  onFinishEdit: () => void;
}) {
  if (item.noteTemplate && TEXT_STICKER_MAP[item.noteTemplate]) return <TextStickerView item={item} editing={editing} onChange={onChange} onFinishEdit={onFinishEdit} />;
  const font = FONT_MAP[item.font] ?? FONT_MAP.hand;
  const strokeWidth = textStrokeWidth(item.weight, item.size);
  const style: CSSProperties = {
    fontFamily: font.family,
    fontSize: item.size,
    color: item.bg === "tag" ? "#fff" : item.color,
    fontWeight: item.weight,
    WebkitTextStrokeWidth: strokeWidth,
    paintOrder: "stroke fill",
    padding: strokeWidth / 2,
    letterSpacing: item.letterSpacing,
    lineHeight: 1.35,
    textAlign: item.align,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        aria-label="画布文字内容"
        maxLength={10000}
        spellCheck={false}
        value={item.text}
        onFocus={(event) => { if (item.text === "点击这里编辑文字" || item.text === "双击这里编辑文字") event.currentTarget.select(); }}
        onKeyDown={(event) => { if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) { event.preventDefault(); event.currentTarget.blur(); } }}
        onChange={(e) => onChange({ text: e.target.value })}
        onBlur={onFinishEdit}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          ...style,
          background: "rgba(255,255,255,0.5)",
          border: "none",
          outline: "2px dashed var(--color-pink)",
          resize: "none",
          height: "100%",
          padding: strokeWidth / 2,
          margin: 0,
        }}
      />
    );
  }

  return <div style={style}>{item.text}</div>;
}

/* ------------------------------ 拖拽状态 ------------------------------ */
type DragState =
  | { mode: "move"; id: string; ox: number; oy: number; sx: number; sy: number; fromTextEdit?: boolean }
  | { mode: "resize"; id: string; ow: number; oh: number; sx: number; sy: number; rot: number; fontSize?: number }
  | { mode: "rotate"; id: string; cx: number; cy: number; start: number; rot0: number };

export interface StageProps {
  doc: WallDoc;
  ratio: { w: number; h: number };
  scale: number;
  selectedId: string | null;
  editingId: string | null;
  stageRef: RefObject<HTMLDivElement | null>;
  interactive?: boolean;
  onZoom?: (scale: number) => void;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<Item>, live?: boolean) => void;
  onCommit: () => void;
  onEditText: (id: string | null) => void;
  journal?: JournalSettings;
  onJournalApply?: (items: Item[], selected: string | null) => void;
  onJournalNotice?: (message: string) => void;
}

const SNAP = 8;

export function Stage({
  doc, ratio, scale, selectedId, editingId, stageRef, interactive = true,
  onSelect, onPatch, onCommit, onEditText, onZoom, journal, onJournalApply, onJournalNotice,
}: StageProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const textPress = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panGesture = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number; itemId?: string }>());
  const pinch = useRef<{ distance: number; scale: number; photo?: PhotoItem } | null>(null);

  const H = (DESIGN_W * ratio.h) / ratio.w;
  const journalActive = interactive && journal && journal.tool !== "select";
  const journalGesture = useJournalGesture({ settings: interactive ? journal : undefined, stageRef, items: doc.items, selectedId, width: DESIGN_W, height: H, onSelect, onApply: onJournalApply ?? (() => {}), onNotice: onJournalNotice ?? (() => {}) });
  const items = journalGesture.preview ?? doc.items;
  const selectedItem = interactive && !journalActive ? items.find((item) => item.id === selectedId) : undefined;

  useEffect(() => { setPan({ x: 0, y: 0 }); }, [ratio.w, ratio.h, scale]);

  const itemById = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const item = itemById(drag.id);
      if (!item) return;

      if (drag.mode === "move") {
        const press = textPress.current;
        if (item.kind === "text" && press?.id === item.id && !press.moved) {
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 6) return;
          press.moved = true;
          if (drag.fromTextEdit) {
            onCommit();
            onEditText(null);
            stageRef.current?.focus({ preventScroll: true });
          }
        }
        if (drag.fromTextEdit) e.preventDefault();
        const dx = (e.clientX - drag.sx) / scale;
        const dy = (e.clientY - drag.sy) / scale;
        let nx = drag.ox + dx;
        let ny = drag.oy + dy;

        const candX = [0, DESIGN_W / 2, DESIGN_W];
        const candY = [0, H / 2, H];
        for (const o of items) {
          if (o.id === item.id) continue;
          candX.push(o.x, o.x + o.w / 2, o.x + o.w);
          candY.push(o.y, o.y + o.h / 2, o.y + o.h);
        }
        const findSnap = (value: number, size: number, candidates: number[]) => {
          let best: { delta: number; line: number } | null = null;
          for (const c of candidates) {
            for (const t of [value, value + size / 2, value + size]) {
              const delta = c - t;
              if (Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))) {
                best = { delta, line: c };
              }
            }
          }
          return best;
        };
        const bx = findSnap(nx, item.w, candX);
        const by = findSnap(ny, item.h, candY);
        if (bx) nx += bx.delta;
        if (by) ny += by.delta;
        setGuides({ x: bx ? [bx.line] : [], y: by ? [by.line] : [] });

        nx = clamp(nx, -item.w * 0.55, DESIGN_W - item.w * 0.45);
        ny = clamp(ny, -item.h * 0.55, H - item.h * 0.45);
        onPatch(item.id, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 }, true);
        return;
      }

      if (drag.mode === "resize") {
        const dx = (e.clientX - drag.sx) / scale;
        const dy = (e.clientY - drag.sy) / scale;
        const angle = drag.rot * Math.PI / 180;
        let w = Math.max(48, drag.ow + dx * Math.cos(angle) + dy * Math.sin(angle));
        let h = Math.max(48, drag.oh - dx * Math.sin(angle) + dy * Math.cos(angle));
        if (item.kind === "photo" || (item.kind === "text" && TEXT_STICKER_MAP[item.noteTemplate || ""]) || e.shiftKey || e.pointerType === "touch") {
          const k = Math.max(w / drag.ow, h / drag.oh);
          w = drag.ow * k;
          h = drag.oh * k;
        }
        const patch: Partial<TextItem> = { w: Math.round(w), h: Math.round(h) };
        if (item.kind === "text") {
          patch.size = Math.max(10, Math.round((drag.fontSize || 38) * (Math.round(h) / drag.oh)));
        }
        onPatch(item.id, patch, true);
        return;
      }

      const ang = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
      let rot = drag.rot0 + ((ang - drag.start) * 180) / Math.PI;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      onPatch(item.id, { rot: Math.round(rot * 10) / 10 }, true);
    };

    const up = () => {
      setDrag(null);
      setGuides({ x: [], y: [] });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, itemById, items, scale, H, onPatch, onCommit, onEditText, stageRef]);

  const startMove = (e: React.PointerEvent, item: Item) => {
    if (e.button !== 0 || !e.isPrimary) return;
    if (editingId === item.id) onEditText(null);
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(item.id);
    onCommit();
    setDrag({ mode: "move", id: item.id, ox: item.x, oy: item.y, sx: e.clientX, sy: e.clientY });
  };

  const startResize = (e: React.PointerEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    onCommit();
    setDrag({ mode: "resize", id: item.id, ow: item.w, oh: item.h, sx: e.clientX, sy: e.clientY, rot: item.rot, fontSize: item.kind === "text" ? item.size : undefined });
  };

  const startRotate = (e: React.PointerEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    onCommit();
    const cx = rect.left + (item.x + item.w / 2) * scale;
    const cy = rect.top + (item.y + item.h / 2) * scale;
    setDrag({
      mode: "rotate",
      id: item.id,
      cx,
      cy,
      start: Math.atan2(e.clientY - cy, e.clientX - cx),
      rot0: item.rot,
    });
  };

  const handleItemPointerDown = (e: React.PointerEvent, item: Item) => {
    textPress.current = item.kind === "text" ? { id: item.id, x: e.clientX, y: e.clientY, moved: false } : null;
    startMove(e, item);
  };

  return (
    <div
      className="relative size-full overflow-hidden touch-none"
      data-canvas-viewport="true"
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "touch") { if (journalActive && (event.target as Element).closest("[data-testid=stage]")) journalGesture.start(event); return; }
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-item-kind=photo]");
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY, itemId: target?.dataset.itemId });
        if (touches.current.size === 2) {
          const [first, second] = [...touches.current.values()];
          const photo = !journalActive && first.itemId && first.itemId === second.itemId ? items.find((item): item is PhotoItem => item.id === first.itemId && item.kind === "photo") : undefined;
          journalGesture.cancel();
          pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), scale, photo };
          if (photo) onSelect(photo.id);
          setDrag(null);
          panGesture.current = null;
          event.stopPropagation();
        }
        else if (journalActive && (event.target as Element).closest("[data-testid=stage]")) journalGesture.start(event);
      }}
      onPointerMoveCapture={(event) => {
        if (!touches.current.has(event.pointerId)) { journalGesture.move(event); return; }
        touches.current.set(event.pointerId, { ...touches.current.get(event.pointerId), x: event.clientX, y: event.clientY });
        if (touches.current.size === 2 && pinch.current) {
          const [first, second] = [...touches.current.values()];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          const factor = distance / Math.max(1, pinch.current.distance);
          const photo = pinch.current.photo;
          if (photo) {
            const bounded = clamp(factor, 48 / Math.min(photo.w, photo.h), 10_000 / Math.max(photo.w, photo.h));
            const width = photo.w * bounded;
            const height = photo.h * bounded;
            onPatch(photo.id, { w: width, h: height, x: photo.x + (photo.w - width) / 2, y: photo.y + (photo.h - height) / 2 }, true);
          } else onZoom?.(pinch.current.scale * factor);
          event.preventDefault();
          event.stopPropagation();
        } else journalGesture.move(event);
      }}
      onPointerUpCapture={(event) => {
        journalGesture.end(event);
        touches.current.delete(event.pointerId);
        if (touches.current.size < 2) pinch.current = null;
      }}
      onPointerDown={(event) => {
        if (journalActive) return;
        if (editingId) onEditText(null);
        onSelect(null);
        if (event.isPrimary && event.button === 0) {
          panGesture.current = { ...pan, startX: event.clientX, startY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        const start = panGesture.current;
        if (start) setPan({ x: start.x + event.clientX - start.startX, y: start.y + event.clientY - start.startY });
      }}
      onPointerUp={() => { panGesture.current = null; }}
      onPointerCancel={(event) => { journalGesture.cancel(); panGesture.current = null; touches.current.delete(event.pointerId); pinch.current = null; }}
      onLostPointerCapture={() => { if (journalGesture.active) journalGesture.cancel(); }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: DESIGN_W,
          height: H,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <div
          ref={stageRef}
          className="stage"
          data-testid="stage"
          tabIndex={interactive ? -1 : undefined}
          style={{
            width: DESIGN_W,
            height: H,
            cursor: journalActive ? journal?.tool === "eraser" ? "cell" : "crosshair" : undefined,
            ...backgroundStyle(doc.background),
          }}
        >
          {interactive && items.every((item) => item.kind === "sticker" && item.collection === "preset") && (
            <div className="stage-empty" data-export-ignore="true">
              <img src="/assets/stickers/elements/element-120.png" alt="" />
              <span className="font-[family-name:var(--font-hand)] text-5xl">好日子，值得贴下来。</span>
              <span className="mt-10 text-lg tracking-[0.3em] text-[var(--color-ink-faint)]">YOUR LITTLE COLLECTION OF LIFE</span>
            </div>
          )}
          {doc.background.vignette && (
            <div className="pointer-events-none absolute inset-0" style={VIGNETTE_STYLE} />
          )}

          {guides.x.map((gx) => (
            <div
              key={`gx${gx}`}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--color-pink)]"
              data-export-ignore="true"
              style={{ left: gx }}
            />
          ))}
          {guides.y.map((gy) => (
            <div
              key={`gy${gy}`}
              className="pointer-events-none absolute left-0 right-0 h-px bg-[var(--color-pink)]"
              data-export-ignore="true"
              style={{ top: gy }}
            />
          ))}

          {items.map((item) => {
            const selected = interactive && selectedId === item.id;
            const common: CSSProperties = {
              position: "absolute",
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
              transform: `rotate(${item.rot}deg)`,
              transformOrigin: "center center",
              zIndex: item.z,
              opacity: item.opacity ?? 1,
            };

            return (
              <div
                key={item.id}
                className={cn("stage-item", selected && "is-selected")}
                data-item-id={item.id}
                data-item-kind={item.kind}
                data-export-ignore={item.id === "journal-preview" ? "true" : undefined}
                style={common}
                onPointerDownCapture={(event) => {
                  if (!interactive || journalActive || item.kind !== "text" || editingId !== item.id || !(event.target instanceof HTMLTextAreaElement) || event.button !== 0 || !event.isPrimary || event.shiftKey) return;
                  textPress.current = { id: item.id, x: event.clientX, y: event.clientY, moved: false };
                  setDrag({ mode: "move", id: item.id, ox: item.x, oy: item.y, sx: event.clientX, sy: event.clientY, fromTextEdit: true });
                }}
                onPointerDown={(e) => interactive && !journalActive && handleItemPointerDown(e, item)}
                onClick={(event) => {
                  const press = textPress.current;
                  if (!interactive || journalActive || item.kind !== "text" || editingId === item.id || press?.id !== item.id || press.moved || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
                  event.stopPropagation();
                  onSelect(item.id);
                  onEditText(item.id);
                }}
              >
                {item.kind === "photo" && <PhotoFrame item={item} />}
                {item.kind === "sticker" && <StickerView item={item} />}
                {(item.kind === "tape" || item.kind === "ink") && <JournalItemView item={item} />}
                {item.kind === "text" && (
                  <div
                    className={cn("text-sticker", item.noteTemplate ? "text-sticker--note" : item.bg !== "none" && `text-sticker--${item.bg}`)}
                    style={item.bg === "tag" ? { background: item.color, color: "#fff" } : undefined}
                  >
                    <TextView
                      item={item}
                      editing={editingId === item.id}
                      onChange={(patch) => onPatch(item.id, patch, true)}
                      onFinishEdit={() => onEditText(null)}
                    />
                  </div>
                )}

              </div>
            );
          })}
          {journalActive && journalGesture.cursor && journal?.tool === "eraser" && <div data-export-ignore="true" className="pointer-events-none absolute rounded-full border border-[#59674e] bg-white/20" style={{ left: journalGesture.cursor.x - journal.eraserSize / 2, top: journalGesture.cursor.y - journal.eraserSize / 2, width: journal.eraserSize, height: journal.eraserSize, borderWidth: 1 / scale, zIndex: 100000 }} />}
        </div>
        {selectedItem && (
          <div data-export-ignore="true" className="pointer-events-none absolute" style={{ left: selectedItem.x, top: selectedItem.y, width: selectedItem.w, height: selectedItem.h, transform: `rotate(${selectedItem.rot}deg)`, zIndex: 100001 }}>
            <div className="selection-outline" style={{ borderWidth: 1.5 / scale }} />
            {selectedItem.kind === "text" && <button className="handle pointer-events-auto" style={{ left: -12 / scale, top: -44 / scale, width: 44 / scale, height: 44 / scale }} onPointerDown={(event) => handleItemPointerDown(event, selectedItem)} title="移动文字" aria-label="移动文字"><Move style={{ width: 16 / scale, height: 16 / scale }} /></button>}
            <button className="handle handle--rotate pointer-events-auto" style={{ left: "50%", top: -44 / scale, width: 32 / scale, height: 32 / scale, marginLeft: -16 / scale }} onPointerDown={(event) => startRotate(event, selectedItem)} title="旋转" aria-label="旋转元素">
              <RotateCw style={{ width: 15 / scale, height: 15 / scale }} />
            </button>
            <button className="handle pointer-events-auto" style={{ right: -16 / scale, bottom: -16 / scale, width: 32 / scale, height: 32 / scale }} onPointerDown={(event) => startResize(event, selectedItem)} title="缩放" aria-label="缩放元素">
              <Maximize2 style={{ width: 15 / scale, height: 15 / scale }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
