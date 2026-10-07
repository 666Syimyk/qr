import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Redirect, router } from "expo-router";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Page } from "../components/Page";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Loading,
  Notice,
  Panel,
} from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { colors as c } from "../components/theme";
import { useSession } from "../lib/session";
import { useRemote } from "../lib/useRemote";
import { errorMessage } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { sharePublicLink } from "../lib/share";
import { canDownloadQr, downloadQrPng } from "../lib/qr-export";

export default function My() {
  const { api, token, ready } = useSession();
  const load = useCallback(() => api.getOwnerCard(token!), [api, token]);
  const state = useRemote(token ? load : null);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sending = useRef(false);
  const latestToken = useRef(token);
  useLayoutEffect(() => {
    latestToken.current = token;
  }, [token]);
  const result = state.data;
  const active = result?.card.status === "active";

  async function setStatus(enabled: boolean) {
    if (!token || sending.current) return;
    const requestToken = token;
    sending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.setStatus(requestToken, enabled ? "active" : "inactive");
      if (latestToken.current !== requestToken) return;
      setConfirmation(false);
      await state.refresh();
      setNotice(
        enabled
          ? "Карточка снова доступна по текущему QR."
          : "Карточка отключена. Публичные сведения недоступны.",
      );
    } catch (e) {
      setError(errorMessage(e));
      setConfirmation(false);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function copyLink() {
    if (!result) return;
    const copied = await copyText(result.publicUrl);
    setNotice(
      copied
        ? "Публичная ссылка скопирована."
        : "Копирование недоступно. Выделите публичную ссылку ниже и скопируйте её вручную.",
    );
  }
  async function share() {
    if (!result) return;
    const outcome = await sharePublicLink(result.publicUrl);
    if (outcome === "copied")
      setNotice("Публичная ссылка скопирована. Отправьте её нужному человеку.");
    else if (outcome === "manual")
      setNotice(
        "Не удалось поделиться ссылкой. Нажмите «Скопировать ссылку» или выделите строку вручную.",
      );
    else setNotice(null);
  }
  async function download() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      await downloadQrPng();
      setNotice("PNG-файл передан браузеру. Проверьте папку загрузок.");
    } catch {
      setError(
        "Не удалось скачать QR. Можно поделиться публичной ссылкой или сохранить снимок QR с белой рамкой.",
      );
    } finally {
      setExporting(false);
    }
  }
  function openPublicCard() {
    if (!result) return;
    void Linking.openURL(result.publicUrl).catch(() =>
      setError(
        "Не удалось открыть ссылку. Скопируйте её и откройте в браузере.",
      ),
    );
  }
  if (ready && !token) return <Redirect href="/restore" />;
  return (
    <Page compact title="Мой QR-код" back="Назад">
      <View style={s.layout}>
        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {!ready || state.loading ? (
          <Loading />
        ) : state.error ? (
          <ErrorState message={state.error} onRetry={state.refresh} />
        ) : result ? (
          <>
            <View style={s.identity}>
              <View style={s.avatar}>
                <Text style={s.initials}>
                  {result.card.displayName
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("ru-RU")}
                </Text>
              </View>
              <View style={s.identityText}>
                <Text style={s.name}>{result.card.displayName}</Text>
                <Text style={s.contact}>
                  Экстренный контакт: {result.card.emergencyContact.name}
                </Text>
                <Text selectable style={s.phone}>
                  {result.card.emergencyContact.phone}
                </Text>
              </View>
            </View>
            <Panel style={s.qrPanel}>
              <View style={[s.status, !active && s.statusInactive]}>
                <View
                  style={[s.statusDot, !active && { backgroundColor: c.muted }]}
                />
                <Text style={[s.statusText, !active && { color: c.muted }]}>
                  {active ? "Карточка активна" : "Карточка отключена"}
                </Text>
              </View>
              <View
                style={s.qr}
                accessibilityLabel="QR с публичной ссылкой на карточку"
              >
                <QRCode
                  value={result.publicUrl}
                  size={256}
                  quietZone={32}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                  ecl="M"
                  testID="owner-public-qr"
                />
              </View>
              <Text style={s.qrTitle}>Публичный QR — только просмотр</Text>
              <Text style={s.qrHint}>
                Отсканируйте обычной камерой телефона,{"\n"}чтобы открыть
                карточку без входа.
              </Text>
            </Panel>
            {!active && (
              <Notice tone="warning">
                Карточка отключена. Включите её, чтобы сведения снова стали
                доступны по этому QR.
              </Notice>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Поделиться ссылкой"
              aria-disabled={busy}
              onPress={() => void share()}
              disabled={busy}
              style={({ pressed }) => [
                s.share,
                { opacity: busy ? 0.5 : pressed ? 0.75 : 1 },
              ]}
            >
              <Icon name="share" color={c.teal} size={21} />
              <Text style={s.shareText}>Поделиться ссылкой</Text>
            </Pressable>
            <View style={s.quickActions}>
              <QuickAction
                label="Изменить данные"
                caption="Изменить"
                icon="edit"
                disabled={busy}
                onPress={() => router.push("/edit")}
              />
              <QuickAction
                label={active ? "Отключить карточку" : "Включить карточку"}
                caption={active ? "Отключить" : "Включить"}
                icon="shield"
                disabled={busy}
                onPress={() =>
                  active ? setConfirmation(true) : void setStatus(true)
                }
              />
              {canDownloadQr ? (
                <QuickAction
                  label="Скачать QR"
                  caption={exporting ? "Сохраняем…" : "Скачать"}
                  icon="download"
                  disabled={busy || exporting}
                  onPress={() => void download()}
                />
              ) : (
                <QuickAction
                  label="Открыть публичную карточку"
                  caption="Открыть"
                  icon="link"
                  disabled={busy}
                  onPress={openPublicCard}
                />
              )}
            </View>
            <View style={s.linkSection}>
              <Text style={s.sectionLabel}>Публичная ссылка</Text>
              <TextInput
                accessibilityLabel="Публичная ссылка"
                value={result.publicUrl}
                readOnly
                multiline
                selectTextOnFocus
                style={s.linkInput}
              />
              <View style={s.linkActions}>
                <Button
                  label="Скопировать ссылку"
                  icon="copy"
                  kind="ghost"
                  onPress={() => void copyLink()}
                  style={s.linkButton}
                />
                {canDownloadQr && (
                  <Button
                    label="Открыть публичную карточку"
                    icon="link"
                    kind="ghost"
                    onPress={openPublicCard}
                    style={s.linkButton}
                  />
                )}
              </View>
            </View>
          </>
        ) : null}
        {token && ready && (
          <View style={s.safety}>
            <Icon name="lock" color={c.muted} size={18} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={s.safetyText}>
                {result
                  ? "Сохраните секретный ключ отдельно от QR. Он понадобится для изменения карточки."
                  : "Сохраните доступ к карточке: секретный ключ доступен в профиле, даже если нет связи с сервером."}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Открыть профиль"
                onPress={() => router.push("/profile")}
                style={s.profileLink}
              >
                <Text style={s.profileLinkText}>Сохранить ключ в профиле</Text>
                <Icon name="chevron" size={16} color={c.teal} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
      <ConfirmDialog
        visible={confirmation}
        title="Отключить карточку?"
        message="По текущему QR перестанут отображаться сведения. Вы сможете включить карточку снова."
        label="Отключить карточку"
        busy={busy}
        onCancel={() => setConfirmation(false)}
        onConfirm={() => void setStatus(false)}
      />
    </Page>
  );
}
function QuickAction({
  label,
  caption,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  caption: string;
  icon: IconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.quickAction,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={23} color={c.ink} />
      <Text style={s.quickCaption}>{caption}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  layout: { gap: 18 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.tealLight,
    justifyContent: "center",
    alignItems: "center",
  },
  initials: { fontSize: 26, fontWeight: "700", color: c.teal },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: c.ink },
  contact: { fontSize: 13, lineHeight: 18, color: c.muted },
  phone: { fontSize: 14, fontWeight: "600", color: c.ink },
  qrPanel: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 9,
    borderRadius: 20,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#EAF7F0",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  statusInactive: { backgroundColor: "#F0F2F5" },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#26855A",
  },
  statusText: { fontSize: 12, fontWeight: "600", color: "#26855A" },
  qr: { backgroundColor: "white" },
  qrTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: c.ink,
    textAlign: "center",
  },
  qrHint: { fontSize: 12, lineHeight: 18, color: c.muted, textAlign: "center" },
  share: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: c.tealLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  shareText: { color: c.teal, fontSize: 16, fontWeight: "600" },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: {
    flex: 1,
    minHeight: 78,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#F0F3F7",
    borderRadius: 13,
    paddingHorizontal: 4,
  },
  quickCaption: { fontSize: 12, color: c.ink, textAlign: "center" },
  linkSection: { gap: 6, paddingTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: "600", color: c.muted },
  linkInput: {
    fontSize: 12,
    lineHeight: 19,
    color: c.muted,
    backgroundColor: "#F4F6F8",
    borderRadius: 10,
    padding: 12,
  },
  linkActions: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  linkButton: { paddingHorizontal: 5, paddingVertical: 5, minHeight: 44 },
  safety: { flexDirection: "row", gap: 10, paddingTop: 4 },
  safetyText: { fontSize: 12, lineHeight: 18, color: c.muted },
  profileLink: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    alignSelf: "flex-start",
    gap: 8,
  },
  profileLinkText: { fontSize: 13, fontWeight: "600", color: c.teal },
});
