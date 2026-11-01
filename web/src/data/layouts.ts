export const DESIGN_W = 1000;

export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export interface LayoutDef {
  id: string;
  name: string;
  tag: string;
  frame?: "plain" | "polaroid" | "tape" | "film" | "shadow";
  build: (count: number, height: number, photoAspects?: number[]) => Slot[];
}

function area(height: number) {
  const top = height * .035;
  return { x: 32, y: top, w: DESIGN_W - 64, h: height - top * 2 };
}

function gridSlots(count: number, height: number, options: { columns?: number; aspect?: number; tilt?: number; stagger?: boolean; fill?: boolean; gap?: number } = {}): Slot[] {
  if (!count) return [];
  const bounds = area(height);
  const aspect = options.aspect ?? .9;
  const gap = Math.min((options.gap ?? 22) * .75, height * .025);
  let columns = options.columns || 1;
  if (!options.columns) {
    let best = Infinity;
    for (let candidate = 1; candidate <= count; candidate += 1) {
      const rows = Math.ceil(count / candidate);
      const width = (bounds.w - gap * (candidate - 1)) / candidate;
      const cellHeight = (bounds.h - gap * (rows - 1)) / rows;
      const score = Math.abs(Math.log(width / cellHeight / aspect)) + (candidate * rows - count) / count * .35;
      if (score < best) { best = score; columns = candidate; }
    }
  }
  const rows = Math.ceil(count / columns);
  const cellHeight = (bounds.h - gap * (rows - 1)) / rows;
  let index = 0;
  return Array.from({ length: rows }, (_, row) => {
    const rowCount = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const cellWidth = (bounds.w - gap * (rowCount - 1)) / rowCount;
    return Array.from({ length: rowCount }, (_, column) => {
      const rot = options.tilt ? Math.sin(index * 2.7 + 1) * options.tilt : 0;
      index += 1;
      const width = options.fill === false ? Math.min(cellWidth, cellHeight * aspect) : cellWidth;
      const photoHeight = options.fill === false ? width / aspect : cellHeight;
      const radians = Math.abs(rot) * Math.PI / 180;
      const factor = Math.min(1, cellWidth / (width * Math.cos(radians) + photoHeight * Math.sin(radians)), cellHeight / (photoHeight * Math.cos(radians) + width * Math.sin(radians)));
      return {
        x: bounds.x + column * (cellWidth + gap) + (cellWidth - width * factor) / 2 + (options.stagger && row % 2 ? 8 : 0),
        y: bounds.y + row * (cellHeight + gap) + (cellHeight - photoHeight * factor) / 2,
        w: width * factor,
        h: photoHeight * factor,
        rot,
      };
    });
  }).flat();
}

function fullbleed(count: number, height: number): Slot[] {
  const bounds = area(height);
  const padding = Math.min(10, height * .02);
  return gridSlots(count, height, { aspect: 1.08, gap: 10 }).map((slot) => ({
    ...slot,
    x: padding + (slot.x - bounds.x) / bounds.w * (DESIGN_W - padding * 2),
    y: padding + (slot.y - bounds.y) / bounds.h * (height - padding * 2),
    w: slot.w / bounds.w * (DESIGN_W - padding * 2),
    h: slot.h / bounds.h * (height - padding * 2),
  }));
}

function insetGrid(count: number, bounds: { x: number; y: number; w: number; h: number }, aspect = 1.05): Slot[] {
  const virtualHeight = bounds.h / bounds.w * DESIGN_W;
  return gridSlots(count, virtualHeight, { aspect, gap: 30 }).map((slot) => ({
    ...slot,
    x: bounds.x + slot.x / DESIGN_W * bounds.w,
    y: bounds.y + slot.y / DESIGN_W * bounds.w,
    w: slot.w / DESIGN_W * bounds.w,
    h: slot.h / DESIGN_W * bounds.w,
  }));
}

function featured(count: number, height: number, side = false): Slot[] {
  if (count < 3) return gridSlots(count, height, { aspect: .92, tilt: side ? 1.5 : 0 });
  const bounds = area(height);
  const heroWidth = bounds.w * .49;
  const heroHeight = bounds.h;
  const hero: Slot = { x: bounds.x, y: bounds.y, w: heroWidth, h: heroHeight, rot: side ? -1.2 : 0 };
  const rest = insetGrid(count - 1, { x: bounds.x + heroWidth + 14, y: bounds.y + (side ? 28 : 0), w: bounds.w - heroWidth - 14, h: bounds.h }, .94);
  return [hero, ...rest.map((slot, index) => ({ ...slot, rot: side ? (index % 2 ? -1.1 : 1.4) : 0 }))];
}

