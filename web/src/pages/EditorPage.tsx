import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, Download, Maximize, Pencil, Redo2, Save, Scissors, Trash2, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import type { AssetManifest, Background, FontId, FrameId, FrameTone, Item, JournalSettings, JournalTool, PhotoItem, StickerItem, TapeItem, TextItem, Wall, WallDoc } from "../types";
import { DEFAULT_JOURNAL, RAINBOW_SWATCH } from "../data/journal";
import { JOURNAL_TOOLS, type JournalApi } from "../components/JournalToolsPanel";
import { api } from "../api";
import { useAuth } from "../store/user";
import { Button, IconButton, Logo, Modal, Sheet, Spinner, useToast } from "../components/ui";
import { Stage } from "../components/Stage";
import { PhotoCropDialog } from "../components/PhotoCropDialog";
import { ZoomPercentInput } from "../components/ZoomPercentInput";
import { InspectorPanel, TAB_META, ToolPanel, type EditorApi, type TabId } from "../components/panels";
import { DESIGN_W, getLayout } from "../data/layouts";
import { DEFAULT_BACKGROUND } from "../data/backgrounds";
import { captureNode, nextFrame } from "../lib/export";
import { trackExport } from '../lib/analytics';
import { usePageView } from '../lib/usePageView';
import { useMediaQuery } from "../lib/useMediaQuery";
import { clamp, cn, downloadDataUrl, uid } from "../lib/utils";
import { loadPhotoAspectRatio, preparePhotos } from "../lib/photos";
import { MAX_CANVAS_SCALE, MIN_CANVAS_SCALE } from "../lib/zoom";
import { fitTextHeight } from "../lib/text";
import { removeErasedInk } from "../lib/inkVisibility";
import { TEXT_STICKER_MAP, textStickerImage } from "../data/textStickers";
import { useStickerDrag } from "../lib/useStickerDrag";
import { DECO_MAP } from "../data/decorations";
import { loadEditorFont } from "../data/fonts";

const MAX_PHOTOS = 20;
const EMPTY_DOC: WallDoc = { version: 1, items: [], background: DEFAULT_BACKGROUND };
interface EditorSnapshot {
  doc: WallDoc;
  ratio: { w: number; h: number };
  layoutId: string;
  title: string;
}

