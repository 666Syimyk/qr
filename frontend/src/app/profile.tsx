import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Page } from "../components/Page";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Loading,
  Notice,
} from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { colors as c } from "../components/theme";
import { useSession } from "../lib/session";
import { useRemote } from "../lib/useRemote";
import { errorMessage } from "../lib/api";
import { copyText } from "../lib/clipboard";

type Action = "rotate" | "delete";
const prompts: Record<
  Action,
  { title: string; message: string; label: string }
> = {
  rotate: {
    title: "Заменить публичный QR?",
    message:
      "Старый QR и ссылка перестанут работать, в том числе на распечатанных карточках. Сохраните новый QR после замены. Статус карточки не изменится.",
    label: "Заменить QR",
  },
  delete: {
    title: "Удалить карточку навсегда?",
    message:
      "Запись будет удалена. QR и секретный ключ перестанут работать. Чужие копии и снимки экрана удалить невозможно.",
    label: "Удалить навсегда",
  },
};

export default function Profile() {
  const { api, token, ready, logout } = useSession();
  const load = useCallback(() => api.getOwnerCard(token!), [api, token]);
  const state = useRemote(token ? load : null);
  const [showKey, setShowKey] = useState(false);
  const [confirmation, setConfirmation] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sending = useRef(false);
  const latestToken = useRef(token);
  useLayoutEffect(() => {
    latestToken.current = token;
  }, [token]);
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (next) => {
        if (next !== "active") setShowKey(false);
      });
      return () => {
        setShowKey(false);
        subscription.remove();
      };
    }, []),
  );

  async function action(kind: Action) {
    if (!token || sending.current) return;
    const requestToken = token;
    sending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (kind === "delete") {
        await api.deleteCard(requestToken);
        if (latestToken.current !== requestToken) return;
        setShowKey(false);
        setLeaving(true);
        await logout();
        router.replace("/");
      } else {
        await api.rotateQr(requestToken);
        if (latestToken.current !== requestToken) return;
        setConfirmation(null);
        await state.refresh();
        setNotice(
          "QR заменён. Сохраните новый код: старый больше не работает.",
        );
      }
    } catch (e) {
      setError(errorMessage(e));
      setConfirmation(null);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function leave() {
    if (busy || leaving) return;
    setShowKey(false);
    setLeaving(true);
    void logout().then(() => router.replace("/"));
  }
  async function copyKey() {
    if (!token) return;
    const copied = await copyText(token);
    setNotice(
      copied
        ? "Ключ скопирован. Сохраните его в надёжном месте и очистите буфер обмена после сохранения."
        : "Копирование недоступно. Выделите строку с ключом и скопируйте её вручную.",
    );
  }
  if (leaving)
    return (
      <Page compact title="Профиль">
        <Loading label="Закрываем доступ на этом устройстве…" />
      </Page>
    );
  if (ready && !token) return <Redirect href="/restore" />;
  const card = state.data?.card;
  return (
    <Page compact title="Профиль" back="Назад">
      <View style={s.layout}>
        {!ready || state.loading ? (
          <Loading />
        ) : state.error ? (
          <ErrorState message={state.error} onRetry={state.refresh} />
        ) : card ? (
          <View style={s.identity}>
            <View style={s.avatar}>
              <Text style={s.initials}>
                {card.displayName.trim().slice(0, 1).toLocaleUpperCase("ru-RU")}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.name}>{card.displayName}</Text>
              <Text style={s.meta}>
                {card.status === "active"
                  ? "Карточка активна"
                  : "Карточка отключена"}
              </Text>
              <Text style={s.meta}>Один контакт · Доступ по ключу</Text>
            </View>
          </View>
        ) : null}
        <View style={s.menu}>
          <MenuRow
            label="Мой QR-код"
            icon="qr"
            disabled={busy}
            onPress={() => router.push("/my")}
          />
          <MenuRow
            label="Изменить данные"
            icon="edit"
            disabled={busy}
            onPress={() => router.push("/edit")}
          />
          <MenuRow
            label="Помощь"
            icon="help"
            onPress={() => router.push("/help")}
          />
          <MenuRow
            label="О приложении"
            icon="info"
            onPress={() => router.push("/about")}
            last
          />
        </View>
        {token && ready && (
          <>
            <View style={s.security}>
              <View style={s.sectionHeading}>
                <Icon name="lock" color={c.ink} size={19} />
                <Text style={s.sectionTitle}>Доступ и безопасность</Text>
              </View>
              <Text style={s.body}>
                Публичным QR можно делиться. Секретный ключ даёт полное
                управление карточкой — сохраните его отдельно.
              </Text>
              <Notice tone="warning">
                Потеря ключа означает потерю доступа к редактированию.
                {Platform.OS === "web"
                  ? " После обновления страницы его нужно ввести снова."
                  : " Сохраните отдельную копию ключа на случай потери устройства."}
              </Notice>
              {!card && !state.loading && (
                <Text style={s.body}>
                  Секретный ключ доступен в этой сессии, даже если карточку пока
                  не удалось загрузить.
                </Text>
              )}
              <Button
                label={
                  showKey
                    ? "Скрыть секретный ключ"
                    : "Показать и сохранить ключ"
                }
                icon={showKey ? "lock" : "eye"}
                kind="secondary"
                disabled={busy}
                onPress={() => setShowKey(!showKey)}
              />
              {showKey && (
                <View style={s.secret}>
                  <Text style={s.secretLabel}>
                    СЕКРЕТНЫЙ КЛЮЧ · НЕ ДЕЛИТЕСЬ ИМ
                  </Text>
                  <TextInput
                    accessibilityLabel="Секретный ключ для сохранения"
                    value={token}
                    readOnly
                    multiline
                    selectTextOnFocus
                    autoComplete="off"
                    style={s.keyInput}
                  />
                  <Button
                    label="Скопировать секретный ключ"
                    icon="copy"
                    kind="secondary"
                    onPress={() => void copyKey()}
                  />
                </View>
              )}
              {notice && <Notice>{notice}</Notice>}
              {error && <Notice tone="error">{error}</Notice>}
            </View>
            <View style={s.menu}>
              <MenuRow
                label="Заменить публичный QR"
                icon="refresh"
                disabled={busy || !card}
                onPress={() => setConfirmation("rotate")}
              />
              <MenuRow
                label="Выйти из карточки"
                icon="logout"
                disabled={busy}
                onPress={leave}
                last
              />
            </View>
            <Text style={s.footnote}>
              Выход очищает ключ на этом устройстве. Карточка остаётся доступной
              по QR. Замена QR отзывает старую ссылку и не удаляет чужие копии
              сведений.
            </Text>
            <Button
              label="Удалить карточку"
              icon="trash"
              kind="danger"
              disabled={busy || !card}
              onPress={() => setConfirmation("delete")}
              style={s.delete}
            />
          </>
        )}
      </View>
      <ConfirmDialog
        visible={!!confirmation}
        title={confirmation ? prompts[confirmation].title : ""}
        message={confirmation ? prompts[confirmation].message : ""}
        label={confirmation ? prompts[confirmation].label : ""}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) void action(confirmation);
        }}
      />
    </Page>
  );
}
function MenuRow({
  label,
  icon,
  disabled,
  onPress,
  last,
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.menuRow,
        !last && s.divider,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} color={c.ink} size={20} />
      <Text style={s.menuLabel}>{label}</Text>
      <Icon name="chevron" size={17} color={c.muted} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  layout: { gap: 20 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 6,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: c.tealLight,
    justifyContent: "center",
    alignItems: "center",
  },
  initials: { fontSize: 29, color: c.teal, fontWeight: "700" },
  name: { fontSize: 23, lineHeight: 30, fontWeight: "700", color: c.ink },
  meta: { fontSize: 12, lineHeight: 18, color: c.muted },
  menu: { backgroundColor: "#F1F4F8", borderRadius: 15, paddingHorizontal: 16 },
  menuRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  menuLabel: { flex: 1, fontSize: 15, lineHeight: 21, color: c.ink },
  divider: { borderBottomWidth: 1, borderColor: "#E2E7ED" },
  body: { fontSize: 14, lineHeight: 22, color: c.muted },
  security: { gap: 15 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: c.ink },
  secret: {
    backgroundColor: c.amberLight,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  secretLabel: {
    color: c.amber,
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  keyInput: {
    color: c.ink,
    fontSize: 15,
    lineHeight: 24,
    minHeight: 58,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  footnote: { fontSize: 12, lineHeight: 19, color: c.muted },
  delete: {
    backgroundColor: "white",
    borderColor: c.teal,
    borderWidth: 1,
    minHeight: 50,
  },
});
