import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Copy, Crop, ImagePlus,
  Camera, Grip, Layers, LayoutGrid, Palette, Smile, Sticker as StickerIcon, Trash2, Type, Scissors, Paintbrush, StickyNote,
} from "lucide-react";
import type { AssetManifest, Background, FrameId, FrameTone, Item, PhotoItem, StickerItem, TextItem, WallDoc } from "../types";
import { LAYOUTS, RATIO_PRESETS } from "../data/layouts";
import { FRAMES, getFramePalette, getFramePalettes } from "../data/frames";
import { PhotoFrame } from "./PhotoFrame";
import { FONTS, TEXT_COLORS, TEXT_PRESETS, TEXT_TEMPLATE_GROUPS } from "../data/fonts";
import { backgroundStyle, DEFAULT_BACKGROUND, PATTERN_CANVASES } from "../data/backgrounds";
import { DECORATIONS } from "../data/decorations";
import { TEXT_STICKERS, TEXT_STICKER_MAP, textStickerImage } from "../data/textStickers";
import { LayoutThumb } from "./LayoutThumb";
import { Button, Field, Segmented } from "./ui";
import { cn } from "../lib/utils";
import { JournalToolsPanel, type JournalApi } from "./JournalToolsPanel";

export type TabId = "layout" | "photo" | "sticker" | "text" | "bg" | "layers" | "journal";

export interface EditorApi {
  wallId: string;
  doc: WallDoc;
  ratio: { w: number; h: number };
  layoutId: string;
  selected: Item | null;
  photoCount: number;
  maxPhotos: number;
  uploading: boolean;
  manifest: AssetManifest | null;
  journal: JournalApi;
  chooseSticker: (options: { src?: string; shape?: string }) => void;
  applyFrameToAll: (frame: FrameId, frameTone?: FrameTone) => void;
  startStickerReplace: () => void;
  startStickerDrag: (event: PointerEvent<HTMLButtonElement>, choice: { src?: string; shape?: string }) => void;
  startTextDrag: (event: PointerEvent<HTMLButtonElement>, choice: { text?: string; template?: string }) => void;
  setRatio: (r: { w: number; h: number }) => void;
  setLayoutId: (id: string) => void;
  applyLayout: (id: string) => void;
  setBackground: (patch: Partial<Background>) => void;
  updateSelected: (patch: Partial<Item>) => void;
  startPhotoCrop: (id: string) => void;
  addText: (preset?: string) => void;
  addTextSticker: (template: string) => void;
  addSticker: (opts: { src?: string; shape?: string }) => void;
  uploadFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  select: (id: string | null) => void;
  duplicateItem: (id: string) => void;
  reorder: (id: string, dir: "front" | "back" | "up" | "down") => void;
}

export const TAB_META: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "layout", label: "布局", icon: LayoutGrid },
  { id: "photo", label: "照片", icon: ImagePlus },
  { id: "sticker", label: "贴纸", icon: StickerIcon },
  { id: "text", label: "文字", icon: Type },
  { id: "journal", label: "照片墙工具", icon: Scissors },
  { id: "bg", label: "纸张", icon: Palette },
  { id: "layers", label: "图层", icon: Layers },
];

