import { expect, test as base, type Page, type Route } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import type {
  ApiError,
  CardInput,
  CreateResult,
  OwnerCard,
  OwnerResult,
  PublicCard,
} from "../src/types/contracts";

// These responses exist only in browser tests. They exercise the frontend; they
// do not demonstrate a working backend, database, phone call, or native build.
const OWNER_TOKEN = "o".repeat(43);
const PUBLIC_TOKEN = "p".repeat(43);
const ROTATED_TOKEN = "r".repeat(43);
const PUBLIC_ORIGIN = "http://127.0.0.1:4274";
const HIDDEN_NOTE = "ДЕМОНСТРАЦИЯ. Скрытая вымышленная заметка.";
const CONSENT =
  "Понимаю, что имя и контакт увидит любой обладатель QR или ссылки. Контакт согласен на публикацию номера";
const UNAVAILABLE =
  "Карточка недоступна: ссылка может быть отключена или заменена.";

type RecordedRequest = {
  method: string;
  path: string;
  authorization?: string;
  body: unknown;
};
type Failure = {
  status: number;
  code: ApiError["error"]["code"];
  message: string;
  fieldErrors?: Record<string, string>;
};
type ApiFixture = {
  card: OwnerCard | null;
  requests: RecordedRequest[];
  publicFailure: Failure | null;
  ownerFailure: Failure | null;
  ownerNetworkFailure: boolean;
  ownerReadNetworkFailure: boolean;
  createFailure: Failure | null;
};

function sampleCard(): OwnerCard {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Демо-владелец",
    emergencyContact: {
      name: "Демо-контакт",
      relationship: "Родственник",
      phone: "+999000000001",
    },
    importantInfo: HIDDEN_NOTE,
    publishImportantInfo: false,
    consentToPublish: true,
    publicToken: PUBLIC_TOKEN,
    status: "active",
    consentAt: "2026-10-01T05:00:00.000Z",
    createdAt: "2026-10-01T05:00:00.000Z",
    updatedAt: "2026-10-01T05:00:00.000Z",
  };
}

function ownerResult(card: OwnerCard): OwnerResult {
  return { card, publicUrl: `${PUBLIC_ORIGIN}/q/${card.publicToken}` };
}

async function interceptApi(page: Page): Promise<ApiFixture> {
  const state: ApiFixture = {
    card: sampleCard(),
    requests: [],
    publicFailure: null,
    ownerFailure: null,
    ownerNetworkFailure: false,
    ownerReadNetworkFailure: false,
    createFailure: null,
  };
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const headers = {
      "access-control-allow-origin": PUBLIC_ORIGIN,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
      "cache-control": "no-store",
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const body: unknown = request.postData()
      ? request.postDataJSON()
      : undefined;
    const authorization = request.headers().authorization;
    state.requests.push({ method, path, authorization, body });
    expect(url.origin).toBe("http://127.0.0.1:3001");
    const json = (status: number, value: unknown) =>
      route.fulfill({ status, headers, json: value });
    const error = (failure: Failure) =>
      json(failure.status, {
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
        },
      } satisfies ApiError);

    if (path.startsWith("/me/")) {
      expect(authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
      if (
        state.ownerNetworkFailure ||
        (method === "GET" && state.ownerReadNetworkFailure)
      )
        return route.abort("failed");
      if (state.ownerFailure) return error(state.ownerFailure);
      if (authorization !== `Bearer ${OWNER_TOKEN}` || !state.card) {
        return error({
          status: 401,
          code: "UNAUTHORIZED",
          message: "Ключ не принят.",
        });
      }
    } else {
      expect(
        authorization,
        "Public requests must never carry the owner key",
      ).toBeUndefined();
    }

    if (path === "/cards" && method === "POST") {
      if (state.createFailure) return error(state.createFailure);
      state.card = { ...sampleCard(), ...(body as CardInput) };
      const result: CreateResult = {
        ...ownerResult(state.card),
        ownerToken: OWNER_TOKEN,
      };
      return json(201, result);
    }
    if (path === "/me/card" && method === "GET" && state.card)
      return json(200, ownerResult(state.card));
    if (path === "/me/card" && method === "PUT" && state.card) {
      state.card = {
        ...state.card,
        ...(body as CardInput),
        updatedAt: "2026-10-01T05:10:00.000Z",
      };
      return json(200, ownerResult(state.card));
    }
    if (path === "/me/card/status" && method === "PATCH" && state.card) {
      state.card = {
        ...state.card,
        status: (body as { status: "active" | "inactive" }).status,
      };
      return json(200, ownerResult(state.card));
    }
    if (path === "/me/card/rotate-qr" && method === "POST" && state.card) {
      state.card = { ...state.card, publicToken: ROTATED_TOKEN };
      return json(200, ownerResult(state.card));
    }
    if (path === "/me/card" && method === "DELETE") {
      state.card = null;
      return route.fulfill({ status: 204, headers });
    }
    if (path.startsWith("/public/cards/") && method === "GET") {
      if (state.publicFailure) return error(state.publicFailure);
      if (
        !state.card ||
        state.card.status !== "active" ||
        path !== `/public/cards/${state.card.publicToken}`
      ) {
        return error({ status: 404, code: "NOT_FOUND", message: UNAVAILABLE });
      }
      const card: PublicCard = {
        displayName: state.card.displayName,
        emergencyContact: state.card.emergencyContact,
        importantInfo: state.card.publishImportantInfo
          ? state.card.importantInfo
          : null,
        updatedAt: state.card.updatedAt,
      };
      return json(200, card);
    }
    // Never fall through to a real API, even for an unexpected frontend request.
    await error({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unexpected request in browser test fixture.",
    });
    throw new Error(`Unexpected frontend request: ${method} ${path}`);
  });
  return state;
}

