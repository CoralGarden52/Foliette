import { getFontEmbedCSS, toJpeg, toPng } from "html-to-image";

let embeddedFonts: { key: string; css: Promise<string> } | undefined;

export interface CaptureOptions {
  width: number;
  height: number;
  /** 输出倍率：1 = 设计稿原始像素 */
  pixelRatio: number;
  format: "png" | "jpeg";
  background?: string;
  quality?: number;
}

/**
 * 把画布节点渲染成图片。
 * 画布本身不带 transform（缩放放在外层容器上），所以这里可以直接用
 * width / height + pixelRatio 精确控制输出尺寸。
 */
export async function captureNode(node: HTMLElement, opts: CaptureOptions): Promise<string> {
  await document.fonts.ready;
  const families = new Set([getComputedStyle(node).fontFamily]);
  node.querySelectorAll<HTMLElement>("*").forEach((element) => families.add(getComputedStyle(element).fontFamily));
  const key = [...families].sort().join("|");
  if (embeddedFonts?.key !== key) {
    embeddedFonts = { key, css: getFontEmbedCSS(node, { preferredFontFormat: "woff2" }).catch((error) => {
      if (embeddedFonts?.key === key) embeddedFonts = undefined;
      throw error;
    }) };
  }
  const fontEmbedCSS = await embeddedFonts.css;
  await Promise.all(Array.from(node.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)));
  const pixelRatio = Math.min(opts.pixelRatio, 8192 / Math.max(opts.width, opts.height), Math.sqrt(16_000_000 / (opts.width * opts.height)));
  const fn = opts.format === "png" ? toPng : toJpeg;
  return fn(node, {
    width: opts.width,
    height: opts.height,
    pixelRatio: Math.max(0.001, pixelRatio),
    backgroundColor: opts.background,
    cacheBust: false,
    skipAutoScale: true,
    quality: opts.quality,
    style: { boxShadow: "none", borderRadius: "0" },
    fontEmbedCSS,
    filter: (n) => {
      if (n instanceof HTMLElement) return n.dataset.exportIgnore !== "true";
      return true;
    },
  });
}

export function nextFrame(times = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = times;
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
