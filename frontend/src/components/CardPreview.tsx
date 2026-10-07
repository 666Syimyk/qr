import { StyleSheet, Text, View } from "react-native";
import { colors as c } from "./theme";
import { Icon } from "./Icon";
import type { FormValues } from "../lib/form";

export function CardPreview({ values }: { values?: FormValues }) {
  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Icon name="eye" size={17} />
        <Text style={s.eyebrow}>ТАК УВИДЯТ КАРТОЧКУ</Text>
      </View>
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.miniIcon}>
            <Icon name="qr" size={17} />
          </View>
          <Text style={s.cardBrand}>EMERGENCY QR</Text>
          <View style={s.publicPill}>
            <Text style={s.pillText}>Для просмотра</Text>
          </View>
        </View>
        <View style={s.avatar}>
          <Icon name="user" size={32} />
        </View>
        <Text style={s.name}>
          {values?.displayName.trim() || "Имя на карточке"}
        </Text>
        <Text style={s.sub}>Контакт на случай, когда нужна помощь</Text>
        <View style={s.contact}>
          <Text style={s.caption}>ЭКСТРЕННЫЙ КОНТАКТ</Text>
          <Text style={s.contactName}>
            {values?.contactName.trim() || "Имя вашего близкого"}
          </Text>
          {!!values?.relationship.trim() && (
            <Text style={s.relationship}>{values.relationship.trim()}</Text>
          )}
          <Text style={s.phone}>
            {values?.phone.trim() || "Номер контакта"}
          </Text>
        </View>
        <View style={s.call}>
          <Icon name="phone" color="white" size={18} />
          <Text style={s.callText}>Позвонить контакту</Text>
        </View>
        {values?.publishImportantInfo && !!values.importantInfo.trim() && (
          <View style={s.info}>
            <Text style={s.infoLabel}>Важная информация</Text>
            <Text style={s.infoText}>{values.importantInfo.trim()}</Text>
          </View>
        )}
        <Text style={s.small}>Данные указаны владельцем и не проверены.</Text>
      </View>
      <View style={s.explanation}>
        <Icon name="shield" size={17} color={c.muted} />
        <Text style={s.explainText}>
          Только эти данные будут доступны по QR. Секретный ключ остаётся у вас.
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { gap: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: c.muted,
    letterSpacing: 1.3,
  },
  card: {
    backgroundColor: c.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.line,
    padding: 24,
    boxShadow: "0 12px 35px rgba(20, 34, 53, 0.05)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 25,
  },
  miniIcon: { padding: 5, borderRadius: 7, backgroundColor: c.tealLight },
  cardBrand: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: c.ink,
    flex: 1,
  },
  publicPill: {
    backgroundColor: "#F1F5F8",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pillText: { fontSize: 9, color: c.muted },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: c.tealLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: { fontSize: 25, lineHeight: 32, fontWeight: "700", color: c.ink },
  sub: { fontSize: 13, lineHeight: 20, color: c.muted, marginTop: 7 },
  contact: {
    backgroundColor: "#F6F9FB",
    padding: 18,
    borderRadius: 13,
    marginTop: 24,
    gap: 5,
  },
  caption: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: c.muted,
    marginBottom: 6,
  },
  contactName: { fontSize: 18, fontWeight: "600", color: c.ink },
  relationship: { fontSize: 13, color: c.muted },
  phone: { fontSize: 17, color: c.teal, marginTop: 7 },
  call: {
    backgroundColor: c.teal,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
  },
  callText: { fontSize: 13, fontWeight: "600", color: c.white },
  small: { fontSize: 11, lineHeight: 17, color: c.muted, marginTop: 18 },
  explanation: { flexDirection: "row", gap: 9, paddingHorizontal: 7 },
  explainText: { fontSize: 13, lineHeight: 20, color: c.muted, flex: 1 },
  info: { marginTop: 18, gap: 6 },
  infoLabel: { fontSize: 14, fontWeight: "600", color: c.ink },
  infoText: { fontSize: 14, lineHeight: 22, color: c.ink },
});
