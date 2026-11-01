import { Eraser, Paintbrush, Sparkles, StickyNote, MousePointer2 } from "lucide-react";
import type { JournalSettings, JournalTool, TapeItem } from "../types";
import { BRUSHES, JOURNAL_COLORS, RAINBOW_SWATCH, TAPE_EDGES, TAPE_PATTERNS } from "../data/journal";
import { JournalItemView } from "./JournalItemView";
import { Button, Field } from "./ui";

export interface JournalApi {
  settings: JournalSettings;
  selectedTape: TapeItem | null;
  setSettings: (patch: Partial<JournalSettings>) => void;
  activate: (tool: JournalTool) => void;
  applyTape: (patch: Partial<TapeItem>) => void;
  restoreTape: () => void;
  beginParameter: () => void;
  endParameter: () => void;
}
export const JOURNAL_TOOLS = [
  { id: "edge", name: "花边剪刀", icon: Sparkles }, { id: "tape", name: "胶带", icon: StickyNote }, { id: "brush", name: "画笔", icon: Paintbrush }, { id: "eraser", name: "橡皮擦", icon: Eraser },
] as const;
function Colors({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="journal-colors">{JOURNAL_COLORS.map(color => <button key={color} aria-label={`颜色 ${color}`} aria-pressed={value === color} style={{ background: color }} onClick={() => onChange(color)} />)}<label className="journal-custom-color" title="自定义颜色"><input aria-label="自定义颜色" type="color" value={value} onChange={event => onChange(event.target.value)} /></label></div>;
}
function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <Field label={`${label} · ${value}`}><input aria-label={label} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /></Field>;
}
export function JournalToolsPanel({ api }: { api: JournalApi }) {
  const settings = api.settings;
  const tape = api.selectedTape;
  const isTape = Boolean(tape) || settings.tool === "tape" || settings.tool === "edge";
  return <div className="journal-panel" onPointerDownCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === "range") api.beginParameter(); }} onPointerUpCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === "range") api.endParameter(); }} onPointerCancelCapture={api.endParameter} onFocusCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === "color") api.beginParameter(); }} onBlurCapture={event => { if (event.target instanceof HTMLInputElement) api.endParameter(); }}>
    <div className="journal-tools">{JOURNAL_TOOLS.map(tool => <button key={tool.id} aria-pressed={settings.tool === tool.id} onClick={() => api.activate(tool.id)}><tool.icon size={21} /><span>{tool.name}</span></button>)}</div>
    <Button variant="ghost" className="w-full" onClick={() => api.activate("select")}><MousePointer2 size={15} />选择与移动</Button>
    {isTape && <>
      <section><h4>胶带款式</h4><div className="journal-patterns">{TAPE_PATTERNS.map(pattern => {
        const preview: TapeItem = { kind: "tape", id: `preview-${pattern.id}`, x: 0, y: 0, w: 160, h: 42, sourceW: 160, sourceH: 42, rot: 0, z: 0, opacity: 1, pattern: pattern.id, color: tape?.color ?? settings.tapeColor, accentColor: "#fffdf6", edge: "straight", edgeSize: 6 };
        return <button key={pattern.id} aria-label={`胶带款式：${pattern.name}`} aria-pressed={(tape?.pattern ?? settings.pattern) === pattern.id} onClick={() => { api.setSettings({ pattern: pattern.id }); if (tape) api.applyTape({ pattern: pattern.id }); }}><span><JournalItemView item={preview} /></span>{pattern.name}</button>;
      })}</div></section>
      <section><h4>胶带颜色</h4><Colors value={tape?.color ?? settings.tapeColor} onChange={color => { api.setSettings({ tapeColor: color }); if (tape) api.applyTape({ color }); }} /></section>
      {!tape && <Range label="胶带宽度" value={settings.tapeWidth} min={16} max={120} onChange={tapeWidth => api.setSettings({ tapeWidth })} />}
      <Range label="胶带不透明度" value={Math.round((tape?.opacity ?? settings.tapeOpacity) * 100)} min={10} max={100} onChange={value => { api.setSettings({ tapeOpacity: value / 100 }); if (tape) api.applyTape({ opacity: value / 100 }); }} />
      {settings.tool === "edge" && <><section><h4>花边形状</h4><div className="journal-edge-options">{TAPE_EDGES.map(edge => <button key={edge.id} aria-pressed={(tape?.edge ?? settings.edge) === edge.id} onClick={() => { api.setSettings({ edge: edge.id }); if (tape) api.applyTape({ edge: edge.id, edgeSize: settings.edgeSize }); }}>{edge.name}</button>)}</div></section><Range label="花边大小" value={tape?.edgeSize ?? settings.edgeSize} min={2} max={20} onChange={edgeSize => { api.setSettings({ edgeSize }); if (tape) api.applyTape({ edgeSize }); }} /></>}
      {settings.tool === "edge" && <Button variant="mint" disabled={!tape} onClick={api.restoreTape}>恢复完整胶带</Button>}
    </>}
    {settings.tool === "brush" && <><section><h4>笔型</h4><div className="journal-edge-options">{BRUSHES.map(brush => <button key={brush.id} aria-pressed={settings.brush === brush.id} style={brush.id === "rainbow" ? { backgroundImage: RAINBOW_SWATCH } : undefined} onClick={() => api.setSettings({ brush: brush.id, size: brush.size })}>{brush.name}</button>)}</div></section>{settings.brush !== "rainbow" && <section><h4>画笔颜色</h4><Colors value={settings.color} onChange={color => api.setSettings({ color })} /></section>}<Range label="画笔粗细" value={settings.size} min={1} max={60} onChange={size => api.setSettings({ size })} /></>}
    {settings.tool === "eraser" && <Range label="橡皮擦大小" value={settings.eraserSize} min={8} max={120} onChange={eraserSize => api.setSettings({ eraserSize })} />}
  </div>;
}
