import { useId, type CSSProperties } from "react";
import type { PhotoItem } from "../types";
import { getFramePalette } from "../data/frames";
import { cropPathData } from "../lib/photoCrop";

export function PhotoFrame({ item }: { item: PhotoItem }) {
  const clipId = `photo-crop-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  if (item.cropPath && item.cropPath.length >= 3) {
    const aspect = item.aspectRatio || item.w / item.h;
    return <svg xmlns="http://www.w3.org/2000/svg" className="photo-free-crop" width="100%" height="100%" viewBox={`0 0 ${aspect} 1`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><clipPath id={clipId}><path d={cropPathData(item.cropPath, aspect)} fillRule="evenodd" clipRule="evenodd" /></clipPath></defs>
      <image href={item.src} width={aspect} height="1" preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
    </svg>;
  }
  const palette = getFramePalette(item.frame, item.frameTone);
  const padding = (vertical: number, horizontal = vertical) => `${item.h * vertical}px ${item.w * horizontal}px`;
  const image: CSSProperties = { width: "100%", height: "100%", backgroundImage: `url("${item.src}")`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" };
  const style = { "--frame-base": palette.base, "--frame-accent": palette.accent, "--frame-detail": palette.detail } as CSSProperties;
  const paper: CSSProperties = { width: "100%", height: "100%", background: "#faf8f0", boxShadow: "inset 0 0 0 1px #796e5720" };
  const photo = (outer: CSSProperties = {}, inner: CSSProperties = {}) => <div style={{ ...paper, ...outer }}><div style={{ width: "100%", height: "100%", overflow: "hidden", ...inner }}><div className="photo-frame-image" style={image} /></div></div>;
  let content;
  switch (item.frame) {
    case "plain": content = <div className="photo-frame-image" style={image} />; break;
    case "rounded": content = photo({ padding: padding(.055), borderRadius: Math.min(item.w, item.h) * .045 }); break;
    case "circle":
    case "arch": content = photo({ borderRadius: item.frame === "circle" ? "50%" : "50% 50% 3% 3%", overflow: "hidden" }, { borderRadius: item.frame === "circle" ? "50%" : "50% 50% 3% 3%", background: "#faf8f0", display: "grid", placeItems: "center" }); break;
    case "shadow": content = photo({ padding: padding(.04), borderRadius: 2, boxShadow: "0 3px 12px #4945321a, 0 1px 2px #4945320d" }); break;
    case "polaroid": content = <div className="photo-frame-polaroid" style={{ ...paper, padding: `${item.h * .045}px ${item.w * .045}px 0`, display: "flex", flexDirection: "column", boxShadow: "0 3px 10px #4d453414" }}><div style={{ flex: 1, minHeight: 0 }}><div className="photo-frame-image" style={image} /></div><div aria-hidden="true" style={{ height: "17%", flexShrink: 0 }} /></div>; break;
    case "tape": {
      const tapeWidth = Math.min(item.w * .32, item.h * .55);
      content = <div style={{ ...paper, position: "relative", padding: `${item.h * .14}px ${item.w * .05}px ${item.h * .06}px` }}>
        <div className="photo-frame-image" style={image} />
        <div className={`photo-frame-tape photo-frame-texture--${palette.pattern}`} style={{ left: "3%", top: "1.5%", width: tapeWidth, height: item.h * .08, transform: "rotate(-7deg)" }} />
        <div className={`photo-frame-tape photo-frame-texture--${palette.pattern}`} style={{ right: "3%", top: "1.5%", width: tapeWidth, height: item.h * .08, transform: "rotate(7deg)" }} />
      </div>; break;
    }
    case "washi": content = <div className={`photo-frame-washi photo-frame-texture--${palette.pattern}`} style={{ width: "100%", height: "100%", padding: padding(.075, .065), borderRadius: Math.min(item.w, item.h) * .012 }}>
      <div style={{ width: "100%", height: "100%", padding: Math.min(item.w, item.h) * .012, background: "#faf8f0", boxShadow: "0 0 0 1px #6d73551a" }}><div className="photo-frame-image" style={image} /></div>
    </div>; break;
    case "film": content = <div className="photo-frame-film" style={{ width: "100%", height: "100%", position: "relative", padding: padding(.14, .075), borderRadius: 2 }}>
      <div className="photo-frame-holes photo-frame-holes--top">{Array.from({ length: 8 }, (_, index) => <span key={index} style={{ height: item.h * .045, borderRadius: Math.min(item.w, item.h) * .006 }} />)}</div>
      <div className="photo-frame-image" style={image} />
      <div className="photo-frame-holes photo-frame-holes--bottom">{Array.from({ length: 8 }, (_, index) => <span key={index} style={{ height: item.h * .045, borderRadius: Math.min(item.w, item.h) * .006 }} />)}</div>
    </div>; break;
    default: content = <div style={{ width: "100%", height: "100%", position: "relative" }}><div className={`frame-${item.frame} photo-frame-shaped-paper`} style={{ position: "absolute", inset: 0, padding: 0 }} /><div className="photo-frame-image" style={{ ...image, position: "absolute", top: "7%", left: "7%", width: "86%", height: "86%" }} /></div>;
  }
  return <div className={`photo-frame photo-frame--${item.frame}`} data-frame-tone={palette.id} style={{ width: "100%", height: "100%", ...style }}>{content}</div>;
}
