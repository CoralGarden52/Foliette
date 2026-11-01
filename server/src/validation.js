import fs from "node:fs";
import { validJournalItem } from "./journalValidation.js";
import { validPhotoCrop } from "./photoCropValidation.js";
import importedTextStickers from "./data/textStickers-imported.json" with { type: "json" };

const TEXT_STICKER_IDS = new Set(Array.from({ length: 35 }, (_, index) => `note-${String(index + 1).padStart(2, "0")}`));
const TEXT_STICKER_LISTS = new Set(["note-11", "note-14"]);
for (const template of importedTextStickers) {
  TEXT_STICKER_IDS.add(template.id);
  if (template.list) TEXT_STICKER_LISTS.add(template.id);
}

export const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export function validImageFile(file) {
  const header = Buffer.alloc(64);
  const descriptor = fs.openSync(file.path, "r");
  let bytesRead;
  try {
    bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (bytesRead < 12) return false;
  switch (file.mimetype) {
    case "image/jpeg": return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case "image/png": return header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/gif": return /^GIF8[79]a$/.test(header.toString("ascii", 0, 6));
    case "image/webp": return header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP";
    case "image/avif": return header.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(header.toString("ascii", 8, bytesRead));
    default: return false;
  }
}

export function validItems(items) {
  if (!Array.isArray(items) || items.length > 500) return false;
  const identifiers = new Set();
  return items.every((item) => {
    if (!item || typeof item.id !== "string" || identifiers.has(item.id)) return false;
    identifiers.add(item.id);
    if (!["photo", "text", "sticker", "tape", "ink"].includes(item.kind)) return false;
    if (!["x", "y", "w", "h", "rot", "z"].every((key) => Number.isFinite(item[key]) && Math.abs(item[key]) <= 100_000)) return false;
    if (item.w <= 0 || item.h <= 0) return false;
    if (item.cropPath !== undefined && (item.kind !== "photo" || !validPhotoCrop(item.cropPath))) return false;
    if ((item.kind === "tape" || item.kind === "ink") && !validJournalItem(item)) return false;
    if (item.opacity !== undefined && (!Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1)) return false;
    if (item.kind === "photo" && item.aspectRatio !== undefined && (!Number.isFinite(item.aspectRatio) || item.aspectRatio <= 0)) return false;
    if (item.kind === "photo" && item.frameTone !== undefined && !["sage", "oat", "blue", "charcoal", "sepia", "olive"].includes(item.frameTone)) return false;
    if (item.kind === "text" && (typeof item.text !== "string" || item.text.length > 10_000 || !Number.isFinite(item.size) || item.size <= 0)) return false;
    if (item.kind === "text" && item.noteTemplate !== undefined && !TEXT_STICKER_IDS.has(item.noteTemplate)) return false;
    if (item.kind === "text" && item.noteRows !== undefined && (!TEXT_STICKER_LISTS.has(item.noteTemplate) || !Number.isInteger(item.noteRows) || item.noteRows < 3 || item.noteRows > 30)) return false;
    if (item.kind === "sticker" && item.src && !/^\/assets\/stickers\/[\w/-]+\.(png|jpe?g|webp|gif|avif|svg)$/i.test(item.src)) return false;
    return true;
  });
}
