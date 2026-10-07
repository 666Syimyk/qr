import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { Page } from "../components/Page";
import { Button, Panel } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { colors as c } from "../components/theme";
export default function About() {
  const desktop = useWindowDimensions().width >= 800;
  const introduction = (
    <View style={[s.copy, { maxWidth: desktop ? 510 : "100%" }]}>
      <Text accessibilityRole="header" style={s.title}>
        {"Забота, которая\nвсегда рядом"}
      </Text>
      <Text style={s.description}>
        Мы верим, что технологии могут помогать людям заботиться друг о друге.
        Emergency QR даёт человеку рядом простой способ связаться с вашим
        близким.
      </Text>
    </View>
  );
  return (
    <Page title="О проекте">
      {desktop ? (
        <ImageBackground
          source={require("../../assets/images/care-heart.png")}
          resizeMode="cover"
          style={[
            s.hero,
            { padding: desktop ? 42 : 24, minHeight: desktop ? 310 : 440 },
          ]}
          imageStyle={{ borderRadius: 22, width: "100%", height: "100%" }}
        >
          {introduction}
        </ImageBackground>
      ) : (
        <View style={[s.hero, { backgroundColor: c.white }]}>
          <Image
            source={require("../../assets/images/care-heart.png")}
            resizeMode="cover"
            style={{ width: "100%", height: 200 }}
          />
          <View style={{ padding: 24 }}>{introduction}</View>
        </View>
      )}
      <View style={[s.values, { flexDirection: desktop ? "row" : "column" }]}>
        {(
          [
            [
              "people",
              "Наша миссия",
              "Сделать важный контакт доступным в нужный момент.",
            ],
            [
              "shield",
              "Ваш выбор",
              "Вы сами выбираете сведения и управляете доступом к ним.",
            ],
            [
              "heart",
              "Наши ценности",
              "Забота. Понятность. Уважение к личной информации.",
            ],
          ] as [IconName, string, string][]
        ).map(([icon, title, text]) => (
          <Panel key={title} style={{ flex: 1, gap: 14 }}>
            <Icon name={icon} size={29} />
            <Text style={s.valueTitle}>{title}</Text>
            <Text style={s.body}>{text}</Text>
          </Panel>
        ))}
      </View>
      <View style={s.bottom}>
        <Text style={s.quote}>
          Иногда один маленький код помогает сделать первый важный шаг.
        </Text>
        <Text style={s.small}>
          Карточка содержит сведения владельца и не заменяет экстренные службы.
          Для демонстрации используйте вымышленные данные.
        </Text>
        <Button
          label="Создать карточку"
          onPress={() => router.push("/create")}
          style={{ alignSelf: "center", minWidth: 220 }}
        />
      </View>
    </Page>
  );
}
const s = StyleSheet.create({
  hero: {
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#F4F7FA",
    justifyContent: "center",
  },
  copy: { gap: 19 },
  title: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 42,
    letterSpacing: -1,
    color: c.ink,
  },
  description: { fontSize: 15, lineHeight: 25, color: c.ink },
  values: { gap: 18, marginTop: 24 },
  valueTitle: { fontSize: 18, fontWeight: "700", color: c.ink },
  body: { fontSize: 14, lineHeight: 23, color: c.muted },
  bottom: { paddingVertical: 36, gap: 22 },
  quote: {
    fontSize: 21,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "600",
    color: c.ink,
  },
  small: {
    fontSize: 13,
    lineHeight: 21,
    color: c.muted,
    textAlign: "center",
    maxWidth: 650,
    alignSelf: "center",
  },
});
