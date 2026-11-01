import { useId } from "react";
import type { InkItem, JournalPoint, TapeItem } from "../types";
import { rainbowColor, rainbowSegments } from "../lib/rainbowInk";

const pathOf = (points: JournalPoint[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
function tapeOutline(item: TapeItem): string {
  const rect = item.crop ?? { x: 0, y: 0, w: item.sourceW, h: item.sourceH };
  if (item.edge === "straight") return `M${rect.x} ${rect.y}h${rect.w}v${rect.h}h${-rect.w}Z`;
  const depth = Math.min(item.edgeSize, rect.w / 5, rect.h / 5);
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
  const points: JournalPoint[] = [];
  corners.forEach((start, side) => {
    const end = corners[(side + 1) % 4];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    const cycles = Math.max(1, Math.round(length / (depth * 3)));
    const count = Math.min(512, cycles * 12);
    for (let index = 0; index <= count; index += 1) {
      const fraction = index / count;
      const phase = fraction * cycles;
      const depthFactor = item.edge === "zigzag" ? 1 - Math.abs((phase % 1) * 2 - 1) : item.edge === "torn" ? Math.abs(Math.sin((index + side * 71) * 12.9898) * Math.sin(index * 3.43)) : item.edge === "stamp" ? Math.sqrt(Math.max(0, 1 - Math.pow((phase % 1) * 2 - 1, 2))) : (1 - Math.cos(phase * Math.PI * 2)) / 2;
      const inset = index === 0 || index === count ? 0 : depthFactor * depth;
      points.push({ x: start.x + deltaX * fraction - deltaY / length * inset, y: start.y + deltaY * fraction + deltaX / length * inset });
    }
  });
  return `${pathOf(points)}Z`;
}
export function JournalItemView({ item }: { item: TapeItem | InkItem }) {
  const token = useId().replace(/[^a-z0-9_-]/gi, "");
  const prefix = `journal-${token}`;
  if (item.kind === "tape") return (
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox={`0 0 ${item.sourceW} ${item.sourceH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={`${prefix}-cut`}><path d={tapeOutline(item)} /></clipPath>
        <pattern id={`${prefix}-pattern`} width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill={item.color} />
          {item.pattern === "stripe" && <path d="M-7 7L7-7M0 28L28 0M21 35L35 21" stroke={item.accentColor} strokeWidth="7" opacity=".55" />}
          {item.pattern === "grid" && <path d="M0 0H28M0 14H28M0 0V28M14 0V28" stroke={item.accentColor} strokeWidth="2" opacity=".5" />}
          {item.pattern === "dot" && <><circle cx="7" cy="7" r="2.4" fill={item.accentColor} /><circle cx="21" cy="21" r="2.4" fill={item.accentColor} /></>}
          {item.pattern === "flower" && <g fill={item.accentColor} opacity=".85"><ellipse cx="14" cy="10" rx="2.6" ry="4" /><ellipse cx="14" cy="18" rx="2.6" ry="4" /><ellipse cx="10" cy="14" rx="4" ry="2.6" /><ellipse cx="18" cy="14" rx="4" ry="2.6" /><circle cx="14" cy="14" r="2" fill="#d5b47e" /></g>}
        </pattern>
      </defs>
      <rect width={item.sourceW} height={item.sourceH} fill={`url(#${prefix}-pattern)`} clipPath={`url(#${prefix}-cut)`} />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox={`0 0 ${item.sourceW} ${item.sourceH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><mask id={`${prefix}-erase`} maskUnits="userSpaceOnUse" x="0" y="0" width={item.sourceW} height={item.sourceH} style={{ maskType: "luminance" }}>
        <rect width={item.sourceW} height={item.sourceH} fill="white" />
        {item.erasures.map((erasure, index) => <g key={index} transform={`scale(1 ${erasure.scaleY})`}>
          {erasure.points.length === 1 ? <circle cx={erasure.points[0].x} cy={erasure.points[0].y / erasure.scaleY} r={erasure.size / 2} fill="black" /> : <path d={pathOf(erasure.points.map(point => ({ x: point.x, y: point.y / erasure.scaleY })))} fill="none" stroke="black" strokeWidth={erasure.size} strokeLinecap="round" strokeLinejoin="round" />}
        </g>)}
      </mask></defs>
      <g mask={`url(#${prefix}-erase)`}>
        {item.points.length === 1 ? <circle cx={item.points[0].x} cy={item.points[0].y} r={item.size / 2} fill={item.brush === "rainbow" ? rainbowColor(0) : item.color} /> : item.brush === "rainbow" ? rainbowSegments(item.points).map((segment, index) => <path key={index} d={pathOf([segment.start, segment.end])} fill="none" stroke={segment.color} strokeWidth={item.size} strokeLinecap="round" />) : <path d={pathOf(item.points)} fill="none" stroke={item.color} strokeWidth={item.size} strokeLinecap={item.brush === "highlighter" ? "butt" : "round"} strokeLinejoin="round" />}
      </g>
    </svg>
  );
}