const test = base.extend<{ api: ApiFixture }>({
  api: [
    async ({ page }, use) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      const api = await interceptApi(page);
      await use(api);
      expect(runtimeErrors, "No uncaught browser exceptions").toEqual([]);
    },
    { auto: true },
  ],
});

async function restore(page: Page) {
  await page.goto("/restore");
  await page
    .getByLabel("Секретный ключ владельца", { exact: true })
    .fill(OWNER_TOKEN);
  await page
    .getByRole("button", { name: "Открыть карточку", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
}

async function fillCard(page: Page) {
  await page
    .getByLabel("Имя на карточке", { exact: true })
    .fill("  Демо-владелец  ");
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByLabel("Имя контакта", { exact: true }).fill("Демо-контакт");
  await page
    .getByLabel("Кем вам приходится · необязательно", { exact: true })
    .fill("Родственник");
  await page
    .getByLabel("Номер телефона", { exact: true })
    .fill("+999000000001");
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page
    .getByLabel("Что ещё стоит знать · необязательно", { exact: true })
    .fill(HIDDEN_NOTE);
}

async function finalEditStep(page: Page) {
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(
    page.getByLabel("Что ещё стоит знать · необязательно", { exact: true }),
  ).toHaveValue(HIDDEN_NOTE);
  await expect(
    page.getByRole("checkbox", { name: CONSENT, exact: true }),
  ).not.toBeChecked();
}

async function openProfile(page: Page) {
  await page
    .getByRole("button", { name: "Открыть профиль", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
}

async function openMyFromProfile(page: Page) {
  await page
    .getByRole("button", { name: "Мой QR-код", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/my$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
}

async function expectNoPersistentKey(page: Page) {
  const stored = await page.evaluate(() => ({
    local: Object.keys(localStorage).map((key) => [
      key,
      localStorage.getItem(key),
    ]),
    session: Object.keys(sessionStorage).map((key) => [
      key,
      sessionStorage.getItem(key),
    ]),
  }));
  expect(JSON.stringify(stored)).not.toContain(OWNER_TOKEN);
  expect(page.url()).not.toContain(OWNER_TOKEN);
}

for (const width of [390, 1280]) {
  test(`home and create form fit a ${width}px viewport`, async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name:
          width < 800
            ? /Безопасность\s+всегда рядом/
            : /Маленький код\.\s+Большая помощь\./,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: test.info().outputPath(`home-${width}.png`),
    });
    const create = page
      .getByRole("button", {
        name: "Создать карточку",
        exact: true,
      })
      .last();
    const bounds = await create.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await create.click();
    await expect(
      page.getByLabel("Имя на карточке", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`create-${width}.png`),
    });
    await expectNoHorizontalOverflow(page);
    expect(api.requests).toEqual([]);
  });
}

test("consent exposes unchecked, checked and unchecked states to assistive technology", async ({
  page,
}) => {
  await page.goto("/create");
  await fillCard(page);
  const consent = page.getByRole("checkbox", { name: CONSENT, exact: true });
  await expect(consent).not.toBeChecked();
  await consent.click();
  await expect(consent).toBeChecked();
  await consent.click();
  await expect(consent).not.toBeChecked();
});

test("create validates locally, sends explicit consent, renders the public QR and hides the owner key", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create");
  const consent = page.getByRole("checkbox", { name: CONSENT, exact: true });
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(
    page.getByText("Укажите имя владельца.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.requests).toEqual([]);
  await fillCard(page);
  await expect(consent).not.toBeChecked();
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await expect(
    page.getByText("Подтвердите согласие на публикацию имени и контакта.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.requests).toEqual([]);
  await consent.click();
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  const creation = api.requests.filter(
    (request) => request.method === "POST" && request.path === "/cards",
  );
  expect(creation).toHaveLength(1);
  expect(creation[0].body).toEqual({
    displayName: "Демо-владелец",
    emergencyContact: {
      name: "Демо-контакт",
      relationship: "Родственник",
      phone: "+999000000001",
    },
    importantInfo: HIDDEN_NOTE,
    publishImportantInfo: false,
    consentToPublish: true,
  });
  await expect(
    page.getByLabel("QR с публичной ссылкой на карточку").locator("svg"),
  ).toBeVisible();
  await page
    .getByLabel("QR с публичной ссылкой на карточку")
    .screenshot({ path: test.info().outputPath("qr.png") });
  await page.screenshot({ path: test.info().outputPath("owner-mobile.png") });
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveCount(0);
  expect(await page.content()).not.toContain(OWNER_TOKEN);
  await expectNoHorizontalOverflow(page);
  await expectNoPersistentKey(page);
  await openProfile(page);
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveValue(
    OWNER_TOKEN,
  );
  await page
    .getByRole("button", { name: "Скрыть секретный ключ", exact: true })
    .click();
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveCount(0);
});

test("editing preserves a draft across visibility changes and saves with the same public URL", async ({
  page,
  api,
}) => {
  await restore(page);
  await page
    .getByRole("button", { name: "Изменить данные", exact: true })
    .click();
  const name = page.getByLabel("Имя на карточке", { exact: true });
  await expect(name).toHaveValue("Демо-владелец");
  await name.fill("Демо-владелец после правки");
  await page.evaluate(async () => {
    for (const visibility of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: visibility,
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: visibility === "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  });
  await expect(name).toHaveValue("Демо-владелец после правки");
  await finalEditStep(page);
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByText("Демо-владелец после правки", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  const update = api.requests.find((request) => request.method === "PUT");
  expect(update?.authorization).toBe(`Bearer ${OWNER_TOKEN}`);
  expect(update?.body).toMatchObject({
    displayName: "Демо-владелец после правки",
    publishImportantInfo: false,
    consentToPublish: true,
  });
});

test("a saved edit is not offered for repeat submission when the following read fails", async ({
  page,
  api,
}) => {
  await restore(page);
  await page
    .getByRole("button", { name: "Изменить данные", exact: true })
    .click();
  await page
    .getByLabel("Имя на карточке", { exact: true })
    .fill("Сохранённая редакция");
  await finalEditStep(page);
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  api.ownerReadNetworkFailure = true;
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByText(/Нет связи с сервером\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toHaveCount(0);
  expect(
    api.requests.filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
  api.ownerReadNetworkFailure = false;
  await page
    .getByRole("button", { name: "Повторить запрос", exact: true })
    .click();
  await expect(
    page.getByText("Сохранённая редакция", { exact: true }),
  ).toBeVisible();
  expect(
    api.requests.filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
});

test("a revealed owner key hides when the application goes into the background", async ({
  page,
}) => {
  await restore(page);
  await openProfile(page);
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveValue(
    OWNER_TOKEN,
  );
  for (const visibility of ["hidden", "visible"]) {
    await page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value,
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: value === "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, visibility);
    await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveCount(
      0,
    );
    expect(await page.content()).not.toContain(OWNER_TOKEN);
  }
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveValue(
    OWNER_TOKEN,
  );
});

test("a successful create preserves key saving when the following owner load loses its connection", async ({
  page,
  api,
}) => {
  api.ownerNetworkFailure = true;
  await page.goto("/create");
  await fillCard(page);
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByText(/Нет связи с сервером\./)).toBeVisible();
  await expect(page.getByText(/Сохраните доступ к карточке:/)).toBeVisible();
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/cards",
    ),
  ).toHaveLength(1);
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveCount(0);
  expect(await page.content()).not.toContain(OWNER_TOKEN);
  await openProfile(page);
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveValue(
    OWNER_TOKEN,
  );
  await expect(
    page.getByRole("button", {
      name: "Скопировать секретный ключ",
      exact: true,
    }),
  ).toBeEnabled();
  await expectNoPersistentKey(page);
  api.ownerNetworkFailure = false;
  await openMyFromProfile(page);
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/cards",
    ),
  ).toHaveLength(1);
});

test("disabling, rotating and deleting require explicit confirmation; cancelling does not mutate", async ({
  page,
  api,
}) => {
  await restore(page);
  const writes = () =>
    api.requests.filter((request) => request.method !== "GET");
  await page
    .getByRole("button", { name: "Отключить карточку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Отключить карточку?", exact: true }),
  ).toBeVisible();
  expect(writes()).toEqual([]);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Отключить карточку?", exact: true }),
  ).toHaveCount(0);
  expect(writes()).toEqual([]);
  await page
    .getByRole("button", { name: "Отключить карточку", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Отключить карточку", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Карточка отключена", { exact: true }),
  ).toBeVisible();
  expect(writes()[0]).toMatchObject({
    method: "PATCH",
    path: "/me/card/status",
    body: { status: "inactive" },
  });

  await openProfile(page);
  await page
    .getByRole("button", { name: "Заменить публичный QR", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Заменить публичный QR?", exact: true }),
  ).toBeVisible();
  expect(writes()).toHaveLength(1);
  await page.getByRole("button", { name: "Заменить QR", exact: true }).click();
  await expect(
    page.getByText(
      "QR заменён. Сохраните новый код: старый больше не работает.",
      { exact: true },
    ),
  ).toBeVisible();
  await openMyFromProfile(page);
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${ROTATED_TOKEN}`);
  await expect(
    page.getByText("Карточка отключена", { exact: true }),
  ).toBeVisible();
  expect(writes()[1]).toMatchObject({
    method: "POST",
    path: "/me/card/rotate-qr",
    body: {},
  });
  await page
    .getByRole("button", { name: "Включить карточку", exact: true })
    .click();
  await expect(
    page.getByText("Карточка активна", { exact: true }),
  ).toBeVisible();

  await openProfile(page);
  await page
    .getByRole("button", { name: "Удалить карточку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Удалить карточку навсегда?",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    api.requests.filter((request) => request.method === "DELETE"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Удалить карточку навсегда?",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Удалить карточку", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Удалить навсегда", exact: true })
    .click();
  await expect(page).toHaveURL(`${PUBLIC_ORIGIN}/`);
  expect(
    api.requests.filter((request) => request.method === "DELETE"),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "У меня уже есть ключ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/restore$/);
  await expectNoPersistentKey(page);
});

test("public view hides private notes, disables the fictitious number and clears stale data on refresh errors", async ({
  page,
  api,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/q/${PUBLIC_TOKEN}`);
  await expect(
    page.getByRole("heading", { name: "Демо-владелец", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Демо-номер", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Вымышленный номер. Звонок отключён.", { exact: true }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(HIDDEN_NOTE);
  expect(await page.content()).not.toContain(OWNER_TOKEN);
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "Скопировать номер", exact: true })
    .click();
  await expect(
    page.getByText("Номер скопирован.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "+999000000001",
  );
  await page.evaluate(() => navigator.clipboard.writeText(""));
  api.publicFailure = {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Демонстрационный сбой сервера.",
  };
  await page
    .getByRole("button", { name: "Обновить карточку", exact: true })
    .click();
  await expect(
    page.getByText("Демонстрационный сбой сервера.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Демо-владелец", { exact: true })).toHaveCount(0);
  await expect(page.getByText("+999000000001", { exact: true })).toHaveCount(0);
  api.publicFailure = { status: 404, code: "NOT_FOUND", message: UNAVAILABLE };
  await page
    .getByRole("button", { name: "Повторить запрос", exact: true })
    .click();
  await expect(page.getByText(UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(page.getByText("Демо-контакт", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Демо-номер", exact: true }),
  ).toHaveCount(0);
  expect(
    api.requests.every((request) => request.authorization === undefined),
  ).toBe(true);
});

test("invalid restore is local; a 401 clears the entered key and never opens management", async ({
  page,
  api,
}) => {
  await page.goto("/restore");
  const key = page.getByLabel("Секретный ключ владельца", { exact: true });
  await key.fill(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  await page
    .getByRole("button", { name: "Открыть карточку", exact: true })
    .click();
  await expect(
    page.getByText(/Введите сохранённый секретный ключ из 43 символов/),
  ).toBeVisible();
  expect(api.requests).toHaveLength(0);
  await key.fill("z".repeat(43));
  await page
    .getByRole("button", { name: "Открыть карточку", exact: true })
    .click();
  await expect(
    page.getByText("Ключ не принят.", { exact: true }),
  ).toBeVisible();
  await expect(key).toHaveValue("");
  await expect(page).toHaveURL(/\/restore$/);
  expect(api.requests).toHaveLength(1);
  expect(api.requests[0]).toMatchObject({
    method: "GET",
    path: "/me/card",
    authorization: `Bearer ${"z".repeat(43)}`,
  });
  await expectNoPersistentKey(page);
});

test("web reload drops owner access and logout routes management back to restore", async ({
  page,
  api,
}) => {
  await restore(page);
  await expectNoPersistentKey(page);
  const requestsBeforeReload = api.requests.length;
  await page.reload();
  await expect(page).toHaveURL(/\/restore$/);
  await expect(
    page.getByLabel("Секретный ключ владельца", { exact: true }),
  ).toHaveValue("");
  expect(api.requests).toHaveLength(requestsBeforeReload);
  await restore(page);
  await openProfile(page);
  await page
    .getByRole("button", { name: "Выйти из карточки", exact: true })
    .click();
  await expect(page).toHaveURL(`${PUBLIC_ORIGIN}/`);
  await page
    .getByRole("button", { name: "У меня уже есть ключ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/restore$/);
  await expectNoPersistentKey(page);
});

test("a rejected active owner session clears management and asks for a key again", async ({
  page,
  api,
}) => {
  await restore(page);
  api.ownerFailure = {
    status: 401,
    code: "UNAUTHORIZED",
    message: "Ключ больше не действителен.",
  };
  await page
    .getByRole("button", { name: "Изменить данные", exact: true })
    .click();
  await expect(page).toHaveURL(/\/restore$/);
  await expect(
    page.getByLabel("Секретный ключ владельца", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Секретный ключ для сохранения")).toHaveCount(0);
  await expectNoPersistentKey(page);
});

for (const width of [390, 1280]) {
  test(`wizard top and bottom back preserve every draft field at ${width}px`, async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Создать карточку", exact: true })
      .last()
      .click();
    await fillCard(page);
    await expectNoHorizontalOverflow(page);
    await page
      .getByRole("button", { name: "Назад", exact: true })
      .first()
      .click();
    await expect(page.getByLabel("Имя контакта", { exact: true })).toHaveValue(
      "Демо-контакт",
    );
    await expect(
      page.getByLabel("Номер телефона", { exact: true }),
    ).toHaveValue("+999000000001");
    await page
      .getByRole("button", { name: "Назад", exact: true })
      .last()
      .click();
    await expect(
      page.getByLabel("Имя на карточке", { exact: true }),
    ).toHaveValue("  Демо-владелец  ");
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await expect(
      page.getByLabel("Что ещё стоит знать · необязательно", { exact: true }),
    ).toHaveValue(HIDDEN_NOTE);
    await expect(
      page.getByRole("checkbox", { name: CONSENT, exact: true }),
    ).not.toBeChecked();
    expect(api.requests).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`wizard-final-${width}.png`),
    });
    await page
      .getByRole("button", { name: "Назад", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Назад", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Назад", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(`${PUBLIC_ORIGIN}/`);
  });
}

test("server field validation returns to the relevant wizard step without losing the draft", async ({
  page,
  api,
}) => {
  await page.goto("/create");
  await fillCard(page);
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  api.createFailure = {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Проверьте номер контакта.",
    fieldErrors: {
      "emergencyContact.phone": "Укажите доступный номер контакта.",
    },
  };
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Кому позвонить?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Укажите доступный номер контакта.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Имя контакта", { exact: true })).toHaveValue(
    "Демо-контакт",
  );
  await page
    .getByLabel("Номер телефона", { exact: true })
    .fill("+999000000002");
  api.createFailure = null;
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(
    page.getByLabel("Что ещё стоит знать · необязательно", { exact: true }),
  ).toHaveValue(HIDDEN_NOTE);
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/my$/);
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(2);
});

test("copy buttons put the public URL and the explicitly revealed key in the browser clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await restore(page);
  await page
    .getByRole("button", { name: "Скопировать ссылку", exact: true })
    .click();
  await expect(
    page.getByText("Публичная ссылка скопирована.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`,
  );
  await openProfile(page);
  await expect(
    page.getByRole("button", {
      name: "Скопировать секретный ключ",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Скопировать секретный ключ", exact: true })
    .click();
  await expect(page.getByText(/Ключ скопирован\. Сохраните его/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    OWNER_TOKEN,
  );
  await page
    .getByRole("button", { name: "Скрыть секретный ключ", exact: true })
    .click();
  expect(await page.content()).not.toContain(OWNER_TOKEN);
  await expectNoPersistentKey(page);
  await page.evaluate(() => navigator.clipboard.writeText(""));
});

test("denied clipboard access gives manual-copy instructions and selectable values", async ({
  page,
}) => {
  await restore(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await page
    .getByRole("button", { name: "Скопировать ссылку", exact: true })
    .click();
  await expect(
    page.getByText(/Копирование недоступно\. Выделите публичную ссылку/),
  ).toBeVisible();
  const link = page.getByLabel("Публичная ссылка", { exact: true });
  await expect(link).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  await expect(link).toHaveAttribute("readonly", "");
  await openProfile(page);
  await page
    .getByRole("button", { name: "Показать и сохранить ключ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Скопировать секретный ключ", exact: true })
    .click();
  await expect(
    page.getByText(
      "Копирование недоступно. Выделите строку с ключом и скопируйте её вручную.",
      { exact: true },
    ),
  ).toBeVisible();
  const key = page.getByLabel("Секретный ключ для сохранения", { exact: true });
  await expect(key).toHaveValue(OWNER_TOKEN);
  await expect(key).toHaveAttribute("readonly", "");
  await key.focus();
  await key.press("ControlOrMeta+A");
  expect(
    await key.evaluate((element) => {
      const field = element as HTMLTextAreaElement;
      return field.selectionEnd - field.selectionStart;
    }),
  ).toBe(43);
});

test("HTTP clipboard fallback copies synchronously without leaving temporary text fields", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await restore(page);
  await page.evaluate(() =>
    Object.defineProperty(globalThis, "isSecureContext", {
      configurable: true,
      value: false,
    }),
  );
  await page
    .getByRole("button", { name: "Скопировать ссылку", exact: true })
    .click();
  await expect(
    page.getByText("Публичная ссылка скопирована.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`,
  );
  await expect(page.locator('textarea[aria-hidden="true"]')).toHaveCount(0);
  await page.evaluate(() => navigator.clipboard.writeText(""));
});

test("share falls back to copying the public URL and explains a blocked fallback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await restore(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    }),
  );
  await page
    .getByRole("button", { name: "Поделиться ссылкой", exact: true })
    .click();
  await expect(
    page.getByText(
      "Публичная ссылка скопирована. Отправьте её нужному человеку.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`,
  );
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    }),
  );
  await page
    .getByRole("button", { name: "Поделиться ссылкой", exact: true })
    .click();
  await expect(
    page.getByText(/Не удалось поделиться ссылкой\. Нажмите/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Публичная ссылка", { exact: true }),
  ).toHaveValue(`${PUBLIC_ORIGIN}/q/${PUBLIC_TOKEN}`);
  expect(await page.content()).not.toContain(OWNER_TOKEN);
});

test("download exports a real 1120px PNG of the displayed public QR", async ({
  page,
}) => {
  await restore(page);
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать QR", exact: true }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("emergency-qr.png");
  const file = test.info().outputPath("downloaded-public-qr.png");
  await download.saveAs(file);
  const png = await readFile(file);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1120);
  expect(png.readUInt32BE(20)).toBe(1120);
  await expect(
    page.getByText("PNG-файл передан браузеру. Проверьте папку загрузок.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(OWNER_TOKEN);
});

test("owner QR stays inside its panel on a narrow 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await restore(page);
  const qr = page
    .getByLabel("QR с публичной ссылкой на карточку")
    .locator("svg");
  await expect(qr).toBeVisible();
  const bounds = await qr.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(20);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(300);
  const viewBox = (await qr.getAttribute("viewBox"))!.split(/\s+/).map(Number);
  // The downloaded SVG must carry its own white margin, without depending on
  // surrounding page padding that disappears in the exported PNG.
  expect(viewBox).toEqual([-32, -32, 320, 320]);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath("owner-320.png") });
});

test("mobile wizard keeps its top back button visible after reaching bottom controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create");
  const headerBack = page
    .getByRole("button", { name: "Назад", exact: true })
    .first();
  const initial = await headerBack.boundingBox();
  await fillCard(page);
  await expect(headerBack).toBeInViewport({ ratio: 1 });
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  const measured = await page.evaluate(() => ({
    outerScroll: window.scrollY,
    documentScroll: document.scrollingElement?.scrollTop,
    bodyScroll: document.body.scrollTop,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    movingElements: Array.from(document.querySelectorAll("div"))
      .filter((element) => element.scrollTop > 0)
      .map((element) => ({
        top: element.getBoundingClientRect().top,
        height: element.getBoundingClientRect().height,
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        overflow: getComputedStyle(element).overflowY,
      })),
  }));
  const evidence = JSON.stringify(
    {
      initialBack: initial,
      finalBack: await headerBack.boundingBox(),
      ...measured,
    },
    null,
    2,
  );
  await writeFile(
    test.info().outputPath("wizard-scroll-measurements.json"),
    evidence,
  );
  await test.info().attach("wizard-scroll-measurements", {
    body: evidence,
    contentType: "application/json",
  });
  await page.screenshot({
    path: test.info().outputPath("wizard-bottom-controls.png"),
  });
  expect(measured.outerScroll).toBe(0);
  expect(measured.documentScroll).toBe(0);
  await expect(headerBack).toBeInViewport({ ratio: 1 });
  const after = await headerBack.boundingBox();
  expect(after?.y).toBe(initial?.y);
  expect(after?.height).toBe(initial?.height);
  await headerBack.click();
  await expect(
    page.getByRole("heading", { name: "Кому позвонить?", exact: true }),
  ).toBeInViewport();
  await expect(page.getByLabel("Имя контакта", { exact: true })).toHaveValue(
    "Демо-контакт",
  );
  await page.getByRole("button", { name: "Назад", exact: true }).last().click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(headerBack).toBeInViewport({ ratio: 1 });
  expect((await headerBack.boundingBox())?.y).toBe(initial?.y);
  const receivesPointer = await headerBack.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const atPoint = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return !!atPoint && element.contains(atPoint);
  });
  expect(receivesPointer).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("wizard-final-after-back.png"),
  });
  await headerBack.click({ timeout: 3000 });
  await expect(
    page.getByRole("heading", { name: "Кому позвонить?", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  // A shorter visual viewport approximates the space available above an open
  // mobile keyboard without claiming a native keyboard/device test.
  await page.setViewportSize({ width: 390, height: 520 });
  await page
    .getByLabel("Что ещё стоит знать · необязательно", { exact: true })
    .focus();
  await page.getByRole("checkbox", { name: CONSENT, exact: true }).click();
  await expect(headerBack).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("profile help, about and mobile tabs all navigate or open visible content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await restore(page);
  await page.getByRole("tab", { name: "Профиль", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "Помощь", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(
    page.getByRole("heading", { name: "Как это работает", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Назад", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "О приложении", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { name: "О проекте", exact: true }).first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "Назад", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("tab", { name: "QR-код", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("tab", { name: "Главная", exact: true }).click();
  await expect(page).toHaveURL(`${PUBLIC_ORIGIN}/`);
  await page
    .getByRole("button", { name: "Открыть профиль", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await page
    .getByRole("button", { name: "Назад", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(`${PUBLIC_ORIGIN}/`);
});
