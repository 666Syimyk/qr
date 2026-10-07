import { useRef, useState } from "react";
import { router } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Page, PageTitle } from "../components/Page";
import { Button, Field, Notice, Panel } from "../components/ui";
import { Icon } from "../components/Icon";
import { colors as c } from "../components/theme";
import { useSession } from "../lib/session";
import { ApiClientError, errorMessage } from "../lib/api";
export default function Restore() {
  const { api, saveToken, token } = useSession();
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  async function submit() {
    if (sending.current) return;
    const candidate = key.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) {
      setError(
        "Введите сохранённый секретный ключ из 43 символов. Публичная ссылка для входа не подходит.",
      );
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.getOwnerCard(candidate);
      await saveToken(candidate);
      setKey("");
      router.replace("/my");
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.status === 401) setKey("");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Page compact back="На главную" title="Вход по ключу">
      <PageTitle
        eyebrow="Доступ владельца"
        title="Откройте свою карточку"
        description="Введите секретный ключ, который вы сохранили при создании. Он даёт доступ к просмотру и изменению вашей карточки."
      />
      <Panel style={{ gap: 22 }}>
        <View style={s.icon}>
          <Icon name="lock" size={28} />
        </View>
        <Field
          label="Секретный ключ владельца"
          placeholder="Вставьте сохранённый ключ"
          value={key}
          onChangeText={setKey}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          onSubmitEditing={() => void submit()}
          hint="43 символа. Не публичная ссылка и не QR."
        />
        <Button
          kind="ghost"
          label={visible ? "Скрыть ввод" : "Показать ввод"}
          icon="eye"
          onPress={() => setVisible(!visible)}
          style={{ alignSelf: "flex-start" }}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          label="Открыть карточку"
          icon="arrow"
          busy={busy}
          onPress={() => void submit()}
        />
        {token && (
          <Button
            label="Вернуться к открытой карточке"
            kind="secondary"
            onPress={() => router.replace("/my")}
          />
        )}
        <Notice>
          {Platform.OS === "web"
            ? "На сайте ключ хранится только в памяти. После обновления страницы введите его снова."
            : "На телефоне ключ сохраняется в защищённом хранилище устройства, если оно доступно."}
        </Notice>
      </Panel>
      <View style={s.bottom}>
        <Text style={s.heading}>Если ключ потерян</Text>
        <Text style={s.text}>
          Восстановления по имени, почте или телефону нет. Публичный QR не даёт
          право редактировать карточку.
        </Text>
        <Button
          label="Создать новую карточку"
          kind="ghost"
          onPress={() => router.push("/create")}
          style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
        />
      </View>
    </Page>
  );
}
const s = StyleSheet.create({
  icon: {
    height: 58,
    width: 58,
    borderRadius: 17,
    backgroundColor: c.tealLight,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: { marginTop: 28, gap: 12 },
  heading: { fontSize: 18, fontWeight: "600", color: c.ink },
  text: { fontSize: 16, lineHeight: 25, color: c.muted },
});