function ring(count: number, height: number): Slot[] {
  if (count === 1 || count > 8) return gridSlots(count, height, { aspect: .95, tilt: 2 });
  const bounds = area(height);
  const width = Math.min(bounds.w, bounds.h) * (count < 5 ? .33 : .25);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return {
      x: DESIGN_W / 2 + Math.cos(angle) * bounds.w * .31 - width / 2,
      y: height / 2 + Math.sin(angle) * bounds.h * .3 - width / 2,
      w: width,
      h: width * 1.12,
      rot: Math.sin(angle) * 4,
    };
  });
}

function spread(count: number, height: number): Slot[] {
  return gridSlots(count, height, { aspect: .91, gap: 35, tilt: 4.4 }).map((slot, index) => ({
    ...slot,
    x: slot.x + Math.sin(index * 4.1) * Math.min(12, slot.w * .045),
    y: slot.y + Math.cos(index * 2.9) * Math.min(14, slot.h * .045),
  }));
}

function randomSlots(count: number, height: number, photoAspects?: number[]): Slot[] {
  if (!count) return [];
  const bounds = area(height);
  const validAspects = photoAspects?.filter((aspect) => Number.isFinite(aspect) && aspect > 0) || [];
  const averageAspect = validAspects.length ? Math.exp(validAspects.reduce((sum, aspect) => sum + Math.log(aspect), 0) / validAspects.length) : 1;
  const preferredAspect = averageAspect * (.65 + Math.random() * 1.3);
  let columns = 1;
  let bestScore = Infinity;
  for (let candidate = 1; candidate <= count; candidate += 1) {
    const rows = Math.ceil(count / candidate);
    const score = Math.abs(Math.log(bounds.w / candidate / (bounds.h / rows) / preferredAspect)) + (candidate * rows - count) / count * .3;
    if (score < bestScore) { bestScore = score; columns = candidate; }
  }
  const rows = Math.ceil(count / columns);
  const cellHeight = bounds.h / rows;
  const gapY = Math.min(18, cellHeight * .04);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  const slots: Slot[] = new Array(count);
  let photoIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const rowCount = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const cellWidth = bounds.w / rowCount;
    const gapX = Math.min(18, cellWidth * .04);
    for (let column = 0; column < rowCount; column += 1) {
      const index = order[photoIndex++];
      const sourceAspect = photoAspects?.[index];
      const aspect = sourceAspect && Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : (cellWidth - gapX) / (cellHeight - gapY) * (.75 + Math.random() * .5);
      const rot = (Math.random() - .5) * 38;
      const radians = Math.abs(rot) * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const photoHeight = Math.min((cellWidth - gapX) / (aspect * cosine + sine), (cellHeight - gapY) / (aspect * sine + cosine)) * (.94 + Math.random() * .06);
      const photoWidth = photoHeight * aspect;
      const rotatedWidth = photoWidth * cosine + photoHeight * sine;
      const rotatedHeight = photoWidth * sine + photoHeight * cosine;
      const centerX = bounds.x + (bounds.w - rowCount * cellWidth) / 2 + (column + .5) * cellWidth + (Math.random() - .5) * (cellWidth - rotatedWidth - gapX);
      const centerY = bounds.y + (row + .5) * cellHeight + (Math.random() - .5) * (cellHeight - rotatedHeight - gapY);
      slots[index] = { x: centerX - photoWidth / 2, y: centerY - photoHeight / 2, w: photoWidth, h: photoHeight, rot };
    }
  }
  return slots;
}

function diptych(count: number, height: number): Slot[] {
  if (count < 3) return gridSlots(count, height, { aspect: .78 });
  const bounds = area(height);
  const leftCount = Math.ceil(count / 2);
  const columnWidth = (bounds.w - 48) / 2;
  return [
    ...insetGrid(leftCount, { x: bounds.x - 15, y: bounds.y, w: columnWidth + 30, h: bounds.h }, .88),
    ...insetGrid(count - leftCount, { x: bounds.x + columnWidth + 33, y: bounds.y + 26, w: columnWidth + 30, h: bounds.h - 26 }, .88),
  ];
}

