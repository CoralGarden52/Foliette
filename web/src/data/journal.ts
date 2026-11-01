import type { BrushKind, JournalSettings, TapeEdge, TapePattern } from "../types";

export const JOURNAL_COLORS = ["#78876c", "#b88d93", "#bda775", "#7c9aa8", "#a394b0", "#d0aa90", "#4f5550", "#fffdf6"];
export const RAINBOW_PALETTE = ["#b88d93", "#ba9b86", "#b6a475", "#8e9c83", "#7c9aa8", "#a394b0", "#b38f9e"];
export const RAINBOW_SWATCH = `linear-gradient(110deg, ${[...RAINBOW_PALETTE, RAINBOW_PALETTE[0]].join(", ")})`;
export const TAPE_PATTERNS: { id: TapePattern; name: string }[] = [
  { id: "solid", name: "纯色" }, { id: "stripe", name: "条纹" }, { id: "grid", name: "格纹" }, { id: "dot", name: "波点" }, { id: "flower", name: "花卉" },
];
export const TAPE_EDGES: { id: TapeEdge; name: string }[] = [
  { id: "straight", name: "直边" }, { id: "wave", name: "波浪边" }, { id: "zigzag", name: "锯齿边" }, { id: "stamp", name: "邮票边" }, { id: "torn", name: "撕纸边" },
];
export const BRUSHES: { id: BrushKind; name: string; size: number; opacity: number }[] = [
  { id: "pen", name: "钢笔", size: 6, opacity: 1 }, { id: "marker", name: "马克笔", size: 18, opacity: .65 }, { id: "highlighter", name: "荧光笔", size: 32, opacity: .3 },
  { id: "rainbow", name: "彩虹笔", size: 8, opacity: 1 },
];
export const DEFAULT_JOURNAL: JournalSettings = { tool: "select", pattern: "stripe", tapeColor: "#78876c", tapeWidth: 54, tapeOpacity: .85, edge: "wave", edgeSize: 6, brush: "pen", color: "#78876c", size: 6, eraserSize: 32 };
