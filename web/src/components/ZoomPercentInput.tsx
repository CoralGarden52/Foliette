import { useRef, useState } from "react";
import { formatZoomPercent, parseZoomPercent } from "../lib/zoom";

export function ZoomPercentInput({ scale, onChange }: { scale: number; onChange: (scale: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  return (
    <label className="zoom-percent-control">
      <input
        className="zoom-percent-input"
        type="text"
        inputMode="decimal"
        aria-label="画布缩放百分比"
        title="画布缩放百分比"
        autoComplete="off"
        value={draft ?? formatZoomPercent(scale)}
        onFocus={(event) => { cancelled.current = false; setDraft(formatZoomPercent(scale)); event.currentTarget.select(); }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!cancelled.current && draft !== null) {
            const next = parseZoomPercent(draft);
            if (next !== null) onChange(next);
          }
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            cancelled.current = event.key === "Escape";
            event.currentTarget.blur();
          }
        }}
      />
      <span aria-hidden="true">%</span>
    </label>
  );
}
