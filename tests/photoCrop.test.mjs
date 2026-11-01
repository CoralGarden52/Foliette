import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "../web/node_modules/typescript/lib/typescript.js";
import { validItems } from "../server/src/validation.js";

const photo = { id: "crop-test", kind: "photo", src: "/uploads/test.png", x: 0, y: 0, w: 400, h: 300, rot: 20, z: 1, opacity: 1, frame: "polaroid", aspectRatio: 4 / 3 };
const triangle = [{ x: .1, y: .1 }, { x: .9, y: .2 }, { x: .4, y: .8 }];

async function geometry() {
  const path = new URL("../web/src/lib/photoCrop.ts", import.meta.url);
  assert.ok(existsSync(path), "自由裁剪坐标与路径处理尚未实现");
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

test("old photos and valid normalized crop paths can be saved", () => {
  assert.equal(validItems([photo]), true);
  assert.equal(validItems([{ ...photo, cropPath: triangle }]), true);
});

test("saving rejects malformed, unbounded and degenerate crop paths", () => {
  for (const cropPath of [null, [], triangle.slice(0, 2), [{ x: -.1, y: .1 }, ...triangle], [{ x: NaN, y: .1 }, ...triangle], [{ x: 1.01, y: .1 }, ...triangle], [{ x: .1, y: .1, extra: true }, ...triangle], Array.from({ length: 1025 }, (_, i) => triangle[i % 3]), [{ x: .1, y: .1 }, { x: .2, y: .2 }, { x: .3, y: .3 }]]) {
    assert.equal(validItems([{ ...photo, cropPath }]), false, `invalid path accepted: ${JSON.stringify(cropPath)?.slice(0, 120)}`);
  }
});

test("crop paths cannot be attached to non-photo elements", () => {
  assert.equal(validItems([{ id: "s", kind: "sticker", x: 0, y: 0, w: 20, h: 20, rot: 0, z: 1, cropPath: triangle }]), false);
});

test("pointer coordinates account for horizontal and vertical image letterboxing", async () => {
  const { photoCropPoint } = await geometry();
  const box = { left: 10, top: 20, width: 400, height: 400 };
  assert.deepEqual(photoCropPoint(210, 220, box, 2), { x: .5, y: .5 });
  assert.deepEqual(photoCropPoint(10, 120, box, 2), { x: 0, y: 0 });
  assert.equal(photoCropPoint(210, 40, box, 2), null);
  assert.deepEqual(photoCropPoint(210, 40, box, 2, true), { x: .5, y: 0 });
  assert.deepEqual(photoCropPoint(110, 20, box, .5), { x: 0, y: 0 });
  assert.equal(photoCropPoint(20, 220, box, .5), null);
  assert.equal(photoCropPoint(0, 0, { ...box, width: 0 }, 2), null);
});

test("a freehand loop closes, simplifies and keeps its shape without mutating input", async () => {
  const { finishPhotoCrop, cropPathData } = await geometry();
  const points = [{ x: .1, y: .1 }, { x: .3, y: .1 }, { x: .5, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }, { x: .1, y: .1 }];
  const original = structuredClone(points);
  const result = finishPhotoCrop(points);
  assert.equal(result.length, 4);
  assert.deepEqual(points, original);
  assert.match(cropPathData(result, 2), /^M/);
  assert.match(cropPathData(result, 2), /Z$/);
  assert.match(cropPathData(result, 2), /0\.2 0\.1/);
  assert.equal(validItems([{ ...photo, cropPath: result }]), true);
  assert.equal(finishPhotoCrop([{ x: .1, y: .1 }, { x: .2, y: .2 }]), null);
  assert.equal(finishPhotoCrop([{ x: .1, y: .1 }, { x: .2, y: .2 }, { x: .3, y: .3 }]), null);
});

test("long curved gestures stay bounded and retain the curved region", async () => {
  const { finishPhotoCrop } = await geometry();
  const circle = Array.from({ length: 4096 }, (_, index) => ({ x: .5 + .4 * Math.cos(index / 4095 * Math.PI * 2), y: .5 + .4 * Math.sin(index / 4095 * Math.PI * 2) }));
  const result = finishPhotoCrop(circle);
  assert.ok(result.length > 12 && result.length <= 1024);
  assert.equal(validItems([{ ...photo, cropPath: result }]), true);
  assert.ok(result.every(point => Math.abs(Math.hypot(point.x - .5, point.y - .5) - .4) < .001));
});
