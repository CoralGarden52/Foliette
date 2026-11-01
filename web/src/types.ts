export type FrameId =
  | "plain" | "rounded" | "polaroid" | "tape" | "film" | "circle"
  | "arch" | "scallop" | "torn" | "stamp" | "washi" | "shadow";
export type FrameTone = "sage" | "oat" | "blue" | "charcoal" | "sepia" | "olive";

export type TextBg = "none" | "paper" | "tape" | "highlight" | "tag" | "bubble";
export type FontId = "hand" | "brush" | "round" | "sans" | "serif" | "mashan" | "longcang" | "zhimang" | "liujian" | "kuaile";
export type PatternId = "plain" | "grid" | "dot" | "line" | "kraft" | "check" | "flower" | "stripe";

export interface BaseItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  z: number;
}

export interface PhotoItem extends BaseItem {
  kind: "photo";
  src: string;
  aspectRatio?: number;
  frame: FrameId;
  frameTone?: FrameTone;
  cropPath?: JournalPoint[];
  opacity: number;
}

export interface StickerItem extends BaseItem {
  kind: "sticker";
  src?: string;
  shape?: string;
  opacity: number;
  collection?: "preset";
}

export interface TextItem extends BaseItem {
  kind: "text";
  opacity: number;
  text: string;
  font: FontId;
  size: number;
  color: string;
  bg: TextBg;
  align: "left" | "center" | "right";
  weight: number;
  letterSpacing: number;
  noteTemplate?: string;
  noteRows?: number;
}

export interface JournalPoint { x: number; y: number }
export interface JournalRect extends JournalPoint { w: number; h: number }
export type TapePattern = "solid" | "stripe" | "grid" | "dot" | "flower";
export type TapeEdge = "straight" | "wave" | "zigzag" | "stamp" | "torn";
export type BrushKind = "pen" | "marker" | "highlighter" | "rainbow";
export type JournalTool = "select" | "tape" | "edge" | "brush" | "eraser";
export interface TapeItem extends BaseItem {
  kind: "tape";
  opacity: number;
  pattern: TapePattern;
  color: string;
  accentColor: string;
  sourceW: number;
  sourceH: number;
  crop?: JournalRect;
  edge: TapeEdge;
  edgeSize: number;
}
export interface InkErasure { points: JournalPoint[]; size: number; scaleY: number }
export interface InkItem extends BaseItem {
  kind: "ink";
  opacity: number;
  brush: BrushKind;
  color: string;
  size: number;
  sourceW: number;
  sourceH: number;
  points: JournalPoint[];
  erasures: InkErasure[];
}
export interface JournalSettings {
  tool: JournalTool;
  pattern: TapePattern;
  tapeColor: string;
  tapeWidth: number;
  tapeOpacity: number;
  edge: TapeEdge;
  edgeSize: number;
  brush: BrushKind;
  color: string;
  size: number;
  eraserSize: number;
}
export type Item = PhotoItem | StickerItem | TextItem | TapeItem | InkItem;

export interface Background {
  color: string;
  texture?: string;
  pattern: PatternId;
  patternColor: string;
  patternScale: number;
  vignette: boolean;
}

export interface WallDoc {
  version: number;
  stickerSet?: string;
  items: Item[];
  background: Background;
}

export interface WallMeta {
  id: string;
  title: string;
  ratio: { w: number; h: number };
  layoutId: string;
  theme: string;
  cover: string;
  photoCount: number;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Wall extends WallMeta {
  doc: WallDoc;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  createdAt: number;
}

export interface AssetManifest {
  avatars: { name: string; url: string }[];
  stickers: Record<string, { name: string; title?: string; url: string }[]>;
  groups: { key: string; title: string; count: number }[];
  canvases: { name: string; title: string; url: string; preview: string }[];
}