/* =============================== 布局面板 ============================== */
export function LayoutPanel({ api }: { api: EditorApi }) {
  const [customW, setCustomW] = useState(api.ratio.w);
  const [customH, setCustomH] = useState(api.ratio.h);

  const applyCustom = () => {
    const w = Math.min(50, Math.max(1, Math.round(customW) || 1));
    const h = Math.min(50, Math.max(1, Math.round(customH) || 1));
    setCustomW(w);
    setCustomH(h);
    api.setRatio({ w, h });
  };

  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink-soft)]">
          <Crop size={14} /> 画布比例
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {RATIO_PRESETS.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setCustomW(r.w);
                setCustomH(r.h);
                api.setRatio({ w: r.w, h: r.h });
              }}
              className={cn(
                "rounded-full border-2 px-2.5 py-1 text-[11px] font-bold transition",
                api.ratio.w === r.w && api.ratio.h === r.h
                  ? "border-[var(--color-ink)] bg-[var(--color-butter)]"
                  : "border-transparent bg-white/70 text-[var(--color-ink-soft)] hover:border-[rgba(61,52,40,0.25)]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            className="field w-16 py-1.5 text-center"
            type="number" min={1} max={50} value={customW}
            onChange={(e) => setCustomW(Number(e.target.value))}
            aria-label="比例宽"
          />
          <span className="text-[var(--color-ink-faint)]">:</span>
          <input
            className="field w-16 py-1.5 text-center"
            type="number" min={1} max={50} value={customH}
            onChange={(e) => setCustomH(Number(e.target.value))}
            aria-label="比例高"
          />
          <Button size="sm" variant="butter" onClick={applyCustom}>自定义比例</Button>
        </div>
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink-soft)]">
          <LayoutGrid size={14} /> 排版方式（{LAYOUTS.length} 种）
        </h4>
        <div className="layout-library">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => api.applyLayout(l.id)}
              aria-pressed={api.layoutId === l.id}
              className={cn(
                "layout-card bg-white text-left transition",
                api.layoutId === l.id
                  ? "border-[var(--color-pink)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
                  : "border-[rgba(61,52,40,0.14)] hover:border-[var(--color-ink)]"
              )}
              title={l.tag}
            >
              <div className="layout-preview">
                <LayoutThumb layoutId={l.id} ratio={api.ratio} count={Math.min(Math.max(api.photoCount, 4), 8)} />
              </div>
              <p className="layout-name">{l.name}</p><p className="layout-description">{l.tag.split(" · ")[0]}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* =============================== 照片面板 ============================== */
