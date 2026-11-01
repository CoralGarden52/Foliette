import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
COLLECTIONS = ("white", "wide", "pastel")


def clean_writing_area(image, template):
    pixels = np.asarray(image).copy()
    area = template["area"]
    if template.get("list"):
        filtered = np.asarray(image.filter(ImageFilter.MedianFilter(11)))
        left, top = area["x"], area["y"]
        right, bottom = left + area["w"], top + area["h"]
        pixels[top:bottom, left:right, :3] = filtered[top:bottom, left:right, :3]
        check = template["checkArea"]
        sample = filtered[top:bottom, left:right, :3]
        paper = np.median(sample.reshape(-1, 3), axis=0).astype(np.uint8)
        pixels[check["y"]:check["y"] + check["h"],check["x"]:check["x"] + check["w"],:3] = paper
    return Image.fromarray(pixels)


def build(collections):
    destination = ROOT / "assets/text-stickers"
    diagnostics = ROOT / ".playwright-mcp/imported-note-native"
    diagnostics.mkdir(parents=True, exist_ok=True)
    templates = []
    for collection in collections:
        records = json.loads((ROOT / f"web/src/data/textStickers-{collection}.json").read_text(encoding="utf-8"))
        sheets = {}
        for original in records:
            template = dict(original)
            identifier = template["id"]
            preview = Image.open(destination / f"{identifier}-preview.png").convert("RGBA")
            if template.get("writing") is False:
                canvas = Image.new("RGBA", (preview.width, preview.height + 60))
                canvas.paste(preview, (0, 0))
                template["height"] = canvas.height
                template["area"] = {"x":0,"y":preview.height + 8,"w":preview.width,"h":42}
                template["caption"] = True
                template["ruled"] = False
                template["list"] = None
                preview = canvas
            background = clean_writing_area(preview, template)
            if not template.get("list"):
                template["ruled"] = False
            background.save(destination / f"{identifier}.png", optimize=True)
            area = template["area"]
            body = np.asarray(background)[area["y"]:area["y"] + area["h"],area["x"]:area["x"] + area["w"],:3]
            template["ink"] = "#fbf7ef" if np.median(body) < 135 and not template.get("caption") else "#3d3428"
            template.update({"growth":"fixed","stripY":0,"stripHeight":1,"fixedArt":False})
            templates.append(template)
            shown = background.copy()
            sheets.setdefault(template["source"], []).append((template, shown))
        for sheet_index, (source, entries) in enumerate(sheets.items(), 1):
            contact = Image.new("RGB", (1400, ((len(entries) + 6) // 7) * 280), "#e5e5df")
            draw = ImageDraw.Draw(contact)
            for index, (template, shown) in enumerate(entries):
                shown.thumbnail((186, 245), Image.Resampling.LANCZOS)
                left = index % 7 * 200
                top = index // 7 * 280
                contact.paste(shown, (left + (200 - shown.width) // 2, top + 22), shown)
                draw.text((left + 6, top + 4), template["id"].replace("note-", ""), fill="#34422f")
            contact.save(diagnostics / f"{collection}-{sheet_index:02d}.png")
    target = ROOT / "web/src/data/textStickers-imported.json"
    target.write_text(json.dumps(templates, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    server_target = ROOT / "server/src/data/textStickers-imported.json"
    server_target.parent.mkdir(parents=True, exist_ok=True)
    server_target.write_text(json.dumps([{key:template[key] for key in ("id","list")} for template in templates], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"templates":len(templates),"collections":list(collections),"captionStickers":sum(bool(template.get("caption")) for template in templates)}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collections", nargs="+", choices=COLLECTIONS, default=list(COLLECTIONS))
    options = parser.parse_args()
    build(options.collections)
