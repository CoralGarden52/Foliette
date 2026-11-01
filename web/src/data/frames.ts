import type { FrameId, FrameTone } from "../types";

export interface FrameDef {
  id: FrameId;
  name: string;
  /** 缩略图示意用的简单描述 */
  desc: string;
}

export const FRAMES: FrameDef[] = [
  { id: "plain", name: "无框", desc: "干净利落" },
  { id: "rounded", name: "圆角", desc: "暖白细边" },
  { id: "polaroid", name: "拍立得", desc: "经典留白" },
  { id: "shadow", name: "投影卡", desc: "轻盈纸卡" },
  { id: "tape", name: "胶带角", desc: "低饱和和纸贴角" },
  { id: "washi", name: "和纸胶带", desc: "细格纹与纸张肌理" },
  { id: "film", name: "胶片", desc: "复古片基与奶油齿孔" },
  { id: "circle", name: "圆形", desc: "圆圆一枚" },
  { id: "arch", name: "拱门", desc: "复古门窗" },
  { id: "scallop", name: "花边", desc: "波浪边" },
  { id: "torn", name: "撕纸", desc: "手工毛边" },
  { id: "stamp", name: "邮票", desc: "齿孔边框" },
];

export const FRAME_MAP: Record<string, FrameDef> = Object.fromEntries(FRAMES.map((f) => [f.id, f]));

export const TAPE_COLORS = ["pink", "mint", "butter", "lilac", "sky", "kraft"];

export interface FramePalette {
  id: FrameTone;
  name: string;
  base: string;
  accent: string;
  detail: string;
  pattern: "grid" | "stripe" | "linen";
}
const PAPER_PALETTES: FramePalette[] = [
  { id: "sage", name: "鼠尾草绿", base: "#a8b19c", accent: "#e5e9da", detail: "#708164", pattern: "grid" },
  { id: "oat", name: "燕麦米", base: "#cebea2", accent: "#eee5d3", detail: "#a38d6c", pattern: "linen" },
  { id: "blue", name: "雾蓝", base: "#a2b1b9", accent: "#e0e7e9", detail: "#6c8793", pattern: "stripe" },
];
const FILM_PALETTES: FramePalette[] = [
  { id: "charcoal", name: "暖炭黑", base: "#393a34", accent: "#ece6d7", detail: "#9c987e", pattern: "linen" },
  { id: "sepia", name: "复古棕", base: "#675548", accent: "#efe2cf", detail: "#c3a47e", pattern: "linen" },
  { id: "olive", name: "深橄榄绿", base: "#4a5343", accent: "#e6e6d7", detail: "#adb493", pattern: "linen" },
];
export function getFramePalettes(frame: FrameId): readonly FramePalette[] {
  return frame === "film" ? FILM_PALETTES : frame === "washi" || frame === "tape" ? PAPER_PALETTES : [];
}
export function getFramePalette(frame: FrameId, tone?: FrameTone): FramePalette {
  const choices = getFramePalettes(frame);
  return choices.find(choice => choice.id === tone) ?? choices[0] ?? PAPER_PALETTES[0];
}
