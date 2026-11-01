import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from extract_sticker_sheets import components


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT.parent / "PhotoWalls" / "assets" / "text stickers"
REVIEW = ROOT / "scripts" / "text-sticker-pastel-review.json"
DESTINATION = ROOT / "assets" / "text-stickers"
REGISTRY = ROOT / "web" / "src" / "data" / "textStickers-pastel.json"
QA = ROOT / ".playwright-mcp" / "pastel"


def filled(mask):
    padded = Image.new("L", (mask.width + 2, mask.height + 2))
    padded.paste(mask, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    return Image.fromarray(np.where(np.asarray(padded) == 128, 0, 255).astype(np.uint8)).crop((1, 1, mask.width + 1, mask.height + 1))


def detect(image, sheet):
    pixels = np.asarray(image.convert("RGBA"))
    mask = pixels[:, :, 3] > 50 if sheet == 1 else np.asarray(Image.fromarray((pixels[:, :, :3].min(2) < 240).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    groups = [group for group in components(mask) if group["area"] > 700]
    groups.sort(key=lambda group: (group["box"][1] // 80, group["box"][0]))
    return groups


def cutout(image, entry, sheet):
    box = entry["box"]
    crop = image.convert("RGBA").crop(box)
    pixels = np.asarray(crop).copy()
    if sheet == 1:
        groups = components(pixels[:, :, 3] > 50)
        primary = max(groups, key=lambda group: group["area"])
        mask = np.zeros(pixels.shape[:2], dtype=bool)
        for row, left, right in primary["runs"]:
            mask[row, left:right] = True
        alpha = np.where(mask, pixels[:, :, 3], 0).astype(np.uint8)
    else:
        seed = Image.fromarray((pixels[:, :, :3].min(2) < entry.get("threshold", 240)).astype(np.uint8) * 255)
        barrier = seed.filter(ImageFilter.MaxFilter(3))
        mask = np.asarray(filled(barrier)) > 0
        groups = components(mask)
        selected = sorted(groups, key=lambda group: group["area"], reverse=True)
        primary = np.zeros_like(mask)
        for group_index, group in enumerate(selected):
            if group_index == 0 or entry.get("parts") and group["area"] >= entry.get("minimumPart", 80):
                for row, left, right in group["runs"]:
                    primary[row, left:right] = True
        alpha = np.asarray(Image.fromarray(primary.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(.35)))
    if "polygon" in entry:
        selection = Image.new("L", crop.size)
        ImageDraw.Draw(selection).polygon([tuple(point) for point in entry["polygon"]], fill=255)
        alpha = np.minimum(alpha, np.asarray(selection))
    if "polygonSource" in entry:
        selection = Image.new("L", crop.size)
        ImageDraw.Draw(selection).polygon([(point[0]-box[0],point[1]-box[1]) for point in entry["polygonSource"]], fill=255)
        alpha = np.minimum(alpha, np.asarray(selection))
    pixels[:, :, 3] = alpha
    result = Image.fromarray(pixels)
    bounds = result.getbbox()
    if bounds is None:
        raise ValueError(f"Empty crop: {entry}")
    left, top, right, bottom = bounds
    pad = 5
    output = Image.new("RGBA", (right - left + pad * 2, bottom - top + pad * 2))
    output.paste(result.crop(bounds), (pad, pad))
    source_box = [box[0] + left - pad, box[1] + top - pad, box[0] + right + pad, box[1] + bottom + pad]
    return output, source_box


def contact_sheet(items, path):
    columns = 8
    canvas = Image.new("RGB", (1440, ((len(items) + columns - 1) // columns) * 185), "#d9dedb")
    draw = ImageDraw.Draw(canvas)
    for index, (identifier, sticker, area) in enumerate(items):
        preview = sticker.copy()
        preview.thumbnail((170, 150), Image.Resampling.LANCZOS)
        left = index % columns * 180 + (180 - preview.width) // 2
        top = index // columns * 185 + (155 - preview.height) // 2
        canvas.paste(preview, (left, top), preview)
        if area:
            scale = preview.width / sticker.width
            draw.rectangle((left + area["x"] * scale, top + area["y"] * scale, left + (area["x"] + area["w"]) * scale, top + (area["y"] + area["h"]) * scale), outline="#ed1496", width=1)
        draw.text((index % columns * 180 + 5, index // columns * 185 + 160), identifier, fill="#303b34")
    canvas.save(path)


def build(source, analyze=False):
    QA.mkdir(parents=True, exist_ok=True)
    paths = sorted(source.glob("Pastel*.png"), key=lambda path: int(path.stem.rsplit("-", 1)[-1]))
    if len(paths) != 6:
        raise ValueError("Expected exactly six Pastel source sheets")
    review = {} if analyze else json.loads(REVIEW.read_text(encoding="utf-8"))
    templates = []
    report = []
    for path in paths:
        sheet = int(path.stem.rsplit("-", 1)[-1])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        original = Image.open(path)
        if original.size != (1536, 1024):
            raise ValueError(f"Unexpected source size: {path}")
        image = original.convert("RGBA")
        if analyze:
            groups = detect(original, sheet)
            overlay = original.convert("RGB")
            draw = ImageDraw.Draw(overlay)
            records = []
            for index, group in enumerate(groups, 1):
                left, top, right, bottom = group["box"]
                draw.rectangle((left, top, right, bottom), outline="#e00085", width=2)
                draw.rectangle((left, top, left + 25, top + 17), fill="#e00085")
                draw.text((left + 2, top + 2), str(index), fill="white")
                records.append({"box": [max(0,left-4),max(0,top-4),min(1536,right+4),min(1024,bottom+4)]})
            overlay.save(QA / f"pastel-s{sheet:02d}-detected.png")
            review[str(sheet)] = {"source": path.name, "sourceSha256": digest, "stickers": records, "accents": []}
            print(json.dumps({"sheet":sheet,"detected":len(groups)}))
            continue
        sheet_review = review[str(sheet)]
        if digest != sheet_review["sourceSha256"] or path.name != sheet_review["source"]:
            raise ValueError(f"Reviewed source changed: {path}")
        items = []
        DESTINATION.mkdir(parents=True, exist_ok=True)
        detected = detect(original, sheet)
        for index, record in enumerate(sheet_review["stickers"], 1):
            region, name, area_source, *settings = record
            entry = {"name":name,"area":area_source,**(settings[0] if settings else {})}
            if isinstance(region, int):
                left, top, right, bottom = detected[region - 1]["box"]
                entry["box"] = [max(0,left-4),max(0,top-4),min(1536,right+4),min(1024,bottom+4)]
            else:
                entry["box"] = region
            identifier = f"note-pastel-s{sheet:02d}-{index:03d}"
            sticker, source_box = cutout(image, entry, sheet)
            left, top, right, bottom = entry["area"]
            area = {"x":left-source_box[0],"y":top-source_box[1],"w":right-left,"h":bottom-top}
            if min(area.values()) < 0 or area["x"] + area["w"] > sticker.width or area["y"] + area["h"] > sticker.height:
                raise ValueError(f"Invalid writing rectangle: {identifier}")
            sticker.save(DESTINATION / f"{identifier}-preview.png", optimize=True)
            exported = np.asarray(Image.open(DESTINATION / f"{identifier}-preview.png"))
            source_pixels = np.asarray(image.crop(source_box))
            visible = exported[:, :, 3] > 0
            if exported.shape != source_pixels.shape or not np.array_equal(exported[:, :, :3][visible], source_pixels[:, :, :3][visible]):
                raise ValueError(f"Native source RGB mismatch: {identifier}")
            if exported[0, :, 3].any() or exported[-1, :, 3].any() or exported[:, 0, 3].any() or exported[:, -1, 3].any():
                raise ValueError(f"Missing transparent margin: {identifier}")
            if entry.get("writing", True) and (exported[area["y"]:area["y"] + area["h"], area["x"]:area["x"] + area["w"], 3] > 0).mean() < .98:
                raise ValueError(f"Writing rectangle crosses transparent area: {identifier}")
            list_style = entry.get("list")
            template = {"id":identifier,"name":entry["name"],"width":sticker.width,"height":sticker.height,"area":area,"list":list_style,"ruled":entry.get("ruled",False),"rows":3 if list_style else 1,"source":path.name,"sourceSha256":digest,"sourceBox":source_box,"collection":"pastel","writing":entry.get("writing",True)}
            if list_style:
                check_area = entry["checkArea"]
                check_left, check_top = check_area["x"], check_area["y"]
                check_right, check_bottom = check_left + check_area["w"], check_top + check_area["h"]
                if min(check_area.values()) < 0 or check_right > sticker.width or check_bottom > sticker.height:
                    raise ValueError(f"Invalid marker rectangle: {identifier}")
                if (exported[check_top:check_bottom, check_left:check_right, 3] > 0).mean() < .98:
                    raise ValueError(f"Marker rectangle crosses transparent area: {identifier}")
                template["checkArea"] = check_area
            templates.append(template)
            items.append((identifier,sticker,area))
        contact_sheet(items, QA / f"pastel-s{sheet:02d}-contact.png")
        report.append({"sheet":sheet,"source":path.name,"count":len(items),"accents":[entry["id"] for entry in templates if entry["source"] == path.name and not entry["writing"]],"issues":sheet_review.get("issues",[])})
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Source changed during import: {path}")
        print(json.dumps(report[-1],ensure_ascii=False))
    if analyze:
        (QA / "pastel-detected.json").write_text(json.dumps(review,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    else:
        REGISTRY.write_text(json.dumps(templates,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        (QA / "pastel-import-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"templates":len(templates),"verifiedSourceRgb":len(templates),"transparentMargins":len(templates),"writingExceptions":sum(not entry["writing"] for entry in templates)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source",type=Path,default=DEFAULT_SOURCE)
    parser.add_argument("--analyze",action="store_true")
    options = parser.parse_args()
    build(options.source, options.analyze)
