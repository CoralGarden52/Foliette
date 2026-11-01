const finite = value => Number.isFinite(value) && Math.abs(value) <= 100_000;
const positive = value => finite(value) && value > 0;
const color = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const points = (value, limit) => Array.isArray(value) && value.length > 0 && value.length <= limit && value.every(point => point && Object.keys(point).every(key => ["x", "y"].includes(key)) && finite(point.x) && finite(point.y));
export function validJournalItem(item) {
  const common = ["id", "kind", "x", "y", "w", "h", "rot", "z", "opacity", "sourceW", "sourceH", "color"];
  const fields = item.kind === "tape" ? ["pattern", "accentColor", "crop", "edge", "edgeSize"] : ["brush", "size", "points", "erasures"];
  if (!Object.keys(item).every(key => [...common, ...fields].includes(key))) return false;
  if (!positive(item.sourceW) || !positive(item.sourceH) || !color(item.color)) return false;
  if (item.kind === "tape") {
    if (!["solid", "stripe", "grid", "dot", "flower"].includes(item.pattern) || !color(item.accentColor)) return false;
    if (!["straight", "wave", "zigzag", "stamp", "torn"].includes(item.edge) || !positive(item.edgeSize) || item.edgeSize > 30) return false;
    const crop = item.crop;
    return crop === undefined || crop !== null && Object.keys(crop).every(key => ["x", "y", "w", "h"].includes(key)) && finite(crop.x) && finite(crop.y) && crop.x >= 0 && crop.y >= 0 && positive(crop.w) && positive(crop.h) && crop.x + crop.w <= item.sourceW + .0001 && crop.y + crop.h <= item.sourceH + .0001;
  }
  if (!["pen", "marker", "highlighter", "rainbow"].includes(item.brush) || !positive(item.size) || item.size > 60 || !points(item.points, 2048) || !Array.isArray(item.erasures)) return false;
  let count = 0;
  return item.erasures.every(erasure => {
    if (!erasure || !Object.keys(erasure).every(key => ["points", "size", "scaleY"].includes(key)) || !points(erasure.points, 4096) || !positive(erasure.size) || !positive(erasure.scaleY)) return false;
    count += erasure.points.length;
    return count <= 4096;
  });
}
