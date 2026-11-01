export function validPhotoCrop(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 1024) return false;
  if (!points.every(point => point && Object.keys(point).every(key => key === "x" || key === "y") && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) return false;
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(twiceArea) / 2 > .0001;
}
