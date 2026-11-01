const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? 1600 : 2400;

const photoAspects = new Map<string, Promise<number | undefined>>();

export function loadPhotoAspectRatio(src: string): Promise<number | undefined> {
  let pending = photoAspects.get(src);
  if (!pending) {
    pending = (async () => {
      try {
        const image = new Image();
        image.src = src;
        await image.decode();
        if (image.naturalWidth > 0 && image.naturalHeight > 0) return image.naturalWidth / image.naturalHeight;
      } catch {
        photoAspects.delete(src);
      }
      return undefined;
    })();
    photoAspects.set(src, pending);
  }
  return pending;
}

async function preparePhoto(file: File): Promise<File> {
  const mime = file.type || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" } as Record<string, string>)[file.name.split(".").pop()?.toLowerCase() || ""];
  const isHeic = /image\/hei[cf]|\.hei[cf]$/i.test(mime + file.name);
  if (!SUPPORTED.has(mime) && !isHeic) throw new Error(`「${file.name}」暂不支持，请在手机相册中转为 JPG 或 PNG 后上传`);
  const source = mime === file.type ? file : new File([file], file.name, { type: mime });
  if (mime === "image/gif" && file.size <= MAX_BYTES) return source;
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!isHeic && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_EDGE && file.size <= MAX_BYTES) return source;
    const factor = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器暂时无法处理图片，请稍后重试");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputType = mime === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.9));
    if (!blob || blob.size > MAX_BYTES) throw new Error(`「${file.name}」仍超过 12 MB，请选择小一点的图片`);
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + (outputType === "image/png" ? ".png" : ".jpg"), { type: outputType });
  } catch (error) {
    if (error instanceof DOMException) throw new Error(`无法读取「${file.name}」，请尝试 JPG 或 PNG 图片`);
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePhotos(files: File[]): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) prepared.push(await preparePhoto(file));
  return prepared;
}
