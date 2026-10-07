import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { sharePublicLink } from "../src/lib/share.web.ts";

function globalValue(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

test("public sharing invokes the browser immediately with only the public URL", async (t) => {
  let payload: unknown;
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    share: (data: unknown) => {
      payload = data;
      return Promise.resolve();
    },
  });
  const pending = sharePublicLink("https://demo.example/q/public-token");
  assert.deepEqual(payload, {
    title: "Emergency QR",
    url: "https://demo.example/q/public-token",
  });
  assert.equal(await pending, "shared");
});

test("cancelling a share sheet does not secretly copy anything", async (t) => {
  let copied = false;
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    share: async () => {
      const e = new Error("Cancelled");
      e.name = "AbortError";
      throw e;
    },
    clipboard: {
      writeText: async () => {
        copied = true;
      },
    },
  });
  assert.equal(
    await sharePublicLink("https://demo.example/q/public-token"),
    "cancelled",
  );
  assert.equal(copied, false);
});

test("unsupported web share falls back to clipboard within the gesture", async (t) => {
  let copied = "";
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    clipboard: {
      writeText: (value: string) => {
        copied = value;
        return Promise.resolve();
      },
    },
  });
  const pending = sharePublicLink("https://demo.example/q/public-token");
  assert.equal(copied, "https://demo.example/q/public-token");
  assert.equal(await pending, "copied");
});

test("share failure requests a manual action instead of reporting success", async (t) => {
  globalValue(t, "isSecureContext", true);
  globalValue(t, "navigator", {
    share: async () => {
      throw new Error("Denied");
    },
  });
  assert.equal(
    await sharePublicLink("https://demo.example/q/public-token"),
    "manual",
  );
});
