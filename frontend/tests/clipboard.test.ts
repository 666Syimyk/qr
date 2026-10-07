import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { copyText } from "../src/lib/clipboard.web.ts";

function globalValue(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

test("secure clipboard write starts synchronously in the user's gesture", async (t) => {
  let written = "";
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    clipboard: {
      writeText: (text: string) => {
        written = text;
        return Promise.resolve();
      },
    },
  });
  const result = copyText("public-link");
  assert.equal(written, "public-link");
  assert.equal(await result, true);
});

test("denied clipboard permission is reported as failure", async (t) => {
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  assert.equal(await copyText("private-value"), false);
});

for (const success of [true, false, "throws"] as const) {
  test(`HTTP fallback runs synchronously, reports ${success} and removes temporary secret text`, async (t) => {
    let copied = false;
    let selected = false;
    let removed = false;
    let restoredFocus = false;
    const field = {
      value: "",
      readOnly: false,
      style: {},
      setAttribute() {},
      focus() {},
      select() {
        selected = true;
      },
      setSelectionRange() {},
      remove() {
        removed = true;
      },
    };
    globalValue(t, "isSecureContext", false);
    globalValue(t, "navigator", {});
    globalValue(t, "document", {
      activeElement: {
        focus() {
          restoredFocus = true;
        },
      },
      body: { appendChild() {} },
      createElement() {
        return field;
      },
      execCommand(command: string) {
        assert.equal(command, "copy");
        assert.equal(field.value, "owner-key");
        assert.equal(selected, true);
        copied = true;
        if (success === "throws") throw new Error("Clipboard unavailable");
        return success;
      },
    });
    const result = copyText("owner-key");
    assert.equal(copied, true);
    assert.equal(removed, true);
    assert.equal(field.value, "");
    assert.equal(restoredFocus, true);
    assert.equal(await result, success === true);
  });
}
