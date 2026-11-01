import type { Background, PatternId } from "../types";

export interface PatternDef {
  id: PatternId;
  name: string;
}

export const PATTERNS: PatternDef[] = [
  { id: "plain", name: "纯色" },
  { id: "grid", name: "方格纸" },
  { id: "dot", name: "点阵纸" },
  { id: "line", name: "横线纸" },
  { id: "kraft", name: "牛皮纸" },
  { id: "check", name: "小格子" },
  { id: "flower", name: "碎花" },
  { id: "stripe", name: "斜条纹" },
];

export const BG_COLORS = [
  "#fff6e9", "#fffdf6", "#fdf3e3", "#fdeef2", "#eef7f1",
  "#f3f0fb", "#eaf4fa", "#fdf0e6", "#f5f0e6", "#3d3428",
];

export const DEFAULT_BACKGROUND: Background = {
  color: "#fff6e9",
  pattern: "plain",
  patternColor: "#e3c9a8",
  patternScale: 44,
  vignette: true,
};

export const PATTERN_CANVASES = PATTERNS.map((pattern) => ({
  id: pattern.id,
  name: pattern.id === "plain" ? "奶油素纸" : pattern.name,
  background: {
    ...DEFAULT_BACKGROUND,
    color: pattern.id === "kraft" ? "#e8d5b5" : DEFAULT_BACKGROUND.color,
    pattern: pattern.id,
    texture: undefined,
    vignette: false,
  } satisfies Background,
}));

function gridPattern(color: string, s: number) {
  return `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`;
}

export function backgroundStyle(bg: Background): React.CSSProperties {
  const s = Math.max(10, Math.round(bg.patternScale));
  const c = bg.patternColor;
  const base: React.CSSProperties = { backgroundColor: bg.color };
  if (bg.texture) return { ...base, backgroundImage: `url("${bg.texture}")`, backgroundSize: "100% 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat" };

  switch (bg.pattern) {
    case "grid":
      return { ...base, backgroundImage: gridPattern(c, s), backgroundSize: `${s}px ${s}px` };
    case "dot":
      return {
        ...base,
        backgroundImage: `radial-gradient(${c} 1.6px, transparent 1.7px)`,
        backgroundSize: `${s}px ${s}px`,
      };
    case "line":
      return {
        ...base,
        backgroundImage: `repeating-linear-gradient(transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`,
      };
    case "kraft":
      return {
        ...base,
        backgroundColor: bg.color === "#fff6e9" ? "#e8d5b5" : bg.color,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E")`,
      };
    case "check":
      return {
        ...base,
        backgroundImage: `linear-gradient(45deg, ${c}33 25%, transparent 25%, transparent 75%, ${c}33 75%), linear-gradient(45deg, ${c}33 25%, transparent 25%, transparent 75%, ${c}33 75%)`,
        backgroundSize: `${s * 2}px ${s * 2}px`,
        backgroundPosition: `0 0, ${s}px ${s}px`,
      };
    case "flower":
      return {
        ...base,
        backgroundImage:
          `radial-gradient(circle at 50% 50%, ${c} 1.5px, transparent 2px),` +
          `radial-gradient(circle at 0% 0%, ${c} 1.2px, transparent 1.6px),` +
          `radial-gradient(circle at 100% 100%, ${c} 1.2px, transparent 1.6px)`,
        backgroundSize: `${s * 2}px ${s * 2}px`,
      };
    case "stripe":
      return {
        ...base,
        backgroundImage: `repeating-linear-gradient(45deg, ${c}40 0 ${Math.round(s / 2)}px, transparent ${Math.round(s / 2)}px ${s}px)`,
      };
    default:
      return base;
  }
}

export const VIGNETTE_STYLE: React.CSSProperties = {
  background:
    "radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(61,52,40,0.13) 100%)",
};
