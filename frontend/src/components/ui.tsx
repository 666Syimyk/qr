import { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors as c } from "./theme";
import { Icon, IconName } from "./Icon";

export function Button({
  label,
  onPress,
  kind = "primary",
  icon,
  disabled,
  busy,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger" | "onImage";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const fill =
    kind === "primary"
      ? c.teal
      : kind === "danger"
        ? c.redLight
        : kind === "secondary"
          ? c.white
          : "transparent";
  const ink =
    kind === "primary" || kind === "onImage"
      ? c.white
      : kind === "danger"
        ? c.red
        : c.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: fill,
          borderColor:
            kind === "onImage"
              ? "rgba(255,255,255,0.8)"
              : kind === "secondary"
                ? c.line
                : "transparent",
          opacity: disabled || busy ? 0.55 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        icon && <Icon name={icon} color={ink} size={18} />
      )}
      <Text style={[s.buttonText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.panel, style]}>{children}</View>;
}
export function Body({
  children,
  muted = false,
}: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[s.body, muted && { color: c.muted }]}>{children}</Text>;
}
export function Notice({
  children,
  tone = "info",
}: PropsWithChildren<{ tone?: "info" | "warning" | "error" | "success" }>) {
  const color =
    tone === "error"
      ? c.red
      : tone === "warning"
        ? c.amber
        : tone === "success"
          ? c.success
          : c.muted;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[
        s.notice,
        {
          backgroundColor:
            tone === "error"
              ? c.redLight
              : tone === "warning"
                ? c.amberLight
                : tone === "success"
                  ? c.successLight
                  : "#F0F3F7",
        },
      ]}
    >
      <Icon
        name={tone === "success" ? "check" : "info"}
        color={color}
        size={19}
      />
      <Text style={[s.noticeText, { color }]}>{children}</Text>
    </View>
  );
}
export function Badge({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <View style={[s.badge, muted && { backgroundColor: "#EDF1F4" }]}>
      <View style={[s.dot, muted && { backgroundColor: c.muted }]} />
      <Text style={[s.badgeText, muted && { color: c.muted }]}>{label}</Text>
    </View>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#8A97A5"
        style={[
          s.input,
          props.multiline && { minHeight: 116, textAlignVertical: "top" },
          error && { borderColor: c.red },
          props.style,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.fieldError}>
          {error}
        </Text>
      ) : (
        hint && <Text style={s.hint}>{hint}</Text>
      )}
    </View>
  );
}
export function CheckRow({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={s.checkRow}
    >
      <View
        style={[
          s.checkbox,
          checked && { backgroundColor: c.teal, borderColor: c.teal },
        ]}
      >
        {checked && <Icon name="check" size={17} color={c.white} />}
      </View>
      <Text style={s.checkLabel}>{label}</Text>
    </Pressable>
  );
}
export function Loading({ label = "Загружаем карточку…" }: { label?: string }) {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={c.teal} size="large" />
      <Text style={s.body}>{label}</Text>
    </View>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Panel style={{ gap: 20 }}>
      <Notice tone="error">{message}</Notice>
      {onRetry && (
        <Button
          label="Повторить запрос"
          icon="refresh"
          kind="secondary"
          onPress={onRetry}
        />
      )}
    </Panel>
  );
}
export function ConfirmDialog({
  visible,
  title,
  message,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View style={s.backdrop}>
        <View accessibilityViewIsModal style={s.dialog}>
          <View style={s.dialogIcon}>
            <Icon name="info" size={28} color={c.amber} />
          </View>
          <Text accessibilityRole="header" style={s.dialogTitle}>
            {title}
          </Text>
          <Body muted>{message}</Body>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Button
              label={label}
              kind="danger"
              busy={busy}
              onPress={onConfirm}
            />
            <Button
              label="Отмена"
              kind="secondary"
              disabled={busy}
              onPress={onCancel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  buttonText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  panel: {
    backgroundColor: c.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.line,
    padding: 24,
  },
  body: { fontSize: 16, lineHeight: 25, color: c.ink },
  notice: {
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeText: { fontSize: 14, lineHeight: 21, flex: 1 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: c.tealLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  badgeText: { color: c.teal, fontWeight: "600", fontSize: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.teal },
  field: { gap: 8 },
  label: { fontSize: 15, fontWeight: "600", color: c.ink },
  input: {
    fontSize: 16,
    color: c.ink,
    backgroundColor: "#FBFCFD",
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  hint: { fontSize: 13, lineHeight: 19, color: c.muted },
  fieldError: { fontSize: 13, lineHeight: 19, color: c.red },
  checkRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#8B9BA7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkLabel: { fontSize: 14, lineHeight: 22, flex: 1, color: c.ink },
  loading: { paddingVertical: 70, alignItems: "center", gap: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,34,53,.48)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: c.white,
    borderRadius: 24,
    padding: 28,
    gap: 16,
  },
  dialogIcon: {
    backgroundColor: c.amberLight,
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogTitle: {
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "700",
    color: c.ink,
  },
});
