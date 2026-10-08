interface CardInput {
  displayName: string;
  emergencyContact: { name: string; relationship: string; phone: string };
  importantInfo: string | null;
  publishImportantInfo: boolean;
  consentToPublish: true;
}

interface CardRow {
  id: string;
  public_token: string;
  owner_token_hash: string;
  display_name: string;
  contact_name: string;
  contact_relationship: string;
  contact_phone: string;
  important_info: string | null;
  publish_important_info: number;
  status: "active" | "inactive";
  consent_at: string;
  created_at: string;
  updated_at: string;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
}

interface Env {
  DB: { prepare(query: string): D1Statement };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const rateWindows = new Map<string, { startedAt: number; count: number }>();
const ownerColumns = `id, public_token, owner_token_hash, display_name, contact_name,
  contact_relationship, contact_phone, important_info, publish_important_info,
  status, consent_at, created_at, updated_at`;

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  const result = new Headers(headers);
  result.set("Content-Type", "application/json; charset=utf-8");
  result.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(value), { status, headers: result });
}

function failure(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
  return json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } }, status);
}

function cardFromRow(row: CardRow) {
  return {
    id: row.id,
    publicToken: row.public_token,
    status: row.status,
    displayName: row.display_name,
    emergencyContact: {
      name: row.contact_name,
      relationship: row.contact_relationship,
      phone: row.contact_phone,
    },
    importantInfo: row.important_info,
    publishImportantInfo: row.publish_important_info === 1,
    consentToPublish: true as const,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateCard(value: unknown): CardInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = ["displayName", "emergencyContact", "importantInfo", "publishImportantInfo", "consentToPublish"];
  if (Object.keys(input).some((key) => !keys.includes(key))) return null;
  const contact = input.emergencyContact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;
  const emergencyContact = contact as Record<string, unknown>;
  if (Object.keys(emergencyContact).some((key) => !["name", "relationship", "phone"].includes(key))) return null;
  if (typeof input.displayName !== "string" || input.displayName.trim().length < 1 || input.displayName.trim().length > 80) return null;
  if (typeof emergencyContact.name !== "string" || emergencyContact.name.trim().length < 1 || emergencyContact.name.trim().length > 80) return null;
  if (typeof emergencyContact.relationship !== "string" || emergencyContact.relationship.trim().length > 40) return null;
  if (typeof emergencyContact.phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(emergencyContact.phone)) return null;
  if (input.importantInfo !== null && (typeof input.importantInfo !== "string" || input.importantInfo.trim().length < 1 || input.importantInfo.trim().length > 500)) return null;
  if (typeof input.publishImportantInfo !== "boolean" || input.consentToPublish !== true) return null;
  return {
    displayName: input.displayName.trim(),
    emergencyContact: {
      name: emergencyContact.name.trim(),
      relationship: emergencyContact.relationship.trim(),
      phone: emergencyContact.phone,
    },
    importantInfo: typeof input.importantInfo === "string" ? input.importantInfo.trim() : null,
    publishImportantInfo: input.publishImportantInfo,
    consentToPublish: true,
  };
}

function ownerUrl(origin: string, row: CardRow) {
  return { card: cardFromRow(row), publicUrl: `${origin}/q/${row.public_token}` };
}

function isRateLimited(request: Request, kind: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${request.headers.get("CF-Connecting-IP") ?? "unknown"}:${kind}`;
  let bucket = rateWindows.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    rateWindows.set(key, bucket);
  }
  bucket.count += 1;
  if (rateWindows.size > 10_000) {
    for (const [oldKey, oldBucket] of rateWindows) {
      if (now - oldBucket.startedAt >= windowMs) rateWindows.delete(oldKey);
    }
  }
  return bucket.count > limit;
}

async function getOwner(db: Env["DB"], hash: string) {
  return db.prepare(`SELECT ${ownerColumns} FROM cards WHERE owner_token_hash = ?`).bind(hash).first<CardRow>();
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const headers = new Headers({
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Vary": "Origin",
  });
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return failure(400, "VALIDATION_ERROR", "Источник запроса не разрешён.");
  }
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const { pathname } = url;
  const method = request.method;
  if (method === "GET" && pathname === "/api/v1/health") {
    return json({ ok: true, contractVersion: "emergency-qr-v1" }, 200, headers);
  }

  const parseBody = async () => {
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      return { error: failure(415, "VALIDATION_ERROR", "Используйте Content-Type: application/json.") } as const;
    }
    const text = await request.text();
    if (text.length > 16 * 1024) return { error: failure(413, "VALIDATION_ERROR", "Тело запроса превышает 16 КБ.") } as const;
    try { return { value: JSON.parse(text) as unknown } as const; }
    catch { return { error: failure(400, "VALIDATION_ERROR", "Некорректный JSON.") } as const; }
  };

  if (method === "POST" && pathname === "/api/v1/cards") {
    if (isRateLimited(request, "create", 10, 600_000)) {
      return failure(429, "RATE_LIMITED", "Слишком много запросов. Повторите позже.");
    }
    const body = await parseBody();
    if ("error" in body && body.error) return body.error;
    const input = validateCard(body.value);
    if (!input) return failure(400, "VALIDATION_ERROR", "Проверьте поля запроса.");
    const ownerToken = makeToken();
    const now = new Date().toISOString();
    const values = [crypto.randomUUID(), makeToken(), await hashToken(ownerToken), input.displayName,
      input.emergencyContact.name, input.emergencyContact.relationship, input.emergencyContact.phone,
      input.importantInfo, Number(input.publishImportantInfo), 1, "active", now, now, now];
    const row = await env.DB.prepare(`INSERT INTO cards (
      id, public_token, owner_token_hash, display_name, contact_name, contact_relationship,
      contact_phone, important_info, publish_important_info, consent_to_publish, status,
      consent_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${ownerColumns}`).bind(...values).first<CardRow>();
    if (!row) return failure(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера.");
    return json({ ...ownerUrl(url.origin, row), ownerToken }, 201, headers);
  }

  const publicMatch = pathname.match(/^\/api\/v1\/public\/cards\/([^/]+)$/);
  if (method === "GET" && publicMatch) {
    if (isRateLimited(request, "public", 120, 60_000)) {
      return failure(429, "RATE_LIMITED", "Слишком много запросов. Повторите позже.");
    }
    const token = publicMatch[1];
    if (!tokenPattern.test(token)) return failure(404, "NOT_FOUND", "Карточка или ресурс недоступны.");
    const row = await env.DB.prepare(`SELECT display_name, contact_name, contact_relationship,
      contact_phone, CASE WHEN publish_important_info = 1 THEN important_info ELSE NULL END AS important_info,
      updated_at FROM cards WHERE public_token = ? AND status = 'active'`).bind(token).first<{
        display_name: string; contact_name: string; contact_relationship: string;
        contact_phone: string; important_info: string | null; updated_at: string;
      }>();
    if (!row) return failure(404, "NOT_FOUND", "Карточка или ресурс недоступны.");
    return json({ displayName: row.display_name,
      emergencyContact: { name: row.contact_name, relationship: row.contact_relationship, phone: row.contact_phone },
      importantInfo: row.important_info, updatedAt: row.updated_at }, 200, headers);
  }

  const ownerRoute = pathname.match(/^\/api\/v1\/me\/card(?:\/(status|rotate-qr))?$/);
  if (ownerRoute && ["GET", "PUT", "PATCH", "POST", "DELETE"].includes(method)) {
    if (isRateLimited(request, "owner", 120, 60_000)) {
      return failure(429, "RATE_LIMITED", "Слишком много запросов. Повторите позже.");
    }
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get("Authorization") ?? "");
    if (!match) return failure(401, "UNAUTHORIZED", "Недействительный ключ владельца.");
    const ownerHash = await hashToken(match[1]);
    const existing = await getOwner(env.DB, ownerHash);
    if (!existing) return failure(401, "UNAUTHORIZED", "Недействительный ключ владельца.");
    let row = existing;
    const suffix = ownerRoute[1];
    if (method === "GET" && !suffix) return json(ownerUrl(url.origin, row), 200, headers);
    if (method === "PUT" && !suffix) {
      const body = await parseBody();
      if ("error" in body && body.error) return body.error;
      const input = validateCard(body.value);
      if (!input) return failure(400, "VALIDATION_ERROR", "Проверьте поля запроса.");
      row = await env.DB.prepare(`UPDATE cards SET display_name = ?, contact_name = ?, contact_relationship = ?,
        contact_phone = ?, important_info = ?, publish_important_info = ?, consent_to_publish = ?,
        consent_at = ?, updated_at = ? WHERE owner_token_hash = ? RETURNING ${ownerColumns}`)
        .bind(input.displayName, input.emergencyContact.name, input.emergencyContact.relationship,
          input.emergencyContact.phone, input.importantInfo, Number(input.publishImportantInfo), 1,
          new Date().toISOString(), new Date().toISOString(), ownerHash).first<CardRow>() ?? existing;
    } else if (method === "PATCH" && suffix === "status") {
      const body = await parseBody();
      if ("error" in body && body.error) return body.error;
      const status = (body.value as { status?: unknown } | null)?.status;
      if (!body.value || typeof body.value !== "object" || Object.keys(body.value).length !== 1 || !["active", "inactive"].includes(String(status))) {
        return failure(400, "VALIDATION_ERROR", "Проверьте статус карточки.");
      }
      row = await env.DB.prepare(`UPDATE cards SET status = ?, updated_at = ? WHERE owner_token_hash = ? RETURNING ${ownerColumns}`)
        .bind(status, new Date().toISOString(), ownerHash).first<CardRow>() ?? existing;
    } else if (method === "POST" && suffix === "rotate-qr") {
      const body = await parseBody();
      if ("error" in body && body.error) return body.error;
      if (!body.value || typeof body.value !== "object" || Array.isArray(body.value) || Object.keys(body.value).length !== 0) {
        return failure(400, "VALIDATION_ERROR", "Проверьте поля запроса.");
      }
      row = await env.DB.prepare(`UPDATE cards SET public_token = ?, updated_at = ? WHERE owner_token_hash = ? RETURNING ${ownerColumns}`)
        .bind(makeToken(), new Date().toISOString(), ownerHash).first<CardRow>() ?? existing;
    } else if (method === "DELETE" && !suffix) {
      const result = await env.DB.prepare("DELETE FROM cards WHERE owner_token_hash = ?").bind(ownerHash).run();
      return result.meta.changes > 0 ? new Response(null, { status: 204, headers }) : failure(401, "UNAUTHORIZED", "Недействительный ключ владельца.");
    } else {
      return failure(404, "NOT_FOUND", "Карточка или ресурс недоступны.");
    }
    return json(ownerUrl(url.origin, row), 200, headers);
  }
  return failure(404, "NOT_FOUND", "Карточка или ресурс недоступны.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); }
      catch { return failure(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера."); }
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
  },
};
