import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";
import { colors as c } from "./theme";
export function HeartMark({ size = 38 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessible={false}
    >
      <FontAwesome name="heart" size={size} color={c.primary} />
      <View style={{ position: "absolute", top: size * 0.18 }}>
        <FontAwesome name="plus" size={size * 0.43} color="white" />
      </View>
    </View>
  );
}
export function Brand({
  light = false,
  stacked = false,
  tagline = false,
}: {
  light?: boolean;
  stacked?: boolean;
  tagline?: boolean;
}) {
  return (
    <View style={[s.brand, stacked && s.stacked]}>
      <HeartMark size={stacked ? 64 : 34} />
      <View style={stacked ? { alignItems: "center" } : undefined}>
        <Text
          style={[
            s.name,
            { color: light ? c.white : c.ink },
            stacked && { fontSize: 27 },
          ]}
        >
          Emergency QR
        </Text>
        {tagline && (
          <Text style={[s.tag, { color: light ? "#EAF0F5" : c.muted }]}>
            Маленький код. Большая помощь.
          </Text>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  stacked: { flexDirection: "column", gap: 14 },
  name: { fontSize: 20, fontWeight: "800", letterSpacing: -0.7 },
  tag: { fontSize: 11, marginTop: 3 },
});
