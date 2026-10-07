import { useCallback, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Page } from "../../components/Page";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  Panel,
} from "../../components/ui";
import { colors as c } from "../../components/theme";
import { useSession } from "../../lib/session";
import { useRemote } from "../../lib/useRemote";
import { copyText } from "../../lib/clipboard";
import { Icon } from "../../components/Icon";

export default function PublicCardScreen() {
  const params = useLocalSearchParams<{ publicToken: string }>();
  const publicToken = Array.isArray(params.publicToken)
    ? params.publicToken[0]
    : params.publicToken;
  const { api } = useSession();
  const load = useCallback(
    () => api.getPublicCard(publicToken ?? ""),
    [api, publicToken],
  );
  const state = useRemote(load);
  const [callError, setCallError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const callPending = useRef(false);
  const card = state.data;
  const demo = card?.emergencyContact.phone.startsWith("+999");
  const validPhone =
    !!card && /^\+[1-9]\d{7,14}$/.test(card.emergencyContact.phone);
  async function call() {
    if (!card || demo || !validPhone || callPending.current) return;
    callPending.current = true;
    setCalling(true);
    setCallError(null);
    try {
      await Linking.openURL("tel:" + card.emergencyContact.phone);
    } catch {
      setCallError(
        "Не удалось открыть набор номера. Номер виден ниже — его можно набрать вручную.",
      );
    } finally {
      callPending.current = false;
      setCalling(false);
    }
  }
  async function copyPhone() {
    if (!card) return;
    const copied = await copyText(card.emergencyContact.phone);
    setNotice(
      copied
        ? "Номер скопирован."
        : "Выделите номер и скопируйте вручную — браузер ограничил копирование.",
    );
  }
  return (
    <Page compact scenic title="Карточка помощи" back="На главную">
      {state.loading ? (
        <Panel>
          <Loading />
        </Panel>
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : card ? (
        <Panel style={s.card}>
          <View style={s.avatar}>
            <Text style={s.initials}>
              {card.displayName.trim().slice(0, 1).toLocaleUpperCase("ru-RU")}
            </Text>
          </View>
          <Text accessibilityRole="header" style={s.name}>
            {card.displayName}
          </Text>
          <Text style={s.intro}>
            Если мне нужна помощь, пожалуйста,{"\n"}свяжитесь с моим экстренным
            контактом.
          </Text>
          <Button
            label={demo ? "Демо-номер" : "Позвонить контакту"}
            icon="phone"
            disabled={demo || !validPhone}
            busy={calling}
            onPress={() => void call()}
            style={{ minHeight: 56, backgroundColor: c.success, marginTop: 8 }}
          />
          {demo && (
            <Text style={s.demo}>Вымышленный номер. Звонок отключён.</Text>
          )}
          {callError && <Notice tone="error">{callError}</Notice>}
          <View style={s.contact}>
            <View style={s.row}>
              <Icon name="user" size={20} color={c.ink} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.label}>Экстренный контакт</Text>
                <Text style={s.contactName}>{card.emergencyContact.name}</Text>
                {!!card.emergencyContact.relationship && (
                  <Text style={s.relationship}>
                    {card.emergencyContact.relationship}
                  </Text>
                )}
              </View>
            </View>
            <Text selectable style={s.phone}>
              {card.emergencyContact.phone}
            </Text>
            <Button
              label="Скопировать номер"
              kind="ghost"
              icon="copy"
              onPress={() => void copyPhone()}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 0,
                minHeight: 36,
              }}
            />
          </View>
          {notice && <Notice>{notice}</Notice>}
          {card.importantInfo?.trim() && (
            <View style={s.info}>
              <Text style={s.infoTitle}>Важная информация</Text>
              <Text style={s.infoText}>{card.importantInfo}</Text>
            </View>
          )}
          <Text style={s.foot}>
            Сведения предоставлены владельцем и не проверены. Карточка не
            заменяет обращение за экстренной помощью.
          </Text>
          <Button
            label="Обновить карточку"
            kind="secondary"
            icon="refresh"
            onPress={() => {
              setNotice(null);
              setCallError(null);
              void state.refresh();
            }}
          />
          <Text style={s.updated}>
            Обновлено: {new Date(card.updatedAt).toLocaleString("ru-RU")}
          </Text>
        </Panel>
      ) : null}
    </Page>
  );
}
const s = StyleSheet.create({
  card: {
    gap: 16,
    padding: 26,
    borderRadius: 22,
    boxShadow: "0 12px 38px rgba(10,30,50,0.16)",
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 4,
  },
  initials: { fontSize: 34, fontWeight: "700", color: c.primary },
  name: {
    fontSize: 29,
    lineHeight: 37,
    fontWeight: "800",
    textAlign: "center",
    color: c.ink,
    letterSpacing: -0.6,
  },
  intro: { fontSize: 14, lineHeight: 23, textAlign: "center", color: c.ink },
  demo: { fontSize: 12, color: c.muted, textAlign: "center" },
  contact: {
    padding: 18,
    backgroundColor: "#F5F7FA",
    borderRadius: 14,
    gap: 10,
  },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  label: { fontSize: 11, color: c.muted },
  contactName: { fontSize: 17, fontWeight: "700", color: c.ink },
  relationship: { fontSize: 13, color: c.muted },
  phone: { fontSize: 21, fontWeight: "600", color: c.ink, marginTop: 3 },
  info: { gap: 9, borderTopWidth: 1, borderColor: c.line, paddingTop: 18 },
  infoTitle: { fontSize: 16, fontWeight: "700", color: c.ink },
  infoText: { fontSize: 15, lineHeight: 24, color: c.ink },
  foot: { fontSize: 11, lineHeight: 18, color: c.muted, textAlign: "center" },
  updated: { fontSize: 11, color: c.muted, textAlign: "center" },
});
