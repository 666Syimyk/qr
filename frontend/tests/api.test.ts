import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, createApiClient } from "../src/lib/api.ts";
import type {
  CardInput,
  CreateResult,
  OwnerResult,
  PublicCard,
} from "../src/types/contracts.ts";

const input: CardInput = {
  displayName: "Демо-владелец",
  emergencyContact: {
    name: "Демо-контакт",
    relationship: "Родственник",
    phone: "+999000000001",
  },
  importantInfo: "ДЕМОНСТРАЦИЯ. Вымышленные сведения.",
  publishImportantInfo: false,
  consentToPublish: true,
};
const ownerToken = "a".repeat(43);
const publicToken = "b".repeat(43);
const owner: OwnerResult = {
  card: {
    ...input,
    id: "demo-id",
    publicToken,
    status: "active",
    consentAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    photoDataUrl: null,
  },
  publicUrl: `https://demo.example/q/${publicToken}`,
};
const created: CreateResult = { ...owner, ownerToken };
const publicCard: PublicCard = {
  displayName: input.displayName,
  emergencyContact: input.emergencyContact,
  importantInfo: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
  photoDataUrl: null,
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("all methods use exact contract paths, JSON bodies and authorization only for owner routes", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const replies = [
    json(created, 201),
    json(owner),
    json(owner),
    json(owner),
    json(owner),
    new Response(null, { status: 204 }),
    json(publicCard),
  ];
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1/",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return replies.shift()!;
    },
  });
  assert.deepEqual(await api.createCard(input), created);
  assert.deepEqual(await api.getOwnerCard(ownerToken), owner);
  assert.deepEqual(await api.replaceCard(ownerToken, input), owner);
  await api.setStatus(ownerToken, "inactive");
  await api.rotateQr(ownerToken);
  assert.equal(await api.deleteCard(ownerToken), undefined);
  assert.deepEqual(await api.getPublicCard(publicToken), publicCard);
  assert.deepEqual(
    calls.map(({ url, init }) => [url, init?.method]),
    [
      ["https://demo.example/api/v1/cards", "POST"],
      ["https://demo.example/api/v1/me/card", "GET"],
      ["https://demo.example/api/v1/me/card", "PUT"],
      ["https://demo.example/api/v1/me/card/status", "PATCH"],
      ["https://demo.example/api/v1/me/card/rotate-qr", "POST"],
      ["https://demo.example/api/v1/me/card", "DELETE"],
      [`https://demo.example/api/v1/public/cards/${publicToken}`, "GET"],
    ],
  );
  for (const [index, call] of calls.entries()) {
    assert.equal(
      new Headers(call.init?.headers).get("Authorization"),
      index > 0 && index < 6 ? `Bearer ${ownerToken}` : null,
    );
    assert.equal(call.url.includes(ownerToken), false);
    assert.equal(call.init?.cache, "no-store");
    assert.equal(call.init?.credentials, "omit");
    assert.ok(call.init?.signal instanceof AbortSignal);
  }
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), input);
  assert.deepEqual(JSON.parse(calls[2].init?.body as string), input);
  assert.equal(calls[3].init?.body, '{"status":"inactive"}');
  assert.equal(calls[4].init?.body, "{}");
  assert.equal(calls[1].init?.body, undefined);
  assert.equal(calls[5].init?.body, undefined);
});

test("validation responses retain typed code, status and field errors", async () => {
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () =>
      json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Проверьте поля",
            fieldErrors: { "emergencyContact.phone": "Неверный формат" },
          },
        },
        400,
      ),
  });
  await assert.rejects(api.createCard(input), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.deepEqual(error.fieldErrors, {
      "emergencyContact.phone": "Неверный формат",
    });
    return true;
  });
});

test("only owner 401 invokes cleanup with the rejected key, including non-JSON 401", async () => {
  const rejected: string[] = [];
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    onUnauthorized: async (token) => {
      rejected.push(token);
    },
    fetchImpl: async () => new Response("not JSON", { status: 401 }),
  });
  await assert.rejects(api.getOwnerCard(ownerToken), {
    code: "UNAUTHORIZED",
    status: 401,
  });
  await assert.rejects(api.getPublicCard(publicToken));
  await assert.rejects(api.createCard(input));
  assert.deepEqual(rejected, [ownerToken]);
});

test("404, rate limit and server errors remain distinguishable", async () => {
  for (const [status, code] of [
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "INTERNAL_ERROR"],
  ] as const) {
    const api = createApiClient({
      baseUrl: "https://demo.example/api/v1",
      fetchImpl: async () =>
        json({ error: { code, message: "Ошибка запроса" } }, status),
    });
    await assert.rejects(api.getPublicCard(publicToken), { status, code });
  }
});

test("unreachable fetch becomes a safe network error without underlying sensitive details", async () => {
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () => {
      throw new Error(`secret ${ownerToken}`);
    },
  });
  await assert.rejects(api.getOwnerCard(ownerToken), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.equal(error.message.includes(ownerToken), false);
    return true;
  });
});

test("public 404 always shows the same neutral unavailable message", async () => {
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () =>
      json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404),
  });
  await assert.rejects(api.getPublicCard(publicToken), {
    code: "NOT_FOUND",
    status: 404,
    message: "Карточка недоступна: ссылка может быть отключена или заменена.",
  });
});

test("request timeout aborts a stalled fetch and is distinct from a network failure", async () => {
  let signal: AbortSignal | undefined;
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    timeoutMs: 10,
    fetchImpl: async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    },
  });
  await assert.rejects(api.getPublicCard(publicToken), { code: "TIMEOUT" });
  assert.equal(signal?.aborted, true);
});

test("successful HTML or malformed JSON is rejected rather than used as card data", async () => {
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () => new Response("<html>wrong server</html>"),
  });
  await assert.rejects(api.getOwnerCard(ownerToken), {
    code: "INVALID_RESPONSE",
  });
});

test("a JSON success with missing card fields cannot become a false successful operation", async () => {
  for (const response of [
    null,
    {},
    { card: null, publicUrl: "https://demo.example/q/demo" },
  ]) {
    const api = createApiClient({
      baseUrl: "https://demo.example/api/v1",
      fetchImpl: async () => json(response),
    });
    await assert.rejects(api.getOwnerCard(ownerToken), {
      code: "INVALID_RESPONSE",
    });
  }
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () => json(owner, 201),
  });
  await assert.rejects(api.createCard(input), { code: "INVALID_RESPONSE" });
});

test("an unexpected 204 cannot be treated as an existing public card", async () => {
  const api = createApiClient({
    baseUrl: "https://demo.example/api/v1",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  await assert.rejects(api.getPublicCard(publicToken), {
    code: "INVALID_RESPONSE",
  });
});

test("missing, credential-bearing and non-API base URLs fail on request without sending data", async () => {
  for (const baseUrl of [
    "",
    "not a url",
    "https://secret@example.test/api/v1",
    "https://example.test",
    "ftp://example.test/api/v1",
    "https://example.test/api/v1?key=secret",
  ]) {
    let fetched = false;
    let api: ReturnType<typeof createApiClient>;
    assert.doesNotThrow(() => {
      api = createApiClient({
        baseUrl,
        fetchImpl: async () => {
          fetched = true;
          return json(owner);
        },
      });
    });
    await assert.rejects(api!.getOwnerCard(ownerToken), {
      code: "CONFIG_ERROR",
    });
    assert.equal(fetched, false);
  }
});
