import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from extract_sticker_sheets import components


ROOT = Path(__file__).resolve().parents[1]


def isolate(crop):
    pixels = np.asarray(crop)
    barrier = Image.fromarray((pixels.min(axis=2) < 248).astype(np.uint8) * 255)
    barrier = barrier.filter(ImageFilter.MaxFilter(3))
    padded = Image.new("L", (crop.width + 2, crop.height + 2))
    padded.paste(barrier, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    filled = np.asarray(padded)[1:-1, 1:-1] != 128
    groups = sorted(components(filled), key=lambda group: group["area"], reverse=True)
    if not groups:
        raise ValueError("No sticker silhouette found")
    alpha = np.zeros((crop.height, crop.width), dtype=np.uint8)
    for row, left, right in groups[0]["runs"]:
        alpha[row, left:right] = 255
    result = crop.convert("RGBA")
    result.putalpha(Image.fromarray(alpha))
    discarded = [{"box": group["box"], "pixels": group["area"]} for group in groups[1:] if group["area"] >= 40]
    return result, discarded


def checkerboard(size):
    canvas = Image.new("RGB", size, "#e9e6e0")
    draw = ImageDraw.Draw(canvas)
    for top in range(0, size[1], 12):
        for left in range(0, size[0], 12):
            if (left // 12 + top // 12) % 2:
                draw.rectangle((left, top, left + 11, top + 11), fill="#d5d1ca")
    return canvas


def check(source, destination, registry, review):
    templates = json.loads(registry.read_text(encoding="utf-8"))
    reviewed = {entry["id"]: entry for sheet in review["sheets"] for entry in sheet["stickers"]}
    assert len(templates) == len(reviewed) == 126
    assert len({template["id"] for template in templates}) == len(templates)
    images = {}
    digests = {}
    for template in templates:
        name = template["source"]
        if name not in images:
            images[name] = Image.open(source / name).convert("RGB")
            digests[name] = hashlib.sha256((source / name).read_bytes()).hexdigest()
        preview = Image.open(destination / f"{template['id']}-preview.png")
        assert preview.mode == "RGBA", template["id"]
        assert preview.size == (template["width"], template["height"]), template["id"]
        original = np.asarray(images[name].crop(template["sourceBox"]))
        rendered = np.asarray(preview)
        assert original.shape[:2] == rendered.shape[:2], template["id"]
        assert np.array_equal(original, rendered[:, :, :3]), template["id"]
        assert np.any(rendered[:, :, 3] == 0), template["id"]
        assert np.any(rendered[:, :, 3] == 255), template["id"]
        assert template["sourceSha256"] == digests[name], template["id"]
        assert template["sourceBox"] == reviewed[template["id"]]["box"], template["id"]
        area = template["area"]
        assert 0 <= area["x"] < area["x"] + area["w"] <= preview.width, template["id"]
        assert 0 <= area["y"] < area["y"] + area["h"] <= preview.height, template["id"]
        assert np.all(rendered[area["y"]:area["y"] + area["h"], area["x"]:area["x"] + area["w"], 3] == 255), template["id"]
        if template["list"]:
            marker_area = template["checkArea"]
            assert marker_area == reviewed[template["id"]]["checkArea"], template["id"]
            assert 0 <= marker_area["x"] < marker_area["x"] + marker_area["w"] <= preview.width, template["id"]
            assert 0 <= marker_area["y"] < marker_area["y"] + marker_area["h"] <= preview.height, template["id"]
            markers = rendered[marker_area["y"]:marker_area["y"] + marker_area["h"], marker_area["x"]:marker_area["x"] + marker_area["w"]]
            assert np.all(markers[:, :, 3] == 255), template["id"]
            dark = markers[:, :, :3].min(axis=2) < 180
            assert len([group for group in components(dark) if group["area"] >= 5]) == 4, template["id"]
            assert not any([dark[0].any(), dark[-1].any(), dark[:, 0].any(), dark[:, -1].any()]), template["id"]
    print(json.dumps({"verified": len(templates), "checks": ["native dimensions", "unaltered source RGB", "RGBA transparency", "source hashes", "reviewed bounds", "opaque writable areas"]}))


def build(source, destination, registry, diagnostics, review):
    destination.mkdir(parents=True, exist_ok=True)
    diagnostics.mkdir(parents=True, exist_ok=True)
    templates = []
    reports = []
    for sheet in review["sheets"]:
        path = source / sheet["source"]
        original = Image.open(path).convert("RGB")
        if original.size != (1448, 1086):
            raise ValueError(f"Unexpected native source size: {path.name} {original.size}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        overlay = original.copy()
        draw = ImageDraw.Draw(overlay)
        count = len(sheet["stickers"])
        assert count == sheet["expectedCount"]
        contact = checkerboard((1440, ((count + 5) // 6) * 210))
        contact_draw = ImageDraw.Draw(contact)
        entries = []
        for index, entry in enumerate(sheet["stickers"]):
            box = entry["box"]
            crop = original.crop(box)
            sticker, discarded = isolate(crop)
            sticker.save(destination / f"{entry['id']}-preview.png", optimize=True)
            safe_left, safe_top, safe_width, safe_height = entry["safe"]
            area = {"x": safe_left - box[0], "y": safe_top - box[1], "w": safe_width, "h": safe_height}
            templates.append({"id": entry["id"], "name": entry["name"], "width": crop.width, "height": crop.height, "area": area, "list": entry["list"], "ruled": entry["ruled"], "rows": 3 if entry["list"] else 1, "source": path.name, "sourceSha256": digest, "sourceBox": box, "collection": "wide"})
            if entry.get("checkArea"):
                templates[-1]["checkArea"] = entry["checkArea"]
            draw.rectangle((box[0], box[1], box[2] - 1, box[3] - 1), outline="#dd1879", width=2)
            draw.text((box[0] + 3, box[1] + 3), str(index + 1), fill="#dd1879", stroke_width=1, stroke_fill="white")
            draw.rectangle((safe_left, safe_top, safe_left + safe_width - 1, safe_top + safe_height - 1), outline="#008855", width=2)
            thumb = sticker.copy()
            thumb.thumbnail((228, 180), Image.Resampling.LANCZOS)
            tile_left = index % 6 * 240
            tile_top = index // 6 * 210
            contact.paste(thumb, (tile_left + (240 - thumb.width) // 2, tile_top + (180 - thumb.height) // 2), thumb)
            contact_draw.text((tile_left + 8, tile_top + 188), entry["id"], fill="#262626")
            entries.append({"id": entry["id"], "discardedExternalFragments": discarded, "reviewNote": entry.get("reviewNote")})
        overlay.save(diagnostics / f"wide-s{sheet['sheet']:02d}-regions.png")
        contact.save(diagnostics / f"wide-s{sheet['sheet']:02d}-contact.png")
        reports.append({"source": path.name, "count": count, "sourceSha256": digest, "entries": entries})
    registry.parent.mkdir(parents=True, exist_ok=True)
    registry.write_text(json.dumps(templates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (diagnostics / "wide-import-report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"templates": len(templates), "perSource": [report["count"] for report in reports]}))
    check(source, destination, registry, review)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT.parent / "PhotoWalls" / "assets" / "text stickers")
    parser.add_argument("--destination", type=Path, default=ROOT / "assets" / "text-stickers")
    parser.add_argument("--registry", type=Path, default=ROOT / "web" / "src" / "data" / "textStickers-wide.json")
    parser.add_argument("--review", type=Path, default=ROOT / "scripts" / "text-sticker-wide-review.json")
    parser.add_argument("--diagnostics", type=Path, default=ROOT / ".playwright-mcp")
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    corrections = json.loads(options.review.read_text(encoding="utf-8"))
    if options.check:
        check(options.source, options.destination, options.registry, corrections)
    else:
        build(options.source, options.destination, options.registry, options.diagnostics, corrections)
