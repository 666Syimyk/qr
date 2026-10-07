import type {
  ApiError,
  CardInput,
  CardStatus,
  CreateResult,
  OwnerResult,
  PublicCard,
} from "../types/contracts";

export type ApiErrorCode =
  | ApiError["error"]["code"]
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CONFIG_ERROR"
  | "INVALID_RESPONSE";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 0,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onUnauthorized?: (rejectedToken: string) => void | Promise<void>;
}

export interface ApiClient {
  createCard(input: CardInput): Promise<CreateResult>;
  getOwnerCard(token: string): Promise<OwnerResult>;
  replaceCard(token: string, input: CardInput): Promise<OwnerResult>;
  setStatus(token: string, status: CardStatus): Promise<OwnerResult>;
  rotateQr(token: string): Promise<OwnerResult>;
  deleteCard(token: string): Promise<void>;
  getPublicCard(publicToken: string): Promise<PublicCard>;
}

function normalizeBaseUrl(value: string | undefined): string {
  try {
    if (!value?.trim()) throw new Error();
    const url = new URL(value.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.replace(/\/$/, "") !== "/api/v1"
    ) {
      throw new Error();
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ApiClientError(
      "CONFIG_ERROR",
      "Не настроен адрес API. Укажите EXPO_PUBLIC_API_URL в frontend/.env: http://АДРЕС_КОМПЬЮТЕРА:3001/api/v1. Затем перезапустите Expo или пересоберите сайт.",
    );
  }
}

const serverCodes: readonly string[] = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
];

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = value.error;
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    !("message" in error)
  )
    return false;
  if (
    typeof error.code !== "string" ||
    !serverCodes.includes(error.code) ||
    typeof error.message !== "string"
  )
    return false;
  if ("fieldErrors" in error && error.fieldErrors !== undefined) {
    if (
      !error.fieldErrors ||
      typeof error.fieldErrors !== "object" ||
      Array.isArray(error.fieldErrors)
    )
      return false;
    if (
      !Object.values(error.fieldErrors).every(
        (field) => typeof field === "string",
      )
    )
      return false;
  }
  return true;
}

function statusError(status: number): ApiClientError {
  if (status === 401)
    return new ApiClientError(
      "UNAUTHORIZED",
      "Ключ не принят. Введите сохранённый приватный ключ ещё раз.",
      status,
    );
  if (status === 404)
    return new ApiClientError(
      "NOT_FOUND",
      "Карточка недоступна: ссылка может быть отключена или заменена.",
      status,
    );
  if (status === 429)
    return new ApiClientError(
      "RATE_LIMITED",
      "Слишком много запросов. Подождите немного и повторите.",
      status,
    );
  if (status === 400)
    return new ApiClientError(
      "VALIDATION_ERROR",
      "Проверьте заполненные поля.",
      status,
    );
  return new ApiClientError(
    "INTERNAL_ERROR",
    "Сервер не смог выполнить запрос. Попробуйте ещё раз позже.",
    status,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPublicCard(value: unknown): value is PublicCard {
  if (!isRecord(value) || !isRecord(value.emergencyContact)) return false;
  const contact = value.emergencyContact;
  return (
    typeof value.displayName === "string" &&
    typeof value.updatedAt === "string" &&
    (value.importantInfo === null || typeof value.importantInfo === "string") &&
    typeof contact.name === "string" &&
    typeof contact.relationship === "string" &&
    typeof contact.phone === "string"
  );
}

function matchesResponse(path: string, value: unknown): boolean {
  if (path.startsWith("/public/")) return isPublicCard(value);
  if (
    !isRecord(value) ||
    !isRecord(value.card) ||
    !isPublicCard(value.card) ||
    typeof value.publicUrl !== "string"
  )
    return false;
  const card = value.card;
  if (
    typeof card.id !== "string" ||
    typeof card.publicToken !== "string" ||
    typeof card.consentAt !== "string" ||
    typeof card.createdAt !== "string"
  )
    return false;
  if (card.status !== "active" && card.status !== "inactive") return false;
  if (
    card.consentToPublish !== true ||
    typeof card.publishImportantInfo !== "boolean"
  )
    return false;
  return (
    path !== "/cards" ||
    (typeof value.ownerToken === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(value.ownerToken))
  );
}

function invalidResponse(status: number): ApiClientError {
  return new ApiClientError(
    "INVALID_RESPONSE",
    "Сервер вернул неожиданный ответ. Проверьте адрес API и повторите запрос.",
    status,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImpl =
    options.fetchImpl ??
    ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(
    path: string,
    method: string,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    // Expo replaces this exact env access during bundling. Validation is lazy so
    // setup errors appear on a screen instead of crashing the initial render.
    const baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL,
    );
    const controller = new AbortController();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token !== undefined && path.startsWith("/me/"))
      headers.Authorization = `Bearer ${token}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(
          new ApiClientError(
            "TIMEOUT",
            "Сервер долго не отвечает. Проверьте соединение и повторите запрос.",
          ),
        );
      }, timeoutMs);
    });

    async function perform(): Promise<T> {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      if (
        response.status === 401 &&
        token !== undefined &&
        path.startsWith("/me/")
      ) {
        // Storage failures are reported by the session; they must not disguise 401.
        try {
          await options.onUnauthorized?.(token);
        } catch {
          /* Preserve the API error. */
        }
      }
      const expectedStatus =
        method === "DELETE" ? 204 : path === "/cards" ? 201 : 200;
      if (response.ok && response.status !== expectedStatus)
        throw invalidResponse(response.status);
      if (response.status === 204) return undefined as T;
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        if (!response.ok) throw statusError(response.status);
        throw invalidResponse(response.status);
      }
      if (!response.ok) {
        if (response.status === 404 && path.startsWith("/public/"))
          throw statusError(404);
        if (isApiError(result))
          throw new ApiClientError(
            result.error.code,
            result.error.message,
            response.status,
            result.error.fieldErrors,
          );
        throw statusError(response.status);
      }
      if (!matchesResponse(path, result))
        throw invalidResponse(response.status);
      return result as T;
    }

    try {
      return await Promise.race([perform(), timeout]);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (timedOut)
        throw new ApiClientError(
          "TIMEOUT",
          "Сервер долго не отвечает. Проверьте соединение и повторите запрос.",
        );
      throw new ApiClientError(
        "NETWORK_ERROR",
        "Нет связи с сервером. Проверьте сеть и доступность адреса API; для телефона нужен доступный адрес компьютера в сети.",
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return {
    createCard: (input) => request<CreateResult>("/cards", "POST", input),
    getOwnerCard: (token) =>
      request<OwnerResult>("/me/card", "GET", undefined, token),
    replaceCard: (token, input) =>
      request<OwnerResult>("/me/card", "PUT", input, token),
    setStatus: (token, status) =>
      request<OwnerResult>("/me/card/status", "PATCH", { status }, token),
    rotateQr: (token) =>
      request<OwnerResult>("/me/card/rotate-qr", "POST", {}, token),
    deleteCard: (token) =>
      request<void>("/me/card", "DELETE", undefined, token),
    getPublicCard: (token) =>
      request<PublicCard>(`/public/cards/${encodeURIComponent(token)}`, "GET"),
  };
}
