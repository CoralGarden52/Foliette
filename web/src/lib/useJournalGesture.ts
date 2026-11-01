import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Item, JournalPoint, JournalSettings, TapeItem } from "../types";
import { createInk, createTape, eraseInk, MAX_INK_POINTS, toItemPoint } from "./journalGeometry";
import { uid } from "./utils";
import { removeErasedInk } from "./inkVisibility";

interface Options {
  settings?: JournalSettings;
  stageRef: RefObject<HTMLDivElement | null>;
  items: Item[];
  selectedId: string | null;
  width: number;
  height: number;
  onSelect: (id: string | null) => void;
  onApply: (items: Item[], selected: string | null) => void;
  onNotice: (message: string) => void;
}
interface Gesture { pointer: number; points: JournalPoint[]; settings: JournalSettings }
export function useJournalGesture(options: Options) {
  const current = useRef(options);
  current.current = options;
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<JournalPoint | null>(null);
  const cancel = () => { gesture.current = null; setPreview(null); setCursor(null); };
  useEffect(() => { cancel(); }, [options.settings?.tool]);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); gesture.current = null; };
  }, []);
  const pointOf = (event: ReactPointerEvent): JournalPoint | null => {
    const rect = current.current.stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return { x: Math.max(0, Math.min(current.current.width, (event.clientX - rect.left) / rect.width * current.current.width)), y: Math.max(0, Math.min(current.current.height, (event.clientY - rect.top) / rect.height * current.current.height)) };
  };
  const render = (active: Gesture): Item[] | null => {
    const { items } = current.current;
    const end = active.points[active.points.length - 1];
    const top = items.reduce((maximum, item) => Math.max(maximum, item.z), 0) + 1;
    if (active.settings.tool === "tape") {
      const tape = createTape(active.points[0], end, active.settings.tapeWidth, active.settings);
      return tape ? [...items, { ...tape, id: "journal-preview", z: top }] : null;
    }
    if (active.settings.tool === "brush") return [...items, { ...createInk(active.points, active.settings), id: "journal-preview", z: top }];
    if (active.settings.tool === "eraser") return eraseInk(items, active.points, active.settings.eraserSize).items;
    return null;
  };
  const start = (event: ReactPointerEvent) => {
    const { settings, items, onSelect, onApply, onNotice } = current.current;
    if (!settings || settings.tool === "select" || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointOf(event);
    if (!point) return;
    current.current.stageRef.current?.focus({ preventScroll: true });
    if (settings.tool === "edge") {
      const tape = [...items].sort((first, second) => second.z - first.z).find((item): item is TapeItem => {
        if (item.kind !== "tape") return false;
        const local = toItemPoint(point, item);
        const crop = item.crop ?? { x: 0, y: 0, w: item.sourceW, h: item.sourceH };
        return local.x >= crop.x && local.x <= crop.x + crop.w && local.y >= crop.y && local.y <= crop.y + crop.h;
      });
      if (!tape) { onNotice("请选择胶带"); return; }
      onSelect(tape.id);
      if (tape.edge !== settings.edge || tape.edgeSize !== settings.edgeSize) onApply(items.map(item => item.id === tape.id ? { ...tape, edge: settings.edge, edgeSize: settings.edgeSize } : item), tape.id);
      return;
    } else if ((settings.tool === "tape" || settings.tool === "brush") && items.length >= 500) { onNotice("画布元素已达上限"); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, points: [point], settings: { ...settings } };
    setCursor(point);
    setPreview(render(gesture.current));
  };
  const move = (event: ReactPointerEvent) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointOf(event);
    if (!point) return;
    setCursor(point);
    const last = active.points[active.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < (active.settings.tool === "eraser" ? 4 : 1)) return;
    if (active.settings.tool === "tape") active.points = [active.points[0], point];
    else if (active.points.length < MAX_INK_POINTS) active.points.push(point);
    else { finish(); current.current.onNotice("已达到本次轨迹长度上限"); return; }
    if (active.settings.tool === "eraser" && eraseInk(current.current.items, active.points, active.settings.eraserSize).limited) { finish(); return; }
    setPreview(render(active));
  };
  const finish = () => {
    const active = gesture.current;
    if (!active) return;
    const { items, onApply, onNotice } = current.current;
    const result = render(active);
    if (active.settings.tool === "eraser") {
      const erased = eraseInk(items, active.points, active.settings.eraserSize);
      if (erased.limited) onNotice("部分笔迹已达擦除轨迹上限");
      if (erased.changed) onApply(removeErasedInk(erased.items), null);
    } else if (result) {
      const next = result.map(item => item.id === "journal-preview" ? { ...item, id: uid(item.kind === "tape" ? "t_" : "i_") } : item);
      onApply(next, next[next.length - 1].id);
    }
    cancel();
  };
  const end = (event: ReactPointerEvent) => {
    if (!gesture.current || gesture.current.pointer !== event.pointerId) return;
    move(event);
    finish();
    event.stopPropagation();
  };
  return { start, move, end, cancel, preview, cursor, active: Boolean(gesture.current) };
}
