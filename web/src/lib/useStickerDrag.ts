import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DESIGN_W } from "../data/layouts";

export interface StickerChoice { src?: string; shape?: string }

export function useStickerDrag<Choice extends object = StickerChoice>(stage: RefObject<HTMLDivElement | null>, onPlace: (choice: Choice, position: { x: number; y: number }) => void) {
  const [drag, setDrag] = useState<(Choice & { x: number; y: number }) | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; active: boolean; choice: Choice } | null>(null);
  const suppressedUntil = useRef(0);
  const place = useRef(onPlace);
  place.current = onPlace;

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) > 7) {
        current.active = true;
        setDrag({ ...current.choice, x: current.x, y: current.y });
      }
      if (current.active) {
        event.preventDefault();
        if (preview.current) preview.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%) rotate(-5deg)`;
      }
    };
    const end = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active) {
        suppressedUntil.current = Date.now() + 400;
        const rectangle = stage.current?.getBoundingClientRect();
        const viewport = stage.current?.closest("[data-canvas-viewport]")?.getBoundingClientRect();
        if (rectangle && viewport && event.clientX >= Math.max(rectangle.left, viewport.left) && event.clientX <= Math.min(rectangle.right, viewport.right) && event.clientY >= Math.max(rectangle.top, viewport.top) && event.clientY <= Math.min(rectangle.bottom, viewport.bottom)) {
          const designHeight = stage.current!.offsetHeight;
          place.current(current.choice, { x: (event.clientX - rectangle.left) / rectangle.width * DESIGN_W, y: (event.clientY - rectangle.top) / rectangle.height * designHeight });
        }
      }
      gesture.current = null;
      setDrag(null);
    };
    const cancel = () => { gesture.current = null; setDrag(null); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [stage]);

  const start = useCallback((event: ReactPointerEvent<HTMLButtonElement>, choice: Choice) => {
    if (event.button !== 0 || !event.isPrimary) return;
    if (event.pointerType === "touch") event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, choice };
  }, []);

  const suppressClick = useCallback(() => Date.now() < suppressedUntil.current, []);
  return { drag, preview, start, suppressClick };
}
