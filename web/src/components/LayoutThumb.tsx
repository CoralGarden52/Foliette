import { useId } from "react";
import { DESIGN_W, getLayout } from "../data/layouts";

const PHOTOS = ["/assets/demo/alpine-lake.jpg", "/assets/demo/forest-light.jpg", "/assets/demo/slow-coast.jpg", "/assets/demo/morning-coffee.jpg"];

export function LayoutThumb({ layoutId, ratio, count = 4 }: { layoutId: string; ratio: { w: number; h: number }; count?: number }) {
  const identifier = useId().replaceAll(":", "");
  const height = DESIGN_W * ratio.h / ratio.w;
  const layout = getLayout(layoutId);
  const slots = getLayout(layoutId === "random" ? "scatter" : layoutId).build(count, height);
  return (
    <svg viewBox={String("0 0 ") + DESIGN_W + " " + height} preserveAspectRatio="xMidYMid meet" className="h-full w-full" aria-hidden="true">
      <rect width={DESIGN_W} height={height} fill="#f4f0e6" />
      {slots.map((slot, index) => {
        const padding = layout.frame === "plain" ? 0 : slot.w * .04;
        const bottom = layout.frame === "polaroid" ? slot.h * .17 : padding;
        const clip = identifier + "-" + index;
        return (
          <g key={index} transform={"rotate(" + slot.rot + " " + (slot.x + slot.w / 2) + " " + (slot.y + slot.h / 2) + ")"}>
            <defs><clipPath id={clip}><rect x={slot.x + padding} y={slot.y + padding} width={Math.max(1, slot.w - padding * 2)} height={Math.max(1, slot.h - padding - bottom)} /></clipPath></defs>
            <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx="1" fill={layout.frame === "film" ? "#302f29" : "#fffdf8"} />
            <image href={PHOTOS[index % PHOTOS.length]} x={slot.x + padding} y={slot.y + padding} width={Math.max(1, slot.w - padding * 2)} height={Math.max(1, slot.h - padding - bottom)} preserveAspectRatio="xMidYMid slice" clipPath={"url(#" + clip + ")"} />
          </g>
        );
      })}
    </svg>
  );
}
