import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from extract_sticker_sheets import components


NAMES = ["今日便签", "星月云朵", "粉色蝴蝶结", "绿叶对话框", "花朵备注", "薰衣草长标签", "心形蝴蝶结", "雾蓝缎带", "花园云朵", "橄榄叶椭圆", "待办清单", "绿叶邮票", "粉色票根", "计划清单", "薰衣草花边", "格纹胶带纸", "记录一下", "鼠尾草蝴蝶结", "重要事项", "灵感便签", "雾蓝花朵对话框", "奶油圆角标签", "紫色爱心缎带", "橄榄绿吊牌", "粉色心意", "纸上小花", "樱桃花边", "雾蓝胶带便签", "蝴蝶结方格纸", "小熊便签", "鼠尾草花旗", "郁金香椭圆", "浅紫邮票", "奶油星云", "橄榄叶撕纸"]
BOXES = [
    [15,0,240,231],[243,18,523,223],[528,20,768,220],[773,25,998,208],[1003,12,1242,235],
    [4,237,292,364],[293,228,488,383],[489,240,762,352],[766,212,1004,381],[1006,242,1243,369],
    [15,370,241,592],[249,386,520,574],[522,397,801,563],[797,377,1028,580],[1028,370,1244,583],
    [11,601,282,728],[282,578,535,754],[536,572,788,754],[789,586,1027,754],[1033,582,1243,761],
    [9,734,273,891],[273,764,552,880],[551,768,825,873],[824,770,1048,888],[1054,756,1245,898],
    [17,886,251,1071],[253,878,514,1077],[513,875,732,1076],[735,902,989,1075],[994,885,1247,1077],
    [9,1079,252,1226],[253,1077,515,1240],[518,1078,756,1226],[752,1074,999,1228],[996,1071,1246,1243],
]
AREAS = [
    [.16,.44,.59,.40],[.20,.44,.60,.33],[.19,.42,.63,.42],[.18,.28,.58,.40],[.17,.43,.60,.43],
    [.25,.27,.57,.46],[.28,.37,.48,.37],[.16,.29,.68,.40],[.23,.29,.51,.43],[.19,.28,.58,.43],
    [.31,.36,.47,.43],[.27,.28,.48,.45],[.23,.29,.54,.43],[.27,.37,.55,.45],[.27,.32,.46,.38],
    [.29,.23,.46,.48],[.20,.47,.53,.33],[.24,.36,.51,.38],[.21,.48,.57,.29],[.20,.47,.57,.32],
    [.26,.32,.47,.36],[.27,.24,.54,.48],[.20,.28,.61,.42],[.25,.27,.50,.43],[.28,.36,.43,.33],
    [.30,.24,.58,.60],[.23,.35,.49,.37],[.15,.28,.55,.43],[.18,.22,.52,.60],[.14,.56,.70,.28],
    [.27,.25,.53,.45],[.37,.26,.41,.42],[.20,.30,.60,.40],[.23,.35,.55,.32],[.27,.35,.54,.44],
]
GUIDES = {1:[110,141,172],2:[128,161],3:[126,157],5:[111,141,169,199],11:[468,500,532],14:[472,503,533],17:[662,691],19:[680,711],20:[670,700],26:[943,974,1004,1035],27:[980,1009],30:[995,1026],35:[1138,1169,1199]}
EXTENSION_BANDS = [
    (116,8),(116,10),(115,10),(65,10),(114,8),(30,8),(83,8),
    (52,8),(82,12),(45,10),(76,6),(90,2),(60,8),(80,10),
    (58,10),(28,10),(74,8),(75,10),(83,8),(99,8),(31,4),
    (30,3),(29,10),(28,8),(93,5),(66,8),(85,10),(71,10),
    (75,2),(115,10),(68,8),(35,4),(67,5),(43,8),(108,10),
]
FIXED_ART = {
    9: [(24,47),(42,49),(54,66),(53,97),(48,118),(28,119),(24,111),(11,109),(5,95),(5,75),(12,58)],
    16: [(33,3),(67,0),(69,4),(63,114),(62,120),(19,121),(22,102),(28,8)],
}


def separate_fixed_art(background, index):
    mask = Image.new("L", background.size)
    ImageDraw.Draw(mask).polygon(FIXED_ART[index], fill=255)
    selected = np.asarray(mask) > 0
    original = np.asarray(background)
    paper = original.copy()
    if index == 9:
        paper[selected] = np.broadcast_to(original[80, ::-1], original.shape)[selected]
    else:
        paper[selected] = np.broadcast_to(original[:, 100:101], original.shape)[selected]
    paper[:,:,3] = np.minimum(paper[:,:,3], original[:,:,3])
    decoration = original.copy()
    decoration[:,:,3] = np.where(selected, original[:,:,3], 0)
    return Image.fromarray(paper), Image.fromarray(decoration)


