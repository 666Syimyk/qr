import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { downloadQrPng } from "../src/lib/qr-export.web.ts";

function globalValue(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

test("QR export fails honestly if the displayed SVG is missing", async (t) => {
  globalValue(t, "document", { querySelector: () => null });
  await assert.rejects(downloadQrPng(), /QR unavailable/);
});

test("QR export renders the displayed SVG to a white PNG and releases temporary resources", async (t) => {
  const clone = { setAttribute() {} };
  const png = new Blob(["png-data"], { type: "image/png" });
  const sources: Blob[] = [];
  const revoked: string[] = [];
  let downloaded = false;
  let removed = false;
  let drawn = false;
  let filledWhite = false;
  const link = {
    href: "",
    download: "",
    click() {
      downloaded = true;
    },
    remove() {
      removed = true;
    },
  };
  const drawing = {
    fillStyle: "",
    imageSmoothingEnabled: true,
    fillRect() {
      filledWhite = drawing.fillStyle === "#ffffff";
    },
    drawImage() {
      drawn = true;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => drawing,
    toBlob(callback: (blob: Blob) => void, format: string) {
      assert.equal(format, "image/png");
      callback(png);
    },
  };
  globalValue(t, "document", {
    querySelector(selector: string) {
      assert.equal(selector, '[data-testid="owner-public-qr"]');
      return { tagName: "svg", cloneNode: () => clone };
    },
    createElement: (name: string) => (name === "canvas" ? canvas : link),
    body: { appendChild() {} },
  });
  globalValue(
    t,
    "XMLSerializer",
    class {
      serializeToString(element: unknown) {
        assert.equal(element, clone);
        return '<svg viewBox="-16 -16 288 288"><path d="M1 1h2"/></svg>';
      }
    },
  );
  globalValue(
    t,
    "Image",
    class {
      onload?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  globalValue(t, "URL", {
    createObjectURL(blob: Blob) {
      sources.push(blob);
      return `blob:qr-${sources.length}`;
    },
    revokeObjectURL(value: string) {
      revoked.push(value);
    },
  });
  globalValue(t, "setTimeout", (callback: () => void) => {
    callback();
    return 1;
  });
  await downloadQrPng();
  assert.equal(filledWhite, true);
  assert.equal(drawn, true);
  assert.equal(canvas.width, 1120);
  assert.equal(canvas.height, 1120);
  assert.equal(drawing.imageSmoothingEnabled, false);
  assert.equal(downloaded, true);
  assert.equal(link.download, "emergency-qr.png");
  assert.equal(link.href, "blob:qr-2");
  assert.equal(sources[0].type, "image/svg+xml;charset=utf-8");
  assert.match(await sources[0].text(), /viewBox="-16 -16 288 288"/);
  assert.equal(sources[1], png);
  assert.equal(removed, true);
  assert.deepEqual(revoked.sort(), ["blob:qr-1", "blob:qr-2"]);
});