function story(count: number, height: number): Slot[] {
  if (count < 3) return featured(count, height);
  const bounds = area(height);
  const heroWidth = bounds.w;
  const heroHeight = bounds.h * .43;
  return [
    { x: (DESIGN_W - heroWidth) / 2, y: bounds.y, w: heroWidth, h: heroHeight, rot: -.8 },
    ...insetGrid(count - 1, { x: bounds.x - 30, y: bounds.y + heroHeight + 12, w: bounds.w + 60, h: bounds.h - heroHeight - 12 }, 1.1),
  ];
}

function masonry(count: number, height: number): Slot[] {
  if (count < 3) return gridSlots(count, height, { aspect: 1.15 });
  const bounds = area(height);
  const columns = count > 12 ? 4 : count > 5 ? 3 : 2;
  const gap = 22;
  const width = (bounds.w - gap * (columns - 1)) / columns;
  const output: Slot[] = [];
  for (let column = 0; column < columns; column += 1) {
    const rows = Math.floor(count / columns) + (column < count % columns ? 1 : 0);
    const weights = Array.from({ length: rows }, (_, row) => 1 + Math.sin(row * 2.1 + column * 1.7) * .28);
    const total = weights.reduce((sum, value) => sum + value, 0);
    let top = bounds.y;
    for (let row = 0; row < rows; row += 1) {
      const photoHeight = (bounds.h - gap * (rows - 1)) * weights[row] / total;
      output.push({ x: bounds.x + column * (width + gap), y: top, w: width, h: photoHeight, rot: 0 });
      top += photoHeight + gap;
    }
  }
  return output;
}

function windowView(count: number, height: number): Slot[] {
  if (count < 3 || count > 9) return gridSlots(count, height, { aspect: 1.16, gap: 35, stagger: true });
  const bounds = area(height);
  const sideCount = count - 1;
  const topCount = Math.ceil(sideCount / 2);
  const bottomCount = sideCount - topCount;
  const bandHeight = bounds.h * .2;
  const top = insetGrid(topCount, { x: bounds.x - 32, y: bounds.y - 20, w: bounds.w + 64, h: bandHeight + 40 }, 1.15);
  const bottom = insetGrid(bottomCount, { x: bounds.x - 32, y: bounds.y + bounds.h - bandHeight - 20, w: bounds.w + 64, h: bandHeight + 40 }, 1.15);
  return [{ x: bounds.x + bounds.w * .2, y: bounds.y + bounds.h * .28, w: bounds.w * .6, h: bounds.h * .45, rot: -.7 }, ...top, ...bottom];
}

const DEFINITIONS: LayoutDef[] = [
  { id: "polaroid", name: "日常拍立得", tag: "轻微错落 · 温柔留白", frame: "polaroid", build: (count, height) => gridSlots(count, height, { aspect: .88, tilt: 2.5, gap: 30 }) },
  { id: "magazine", name: "留白杂志", tag: "主次分明 · 编辑精选", frame: "plain", build: (count, height) => featured(count, height) },
  { id: "grid", name: "整齐相册", tag: "规整留白 · 安静耐看", frame: "polaroid", build: (count, height) => gridSlots(count, height, { aspect: 1.12, gap: 26 }) },
  { id: "fullbleed", name: "满版拼贴", tag: "自动铺满 · 随数量适配", frame: "plain", build: fullbleed },
  { id: "mosaic", name: "焦点拼贴", tag: "一张主角 · 层次分明", frame: "shadow", build: (count, height) => featured(count, height, true) },
  { id: "filmstrip", name: "胶片日记", tag: "电影片段 · 时光质感", frame: "film", build: (count, height) => gridSlots(count, height, { aspect: 1.25, gap: 28, tilt: .5 }) },
  { id: "circle", name: "环游小记", tag: "围绕中心 · 收藏心事", frame: "polaroid", build: ring },
  { id: "timeline", name: "旅行手记", tag: "一程一页 · 有序错落", frame: "tape", build: (count, height) => gridSlots(count, height, { aspect: 1.12, stagger: true, tilt: 1.4, gap: 42 }) },
  { id: "bento", name: "编辑精选", tag: "错落瀑布 · 自然呼吸", frame: "plain", build: masonry },
  { id: "staircase", name: "错落阶梯", tag: "轻盈节奏 · 纸片记忆", frame: "polaroid", build: (count, height) => gridSlots(count, height, { aspect: .9, gap: 34, tilt: 2 }).map((slot, index) => ({ ...slot, y: slot.y + index % 3 * 10 })) },
  { id: "window", name: "窗边来信", tag: "中间主图 · 细碎片段", frame: "tape", build: windowView },
  { id: "honeycomb", name: "错位相册", tag: "交错排列 · 松弛有序", frame: "shadow", build: (count, height) => gridSlots(count, height, { aspect: 1, gap: 35, stagger: true }) },
  { id: "scatter", name: "自由纸片", tag: "随手铺开 · 自然拼贴", frame: "polaroid", build: spread },
  { id: "duo", name: "双页故事", tag: "两列叙事 · 像翻开书", frame: "plain", build: diptych },
  { id: "storybook", name: "森林绘本", tag: "大幅风景 · 细节收藏", frame: "polaroid", build: story },
  { id: "random", name: "随机排布", tag: "每次不同 · 有序随性", frame: "polaroid", build: randomSlots },
];

