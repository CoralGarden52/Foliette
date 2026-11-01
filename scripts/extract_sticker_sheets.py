import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def components(mask):
    height, width = mask.shape
    parents = [0]
    runs = []
    previous = []

    def root(label):
        while parents[label] != label:
            parents[label] = parents[parents[label]]
            label = parents[label]
        return label

    for row in range(height):
        padded = np.pad(mask[row].astype(np.int8), (1, 1))
        changes = np.diff(padded)
        starts = np.flatnonzero(changes == 1)
        ends = np.flatnonzero(changes == -1)
        current = []
        previous_index = 0
        for left, right in zip(starts.tolist(), ends.tolist()):
            while previous_index < len(previous) and previous[previous_index][1] < left:
                previous_index += 1
            overlaps = []
            overlap_index = previous_index
            while overlap_index < len(previous) and previous[overlap_index][0] <= right:
                overlaps.append(root(previous[overlap_index][2]))
                overlap_index += 1
            if overlaps:
                label = min(overlaps)
                for other in overlaps:
                    parents[other] = label
            else:
                label = len(parents)
                parents.append(label)
            current.append((left, right, label))
            runs.append((row, left, right, label))
        previous = current

    groups = {}
    for row, left, right, label in runs:
        label = root(label)
        if label not in groups:
            groups[label] = {"box": [left, row, right, row + 1], "area": 0, "runs": []}
        group = groups[label]
        group["box"][0] = min(group["box"][0], left)
        group["box"][1] = min(group["box"][1], row)
        group["box"][2] = max(group["box"][2], right)
        group["box"][3] = row + 1
        group["area"] += right - left
        group["runs"].append((row, left, right))
    return list(groups.values())