export default function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 1180px)");

  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [wall, setWall] = useState<Wall | null>(null);
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<WallDoc>(EMPTY_DOC);
  const [ratio, setRatio] = useState({ w: 1, h: 1 });
  const [layoutId, setLayoutId] = useState("grid");
  const [title, setTitle] = useState("未命名照片墙");
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("photo");
  const [journal, setJournal] = useState<JournalSettings>({ ...DEFAULT_JOURNAL });
  const parameterGesture = useRef({ active: false, started: false });
  const [sheet, setSheet] = useState<null | "tools" | "style">(null);
  const [uploading, setUploading] = useState(false);
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [viewScale, setViewScale] = useState<number | null>(null);
  const [fit, setFit] = useState(0.4);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportQuality, setExportQuality] = useState<1 | 2 | 3>(2);
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg">("png");
  const [exportPreview, setExportPreview] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [, setHistoryVersion] = useState(0);

  const past = useRef<EditorSnapshot[]>([]);
  const future = useRef<EditorSnapshot[]>([]);
  const dirtyRef = useRef(false);
  const timer = useRef<number | null>(null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const uploadLock = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  const H = (DESIGN_W * ratio.h) / ratio.w;
  const stateRef = useRef({ doc, ratio, layoutId, title });
  stateRef.current = { doc, ratio, layoutId, title };

  const photoCount = useMemo(() => doc.items.filter((i) => i.kind === "photo").length, [doc.items]);
  const selected = useMemo(() => doc.items.find((i) => i.id === selectedId) ?? null, [doc.items, selectedId]);
  const croppingPhoto = doc.items.find((item): item is PhotoItem => item.id === croppingId && item.kind === "photo");
  const fontKey = useMemo(() => [...new Set(doc.items.filter((item): item is TextItem => item.kind === "text").map((item) => item.font))].sort().join("|"), [doc.items]);
  const maxZ = useCallback(
    () => doc.items.reduce((m, i) => Math.max(m, i.z), 0),
    [doc.items]
  );

  /* ------------------------------ 载入 ------------------------------ */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ wall: w }] = await Promise.all([
          api.getWall(id),
          api.assets().then(setManifest).catch(() => null),
        ]);
        if (!alive) return;
        const loadedItems = await Promise.all((Array.isArray(w.doc?.items) ? w.doc.items : []).map(async (item) => item.kind === "photo" ? { ...item, aspectRatio: item.aspectRatio ?? await loadPhotoAspectRatio(item.src) } : item.kind === "text" && TEXT_STICKER_MAP[item.noteTemplate || ""] ? fitTextHeight(item) : item));
        const nextDoc: WallDoc = {
          version: 1,
          stickerSet: w.doc?.stickerSet,
          items: removeErasedInk(loadedItems),
          background: Object.assign({}, DEFAULT_BACKGROUND, { color: /^#[0-9a-f]{6}$/i.test(w.theme) ? w.theme : DEFAULT_BACKGROUND.color }, w.doc?.background || {}),
        };
        if (!alive) return;
        setWall(w);
        setDoc(nextDoc);
        setRatio(w.ratio);
        setLayoutId(w.layoutId);
        setTitle(w.title);
        setSaveState("saved");
        if (nextDoc.items.length !== loadedItems.length) markDirty();
      } catch (err) {
        toast.push((err as Error).message, "error");
        navigate("/walls", { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------------------------- 保存逻辑 ---------------------------- */
  usePageView('editor', !loading && wall?.id === id);

  const makeCover = useCallback(async () => {
    const node = stageRef.current;
    if (!node) return "";
    setJournal(previous => ({ ...previous, tool: "select" }));
    await nextFrame(2);
    try {
      return await captureNode(node, {
        width: DESIGN_W,
        height: (DESIGN_W * stateRef.current.ratio.h) / stateRef.current.ratio.w,
        pixelRatio: 380 / DESIGN_W,
        format: "jpeg",
        quality: 0.78,
        background: stateRef.current.doc.background.color,
      });
    } catch {
      return "";
    }
  }, []);

  const saveNow = useCallback(
    (withCover: boolean): Promise<boolean> => {
      if (timer.current) window.clearTimeout(timer.current);
      const task = async () => {
        if (!id) return false;
        if (!withCover && savedRevision.current === revision.current) return true;
        setSaveState("saving");
        try {
          let cover: string | undefined;
          let captureRevision = revision.current;
          if (withCover) {
            cover = await makeCover();
            if (revision.current !== captureRevision) cover = undefined;
          }
          captureRevision = revision.current;
          const content = stateRef.current;
          const { wall: savedWall } = await api.saveWall(id, {
            title: content.title.trim() || "未命名照片墙",
            ratio: content.ratio,
            layoutId: content.layoutId,
            theme: content.doc.background.color,
            doc: content.doc,
            ...(cover ? { cover } : {}),
          });
          setWall(savedWall);
          savedRevision.current = captureRevision;
          dirtyRef.current = revision.current !== captureRevision;
          setSaveState(dirtyRef.current ? "dirty" : "saved");
          return true;
        } catch (err) {
          dirtyRef.current = true;
          setSaveState("error");
          toast.push(`保存失败：${(err as Error).message}，请点保存重试`, "error");
          return false;
        }
      };
      const queued = saveQueue.current.then(task, task);
      saveQueue.current = queued;
      return queued;
    },
    [id, makeCover, toast]
  );

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  const markDirty = useCallback(() => {
    revision.current += 1;
    dirtyRef.current = true;
    setSaveState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void saveNowRef.current(false);
    }, 1500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (dirtyRef.current) void saveNowRef.current(false);
    },
    []
  );

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  /* ---------------------------- 历史记录 ---------------------------- */
  const snapshot = useCallback(() => {
    past.current = [...past.current.slice(-59), stateRef.current];
    future.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const restore = useCallback((content: EditorSnapshot) => {
    setDoc(content.doc);
    setRatio(content.ratio);
    setLayoutId(content.layoutId);
    setTitle(content.title);
    setSelectedId(null);
    setEditingId(null);
    markDirty();
  }, [markDirty]);

  const undo = useCallback(() => {
    if (uploadLock.current) return;
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current, stateRef.current];
    restore(prev);
  }, [restore]);

  const redo = useCallback(() => {
    if (uploadLock.current) return;
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, stateRef.current];
    restore(next);
  }, [restore]);

  /* ---------------------------- 元素操作 ---------------------------- */
  const patchItem = useCallback((itemId: string, patch: Partial<Item>, live = false) => {
    if (!live) snapshot();
    setDoc((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, ...patch } as Item;
        return updated.kind === "text" && ["text", "size", "font", "weight", "bg", "letterSpacing", "w", "noteRows", "noteTemplate"].some((key) => key in patch) ? fitTextHeight(updated) : updated;
      }),
    }));
    markDirty();
  }, [markDirty, snapshot]);

  const updateSelected = useCallback(
    (patch: Partial<Item>) => {
      if (!selectedId) return;
      patchItem(selectedId, patch);
    },
    [selectedId, patchItem]
  );

  useEffect(() => {
    if (loading || !fontKey) return;
    let cancelled = false;
    void Promise.all(fontKey.split("|").map((font) => loadEditorFont(font as FontId))).then(() => {
      if (cancelled) return;
      const current = stateRef.current.doc;
      const items = current.items.map((item) => {
        if (item.kind !== "text") return item;
        const fitted = fitTextHeight(item);
        return fitted.h > item.h ? fitted : item;
      });
      if (!items.some((item, index) => item.h !== current.items[index].h)) return;
      setDoc({ ...current, items });
      markDirty();
    }).catch((error: Error) => { if (!cancelled) toast.push(error.message, "error"); });
    return () => { cancelled = true; };
  }, [fontKey, loading, markDirty, toast]);

  const applyFrameToAll = useCallback((frame: FrameId, frameTone?: FrameTone) => {
    snapshot();
    setDoc((previous) => ({ ...previous, items: previous.items.map((item) => item.kind === "photo" ? { ...item, frame, frameTone } : item) }));
    markDirty();
    toast.push("所有照片已使用同款相框", "success");
  }, [snapshot, markDirty, toast]);

  const removeItem = useCallback(
    (itemId: string) => {
      snapshot();
      setDoc((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
      if (selectedId === itemId) setSelectedId(null);
      markDirty();
    },
    [markDirty, selectedId, snapshot]
  );

  const duplicateItem = useCallback(
    (itemId: string) => {
      const src = doc.items.find((i) => i.id === itemId);
      if (!src) return;
      if (doc.items.length >= 500) { toast.push("画布元素已达上限", "error"); return; }
      if (src.kind === "photo" && uploadLock.current) {
        toast.push("照片上传完成后就能继续复制了");
        return;
      }
      if (src.kind === "photo" && photoCount >= MAX_PHOTOS) {
        toast.push(`一个照片墙最多 ${MAX_PHOTOS} 张照片`, "error");
        return;
      }
      snapshot();
      const copy = {
        ...structuredClone(src),
        id: uid("c_"),
        x: src.x + 28,
        y: src.y + 28,
        z: maxZ() + 1,
      } as Item;
      setDoc((prev) => ({ ...prev, items: [...prev.items, copy] }));
      setSelectedId(copy.id);
      markDirty();
    },
    [doc.items, markDirty, maxZ, photoCount, toast, snapshot]
  );

  const reorder = useCallback(
    (itemId: string, dir: "front" | "back" | "up" | "down") => {
      snapshot();
      setDoc((prev) => {
        const sorted = [...prev.items].sort((a, b) => a.z - b.z);
        const idx = sorted.findIndex((i) => i.id === itemId);
        if (idx < 0) return prev;
        const item = sorted[idx];
        if (dir === "front") {
          return {
            ...prev,
            items: prev.items.map((i) => (i.id === itemId ? { ...i, z: prev.items.reduce((m, x) => Math.max(m, x.z), 0) + 1 } : i)),
          };
        }
        if (dir === "back") {
          const min = prev.items.reduce((m, x) => Math.min(m, x.z), 0);
          return { ...prev, items: prev.items.map((i) => (i.id === itemId ? { ...i, z: min - 1 } : i)) };
        }
        const target = dir === "up" ? sorted[idx + 1] : sorted[idx - 1];
        if (!target) return prev;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === itemId ? { ...i, z: target.z } : i.id === target.id ? { ...i, z: item.z } : i
          ),
        };
      });
      markDirty();
    },
    [markDirty, snapshot]
  );

  const addText = useCallback(
    (preset?: string, position?: { x: number; y: number }, templateId?: string) => {
      if (stateRef.current.doc.items.length >= 500) { toast.push("画布元素已达上限", "error"); return; }
      snapshot();
      const template = TEXT_STICKER_MAP[templateId || ""];
      const text = template ? "" : preset ?? "点击这里编辑文字";
      const size = template ? 24 : preset ? 34 : 38;
      const w = template ? template.caption ? 180 : 320 : clamp(70 + text.length * size * 0.62, 180, 640);
      const h = Math.round(size * 2.6);
      const item: TextItem = {
        kind: "text",
        opacity: 1,
        id: uid("t_"),
        text,
        font: "hand",
        size,
        color: template?.ink || "#3d3428",
        bg: template ? "none" : preset ? "none" : "paper",
        align: template ? "left" : "center",
        weight: 400,
        letterSpacing: 0,
        x: Math.round((DESIGN_W - w) / 2),
        y: Math.round((H - h) / 2),
        w,
        h: template ? w * template.height / template.width : h,
        rot: Math.random() * 6 - 3,
        z: maxZ() + 1,
        ...(template ? { noteTemplate: template.id, ...(template.list ? { noteRows: 3 } : {}) } : {}),
      };
      const fitted = fitTextHeight(item);
      fitted.x = Math.round(clamp((position?.x ?? DESIGN_W / 2) - fitted.w / 2, 0, DESIGN_W - fitted.w));
      fitted.y = Math.round(clamp((position?.y ?? H / 2) - fitted.h / 2, 0, Math.max(0, H - fitted.h)));
      setDoc((prev) => ({ ...prev, items: [...prev.items, fitted] }));
      setSelectedId(item.id);
      setEditingId(template || !preset ? item.id : null);
      setSheet(null);
      markDirty();
    },
    [H, markDirty, maxZ, snapshot, toast]
  );

  const addSticker = useCallback(
    (opts: { src?: string; shape?: string; x?: number; y?: number }) => {
      if (stateRef.current.doc.items.length >= 500) { toast.push("画布元素已达上限", "error"); return; }
      snapshot();
      const size = 140;
      const item: StickerItem = {
        kind: "sticker",
        id: uid("s_"),
        src: opts.src,
        shape: opts.shape,
        opacity: 1,
        w: size,
        h: size,
        x: Math.round((opts.x ?? DESIGN_W / 2) - size / 2),
        y: Math.round((opts.y ?? H / 2) - size / 2),
        rot: Math.random() * 14 - 7,
        z: maxZ() + 1,
      };
      setDoc((prev) => ({ ...prev, items: [...prev.items, item] }));
      setSelectedId(item.id);
      setSheet(null);
      markDirty();

      if (opts.src) {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(160 / img.naturalWidth, 160 / img.naturalHeight, 1);
          const w = Math.max(48, Math.round(img.naturalWidth * k));
          const h = Math.max(48, Math.round(img.naturalHeight * k));
          setDoc((prev) => ({
            ...prev,
            items: prev.items.map((i) =>
              i.id === item.id && i.w === size && i.h === size
                ? { ...(i as StickerItem), w, h, x: i.x + (i.w - w) / 2, y: i.y + (i.h - h) / 2 }
                : i
            ),
          }));
          markDirty();
        };
        img.src = opts.src;
      }
    },
    [H, markDirty, maxZ, snapshot, toast]
  );

  const stickerDrag = useStickerDrag(stageRef, (choice, position) => addSticker({ ...choice, ...position }));
  const textDrag = useStickerDrag<{ text?: string; template?: string }>(stageRef, (choice, position) => addText(choice.text, position, choice.template));
  const chooseText = useCallback((preset?: string) => {
    if (!textDrag.suppressClick()) addText(preset);
  }, [addText, textDrag.suppressClick]);
  const chooseTextSticker = useCallback((template: string) => {
    if (!textDrag.suppressClick() && TEXT_STICKER_MAP[template]) addText(undefined, undefined, template);
  }, [addText, textDrag.suppressClick]);

  const chooseSticker = useCallback((options: { src?: string; shape?: string }) => {
    if (stickerDrag.suppressClick()) return;
    if (selected?.kind === "sticker") {
      patchItem(selected.id, { src: options.src, shape: options.shape });
      setSheet(null);
      toast.push("贴纸换好啦，位置和角度都保留了", "success");
    } else addSticker(options);
  }, [selected, patchItem, addSticker, toast]);

  const applyLayout = useCallback(
    (lid: string) => {
      snapshot();
      setLayoutId(lid);
      setDoc((prev) => {
        const photos = prev.items.filter((i): i is PhotoItem => i.kind === "photo");
        if (!photos.length) return prev;
        const others = prev.items.filter((i) => i.kind !== "photo");
        const slots = getLayout(lid).build(photos.length, (DESIGN_W * stateRef.current.ratio.h) / stateRef.current.ratio.w, photos.map((photo) => photo.aspectRatio ?? photo.w / photo.h));
        const arranged = photos.map((photo, index) => ({ ...photo, ...slots[index] } as Item));
        return { ...prev, items: [...arranged, ...others] };
      });
      markDirty();
    },
    [markDirty, snapshot]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (uploadLock.current) return;
      const images = files.filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name));
      if (!images.length) {
        toast.push("请选择图片文件", "error");
        return;
      }
      const current = stateRef.current.doc.items.filter((i) => i.kind === "photo").length;
      if (stateRef.current.doc.items.length + images.length > 500) { toast.push("画布元素已达上限，请先删除部分元素", "error"); return; }
      if (current + images.length > MAX_PHOTOS) {
        toast.push(`一个照片墙最多 ${MAX_PHOTOS} 张，还能再贴 ${MAX_PHOTOS - current} 张`, "error");
        return;
      }
      uploadLock.current = true;
      setUploading(true);
      try {
        const prepared = await preparePhotos(images);
        if (!await saveNowRef.current(false)) throw new Error("请先保存当前修改，再重试上传");
        const { photos } = await api.uploadPhotos(id, prepared);
        const aspects = await Promise.all(photos.map((photo) => loadPhotoAspectRatio(photo.url)));
        if (stateRef.current.doc.items.length + photos.length > 500) throw new Error("画布元素已达上限，请先删除部分元素");
        if (stateRef.current.doc.items.filter((item) => item.kind === "photo").length + photos.length > MAX_PHOTOS) throw new Error("照片数量已改变，请减少照片后重试");
        snapshot();
        const baseZ = stateRef.current.doc.items.filter((item) => item.kind === "photo").reduce((maximum, item) => Math.max(maximum, item.z), 0);
        const added: PhotoItem[] = photos.map((p, i) => ({
          kind: "photo",
          id: uid("p_"),
          src: p.url,
          aspectRatio: aspects[i],
          frame: getLayout(stateRef.current.layoutId).frame || "polaroid",
          opacity: 1,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          rot: 0,
          z: baseZ + 1 + i,
        }));
        const nextItems = [...stateRef.current.doc.items, ...added];
        const allPhotos = nextItems.filter((i): i is PhotoItem => i.kind === "photo");
        const slots = getLayout(stateRef.current.layoutId).build(
          allPhotos.length,
          (DESIGN_W * stateRef.current.ratio.h) / stateRef.current.ratio.w,
          allPhotos.map((photo) => photo.aspectRatio ?? photo.w / photo.h)
        );
        const arranged = allPhotos.map((p, i) => ({ ...p, ...slots[i] } as Item));
        const others = nextItems.filter((i) => i.kind !== "photo");
        setDoc((prev) => ({ ...prev, items: [...arranged, ...others] }));
        setSheet(null);
        markDirty();
        toast.push(`贴上了 ${photos.length} 张照片`, "success");
      } catch (err) {
        toast.push((err as Error).message, "error");
      } finally {
        uploadLock.current = false;
        setUploading(false);
      }
    },
    [id, markDirty, toast, snapshot]
  );

  const setBackground = useCallback(
    (patch: Partial<Background>) => {
      snapshot();
      setDoc((prev) => ({ ...prev, background: { ...prev.background, ...patch } }));
      markDirty();
    },
    [markDirty, snapshot]
  );

  const setRatioSafe = useCallback(
    (r: { w: number; h: number }) => {
      snapshot();
      const oldHeight = DESIGN_W * stateRef.current.ratio.h / stateRef.current.ratio.w;
      const newHeight = DESIGN_W * r.h / r.w;
      setDoc((previous) => {
        const photos = previous.items.filter((item) => item.kind === "photo");
        const slots = getLayout(stateRef.current.layoutId).build(photos.length, newHeight, photos.map((photo) => photo.aspectRatio ?? photo.w / photo.h));
        let photoIndex = 0;
        const factor = Math.min(DESIGN_W, newHeight) / Math.min(DESIGN_W, oldHeight);
        return { ...previous, items: previous.items.map((item) => {
          if (item.kind === "photo") return { ...item, ...slots[photoIndex++] };
          const width = item.w * factor;
          const height = item.h * factor;
          return {
            ...item,
            x: clamp(item.x + (item.w - width) / 2, 0, DESIGN_W - width),
            y: clamp((item.y + item.h / 2) * newHeight / oldHeight - height / 2, 0, Math.max(0, newHeight - height)),
            w: width, h: height,
            ...(item.kind === "text" ? { size: Math.max(10, item.size * factor) } : {}),
          };
        }) };
      });
      setRatio(r);
      setViewScale(null);
      markDirty();
    },
    [markDirty, snapshot]
  );

  /* ---------------------------- 缩放适配 ---------------------------- */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setFit(Math.max(MIN_CANVAS_SCALE, Math.min((w - 28) / DESIGN_W, (h - 28) / H)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [H, loading, isDesktop]);

  const scale = clamp(viewScale ?? fit, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE);
  const setCanvasScale = useCallback((value: number) => {
    if (Number.isFinite(value)) setViewScale(clamp(value, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE));
  }, []);

  /* ---------------------------- 快捷键 ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [role="textbox"], [role="dialog"][aria-modal="true"]') || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setJournal(previous => ({ ...previous, tool: "select" }));
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow(true);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          removeItem(selectedId);
        }
      } else if (e.key === "Escape") {
        setJournal(previous => ({ ...previous, tool: "select" }));
        setSelectedId(null);
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo, saveNow, removeItem, selectedId]);

  /* ------------------------------ 导出 ------------------------------ */
  const doExport = useCallback(
    async (multiplier: number, format: "png" | "jpeg") => {
      const node = stageRef.current;
      if (!node) return;
      setExporting(true);
      setEditingId(null);
      await nextFrame(3);
      try {
        const dataUrl = await captureNode(node, {
          width: DESIGN_W,
          height: (DESIGN_W * ratio.h) / ratio.w,
          pixelRatio: multiplier,
          format,
          quality: 0.92,
          background: doc.background.color,
        });
        downloadDataUrl(
          dataUrl,
          `${title.trim() || "foliette"}-${ratio.w}x${ratio.h}@${multiplier}x.${format === "png" ? "png" : "jpg"}`
        );
        trackExport(id);
        toast.push("图片已生成，浏览器将开始下载", "success");
        setExportOpen(false);
      } catch (err) {
        toast.push(`导出失败：${(err as Error).message}`, "error");
      } finally {
        setExporting(false);
      }
    },
    [doc.background.color, ratio, selectedId, title, toast, id]
  );

  const openExport = useCallback(async () => {
    setEditingId(null);
    setExportOpen(true);
    setExportPreview("");
    const preview = await makeCover();
    setExportPreview(preview);
  }, [makeCover]);

  const leaveEditor = useCallback(async () => {
    if (leaving || uploading) return;
    setLeaving(true);
    setEditingId(null);
    try {
      let saved = await saveNowRef.current(true);
      while (saved && dirtyRef.current) saved = await saveNowRef.current(true);
      if (saved) navigate("/walls");
    } finally {
      setLeaving(false);
    }
  }, [leaving, uploading, navigate]);

  /* ---------------------------- 面板 API ---------------------------- */
  const activateJournal = useCallback((tool: JournalTool) => {
    setEditingId(null);
    setTab("journal");
    setJournal(previous => ({ ...previous, tool }));
    if (tool === "tape" || tool === "brush" || tool === "eraser") setSelectedId(null);
    setSheet(null);
  }, []);
  const commitJournal = useCallback((items: Item[], selection: string | null) => {
    if (uploadLock.current) return;
    snapshot();
    setDoc(previous => ({ ...previous, items }));
    setSelectedId(selection);
    setEditingId(null);
    markDirty();
  }, [snapshot, markDirty]);
  const applyTape = useCallback((patch: Partial<TapeItem>) => {
    const current = stateRef.current.doc.items.find(item => item.id === selectedId);
    if (current?.kind !== "tape" || !Object.entries(patch).some(([key, value]) => current[key as keyof TapeItem] !== value)) return;
    if (!parameterGesture.current.active || !parameterGesture.current.started) { snapshot(); parameterGesture.current.started = true; }
    setDoc(previous => ({ ...previous, items: previous.items.map(item => item.id === current.id ? { ...item, ...patch } as TapeItem : item) }));
    markDirty();
  }, [selectedId, snapshot, markDirty]);
  const journalApi: JournalApi = useMemo(() => ({
    settings: journal,
    selectedTape: selected?.kind === "tape" ? selected : null,
    setSettings: patch => setJournal(previous => ({ ...previous, ...patch })),
    activate: activateJournal,
    applyTape,
    restoreTape: () => applyTape({ crop: undefined, edge: "straight" }),
    beginParameter: () => { parameterGesture.current = { active: true, started: false }; },
    endParameter: () => { parameterGesture.current = { active: false, started: false }; },
  }), [journal, selected, activateJournal, applyTape]);
  useEffect(() => {
    if (tab !== "journal" || renaming || exportOpen || leaving || croppingId) setJournal(previous => previous.tool === "select" ? previous : { ...previous, tool: "select" });
  }, [tab, renaming, exportOpen, leaving, croppingId]);
  useEffect(() => { setJournal({ ...DEFAULT_JOURNAL }); }, [id]);
  const editorApi: EditorApi = useMemo(
    () => ({
      wallId: id,
      doc,
      ratio,
      layoutId,
      selected,
      photoCount,
      maxPhotos: MAX_PHOTOS,
      uploading,
      manifest,
      journal: journalApi,
      chooseSticker,
      applyFrameToAll,
      startStickerDrag: stickerDrag.start,
      startTextDrag: textDrag.start,
      startStickerReplace: () => {
        setTab("sticker");
        if (!isDesktop) setSheet("tools");
      },
      setRatio: setRatioSafe,
      setLayoutId: (v) => {
        snapshot();
        setLayoutId(v);
        markDirty();
      },
      applyLayout,
      setBackground,
      updateSelected,
      startPhotoCrop: (photoId) => { setEditingId(null); setSelectedId(photoId); setSheet(null); setCroppingId(photoId); },
      addText: chooseText,
      addTextSticker: chooseTextSticker,
      addSticker,
      uploadFiles,
      removeItem,
      duplicateItem,
      reorder,
      select: (itemId) => {
        setSelectedId(itemId);
        if (!isDesktop && itemId) setSheet(null);
      },
    }),
    [
      id, doc, ratio, layoutId, selected, photoCount, uploading, manifest, setRatioSafe, journalApi,
      applyLayout, setBackground, updateSelected, chooseText, chooseTextSticker, addSticker, uploadFiles, removeItem,
      duplicateItem, reorder, markDirty, snapshot, isDesktop, chooseSticker, applyFrameToAll,
    ]
  );

  const saveLabel =
    saveState === "error" ? "保存失败，点击重试" : saveState === "saving" ? "保存中 …" : saveState === "dirty" ? "等待保存" : saveState === "saved" ? "已自动保存" : "";

  const confirmRename = () => {
    const nextTitle = titleDraft.trim().slice(0, 60) || "未命名照片墙";
    if (nextTitle !== title) {
      snapshot();
      setTitle(nextTitle);
      markDirty();
    }
    setRenaming(false);
  };

  const topBar = (
    <header className="editor-header safe-top flex min-h-16 shrink-0 items-center gap-1 border-b border-[rgba(61,52,40,0.12)] bg-[var(--color-paper)]/95 px-2 backdrop-blur-md sm:gap-2 sm:px-4">
      <IconButton onClick={() => void leaveEditor()} disabled={leaving || uploading} title="返回我的照片墙">
        <ArrowLeft size={18} />
      </IconButton>
      <div className="editor-brand hidden xl:block"><Logo size={28} /></div>
      <div className="editor-document">
        <span className="editor-document-kicker">MY PHOTO JOURNAL</span>
        <button type="button" className="editor-document-title" aria-label="重命名照片墙" title="点击修改作品名称" disabled={leaving} onClick={() => { setTitleDraft(title); setRenaming(true); }}>
          <span>{title || "未命名照片墙"}</span><Pencil size={13} strokeWidth={1.3} />
        </button>
      </div>
      <button
        onClick={() => void saveNow(true)}
        className={cn(
          "editor-save-status",
          saveState === "dirty" || saveState === "error" ? "text-[var(--color-pink)]" : "text-[var(--color-ink-soft)]"
        )}
      >
        <span className="editor-save-dot" data-state={saveState} />{saveLabel || "已就绪"}
      </button>
      <div className="editor-history">
      <IconButton onClick={undo} disabled={!past.current.length || uploading} title="撤销 (Ctrl+Z)">
        <Undo2 size={17} />
      </IconButton>
      <IconButton onClick={redo} disabled={!future.current.length || uploading} title="重做 (Ctrl+Shift+Z)">
        <Redo2 size={17} />
      </IconButton>
      </div>
      <Button size="sm" variant="plain" aria-label="保存" title="保存照片墙" onClick={() => void saveNow(true)} disabled={uploading || leaving} className="px-2 sm:px-3">
        <Save size={15} /><span className="hidden sm:inline">保存</span>
      </Button>
      <Button size="sm" variant="primary" onClick={() => void openExport()} disabled={uploading || leaving} title="导出照片墙" className="px-2 sm:px-3">
        <Download size={15} />
        <span className="hidden sm:inline">导出</span>
      </Button>
    </header>
  );

  if (loading || !wall) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4">
        <Spinner className="size-8" />
        <p className="font-[family-name:var(--font-hand)] text-[var(--color-ink-soft)]">正在打开照片墙 …</p>
      </div>
    );
  }

  const stage = (
    <Stage
      doc={doc}
      ratio={ratio}
      scale={scale}
      onZoom={setCanvasScale}
      selectedId={selectedId}
      editingId={editingId}
      stageRef={stageRef}
      journal={sheet || uploading || renaming || exportOpen || leaving || croppingId ? undefined : journal}
      onJournalApply={commitJournal}
      onJournalNotice={message => toast.push(message)}
      onSelect={(itemId) => {
        setSelectedId(itemId);
        if (isDesktop && doc.items.find((item) => item.id === itemId)?.kind === "text") setTab("text");
      }}
      onPatch={patchItem}
      onCommit={snapshot}
      onEditText={setEditingId}
    />
  );

  return (
    <div className="editor-shell flex h-[100dvh] flex-col overflow-hidden" aria-busy={leaving} inert={leaving}>
      {topBar}
      {croppingPhoto && <PhotoCropDialog key={croppingPhoto.id} item={croppingPhoto} onClose={() => setCroppingId(null)} onApply={(cropPath, aspectRatio) => { patchItem(croppingPhoto.id, { cropPath, aspectRatio }); setCroppingId(null); }} />}
      {journal.tool !== "select" && !sheet && <div className="journal-active-bar" data-export-ignore="true"><span className="journal-active-swatch" style={{ background: journal.tool === "brush" ? journal.brush === "rainbow" ? RAINBOW_SWATCH : journal.color : journal.tapeColor }} /><span>{journal.tool === "brush" && journal.brush === "rainbow" ? "彩虹笔" : JOURNAL_TOOLS.find(tool => tool.id === journal.tool)?.name}</span><button onClick={() => activateJournal("select")}>完成</button></div>}
      {stickerDrag.drag && <div ref={stickerDrag.preview} className="sticker-drag-preview" style={{ transform: `translate3d(${stickerDrag.drag.x}px, ${stickerDrag.drag.y}px, 0) translate(-50%, -50%) rotate(-5deg)` }}>{stickerDrag.drag.src ? <img src={stickerDrag.drag.src} alt="" /> : stickerDrag.drag.shape && DECO_MAP[stickerDrag.drag.shape]?.draw()}</div>}
      {textDrag.drag && <div ref={textDrag.preview} className={textDrag.drag.template ? "sticker-drag-preview" : "text-drag-preview"} style={{ transform: `translate3d(${textDrag.drag.x}px, ${textDrag.drag.y}px, 0) translate(-50%, -50%) rotate(-5deg)` }}>{textDrag.drag.template ? <img src={textStickerImage(textDrag.drag.template, "preview")} alt="" /> : <><Pencil size={12} /><span>{textDrag.drag.text || "写下你的文字"}</span></>}</div>}

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <nav className="editor-tool-rail flex w-[4.5rem] shrink-0 flex-col gap-2 border-r border-[rgba(61,52,40,0.1)] bg-[var(--color-paper)] p-2">
            {TAB_META.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn("editor-tool-tab", tab === t.id && "is-active")}
                aria-pressed={tab === t.id}
              >
                <t.icon size={19} />
                {t.label}
              </button>
            ))}
          </nav>

          <aside className="thin-scroll w-[17.5rem] shrink-0 overflow-y-auto border-r border-[rgba(61,52,40,0.12)] bg-[var(--color-paper)]/80 px-4 py-5">
            <p className="eyebrow mb-5">{TAB_META.find((tool) => tool.id === tab)?.label} / MAKE IT YOURS</p>
            <ToolPanel tab={tab} api={editorApi} />
          </aside>

          <main className="editor-workspace relative min-w-0 flex-1" ref={viewportRef}>
            {stage}
            <div className="editor-zoom absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-[rgba(61,52,40,0.18)] bg-[var(--color-paper)]/95 px-1.5 py-1 shadow-sm">
              <IconButton onClick={() => setCanvasScale(scale / 1.2)} title="缩小">
                <ZoomOut size={15} />
              </IconButton>
              <ZoomPercentInput scale={scale} onChange={setCanvasScale} />
              <IconButton onClick={() => setCanvasScale(scale * 1.2)} title="放大">
                <ZoomIn size={15} />
              </IconButton>
              <IconButton onClick={() => setViewScale(null)} title="适应画布">
                <Maximize size={15} />
              </IconButton>
            </div>
            <p className="pointer-events-none absolute right-3 top-3 rounded-full bg-[var(--color-paper)]/85 px-3 py-1 text-[11px] font-bold text-[var(--color-ink-soft)]">
              {photoCount}/{MAX_PHOTOS} 张照片 · {ratio.w}:{ratio.h}
            </p>
          </main>

          <aside className="thin-scroll w-[16.5rem] shrink-0 overflow-y-auto border-l border-[rgba(61,52,40,0.12)] bg-[var(--color-paper)]/80 px-4 py-5">
            <h3 className="mb-3 font-[family-name:var(--font-brush)] text-2xl">元素样式</h3>
            <InspectorPanel api={editorApi} />
          </aside>
        </div>
      ) : (
        <>
          <main className="editor-workspace relative min-h-0 flex-1" ref={viewportRef}>
            {stage}
            <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-[var(--color-paper)]/85 px-2.5 py-1 text-[11px] font-bold text-[var(--color-ink-soft)]">
              {photoCount}/{MAX_PHOTOS} · {ratio.w}:{ratio.h}
            </span>
            <button className={cn("absolute left-3 top-3 text-[11px]", saveState === "error" ? "text-[var(--color-pink)]" : "text-[var(--color-ink-soft)]")} onClick={() => void saveNow(true)}>{saveLabel}</button>
            <div className="absolute bottom-3 right-3 flex items-center rounded-xl border border-[#d5ccba] bg-[var(--color-paper)]/95 p-0.5 shadow-sm">
              <IconButton title="缩小画布" onClick={() => setCanvasScale(scale / 1.25)}><ZoomOut size={16} /></IconButton>
              <ZoomPercentInput scale={scale} onChange={setCanvasScale} />
              <IconButton title="放大画布" onClick={() => setCanvasScale(scale * 1.25)}><ZoomIn size={16} /></IconButton>
              <IconButton title="适应画布" onClick={() => setViewScale(null)}><Maximize size={16} /></IconButton>
            </div>
          </main>

          {selected && (
            <div className="anim-slide-up flex shrink-0 items-center justify-center gap-1.5 overflow-x-auto border-t border-[rgba(61,52,40,0.12)] bg-[var(--color-paper)]/95 px-2 py-2 backdrop-blur">
              <Button size="sm" variant="butter" onClick={() => setSheet("style")}>
                <Pencil size={14} /> {selected.kind === "text" ? "编辑文字" : "样式"}
              </Button>
              {selected.kind === "photo" && <Button size="sm" variant="mint" onClick={() => editorApi.startPhotoCrop(selected.id)}><Scissors size={14} />裁剪</Button>}
              <Button size="sm" variant="ghost" onClick={() => duplicateItem(selected.id)}>
                <Copy size={14} /> 复制
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reorder(selected.id, "front")}>
                置顶
              </Button>
              <Button size="sm" variant="ghost" className="text-[#b73e68]" onClick={() => removeItem(selected.id)}>
                <Trash2 size={14} /> 删除
              </Button>
            </div>
          )}

          <nav className="mobile-editor-nav safe-bottom flex shrink-0 border-t border-[rgba(61,52,40,0.12)] bg-[var(--color-cream)]/95 backdrop-blur-md">
            {TAB_META.map((t) => (
              <button
                key={t.id}
                aria-pressed={tab === t.id}
                onPointerUp={(event) => {
                  if (event.pointerType !== "touch") return;
                  event.preventDefault();
                  requestAnimationFrame(() => {
                    setTab(t.id);
                    setSheet("tools");
                  });
                }}
                onClick={() => {
                  setTab(t.id);
                  setSheet("tools");
                }}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition",
                  tab === t.id ? "text-[var(--color-pink)]" : "text-[var(--color-ink-soft)]"
                )}
              >
                <t.icon size={19} />
                {t.label}
              </button>
            ))}
          </nav>

          <Sheet open={sheet === "tools"} dragging={Boolean(stickerDrag.drag || textDrag.drag)} onClose={() => setSheet(null)} title={TAB_META.find((t) => t.id === tab)?.label}>
            <ToolPanel tab={tab} api={editorApi} />
          </Sheet>

          <Sheet open={sheet === "style"} onClose={() => setSheet(null)} title="元素样式">
            <InspectorPanel api={editorApi} />
          </Sheet>
        </>
      )}

      <Modal open={renaming} onClose={() => setRenaming(false)} title="为这一页命名" footer={<><Button variant="ghost" onClick={() => setRenaming(false)}>取消</Button><Button variant="primary" onClick={confirmRename}>保存名称</Button></>}>
        <div className="rename-title-content"><p>给值得收藏的瞬间，一个特别的名字。</p><label htmlFor="wall-title">作品名称</label><input ref={renameInputRef} id="wall-title" aria-label="照片墙名称" className="field" value={titleDraft} maxLength={60} placeholder="例如：十月，山海有信" onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); confirmRename(); } }} /><span>{titleDraft.length} / 60</span></div>
      </Modal>

      {/* ------------------------------ 导出弹窗 ------------------------------ */}
      <Modal
        open={exportOpen}
        onClose={() => { if (!exporting) setExportOpen(false); }}
        title="导出照片墙"
        footer={
          <>
            <Button variant="ghost" disabled={exporting} onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void doExport(exportQuality, exportFormat)} disabled={exporting}>
              {exporting ? "生成中 …" : `下载 ${exportFormat === "png" ? "PNG" : "JPG"}`}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div
            className="mx-auto w-full max-w-[16rem] overflow-hidden rounded-xl border-2 border-[rgba(61,52,40,0.15)] bg-[var(--color-paper-2)]"
            style={{ aspectRatio: `${ratio.w} / ${ratio.h}` }}
          >
            {exportPreview ? (
              <img src={exportPreview} alt="当前照片墙预览" className="size-full object-contain" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                <Spinner />
              </div>
            )}
          </div>

          <div>
            <p className="export-section-label">导出清晰度</p>
            <div className="export-quality-options" role="radiogroup" aria-label="导出清晰度">
              {[
                { m: 1, label: "标准" },
                { m: 2, label: "高清" },
                { m: 3, label: "超高清" },
              ].map((option) => (
                <button
                  key={option.m}
                  type="button"
                  role="radio"
                  aria-checked={exportQuality === option.m}
                  className="export-quality-option"
                  disabled={exporting}
                  onClick={() => setExportQuality(option.m as 1 | 2 | 3)}
                >
                  <span>{option.label}</span><small>{DESIGN_W * option.m}px 宽</small>
                </button>
              ))}
            </div>
          </div>

          <div><p className="export-section-label">文件格式</p><div className="export-format-options" role="radiogroup" aria-label="文件格式">{([{ value: "png", label: "PNG", hint: "细节清晰" }, { value: "jpeg", label: "JPG", hint: "文件更轻" }] as const).map((option) => <button key={option.value} type="button" role="radio" aria-checked={exportFormat === option.value} disabled={exporting} onClick={() => setExportFormat(option.value)}><span>{option.label}</span><small>{option.hint}</small></button>)}</div></div>
        </div>
      </Modal>
    </div>
  );
}
