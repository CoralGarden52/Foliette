import type { TextItem } from "../types";
import { FONT_MAP } from "../data/fonts";
import { TEXT_STICKER_MAP } from "../data/textStickers";
import { textStrokeWidth } from "./textWeight";

export function fitTextHeight(item: TextItem): TextItem {
  const note = TEXT_STICKER_MAP[item.noteTemplate || ""];
  if (note) return { ...item, h: item.w * note.height / note.width };
  const padding = { none: [0, 0], paper: [.08, .06], tape: [.07, .04], highlight: [.02, .01], tag: [.08, .03], bubble: [.08, .06] }[item.bg];
  const measure = document.createElement("div");
  Object.assign(measure.style, {
    position: "absolute", visibility: "hidden", pointerEvents: "none", left: "-100000px", top: "0",
    width: `${Math.max(1, item.w * (1 - padding[0] * 2) - 4)}px`, fontFamily: FONT_MAP[item.font]?.family || "sans-serif",
    fontSize: `${item.size}px`, fontWeight: String(item.weight), letterSpacing: `${item.letterSpacing}px`,
    whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.35",
  });
  measure.textContent = item.text || " ";
  document.body.appendChild(measure);
  const measuredHeight = measure.getBoundingClientRect().height;
  const height = Math.ceil(Math.max(item.size * 1.35, measuredHeight) + item.w * padding[1] * 2 + textStrokeWidth(item.weight, item.size) + 6);
  measure.remove();
  return { ...item, h: height };
}