def analyze(source, output, threshold, core, review, export):
    output.mkdir(parents=True, exist_ok=True)
    report = []
    metadata = {}
    rejected = []
    categories = {"garden":"花园植物", "tea":"甜点茶歇", "travel":"旅行拾光", "hearts":"心意装饰"}
    corrections = json.loads(review.read_text(encoding="utf-8")) if review else {}
    for path in sorted(source.glob("*.png")):
        image = Image.open(path).convert("RGB")
        pixels = np.asarray(image)
        if core:
            spread = pixels.max(axis=2).astype(int) - pixels.min(axis=2).astype(int)
            seeds = (pixels.min(axis=2) < threshold) | (spread > 14)
            merged = Image.fromarray(seeds.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(5))
            mask = np.asarray(merged) > 0
        else:
            mask = pixels.min(axis=2) < threshold
        groups = [group for group in components(mask) if group["area"] >= 40]
        groups.sort(key=lambda group: group["area"], reverse=True)
        retained = []
        for group in groups:
            left, top, right, bottom = group["box"]
            parent = next((candidate for candidate in retained if candidate["area"] > group["area"] * 5 and encloses(candidate, group)), None)
            if parent:
                parent["runs"].extend(group["runs"])
                parent["area"] += group["area"]
            elif max(right - left, bottom - top) >= 16 and min(right - left, bottom - top) >= 4:
                retained.append(group)
        groups = retained
        groups.sort(key=lambda group: (group["box"][1] // 60, group["box"][0]))
        overlay = image.copy()
        draw = ImageDraw.Draw(overlay)
        for index, group in enumerate(groups, 1):
            left, top, right, bottom = group["box"]
            draw.rectangle((left, top, right - 1, bottom - 1), outline="#d00080", width=2)
            draw.rectangle((left, top, left + 29, top + 15), fill="#d00080")
            draw.text((left + 2, top + 1), str(index), fill="white")
        sheet = int(path.stem.rsplit("-", 1)[-1])
        overlay.save(output / f"sheet-{sheet:02d}-regions.png")
        if review:
            groups, discarded = reviewed_groups(image, groups, corrections[str(sheet)])
            rejected.extend({"source": path.name, **entry} for entry in discarded)
        if export:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            for group in groups:
                category = group["category"]
                name = f"{category}-s{sheet:02d}-{group['key']}.png"
                relative = f"{category}/{name}"
                target = export / relative
                if target.exists():
                    raise FileExistsError(target)
                target.parent.mkdir(parents=True, exist_ok=True)
                sticker = cutout(image, group)
                sticker.save(target, optimize=True)
                metadata[relative] = {"title": group.get("name") or f"{categories[category]} {sheet:02d}-{group['key']}", "category": category, "width": sticker.width, "height": sticker.height, "source": path.name, "sourceSha256": digest, "sourceBox": group["export_box"]}
        contact = Image.new("RGB", (1200, ((len(groups) + 7) // 8) * 170), "#e7e3dc")
        contact_draw = ImageDraw.Draw(contact)
        for index, group in enumerate(groups):
            sticker = cutout(image, group)
            sticker.thumbnail((140, 140), Image.Resampling.LANCZOS)
            left = (index % 8) * 150
            top = (index // 8) * 170
            contact.paste(sticker, (left + (150 - sticker.width) // 2, top + (145 - sticker.height) // 2), sticker)
            contact_draw.text((left + 5, top + 148), f"{group.get('key', index + 1)}: {group['box'][2] - group['box'][0]}x{group['box'][3] - group['box'][1]}", fill="#34392f")
        contact.save(output / f"sheet-{sheet:02d}-cutouts.png")
        report.append({"source": path.name, "sheet": sheet, "count": len(groups), "regions": [{"box": group["box"], "area": group["area"]} for group in groups]})
        print(json.dumps({"sheet": sheet, "count": len(groups), "largest": sorted([group["area"] for group in groups], reverse=True)[:5]}), flush=True)
    (output / "regions.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if export:
        (output / "sticker-manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (output / "rejected.json").write_text(json.dumps(rejected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"exported": len(metadata), "categories": {key:sum(entry["category"] == key for entry in metadata.values()) for key in categories}, "rejected": len(rejected)}), flush=True)


def group_mask(image, group):
    mask = Image.new("L", image.size)
    draw = ImageDraw.Draw(mask)
    for row, left, right in group["runs"]:
        draw.line((left, row, right - 1, row), fill=255)
    return np.asarray(mask) > 0


def from_mask(mask):
    rows, columns = np.nonzero(mask)
    if not len(rows):
        return None
    left, right = int(columns.min()), int(columns.max()) + 1
    top, bottom = int(rows.min()), int(rows.max()) + 1
    runs = []
    for row in range(top, bottom):
        changes = np.diff(np.pad(mask[row].astype(np.int8), (1, 1)))
        runs.extend((row, int(start), int(end)) for start, end in zip(np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)))
    return {"box":[left, top, right, bottom], "area":len(rows), "runs":runs}


def reviewed_groups(image, groups, review):
    pixels = np.asarray(image)
    spread = pixels.max(axis=2).astype(int) - pixels.min(axis=2).astype(int)
    deep = ((spread > 28) & (pixels.min(axis=2) < 210)) | (pixels.min(axis=2) < 125)
    ignored = set(review.get("skip", []))
    joined = {}
    for members in review.get("join", []):
        mask = np.zeros((image.height, image.width), dtype=bool)
        for member in members:
            mask |= group_mask(image, groups[member - 1])
        joined[members[0]] = from_mask(mask)
        ignored.update(members[1:])
    accepted, rejected = [], []
    for index, original in enumerate(groups, 1):
        if index in ignored:
            rejected.append({"region":index,"reason":"reviewed-shadow-or-joined"})
            continue
        original = joined.get(index, original)
        category = review.get("overrides", {}).get(str(index), review["category"])
        split = review.get("split", {}).get(str(index))
        pieces = []
        if split:
            original_mask = group_mask(image, original)
            remainder = original_mask.copy()
            masks = []
            for part in split["parts"]:
                selection = Image.new("L", image.size)
                draw = ImageDraw.Draw(selection)
                if "box" in part:
                    left, top, right, bottom = part["box"]
                    draw.rectangle((left, top, right - 1, bottom - 1), fill=255)
                else:
                    draw.polygon([tuple(point) for point in part["polygon"]], fill=255)
                mask = remainder & (np.asarray(selection) > 0)
                remainder &= ~mask
                masks.append((mask, part))
            masks.append((remainder, {"name":split["rest"],"category":split.get("category", category)}))
            for part_index, (mask, details) in enumerate(masks, 1):
                piece = from_mask(mask)
                if not piece:
                    rejected.append({"region":index,"part":part_index,"reason":"empty-reviewed-part"})
                    continue
                adjacent = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
                damaged = int(np.count_nonzero(adjacent & original_mask & ~mask & deep))
                if damaged > 3:
                    rejected.append({"region":index,"part":part_index,"reason":"boundary-crosses-artwork","pixels":damaged})
                    continue
                pieces.append({**piece, "category":details.get("category", category), "name":details["name"], "key":f"{index:03d}-{part_index}"})
        else:
            pieces.append({**original, "category":category, "key":f"{index:03d}"})
        for piece in pieces:
            left, top, right, bottom = piece["box"]
            mask = group_mask(image, piece)
            if piece["key"] in review.get("drop", []):
                rejected.append({"region":piece["key"],"reason":"visual-review-incomplete-edge"})
            elif max(right - left, bottom - top) < 48 or np.count_nonzero(mask & deep) < 24:
                rejected.append({"region":piece["key"],"reason":"insufficient-source-detail"})
            elif left == 0 or top == 0 or right == image.width or bottom == image.height:
                rejected.append({"region":piece["key"],"reason":"source-already-clipped"})
            else:
                accepted.append(piece)
    return accepted, rejected


def encloses(parent, child):
    left, top, right, bottom = parent["box"]
    child_left, child_top, child_right, child_bottom = child["box"]
    if not (left <= child_left and top <= child_top and right >= child_right and bottom >= child_bottom):
        return False
    if "filled" not in parent:
        mask = Image.new("L", (right - left + 2, bottom - top + 2))
        draw = ImageDraw.Draw(mask)
        for row, start, end in parent["runs"]:
            draw.line((start - left + 1, row - top + 1, end - left, row - top + 1), fill=255)
        ImageDraw.floodfill(mask, (0, 0), 128)
        parent["filled"] = np.asarray(mask) != 128
    return all(parent["filled"][row - top + 1, start - left + 1:end - left + 1].all() for row, start, end in child["runs"])


def cutout(image, group):
    left, top, right, bottom = group["box"]
    padding = 8
    box = (max(0, left - padding), max(0, top - padding), min(image.width, right + padding), min(image.height, bottom + padding))
    group["export_box"] = list(box)
    mask = Image.new("L", (box[2] - box[0] + 2, box[3] - box[1] + 2))
    draw = ImageDraw.Draw(mask)
    for row, start, end in group["runs"]:
        draw.line((start - box[0] + 1, row - box[1] + 1, end - box[0], row - box[1] + 1), fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(5))
    ImageDraw.floodfill(mask, (0, 0), 128)
    alpha = Image.fromarray(np.where(np.asarray(mask) == 128, 0, 255).astype(np.uint8)).crop((1, 1, mask.width - 1, mask.height - 1))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.45))
    sticker = image.crop(box).convert("RGBA")
    sticker.putalpha(alpha)
    return sticker


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--threshold", type=int, default=205)
    parser.add_argument("--core", action="store_true")
    parser.add_argument("--review", type=Path)
    parser.add_argument("--export", type=Path)
    arguments = parser.parse_args()
    analyze(arguments.source, arguments.output, arguments.threshold, arguments.core, arguments.review, arguments.export)
