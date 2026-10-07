import {
  ImageBackground,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, type Href } from "expo-router";
import { Page } from "../components/Page";
import { Brand } from "../components/Brand";
import { Icon, type IconName } from "../components/Icon";
import { Button } from "../components/ui";
import { colors as c } from "../components/theme";
import { useSession } from "../lib/session";
const benefits: [IconName, string, string][] = [
  ["flash", "Быстро и удобно", "Карточка за пару минут"],
  ["people", "Открывается у всех", "Достаточно камеры телефона"],
  ["shield", "Вы управляете данными", "Публикуйте только нужное"],
  ["heart", "Близкие на связи", "Важный контакт всегда рядом"],
];
export default function Home() {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 800;
  const { token } = useSession();
  return (
    <Page landing>
      <ImageBackground
        source={
          desktop
            ? require("../../assets/images/hero-mountains.png")
            : require("../../assets/images/hero-mountains-mobile.png")
        }
        resizeMode="cover"
        style={[
          s.hero,
          { minHeight: desktop ? 560 : Math.max(height - 24, 620) },
        ]}
        imageStyle={{
          width: "100%",
          height: "100%",
          opacity: desktop ? 1 : 0.9,
        }}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: desktop
                ? "rgba(5,22,36,0.18)"
                : "rgba(5,22,36,0.27)",
            },
          ]}
        />
        <View
          style={[
            s.heroInside,
            desktop
              ? { paddingHorizontal: 64, paddingVertical: 88 }
              : {
                  paddingHorizontal: 28,
                  paddingTop: 46,
                  paddingBottom: 32,
                  justifyContent: "space-between",
                  flex: 1,
                },
          ]}
        >
          {!desktop && <Brand stacked light tagline />}
          <View style={[s.heroText, { maxWidth: desktop ? 660 : 430 }]}>
            {desktop && <Text style={s.eyebrow}>ДЛЯ ВАС И ВАШИХ БЛИЗКИХ</Text>}
            <Text
              accessibilityRole="header"
              style={[
                s.heroTitle,
                { fontSize: desktop ? 54 : 34, lineHeight: desktop ? 62 : 41 },
              ]}
            >
              {desktop
                ? "Маленький код.\nБольшая помощь."
                : "Безопасность\nвсегда рядом"}
            </Text>
            <Text
              style={[s.heroDescription, { maxWidth: desktop ? 480 : 310 }]}
            >
              {desktop
                ? "Если вам нужна помощь — пусть близкие узнают об этом. Один QR открывает важный контакт и информацию, которой вы решили поделиться."
                : "Создайте свою цифровую карточку. Пусть важный контакт будет рядом, где бы вы ни находились."}
            </Text>
            <View
              style={[s.actions, { flexDirection: desktop ? "row" : "column" }]}
            >
              <Button
                label={token ? "Мой QR-код" : "Создать карточку"}
                onPress={() => router.push(token ? "/my" : "/create")}
                style={{ minHeight: 52, paddingHorizontal: 28 }}
              />
              <Button
                label={
                  desktop
                    ? "Узнать больше"
                    : token
                      ? "Открыть профиль"
                      : "У меня уже есть ключ"
                }
                kind={desktop ? "secondary" : "onImage"}
                onPress={() =>
                  router.push(
                    (desktop
                      ? "/about"
                      : token
                        ? "/profile"
                        : "/restore") as Href,
                  )
                }
                style={{ minHeight: 52, paddingHorizontal: 26 }}
              />
            </View>
            {desktop && (
              <Button
                label={token ? "Открыть профиль" : "У меня уже есть ключ"}
                kind="onImage"
                onPress={() =>
                  router.push((token ? "/profile" : "/restore") as Href)
                }
                style={{
                  alignSelf: "flex-start",
                  minHeight: 44,
                  paddingHorizontal: 0,
                  borderWidth: 0,
                  paddingVertical: 4,
                }}
              />
            )}
            {desktop && (
              <Text style={s.heroFine}>
                Без регистрации для просмотра · Вы решаете, чем делиться
              </Text>
            )}
          </View>
        </View>
      </ImageBackground>
      {desktop && (
        <>
          <View style={s.benefits}>
            {benefits.map(([icon, title, description]) => (
              <View key={title} style={s.benefit}>
                <Icon name={icon} size={29} />
                <Text style={s.benefitTitle}>{title}</Text>
                <Text style={s.benefitDescription}>{description}</Text>
              </View>
            ))}
          </View>
          <View style={s.how}>
            <Text style={s.sectionLabel}>ВСЁ ПРОСТО</Text>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Помощь начинается с одного QR
            </Text>
            <View style={s.steps}>
              {[
                [
                  "01",
                  "Создайте карточку",
                  "Укажите своё имя и контакт человека, которому доверяете.",
                ],
                [
                  "02",
                  "Сохраните QR",
                  "Разместите код там, где его легко найти. Секретный ключ сохраните отдельно.",
                ],
                [
                  "03",
                  "Оставайтесь на связи",
                  "Камера телефона откроет карточку в браузере. Приложение для просмотра не нужно.",
                ],
              ].map(([number, title, text]) => (
                <View key={number} style={s.step}>
                  <Text style={s.number}>{number}</Text>
                  <Text style={s.stepTitle}>{title}</Text>
                  <Text style={s.stepText}>{text}</Text>
                </View>
              ))}
            </View>
            <Button
              label="Как это работает"
              kind="ghost"
              icon="arrow"
              onPress={() => router.push("/help" as Href)}
              style={{ alignSelf: "center" }}
            />
          </View>
        </>
      )}
    </Page>
  );
}
const s = StyleSheet.create({
  hero: { width: "100%", backgroundColor: "#193746", overflow: "hidden" },
  heroInside: { width: "100%", maxWidth: 1320, alignSelf: "center" },
  heroText: { gap: 22 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#E5EDF1",
  },
  heroTitle: { fontWeight: "800", color: c.white, letterSpacing: -1.5 },
  heroDescription: { fontSize: 17, lineHeight: 27, color: "#F1F4F6" },
  actions: { gap: 12, marginTop: 9 },
  heroFine: { fontSize: 12, color: "#DCE6EC", marginTop: 3 },
  benefits: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingVertical: 37,
    paddingHorizontal: 40,
    backgroundColor: c.white,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  benefit: { flex: 1, alignItems: "center", gap: 8, paddingHorizontal: 14 },
  benefitTitle: { fontSize: 15, fontWeight: "700", color: c.ink, marginTop: 5 },
  benefitDescription: { fontSize: 12, color: c.muted, textAlign: "center" },
  how: {
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
    gap: 17,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    color: c.primary,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.8,
    textAlign: "center",
    color: c.ink,
  },
  steps: { flexDirection: "row", gap: 24, marginVertical: 22 },
  step: {
    flex: 1,
    backgroundColor: c.white,
    borderRadius: 18,
    padding: 27,
    gap: 13,
    borderWidth: 1,
    borderColor: c.line,
  },
  number: { fontSize: 15, fontWeight: "700", color: c.primary },
  stepTitle: { fontSize: 19, fontWeight: "700", color: c.ink },
  stepText: { fontSize: 14, lineHeight: 23, color: c.muted },
});
