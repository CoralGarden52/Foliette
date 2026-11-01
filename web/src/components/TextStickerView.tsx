import { useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { TextItem } from "../types";
import { FONT_MAP } from "../data/fonts";
import { textStickerImage, textStickerLayout } from "../data/textStickers";
import { textStrokeWidth } from "../lib/textWeight";

export function TextStickerView({ item, editing, onChange, onFinishEdit }: {
  item: TextItem;
  editing: boolean;
  onChange: (patch: Partial<TextItem>) => void;
  onFinishEdit: () => void;
}) {
  const { template, unit, top, left, width, bodyHeight, lineHeight, rows } = textStickerLayout(item);
  const [fittedScale, setFittedScale] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      // Measure the same control used for editing, including its final empty line.
      const probe = document.createElement("textarea");
      probe.rows = 1;
      Object.assign(probe.style, { position: "absolute", visibility: "hidden", left: "-100000px", width: `${width}px`, height: "0", padding: "0", border: "0", boxSizing: "border-box", overflow: "hidden", fontFamily: FONT_MAP[item.font]?.family || "sans-serif", fontWeight: String(item.weight), whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" });
      probe.value = item.text || " ";
      document.body.appendChild(probe);
      let low = .001;
      let high = 1;
      for (let attempt = 0; attempt < 12; attempt++) {
        const scale = (low + high) / 2;
        const strokeWidth = textStrokeWidth(item.weight, item.size * scale);
        Object.assign(probe.style, { fontSize: `${item.size * scale}px`, lineHeight: `${lineHeight * scale}px`, letterSpacing: `${item.letterSpacing * scale}px`, padding: `${strokeWidth / 2}px` });
        if (Math.max(probe.scrollHeight, (template.list ? rows : 1) * lineHeight * scale + strokeWidth) <= Math.floor(bodyHeight)) low = scale;
        else high = scale;
      }
      probe.remove();
      setFittedScale(low > .999 ? 1 : low);
    };
    measure();
    document.fonts.addEventListener("loadingdone", measure);
    return () => document.fonts.removeEventListener("loadingdone", measure);
  }, [template, item.text, item.font, item.size, item.weight, item.letterSpacing, width, bodyHeight, lineHeight, rows]);
  const scale = fittedScale;
  const strokeWidth = textStrokeWidth(item.weight, item.size * scale);
  const renderedLineHeight = lineHeight * scale;
  const checkSize = Math.min(14 * unit, renderedLineHeight * .5);
  const checkLeft = template.checkArea ? (template.checkArea.x + template.checkArea.w / 2 - 10) * unit : left - 29 * unit;
  const background = { backgroundImage: `url("${textStickerImage(template.id)}")`, backgroundSize: `${item.w}px ${template.height * unit}px`, backgroundRepeat: "no-repeat" };
  const textStyle: CSSProperties = { fontFamily: FONT_MAP[item.font]?.family, fontSize: item.size * scale, color: item.color, fontWeight: item.weight, WebkitTextStrokeWidth: strokeWidth, paintOrder: "stroke fill", padding: strokeWidth / 2, letterSpacing: item.letterSpacing * scale, textAlign: item.align, lineHeight: `${renderedLineHeight}px`, height: bodyHeight, width, overflow: "hidden" };

  return <div className="editable-note" data-note-template={template.id} data-note-rows={template.list ? rows : undefined}>
    <div className="note-background" style={{ ...background, top: 0, height: template.height * unit }} />
    {template.fixedArt && <div className="note-background" style={{ ...background, top: 0, height: template.height * unit, backgroundImage: `url("${textStickerImage(template.id, "decor")}")` }} />}
    {template.list && <div className="note-checks" aria-hidden="true" style={{ top, left: checkLeft, width: 20 * unit, maxHeight: bodyHeight, overflow: "hidden" }}>{Array.from({ length: rows }, (_, index) => <span key={index} style={{ height: renderedLineHeight }}><i style={{ width: checkSize, height: checkSize, borderRadius: template.list === "circle" ? "50%" : 2 * unit, borderWidth: Math.max(.5, Math.min(unit, renderedLineHeight * .05)) }} /></span>)}</div>}
    <div className="note-writing-area" style={{ top, left, width, height: bodyHeight, backgroundImage: template.ruled ? `repeating-linear-gradient(to bottom, transparent 0, transparent ${renderedLineHeight - 1}px, #aa91823d ${renderedLineHeight - 1}px, #aa91823d ${renderedLineHeight}px)` : undefined }}>
      {editing ? <textarea autoFocus aria-label="画布文字内容" placeholder="点击这里填写" value={item.text} maxLength={10000} spellCheck={false} style={textStyle} onPointerDown={event => event.stopPropagation()} onBlur={onFinishEdit} onKeyDown={event => { if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) { event.preventDefault(); event.currentTarget.blur(); } }} onChange={event => onChange({ text: event.target.value })} /> : <div className="note-written-text" style={textStyle}>{item.text || <span data-export-ignore="true" className="note-placeholder">点击填写</span>}</div>}
    </div>
  </div>;
}
