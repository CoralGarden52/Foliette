/**
 * 内置「装饰小物」：图钉、钉子、和纸胶带、回形针……
 * 全部用内联 SVG 绘制，导出图片时不会出现跨域 / 字体问题。
 */
import type { ReactElement } from "react";

export interface DecoDef {
  id: string;
  name: string;
  draw: () => ReactElement;
}

const svg = (children: ReactElement, vb = "0 0 100 100") => (
  <svg viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    {children}
  </svg>
);

export const DECORATIONS: DecoDef[] = [
  {
    id: "pin",
    name: "彩色图钉",
    draw: () =>
      svg(
        <>
          <ellipse cx="50" cy="88" rx="16" ry="5" fill="rgba(61,52,40,0.18)" />
          <rect x="45" y="42" width="10" height="44" rx="4" fill="#b9ab97" />
          <circle cx="50" cy="36" r="26" fill="#f2789f" />
          <circle cx="42" cy="28" r="8" fill="rgba(255,255,255,0.55)" />
          <circle cx="50" cy="36" r="26" fill="none" stroke="rgba(61,52,40,0.25)" strokeWidth="2" />
        </>
      ),
  },
  {
    id: "nail",
    name: "圆头钉子",
    draw: () =>
      svg(
        <>
          <rect x="44" y="34" width="12" height="58" rx="3" fill="#9aa3ad" />
          <rect x="44" y="34" width="5" height="58" fill="rgba(255,255,255,0.35)" />
          <circle cx="50" cy="28" r="22" fill="#c3ccd6" />
          <circle cx="50" cy="28" r="22" fill="none" stroke="#8b949e" strokeWidth="2" />
          <ellipse cx="43" cy="21" rx="7" ry="5" fill="rgba(255,255,255,0.6)" />
          <path d="M50 50 L50 90" stroke="rgba(61,52,40,0.25)" strokeWidth="2" />
        </>
      ),
  },
  {
    id: "tape",
    name: "和纸胶带",
    draw: () =>
      svg(
        <>
          <rect x="2" y="26" width="96" height="48" rx="3" fill="#ffd166" />
          <rect
            x="2" y="26" width="96" height="48" rx="3" fill="none"
            stroke="rgba(61,52,40,0.18)" strokeWidth="2"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={6 + i * 16} y="26" width="8" height="48" fill="rgba(255,255,255,0.45)" />
          ))}
        </>,
      ),
  },
  {
    id: "clip",
    name: "回形针",
    draw: () =>
      svg(
        <path
          d="M30 78 V30 a20 20 0 0 1 40 0 v52 a12 12 0 0 1 -24 0 V34 a6 6 0 0 1 12 0 v44"
          fill="none" stroke="#9aa3ad" strokeWidth="8" strokeLinecap="round"
        />
      ),
  },
  {
    id: "star",
    name: "小星星",
    draw: () =>
      svg(
        <path
          d="M50 8 61 38 94 40 68 59 77 90 50 71 23 90 32 59 6 40 39 38Z"
          fill="#ffd166" stroke="rgba(61,52,40,0.3)" strokeWidth="2.5" strokeLinejoin="round"
        />
      ),
  },
  {
    id: "heart",
    name: "爱心",
    draw: () =>
      svg(
        <path
          d="M50 88C22 68 8 52 8 36a22 22 0 0 1 42-9A22 22 0 0 1 92 36c0 16-14 32-42 52Z"
          fill="#f2789f" stroke="rgba(61,52,40,0.25)" strokeWidth="2.5"
        />
      ),
  },
  {
    id: "sparkle",
    name: "闪光",
    draw: () =>
      svg(
        <>
          <path d="M50 6 58 40 92 50 58 60 50 94 42 60 8 50 42 40Z" fill="#ffe9a8" stroke="rgba(232,163,61,0.5)" strokeWidth="2" />
          <circle cx="78" cy="20" r="5" fill="#ffd166" />
          <circle cx="20" cy="78" r="4" fill="#ffd166" />
        </>
      ),
  },
  {
    id: "flower",
    name: "小雏菊",
    draw: () =>
      svg(
        <>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx="50" cy="24" rx="11" ry="18" fill="#fffdf6" stroke="rgba(61,52,40,0.2)" strokeWidth="2"
              transform={`rotate(${a} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="11" fill="#ffd166" />
        </>
      ),
  },
  {
    id: "leaf",
    name: "叶子",
    draw: () =>
      svg(
        <>
          <path d="M20 84C20 40 46 14 84 14c0 38-26 70-64 70Z" fill="#7fc8a9" />
          <path d="M20 84C40 62 60 40 84 14" stroke="rgba(255,255,255,0.75)" strokeWidth="3" fill="none" />
        </>
      ),
  },
  {
    id: "arrow",
    name: "手绘箭头",
    draw: () =>
      svg(
        <>
          <path d="M10 82C28 60 46 34 82 22" fill="none" stroke="#f2789f" strokeWidth="7" strokeLinecap="round" />
          <path d="M62 14 86 18 80 42" fill="none" stroke="#f2789f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ),
  },
  {
    id: "dash",
    name: "虚线",
    draw: () =>
      svg(
        <path d="M4 50 H96" stroke="#3d3428" strokeWidth="4" strokeDasharray="10 9" strokeLinecap="round" opacity="0.55" />,
        "0 0 100 100"
      ),
  },
  {
    id: "label",
    name: "小标签",
    draw: () =>
      svg(
        <>
          <path d="M8 30a8 8 0 0 1 8-8h58l24 24-24 24H16a8 8 0 0 1-8-8Z" fill="#fffdf6" stroke="rgba(61,52,40,0.28)" strokeWidth="2.5" />
          <circle cx="24" cy="46" r="5" fill="rgba(61,52,40,0.28)" />
        </>
      ),
  },
  {
    id: "cloud",
    name: "云朵",
    draw: () =>
      svg(
        <path
          d="M24 70a16 16 0 0 1 2-32 22 22 0 0 1 42-4 17 17 0 0 1 6 36Z"
          fill="#d8edf7" stroke="rgba(61,52,40,0.22)" strokeWidth="2.5"
        />
      ),
  },
  {
    id: "bow",
    name: "蝴蝶结",
    draw: () =>
      svg(
        <>
          <path d="M50 50 12 30v40Z" fill="#f2789f" />
          <path d="M50 50 88 30v40Z" fill="#f2789f" />
          <path d="M50 50 12 30v40Z" fill="none" stroke="rgba(61,52,40,0.2)" strokeWidth="2" />
          <path d="M50 50 88 30v40Z" fill="none" stroke="rgba(61,52,40,0.2)" strokeWidth="2" />
          <circle cx="50" cy="50" r="10" fill="#ffd166" stroke="rgba(61,52,40,0.2)" strokeWidth="2" />
        </>
      ),
  },
  {
    id: "sun",
    name: "小太阳",
    draw: () =>
      svg(
        <>
          <circle cx="50" cy="50" r="22" fill="#ffd166" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="47" y="4" width="6" height="18" rx="3" fill="#ffd166"
              transform={`rotate(${a} 50 50)`} />
          ))}
        </>
      ),
  },
  {
    id: "moon",
    name: "月亮",
    draw: () =>
      svg(
        <path
          d="M62 10a40 40 0 1 0 28 62A34 34 0 0 1 62 10Z"
          fill="#ffe9a8" stroke="rgba(232,163,61,0.45)" strokeWidth="2.5"
        />
      ),
  },
];

export const DECO_MAP: Record<string, DecoDef> = Object.fromEntries(DECORATIONS.map((d) => [d.id, d]));