def build(source, destination, registry, replace=False):
    original = Image.open(source).convert("RGB")
    if original.size != (1254, 1254):
        raise ValueError("Expected the reviewed 1254x1254 reference sheet")
    destination.mkdir(parents=True, exist_ok=True)
    templates = []
    for index, (name, box, area) in enumerate(zip(NAMES, BOXES, AREAS), 1):
        identifier = f"note-{index:02d}"
        target = destination / f"{identifier}.png"
        if target.exists() and not replace:
            raise FileExistsError(target)
        crop = original.crop(box)
        pixels = np.asarray(crop)
        mask = Image.fromarray((pixels.min(axis=2) < 246).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))
        padded = Image.new("L", (crop.width + 2, crop.height + 2))
        padded.paste(mask, (1, 1))
        ImageDraw.floodfill(padded, (0, 0), 128)
        alpha = Image.fromarray(np.where(np.asarray(padded) == 128, 0, 255).astype(np.uint8)).crop((1, 1, crop.width + 1, crop.height + 1)).filter(ImageFilter.GaussianBlur(.35))
        alpha_pixels = np.asarray(alpha)
        primary = max(components(alpha_pixels > 0), key=lambda group: group["area"])
        isolated = np.zeros_like(alpha_pixels)
        for row, start, end in primary["runs"]:
            isolated[row, start:end] = alpha_pixels[row, start:end]
        if index == 25:
            isolated[130:, :55] = 0
            isolated[137:, :82] = 0
        alpha = Image.fromarray(isolated)
        preview = crop.convert("RGBA")
        preview.putalpha(alpha)
        preview.save(destination / f"{identifier}-preview.png", optimize=True)
        cleaned = np.asarray(crop).copy()
        area_x, area_y, area_w, area_h = [round(value * dimension) for value, dimension in zip(area, [crop.width, crop.height, crop.width, crop.height])]
        for source_y in GUIDES.get(index, []):
            row = source_y - box[1]
            left = area_x
            right = min(crop.width - 1, area_x + area_w)
            if index == 11:
                left, right = 73, 181 if row < 150 else 160
            if index == 14:
                left, right = 59, 196 if row < 145 else 175
            radius = 4 if index in (11,14) else 2
            if 6 <= row < crop.height - 6:
                replacement = ((cleaned[row - 6, left:right].astype(float) + cleaned[row + 6, left:right].astype(float)) / 2).astype(np.uint8)
                cleaned[row - radius:row + radius + 1, left:right] = replacement
        if index in (11, 14):
            centers = [98,130,162] if index == 11 else [92,123,154]
            left, right, sample = (49,74,44) if index == 11 else (29,51,24)
            for center in centers:
                for row in range(center - 12, center + 12):
                    cleaned[row, left:right] = cleaned[row, sample]
            regions = [(43,81,186,140),(43,140,158,186)] if index == 11 else [(28,78,201,137),(28,137,174,174)]
            sample = 44 if index == 11 else 25
            for left, top, right, bottom in regions:
                for row in range(top, bottom):
                    cleaned[row,left:right] = pixels[row,sample]
        if index == 14:
            cleaned[120:190,178:222] = pixels[120:190,178:222]
        background = Image.fromarray(cleaned).convert("RGBA")
        background.putalpha(alpha)
        if index in FIXED_ART:
            background, decoration = separate_fixed_art(background, index)
            decoration.save(destination / f"{identifier}-decor.png", optimize=True)
        background.save(target, optimize=True)
        strip_y, strip_height = EXTENSION_BANDS[index - 1]
        background.crop((0,strip_y,crop.width,strip_y + strip_height)).save(destination / f"{identifier}-strip.png", optimize=True)
        templates.append({"id":identifier,"name":name,"width":crop.width,"height":crop.height,"area":{"x":area_x,"y":area_y,"w":area_w,"h":area_h},"stripY":strip_y,"stripHeight":strip_height,"fixedArt":index in FIXED_ART,"list":"square" if index == 11 else "circle" if index == 14 else None,"ruled":index in GUIDES,"rows":3 if index in (11,14) else 1,"sourceBox":box})
    registry.write_text(json.dumps(templates,ensure_ascii=False,indent=2) + "\n",encoding="utf-8")
    print(json.dumps({"templates":len(templates),"sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),"images":len(list(destination.glob('*.png')))}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source",type=Path)
    parser.add_argument("destination",type=Path)
    parser.add_argument("registry",type=Path)
    parser.add_argument("--replace",action="store_true")
    options = parser.parse_args()
    build(options.source,options.destination,options.registry,options.replace)
