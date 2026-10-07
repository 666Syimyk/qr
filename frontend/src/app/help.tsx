import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Page, PageTitle } from "../components/Page";
import { Button, Panel } from "../components/ui";
import { colors as c } from "../components/theme";
const steps = [
  [
    "1",
    "Создайте карточку",
    "Введите имя, экстренный контакт и, при желании, дополнительную информацию. Согласие на публикацию подтверждается отдельно.",
  ],
  [
    "2",
    "Сохраните доступ",
    "QR открывает публичную карточку. Секретный ключ нужен только вам — сохраните его отдельно, чтобы позже редактировать данные.",
  ],
  [
    "3",
    "Проверьте QR телефоном",
    "Отсканируйте код обычной камерой. Для просмотра достаточно браузера и доступа к интернету или к вашей локальной сети.",
  ],
];
const questions = [
  [
    "Как изменить информацию?",
    "Откройте «Мой QR-код» и нажмите «Изменить данные». Уже сохранённый QR продолжит работать.",
  ],
  [
    "Как убрать карточку из общего доступа?",
    "Нажмите «Отключить карточку» на экране QR. В профиле можно заменить публичный код или удалить карточку навсегда.",
  ],
  [
    "Что делать, если копирование недоступно?",
    "Нажмите и удерживайте текст ссылки или ключа, выберите «Выделить всё» и «Копировать». Браузер может ограничивать автоматическое копирование.",
  ],
  [
    "Почему QR не открывается на другом телефоне?",
    "При локальном запуске оба устройства должны быть в одной сети, а компьютер — включён. Для работы через мобильный интернет нужен постоянный HTTPS-сервер. QR не хранит карточку внутри себя.",
  ],
  [
    "Где хранится моя информация?",
    "Карточка хранится на сервере. На телефоне ключ сохраняется в защищённом хранилище. В браузере ключ хранится только до обновления страницы — сохраните его заранее.",
  ],
  [
    "Можно восстановить потерянный ключ?",
    "Нет. Имя, телефон и публичный QR не заменяют секретный ключ. Без него нужно создать новую карточку.",
  ],
];
export default function Help() {
  return (
    <Page title="Как это работает" compact>
      <PageTitle
        title="Три шага к вашей карточке"
        description="Всё важное — без сложных настроек."
      />
      <View style={{ gap: 14 }}>
        {steps.map(([number, title, text]) => (
          <Panel key={number} style={s.step}>
            <View style={s.number}>
              <Text style={s.numberText}>{number}</Text>
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={s.heading}>{title}</Text>
              <Text style={s.body}>{text}</Text>
            </View>
          </Panel>
        ))}
      </View>
      <Text accessibilityRole="header" style={s.faq}>
        Частые вопросы
      </Text>
      <Panel style={{ gap: 23 }}>
        {questions.map(([question, answer]) => (
          <View key={question} style={{ gap: 8 }}>
            <Text style={s.heading}>{question}</Text>
            <Text style={s.body}>{answer}</Text>
          </View>
        ))}
      </Panel>
      <Button
        label="Создать карточку"
        onPress={() => router.push("/create")}
        style={{ marginTop: 25 }}
      />
    </Page>
  );
}
const s = StyleSheet.create({
  step: { flexDirection: "row", gap: 16, padding: 22 },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: c.primary, fontSize: 15, fontWeight: "700" },
  heading: { fontSize: 16, fontWeight: "700", lineHeight: 23, color: c.ink },
  body: { fontSize: 14, lineHeight: 23, color: c.muted },
  faq: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 35,
    marginBottom: 20,
    color: c.ink,
  },
});
