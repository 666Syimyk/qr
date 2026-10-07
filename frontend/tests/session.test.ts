import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/lib/api.ts";
import { SessionController } from "../src/lib/session-core.ts";
import type { TokenStorage } from "../src/lib/session-core.ts";

const firstToken = "c".repeat(43);
const secondToken = "d".repeat(43);
function memoryStorage(initial: string | null = null): TokenStorage {
  let saved = initial;
  return {
    loadToken: async () => saved,
    saveToken: async (token) => {
      saved = token;
    },
    clearToken: async () => {
      saved = null;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

test("saved native token is loaded on startup and logout removes memory and stored key", async () => {
  const storage = memoryStorage(firstToken);
  const session = new SessionController(storage);
  assert.equal(session.getSnapshot().ready, false);
  await session.hydrate();
  assert.equal(session.getSnapshot().token, firstToken);
  assert.equal(session.getSnapshot().ready, true);
  await session.logout();
  assert.equal(session.getSnapshot().token, null);
  assert.equal(await storage.loadToken(), null);
});

test("owner 401 removes memory and stored key through actual API client callback", async () => {
  const storage = memoryStorage();
  const session = new SessionController(storage);
  await session.saveToken(firstToken);
  assert.equal(session.getSnapshot().token, firstToken);
  assert.equal(await storage.loadToken(), firstToken);
  const revision = session.getSnapshot().revision;
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    onUnauthorized: (token) => session.handleUnauthorized(token, revision),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Ключ не принят" },
        }),
        { status: 401 },
      ),
  });
  await assert.rejects(api.getOwnerCard(firstToken), { code: "UNAUTHORIZED" });
  assert.equal(session.getSnapshot().token, null);
  assert.equal(await storage.loadToken(), null);
});

test("failed SecureStore save retains current key and reports manual-save warning", async () => {
  const session = new SessionController({
    ...memoryStorage(),
    saveToken: async () => {
      throw new Error("secure storage locked");
    },
  });
  await session.saveToken(firstToken);
  assert.equal(session.getSnapshot().token, firstToken);
  assert.equal(session.getSnapshot().ready, true);
  assert.match(session.getSnapshot().storageWarning ?? "", /вручную/i);
});

test("failed SecureStore read still unlocks application with recovery guidance", async () => {
  const session = new SessionController({
    ...memoryStorage(),
    loadToken: async () => {
      throw new Error("unavailable");
    },
  });
  await session.hydrate();
  assert.equal(session.getSnapshot().ready, true);
  assert.equal(session.getSnapshot().token, null);
  assert.ok(session.getSnapshot().storageWarning);
});

test("failed storage deletion never leaves active key and warns that device copy may remain", async () => {
  const session = new SessionController({
    ...memoryStorage(),
    clearToken: async () => {
      throw new Error("locked");
    },
  });
  await session.saveToken(firstToken);
  await session.logout();
  assert.equal(session.getSnapshot().token, null);
  assert.ok(session.getSnapshot().storageWarning);
});

test("late hydration cannot restore a key after logout", async () => {
  const read = deferred<string | null>();
  const storage = {
    ...memoryStorage(firstToken),
    loadToken: () => read.promise,
  };
  const session = new SessionController(storage);
  const loading = session.hydrate();
  const leaving = session.logout();
  read.resolve(firstToken);
  await Promise.all([loading, leaving]);
  assert.equal(session.getSnapshot().token, null);
  assert.equal(session.getSnapshot().ready, true);
});

test("logout waits behind an in-flight save so stale persistence cannot restore a session", async () => {
  const stored = memoryStorage();
  const saved = deferred<void>();
  const session = new SessionController({
    ...stored,
    saveToken: async (token) => {
      await saved.promise;
      await stored.saveToken(token);
    },
  });
  const saving = session.saveToken(firstToken);
  assert.equal(session.getSnapshot().token, firstToken);
  const leaving = session.logout();
  assert.equal(session.getSnapshot().token, null);
  saved.resolve();
  await Promise.all([saving, leaving]);
  assert.equal(await stored.loadToken(), null);
});

test("an old request 401 does not clear a more recently saved key", async () => {
  const storage = memoryStorage();
  const session = new SessionController(storage);
  await session.saveToken(firstToken);
  const oldRevision = session.getSnapshot().revision;
  await session.saveToken(secondToken);
  await session.handleUnauthorized(firstToken, oldRevision);
  assert.equal(session.getSnapshot().token, secondToken);
  assert.equal(await storage.loadToken(), secondToken);
});

test("even re-saving the same key makes an older request unauthorized callback stale", async () => {
  const session = new SessionController(memoryStorage());
  await session.saveToken(firstToken);
  const oldRevision = session.getSnapshot().revision;
  await session.saveToken(firstToken);
  await session.handleUnauthorized(firstToken, oldRevision);
  assert.equal(session.getSnapshot().token, firstToken);
});

test("storage failure from an older save does not replace current session state or warning", async () => {
  const failure = deferred<void>();
  const session = new SessionController({
    ...memoryStorage(),
    saveToken: async (token) => {
      if (token === firstToken) {
        await failure.promise;
        throw new Error("older failure");
      }
    },
  });
  const first = session.saveToken(firstToken);
  const second = session.saveToken(secondToken);
  failure.resolve();
  await Promise.all([first, second]);
  assert.equal(session.getSnapshot().token, secondToken);
  assert.equal(session.getSnapshot().storageWarning, null);
});