function fitSlots(slots: Slot[], height: number, margin = Math.min(24, height * .04)): Slot[] {
  const bounds = slots.map((slot) => {
    const angle = slot.rot * Math.PI / 180;
    const width = Math.abs(slot.w * Math.cos(angle)) + Math.abs(slot.h * Math.sin(angle));
    const rotatedHeight = Math.abs(slot.w * Math.sin(angle)) + Math.abs(slot.h * Math.cos(angle));
    return { left: slot.x + (slot.w - width) / 2, top: slot.y + (slot.h - rotatedHeight) / 2, width, height: rotatedHeight };
  });
  const left = Math.min(0, ...bounds.map((bound) => bound.left - margin));
  const top = Math.min(0, ...bounds.map((bound) => bound.top - margin));
  const right = Math.max(DESIGN_W, ...bounds.map((bound) => bound.left + bound.width + margin));
  const bottom = Math.max(height, ...bounds.map((bound) => bound.top + bound.height + margin));
  const factor = Math.min(DESIGN_W / (right - left), height / (bottom - top));
  return slots.map((slot) => ({
    x: (slot.x - left) * factor + (DESIGN_W - (right - left) * factor) / 2,
    y: (slot.y - top) * factor + (height - (bottom - top) * factor) / 2,
    w: slot.w * factor,
    h: slot.h * factor,
    rot: slot.rot,
  }));
}

export const LAYOUTS: LayoutDef[] = DEFINITIONS.map((layout) => ({
  ...layout,
  build(count, height, photoAspects) {
    if (count <= 0) return [];
    const workingHeight = layout.id === "random" ? height : Math.max(650, height);
    const slots = layout.build(count, workingHeight, photoAspects).map((slot, index) => {
      const adapted = { ...slot, y: slot.y * height / workingHeight, h: slot.h * height / workingHeight };
      const aspect = photoAspects?.[index];
      if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return adapted;
      const photoHeight = Math.min(adapted.h, adapted.w / aspect);
      const photoWidth = photoHeight * aspect;
      return { ...adapted, x: adapted.x + (adapted.w - photoWidth) / 2, y: adapted.y + (adapted.h - photoHeight) / 2, w: photoWidth, h: photoHeight };
    });
    return fitSlots(slots, height, layout.id === "fullbleed" ? 0 : undefined);
  },
}));

export const LAYOUT_MAP: Record<string, LayoutDef> = Object.fromEntries(LAYOUTS.map((layout) => [layout.id, layout]));

export function getLayout(id: string): LayoutDef {
  return LAYOUT_MAP[id] ?? LAYOUTS[0];
}

export const RATIO_PRESETS = [
  { id: "1:1", w: 1, h: 1, label: "1:1 方形" },
  { id: "4:5", w: 4, h: 5, label: "4:5 竖版" },
  { id: "3:4", w: 3, h: 4, label: "3:4 竖版" },
  { id: "2:3", w: 2, h: 3, label: "2:3 竖版" },
  { id: "9:16", w: 9, h: 16, label: "9:16 全屏" },
  { id: "5:4", w: 5, h: 4, label: "5:4 横版" },
  { id: "4:3", w: 4, h: 3, label: "4:3 横版" },
  { id: "3:2", w: 3, h: 2, label: "3:2 横版" },
  { id: "16:9", w: 16, h: 9, label: "16:9 宽屏" },
  { id: "21:9", w: 21, h: 9, label: "21:9 电影" },
];
