import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from extract_sticker_sheets import components


ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    "ChatGPT Image Oct 19, 2026, 09_49_48 AM-1.png",
    "ChatGPT Image Oct 19, 2026, 09_49_56 AM-2.png",
    "ChatGPT Image Oct 19, 2026, 09_49_58 AM-3.png",
    "ChatGPT Image Oct 19, 2026, 09_50_00 AM-4.png",
]


def filled_mask(pixels):
    seed = Image.fromarray((pixels.min(axis=2) < 242).astype(np.uint8) * 255)
    seed = seed.filter(ImageFilter.MaxFilter(3))
    padded = Image.new("L", (seed.width + 2, seed.height + 2))
    padded.paste(seed, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    filled = np.asarray(padded)[1:-1, 1:-1] != 128
    primary = max(components(filled), key=lambda group: group["area"])
    isolated = np.zeros(filled.shape, dtype=np.uint8)
    for row, start, end in primary["runs"]:
        isolated[row, start:end] = 255
    return Image.fromarray(isolated)


def build(source_directory, review_path, destination, registry, output):
    review = json.loads(review_path.read_text(encoding="utf-8"))
    destination.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    templates = []
    counts = []
    for sheet, filename in enumerate(SOURCES, 1):
        source_path = source_directory / filename
        original_bytes = source_path.read_bytes()
        digest = hashlib.sha256(original_bytes).hexdigest()
        source = Image.open(source_path).convert("RGB")
        entries = review[str(sheet)]["stickers"]
        if source.size != (1254, 1254):
            raise ValueError(f"Unexpected source dimensions: {filename}: {source.size}")
        contact = Image.new("RGB", (1200, ((len(entries) + 5) // 6) * 235), "#ded8cf")
        contact_draw = ImageDraw.Draw(contact)
        overlay = source.copy()
        overlay_draw = ImageDraw.Draw(overlay)
        for index, entry in enumerate(entries, 1):
            identifier = f"note-white-s{sheet:02d}-{index:03d}"
            box = entry["box"]
            crop = source.crop(box)
            alpha = filled_mask(np.asarray(crop))
            if "polygon" in entry:
                selection = Image.new("L", crop.size)
                ImageDraw.Draw(selection).polygon([tuple(point) for point in entry["polygon"]], fill=255)
                alpha = Image.fromarray(np.minimum(np.asarray(alpha), np.asarray(selection)))
            if "exclude" in entry:
                exclusion_draw = ImageDraw.Draw(alpha)
                for exclusion in entry["exclude"]:
                    exclusion_draw.rectangle(tuple(exclusion), fill=0)
            alpha_pixels = np.asarray(alpha).copy()
            if "exclude" in entry:
                primary = max(components(alpha_pixels > 0), key=lambda group: group["area"])
                alpha_pixels.fill(0)
                for row, start, end in primary["runs"]:
                    alpha_pixels[row, start:end] = 255
            alpha_pixels[[0, -1], :] = 0
            alpha_pixels[:, [0, -1]] = 0
            preview = crop.convert("RGBA")
            preview.putalpha(Image.fromarray(alpha_pixels))
            preview.save(destination / f"{identifier}-preview.png", optimize=True)
            fractions = entry.get("area", [.23, .30, .54, .38])
            area = dict(zip(("x", "y", "w", "h"), [round(value * dimension) for value, dimension in zip(fractions, [crop.width, crop.height, crop.width, crop.height])]))
            list_style = entry.get("list")
            templates.append({"id": identifier, "name": entry["name"], "width": crop.width, "height": crop.height, "area": area, "list": list_style, "ruled": entry.get("ruled", False), "rows": 3 if list_style else 1, "source": filename, "sourceSha256": digest, "sourceBox": box, "collection": "white"})
            if list_style:
                check_area = entry["checkArea"]
                assert check_area["x"] >= 0 and check_area["y"] >= 0, identifier
                assert check_area["x"] + check_area["w"] <= crop.width, identifier
                assert check_area["y"] + check_area["h"] <= crop.height, identifier
                marker_paper = alpha_pixels[check_area["y"]:check_area["y"] + check_area["h"], check_area["x"]:check_area["x"] + check_area["w"]]
                assert np.all(marker_paper == 255), identifier
                templates[-1]["checkArea"] = check_area
            assert np.array_equal(np.asarray(preview)[:, :, :3], np.asarray(crop)), identifier
            assert alpha_pixels.min() == 0 and alpha_pixels.max() == 255, identifier
            assert np.count_nonzero(alpha_pixels == 255) > crop.width * crop.height * .2, identifier
            area_slice = alpha_pixels[area["y"]:area["y"] + area["h"], area["x"]:area["x"] + area["w"]]
            if np.mean(area_slice == 255) < .98:
                raise ValueError(f"Writing area leaves paper: {identifier}")
            thumbnail = preview.copy()
            thumbnail.thumbnail((188, 196), Image.Resampling.LANCZOS)
            left, top = (index - 1) % 6 * 200, (index - 1) // 6 * 235
            contact.paste(thumbnail, (left + (200 - thumbnail.width) // 2, top + (198 - thumbnail.height) // 2), thumbnail)
            contact_draw.text((left + 5, top + 200), f"{identifier} {crop.width}x{crop.height}", fill="#34392f")
            scale_x, scale_y = thumbnail.width / crop.width, thumbnail.height / crop.height
            area_left = left + (200 - thumbnail.width) // 2 + round(area["x"] * scale_x)
            area_top = top + (198 - thumbnail.height) // 2 + round(area["y"] * scale_y)
            contact_draw.rectangle((area_left, area_top, area_left + round(area["w"] * scale_x), area_top + round(area["h"] * scale_y)), outline="#d00080", width=1)
            overlay_draw.rectangle(box, outline="#d00080", width=2)
            overlay_draw.text((box[0] + 3, box[1] + 3), str(index), fill="#d00080")
        contact.save(output / f"white-s{sheet:02d}-contact.png")
        overlay.save(output / f"white-s{sheet:02d}-regions.png")
        assert hashlib.sha256(source_path.read_bytes()).hexdigest() == digest
        counts.append({"source": filename, "count": len(entries), "sourceSha256": digest})
    registry.write_text(json.dumps(templates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "white-validation.json").write_text(json.dumps({"total": len(templates), "sources": counts, "checks": ["source hashes unchanged", "native dimensions", "all crop RGB equal source pixels", "transparent crop edges", "opaque writing areas", "filled paper interiors"]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"total": len(templates), "sources": counts}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT.parent / "PhotoWalls" / "assets" / "text stickers")
    parser.add_argument("--review", type=Path, default=ROOT / "scripts" / "text-sticker-white-review.json")
    parser.add_argument("--destination", type=Path, default=ROOT / "assets" / "text-stickers")
    parser.add_argument("--registry", type=Path, default=ROOT / "web" / "src" / "data" / "textStickers-white.json")
    parser.add_argument("--output", type=Path, default=ROOT / ".playwright-mcp")
    arguments = parser.parse_args()
    build(arguments.source, arguments.review, arguments.destination, arguments.registry, arguments.output)