export function PhotoPanel({ api }: { api: EditorApi }) {
  const photos = api.doc.items.filter((i): i is PhotoItem => i.kind === "photo");
  const remaining = Math.max(0, api.maxPhotos - api.photoCount);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-[rgba(61,52,40,0.25)] bg-white/60 px-4 py-5 text-center">
        <p className="font-[family-name:var(--font-hand)] text-lg">
          {api.photoCount} / {api.maxPhotos} 张照片
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
          {remaining > 0 ? `还可以再贴 ${remaining} 张` : "已经贴满啦，删掉一些再贴新的吧"}
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <label className="btn btn--primary btn--sm cursor-pointer">
            <ImagePlus size={15} /> 从相册选择
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.heic,.heif"
              aria-label="从相册选择照片"
              multiple
              className="hidden"
              disabled={api.uploading || remaining === 0}
              onChange={(e) => {
                if (e.target.files) api.uploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
          <label className="btn btn--sky btn--sm cursor-pointer">
            <Camera size={15} /> 拍照上传
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={api.uploading || remaining === 0}
              onChange={(e) => {
                if (e.target.files) api.uploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {api.uploading && <p className="mt-2 text-xs text-[var(--color-pink)]">正在上传 …</p>}
      </div>

      {photos.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-[var(--color-ink-soft)]">已贴上的照片</h4>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => api.select(p.id)}
                  className="block w-full"
                  title="点击选中"
                >
                  <div
                    className="aspect-square w-full overflow-hidden rounded-lg border-2 border-[rgba(61,52,40,0.14)] bg-[var(--color-paper-2)]"
                    style={{
                      backgroundImage: `url("${p.src}")`,
                      backgroundSize: "contain",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                </button>
                <button
                  onClick={() => api.removeItem(p.id)}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-[var(--color-ink)] bg-[var(--color-pink)] text-white opacity-0 transition group-hover:opacity-100"
                  title="移除"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================== 贴纸面板 ============================== */
function StickerTile({ api, choice, name, children }: { api: EditorApi; choice: { src?: string; shape?: string }; name: string; children: ReactNode }) {
  return <div className="sticker-tile"><button className="sticker-tile-content" title={name} onDragStart={(event) => event.preventDefault()} onPointerDown={(event) => { if (event.pointerType !== "touch") api.startStickerDrag(event, choice); }} onClick={() => api.chooseSticker(choice)}>{children}</button><button className="sticker-drag-grip" aria-label={`拖动贴纸 ${name}`} title="按住拖到画布" onPointerDown={(event) => api.startStickerDrag(event, choice)}><Grip size={13} /></button></div>;
}

export function StickerPanel({ api }: { api: EditorApi }) {
  const [group, setGroup] = useState("text-notes");
  const groups = api.manifest?.groups ?? [];
  const list = api.manifest?.stickers[group] ?? [];

  return (
    <div className="space-y-3">
      {api.selected?.kind === "sticker" && (
        <div className="space-y-2">
          <Button size="sm" variant="ghost" className="w-full" onClick={() => api.select(null)}>添加新贴纸</Button>
        </div>
      )}
      <Segmented
        value={group}
        onChange={setGroup}
        options={[{ value: "text-notes", label: `文字贴纸 ${TEXT_STICKERS.length}` }, ...groups.map((g) => ({ value: g.key, label: `${g.title} ${g.count + (g.key === "elements" ? DECORATIONS.length : 0)}` }))]}
      />

      <div className="grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto pr-1 thin-scroll sm:max-h-none">
        {group === "text-notes" && TEXT_STICKERS.map(template => <div key={template.id} className="sticker-tile"><button className="sticker-tile-content" title={`文字贴纸：${template.name}`} onDragStart={event => event.preventDefault()} onPointerDown={event => { if (event.pointerType !== "touch") api.startTextDrag(event, { template: template.id }); }} onClick={() => api.addTextSticker(template.id)}><img src={textStickerImage(template.id, "preview")} alt={template.name} draggable={false} className="size-full object-contain" loading="lazy" /></button><button className="sticker-drag-grip" aria-label={`拖动文字贴纸 ${template.name}`} title="按住拖到画布" onPointerDown={event => api.startTextDrag(event, { template: template.id })}><Grip size={13} /></button></div>)}
        {list.map((s) => (
          <StickerTile key={s.name} api={api} choice={{ src: s.url }} name={s.title || s.name}>
            <img src={s.url} alt={s.title || s.name} draggable={false} className="size-full object-contain" loading="lazy" />
          </StickerTile>
        ))}
        {group === "elements" && DECORATIONS.map((d) => (
          <StickerTile key={d.id} api={api} choice={{ shape: d.id }} name={d.name}>
            <span className="block size-full">{d.draw()}</span>
          </StickerTile>
        ))}
        {list.length === 0 && group !== "elements" && group !== "text-notes" && (
          <p className="col-span-4 py-8 text-center text-sm text-[var(--color-ink-faint)]">
            贴纸加载中 …
          </p>
        )}
      </div>
    </div>
  );
}

/* =============================== 文字面板 ============================== */
function TextWeightControl({ weight, onChange }: { weight: number; onChange: (weight: number) => void }) {
  const value = Math.max(400, Math.min(900, weight || 400));
  return <div role="group" aria-label="文字粗细">
    <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-soft)]">文字粗细 · {Math.round((value - 400) / 5)}%</p>
    <input aria-label="文字粗细" aria-valuetext={`${Math.round((value - 400) / 5)}%`} type="range" min={400} max={900} step={10} value={value} onChange={event => onChange(Number(event.target.value))} className="w-full accent-[var(--color-pink)]" />
    <div className="flex justify-between text-xs text-[var(--color-ink-faint)]"><span>常规</span><span>更粗</span></div>
  </div>;
}

export function TextPanel({ api }: { api: EditorApi }) {
  const selected = api.selected?.kind === "text" ? (api.selected as TextItem) : null;
  const [templateGroup, setTemplateGroup] = useState(TEXT_TEMPLATE_GROUPS[0].id);
  const activeGroup = TEXT_TEMPLATE_GROUPS.find((group) => group.id === templateGroup) || TEXT_TEMPLATE_GROUPS[0];
  const templateCount = TEXT_TEMPLATE_GROUPS.reduce((count, group) => count + group.templates.length, 0);
  const renderTextSource = (text: string) => (
    <div className="text-preset-source" key={text}>
      <button className="text-preset-content" onPointerDown={(event) => { if (event.pointerType !== "touch") api.startTextDrag(event, { text }); }} onClick={() => api.addText(text)}>{text}</button>
      <button className="text-source-grip" aria-label={`拖动文字 ${text}`} title="按住拖到画布" onPointerDown={(event) => api.startTextDrag(event, { text })}><Grip size={13} /></button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="text-source-main"><Button variant="lilac" className="flex-1" onPointerDown={(event) => { if (event.pointerType !== "touch") api.startTextDrag(event, {}); }} onClick={() => api.addText()}><Type size={16} /> 添加一段文字</Button><button className="text-source-grip" aria-label="拖动空白文字到画布" title="按住拖到画布" onPointerDown={(event) => api.startTextDrag(event, {})}><Grip size={15} /></button></div>

      <section className="symbol-template-section" aria-label="符号文字模板">
        <div className="text-template-heading"><h4>符号文字模板</h4><span>{templateCount} 款</span></div>
        <div className="text-template-categories" role="group" aria-label="文字模板分类">
          {TEXT_TEMPLATE_GROUPS.map((group) => <button key={group.id} aria-pressed={templateGroup === group.id} onClick={() => setTemplateGroup(group.id)}>{group.name}</button>)}
        </div>
        <div className="text-preset-library" role="group" aria-label={`${activeGroup.name}模板`}>
          {activeGroup.templates.map(renderTextSource)}
        </div>
      </section>

      <div>
        <h4 className="mb-2 text-sm font-bold text-[var(--color-ink-soft)]">快捷短语</h4>
        <div className="text-preset-library">
          {TEXT_PRESETS.map(renderTextSource)}
        </div>
      </div>

      {selected && (
        <div className="space-y-4 rounded-2xl bg-white/60 p-3">
          <Field label="文字内容">
            <textarea
              className={cn("field min-h-20 resize-none leading-relaxed", selected.noteTemplate && "overflow-hidden")}
              ref={node => { if (node && selected.noteTemplate) { node.style.height = "auto"; node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`; } }}
              aria-label="文字内容"
              value={selected.text}
              onChange={(e) => api.updateSelected({ text: e.target.value })}
            />
          </Field>

          <TextWeightControl weight={selected.weight} onChange={weight => api.updateSelected({ weight })} />

          <div>
            <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-soft)]">字体</p>
            <div className="font-library">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => api.updateSelected({ font: f.id })}
                  aria-pressed={selected.font === f.id}
                  className="font-option"
                  style={{ fontFamily: selected.font === f.id ? f.family : undefined }}
                  title={f.hint}
                >
                  <span>{f.name}</span><small>{f.hint}</small>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-soft)]">文字颜色</p>
            <div className="flex flex-wrap gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => api.updateSelected({ color: c })}
                  className={cn(
                    "size-7 rounded-full border-2 transition",
                    selected.color === c ? "scale-110 border-[var(--color-ink)]" : "border-[rgba(61,52,40,0.2)]"
                  )}
                  style={{ background: c }}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
          </div>

          {!selected.noteTemplate && <div>
            <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-soft)]">贴纸底</p>
            <Segmented
              value={selected.bg}
              onChange={(v) => api.updateSelected({ bg: v })}
              options={[
                { value: "none", label: "无" },
                { value: "paper", label: "纸片" },
                { value: "tape", label: "胶带" },
                { value: "highlight", label: "荧光笔" },
                { value: "tag", label: "标签" },
                { value: "bubble", label: "对话框" },
              ]}
            />
          </div>}

          <div>
            <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-soft)]">对齐</p>
            <Segmented
              value={selected.align}
              onChange={(v) => api.updateSelected({ align: v })}
              options={[
                { value: "left", label: <AlignLeft size={14} /> },
                { value: "center", label: <AlignCenter size={14} /> },
                { value: "right", label: <AlignRight size={14} /> },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================== 背景面板 ============================== */
export function BackgroundPanel({ api }: { api: EditorApi }) {
  const bg = api.doc.background;
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between"><h4 className="panel-section-title">照片墙画布</h4><span className="text-[10px] text-[var(--color-ink-faint)]">{(api.manifest?.canvases.length || 0) + PATTERN_CANVASES.length + 1} 款画布</span></div>
        <div className="canvas-library">
          <button aria-label="画布：纯白画布" aria-pressed={!bg.texture && bg.color === "#ffffff" && bg.pattern === "plain" && !bg.vignette} onClick={() => api.setBackground({ ...DEFAULT_BACKGROUND, color: "#ffffff", pattern: "plain", texture: undefined, vignette: false })} className={cn("canvas-swatch", !bg.texture && bg.color === "#ffffff" && bg.pattern === "plain" && !bg.vignette && "is-active")}><span className="pure-white-preview" /><span>纯白画布</span></button>
          {(api.manifest?.canvases || []).map((canvas) => (
            <button key={canvas.name} aria-label={`画布：${canvas.title}`} aria-pressed={bg.texture === canvas.url} onClick={() => api.setBackground({ texture: canvas.url, pattern: "plain", vignette: false })} className={cn("canvas-swatch", bg.texture === canvas.url && "is-active")}>
              <img src={canvas.preview} alt="" loading="lazy" /><span>{canvas.title}</span>
            </button>
          ))}
          {PATTERN_CANVASES.map((canvas) => {
            const active = !bg.texture && bg.pattern === canvas.id && bg.color === canvas.background.color && (canvas.id === "plain" || (bg.patternColor === canvas.background.patternColor && bg.patternScale === canvas.background.patternScale));
            return (
              <button key={canvas.id} aria-label={`画布：${canvas.name}`} aria-pressed={active} onClick={() => api.setBackground(canvas.background)} className={cn("canvas-swatch", active && "is-active")}>
                <div className="canvas-pattern-preview" aria-hidden="true" style={backgroundStyle({ ...canvas.background, patternScale: 12 })} />
                <span>{canvas.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink-soft)]">
        <input
          type="checkbox"
          checked={bg.vignette}
          onChange={(e) => api.setBackground({ vignette: e.target.checked })}
          className="size-4 accent-[var(--color-pink)]"
        />
        四角暗角
      </label>
    </div>
  );
}

/* ============================= 元素检查器 ============================= */
export function InspectorPanel({ api }: { api: EditorApi }) {
  const item = api.selected;
  if (!item) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--color-ink-faint)]">
        <Smile size={30} />
        <p className="text-sm">未选中元素</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {item.kind === "photo" && <section className="space-y-2"><Button variant="mint" className="w-full" onClick={() => api.startPhotoCrop(item.id)}><Scissors size={15} />{item.cropPath ? "重新裁剪相片" : "自由裁剪相片"}</Button>{item.cropPath && <><Button variant="ghost" className="w-full" onClick={() => api.updateSelected({ cropPath: undefined })}>恢复原图</Button><p className="text-xs text-[var(--color-ink-faint)]">已保留圈内相片，恢复原图后可继续使用相框。</p></>}</section>}
      {item.kind === "text" && item.noteTemplate && <section className="space-y-3"><h4 className="panel-section-title">{TEXT_STICKER_MAP[item.noteTemplate]?.name || "文字贴纸"}</h4><Field label="贴纸文字"><textarea aria-label="文字贴纸内容" className="field min-h-24 resize-none overflow-hidden leading-relaxed" ref={node => { if (node) { node.style.height = "auto"; node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`; } }} maxLength={10000} value={item.text} onChange={event => api.updateSelected({ text: event.target.value })} /></Field></section>}
      {/* 通用：位置尺寸 */}
      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <input
              type="number" className="field py-1.5 text-sm"
              value={Math.round(item.x)}
              onChange={(e) => api.updateSelected({ x: Number(e.target.value) })}
            />
          </Field>
          <Field label="Y">
            <input
              type="number" className="field py-1.5 text-sm"
              value={Math.round(item.y)}
              onChange={(e) => api.updateSelected({ y: Number(e.target.value) })}
            />
          </Field>
          <Field label="宽">
            <input
              type="number" className="field py-1.5 text-sm"
              value={Math.round(item.w)}
              onChange={(e) => api.updateSelected({ w: Math.max(24, Number(e.target.value)) })}
            />
          </Field>
          <Field label="高">
            <input
              type="number" className="field py-1.5 text-sm"
              value={Math.round(item.h)}
              onChange={(e) => api.updateSelected({ h: Math.max(24, Number(e.target.value)) })}
            />
          </Field>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold text-[var(--color-ink-soft)]">
            旋转 <span className="text-[var(--color-pink)]">{Math.round(item.rot)}°</span>
          </p>
          <input
            type="range" min={-180} max={180} step={1}
            value={item.rot}
            onChange={(e) => api.updateSelected({ rot: Number(e.target.value) })}
            className="w-full accent-[var(--color-pink)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="ghost" onClick={() => api.reorder(item.id, "front")} title="移到最前">
            <ArrowUp size={14} /> 最前
          </Button>
          <Button size="sm" variant="ghost" onClick={() => api.reorder(item.id, "back")} title="移到最后">
            <ArrowDown size={14} /> 最后
          </Button>
          <Button size="sm" variant="ghost" onClick={() => api.duplicateItem(item.id)} title="复制">
            <Copy size={14} /> 复制
          </Button>
          <Button size="sm" variant="ghost" className="text-[#b73e68]" onClick={() => api.removeItem(item.id)} title="删除">
            <Trash2 size={14} /> 删除
          </Button>
        </div>
      </section>

      {/* 照片专属 */}
      {item.kind === "photo" && !item.cropPath && (
        <section className="space-y-3">
          <h4 className="text-sm font-bold text-[var(--color-ink-soft)]">相框</h4>
          <div className="photo-frame-choices">
            {FRAMES.map((f) => (
              <button
                key={f.id}
                onClick={() => api.updateSelected({ frame: f.id, frameTone: getFramePalettes(f.id).some(palette => palette.id === item.frameTone) ? item.frameTone : undefined })}
                className="photo-frame-choice"
                aria-pressed={item.frame === f.id}
                aria-label={f.name}
                title={f.desc}
              >
                <span className="photo-frame-choice-preview" aria-hidden="true"><div><PhotoFrame item={{ ...item, id: `frame-preview-${f.id}`, src: "/assets/demo/alpine-lake.jpg", frame: f.id, frameTone: undefined, w: 90, h: 70 }} /></div></span>
                <span>{f.name}</span>
              </button>
            ))}
          </div>
          {getFramePalettes(item.frame).length > 0 && <div className="photo-frame-palettes" role="group" aria-label="相框配色">{getFramePalettes(item.frame).map(palette => <button key={palette.id} aria-label={`相框配色：${palette.name}`} aria-pressed={getFramePalette(item.frame, item.frameTone).id === palette.id} onClick={() => api.updateSelected({ frameTone: palette.id })}><span style={{ background: palette.base, boxShadow: `inset 0 0 0 3px ${palette.accent}` }} /><span>{palette.name}</span></button>)}</div>}

          <Button variant="mint" size="sm" className="w-full" onClick={() => api.applyFrameToAll(item.frame, item.frameTone)} disabled={api.photoCount === 0}>
            <Copy size={14} /> 应用到所有照片
          </Button>

        </section>
      )}

      {/* 贴纸 / 文字专属 */}
      {item.kind === "sticker" && <Button variant="mint" className="w-full" onClick={api.startStickerReplace}><StickerIcon size={15} /> 打开贴纸库</Button>}
      {(item.kind === "sticker" || item.kind === "text" || item.kind === "tape" || item.kind === "ink") && (
        <section>
          <p className="mb-1 text-xs font-bold text-[var(--color-ink-soft)]">
            不透明度 <span className="text-[var(--color-pink)]">{Math.round(item.opacity * 100)}%</span>
          </p>
          <input
            type="range" min={10} max={100} step={1}
            value={Math.round(item.opacity * 100)}
            onChange={(e) => api.updateSelected({ opacity: Number(e.target.value) / 100 })}
            className="w-full accent-[var(--color-pink)]"
          />
        </section>
      )}

      {item.kind === "text" && (
        <section className="space-y-3">
          {!item.noteTemplate && <Field label="编辑文字">
            <textarea aria-label="编辑文字" className="field min-h-24 resize-y text-base" value={item.text} onChange={(event) => api.updateSelected({ text: event.target.value })} maxLength={10000} />
          </Field>}
          <TextWeightControl weight={item.weight} onChange={weight => api.updateSelected({ weight })} />
          <div>
            <p className="mb-1 text-xs font-bold text-[var(--color-ink-soft)]">
              字号 <span className="text-[var(--color-pink)]">{item.size}</span>
            </p>
            <input
              type="range" min={12} max={140} step={1}
              value={item.size}
              onChange={(e) => api.updateSelected({ size: Number(e.target.value) })}
              className="w-full accent-[var(--color-pink)]"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-[var(--color-ink-soft)]">
              字间距 <span className="text-[var(--color-pink)]">{item.letterSpacing}</span>
            </p>
            <input
              type="range" min={-2} max={20} step={0.5}
              value={item.letterSpacing}
              onChange={(e) => api.updateSelected({ letterSpacing: Number(e.target.value) })}
              className="w-full accent-[var(--color-pink)]"
            />
          </div>
        </section>
      )}
      {(item.kind === "tape" || item.kind === "ink") && <Button variant="mint" className="w-full" onClick={() => api.journal.activate(item.kind === "tape" ? "edge" : "brush")}><Scissors size={15} />{item.kind === "tape" ? "编辑胶带" : "继续绘画"}</Button>}
    </div>
  );
}

/* ============================== 工具面板入口 ========================== */
export function ToolPanel({ tab, api }: { tab: TabId; api: EditorApi }) {
  const body = useMemo(() => {
    switch (tab) {
      case "layout": return <LayoutPanel api={api} />;
      case "photo": return <PhotoPanel api={api} />;
      case "sticker": return <StickerPanel api={api} />;
      case "text": return <TextPanel api={api} />;
      case "bg": return <BackgroundPanel api={api} />;
      case "layers": return <LayersPanel api={api} />;
      case "journal": return <JournalToolsPanel api={api.journal} />;
      default: return null;
    }
  }, [tab, api]);

  return <div key={tab} className="panel-enter pb-2">{body}</div>;
}

function LayersPanel({ api }: { api: EditorApi }) {
  return (
    <div className="space-y-3">
      {[...api.doc.items].sort((first, second) => second.z - first.z).map((item, index) => (
        <button key={item.id} onClick={() => api.select(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl border p-2 text-left transition", api.selected?.id === item.id ? "border-[var(--color-mint)] bg-[var(--color-mint-soft)]" : "border-[#e2d9c8] bg-white/70")}>
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-paper-2)]">
            {item.kind === "text" ? <Type size={18} /> : item.kind === "tape" ? <StickyNote size={18} /> : item.kind === "ink" ? <Paintbrush size={18} /> : item.src ? <img src={item.src} alt="" className="size-full object-contain" /> : <StickerIcon size={18} />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{item.kind === "text" ? item.text || "空白文字" : item.kind === "photo" ? `照片 ${api.doc.items.filter((entry) => entry.kind === "photo").findIndex((entry) => entry.id === item.id) + 1}` : item.kind === "tape" ? "胶带" : item.kind === "ink" ? "画笔笔迹" : item.shape ? DECORATIONS.find((decoration) => decoration.id === item.shape)?.name || "装饰" : "贴纸"}</span>
          <span className="text-[10px] text-[var(--color-ink-faint)]">{index + 1}</span>
        </button>
      ))}
      {!api.doc.items.length && <p className="py-8 text-center text-sm text-[var(--color-ink-faint)]">暂无图层</p>}
    </div>
  );
}
