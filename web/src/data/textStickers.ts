import templates from "./textStickers.json";
import imported from "./textStickers-imported.json";
import type { TextItem } from "../types";

export interface TextStickerTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  area: { x: number; y: number; w: number; h: number };
  stripY: number;
  stripHeight: number;
  fixedArt: boolean;
  list: "square" | "circle" | null;
  ruled: boolean;
  rows: number;
  growth?: "fixed";
  caption?: boolean;
  ink?: string;
  checkArea?: { x: number; y: number; w: number; h: number };
}

const allTemplates = [...templates, ...imported].map(template => ({ ...template, growth: "fixed" as const })) as TextStickerTemplate[];
export const TEXT_STICKERS = allTemplates.filter(template => template.id !== "note-21");
export const TEXT_STICKER_MAP = Object.assign(Object.create(null) as Record<string, TextStickerTemplate>, Object.fromEntries(allTemplates.map(template => [template.id, template])));
export const textStickerImage = (id: string, variant = "") => `/assets/text-stickers/${id}${variant ? `-${variant}` : ""}.png?v=4`;

export function textStickerLayout(item: TextItem) {
  const template = TEXT_STICKER_MAP[item.noteTemplate || ""];
  const unit = item.w / template.width;
  const top = template.area.y * unit;
  const bottom = (template.height - template.area.y - template.area.h) * unit;
  const lineHeight = Math.max(item.size * 1.6, template.list ? 31 * unit : 0);
  const bodyHeight = template.area.h * unit;
  return { template, unit, top, bottom, left: template.area.x * unit, width: template.area.w * unit, bodyHeight, lineHeight, rows: Math.max(template.rows, item.noteRows || template.rows) };
}

