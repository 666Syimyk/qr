import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { CardInput } from "../types/contracts";
import {
  cardToForm,
  emptyForm,
  firstErrorStep,
  FormStep,
  FormValues,
  mapFieldErrors,
  validateForm,
  validateStep,
} from "../lib/form";
import { ApiClientError, errorMessage } from "../lib/api";
import { Button, CheckRow, Field, Notice, Panel } from "./ui";
import { usePageBack } from "./Page";
import { colors as c } from "./theme";
import { Icon } from "./Icon";

const steps = [
  {
    label: "Основное",
    title: "Как к вам обращаться?",
    description: "Это имя увидит человек, который отсканирует ваш QR-код.",
  },
  {
    label: "Контакт",
    title: "Кому позвонить?",
    description:
      "Укажите близкого человека, с которым можно связаться, если вам нужна помощь.",
  },
  {
    label: "Дополнительно",
    title: "Что ещё стоит знать?",
    description:
      "Добавьте важную информацию, если хотите. Вы решаете, показывать ли её по QR.",
  },
] as const;

export function CardForm({
  initial,
  onSubmit,
  editing = false,
}: {
  initial?: CardInput;
  onSubmit: (input: CardInput) => Promise<void>;
  editing?: boolean;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    initial
      ? { ...cardToForm(initial), consentToPublish: false }
      : { ...emptyForm },
  );
  const [step, setStep] = useState<FormStep>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const back = useCallback(() => {
    if (sending.current) return true;
    if (step === 0) return false;
    Keyboard.dismiss();
    setError(null);
    setStep((step - 1) as FormStep);
    return true;
  }, [step]);
  usePageBack(back);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        back,
      );
      return () => subscription.remove();
    }, [back]),
  );

  const change = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    if (sending.current) return;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setError(null);
  };
  const next = () => {
    if (sending.current || step === 2) return;
    const fieldErrors = validateStep(values, step);
    setErrors(fieldErrors);
    setError(null);
    if (Object.keys(fieldErrors).length) return;
    Keyboard.dismiss();
    setStep((step + 1) as FormStep);
  };
  const submit = async () => {
    if (sending.current) return;
    const result = validateForm(values);
    setErrors(result.fieldErrors);
    setError(null);
    if (!result.input) {
      setStep(firstErrorStep(result.fieldErrors));
      setError("Проверьте отмеченные поля и подтвердите согласие.");
      return;
    }
    Keyboard.dismiss();
    sending.current = true;
    setBusy(true);
    try {
      await onSubmit(result.input);
      // A successful submit navigates away. Keep the guard until unmount so
      // another press cannot create a second card while the route changes.
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.fieldErrors) {
        const fieldErrors = mapFieldErrors(e.fieldErrors);
        setErrors(fieldErrors);
        setStep(firstErrorStep(fieldErrors, step));
      }
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Panel style={s.panel}>
        <View style={s.progressHeader}>
          <View style={s.startLabel}>
            <Icon name="shield" color={c.red} size={18} />
            <Text style={s.caption}>Ваша карточка помощи</Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={s.counter}>
            Шаг {step + 1} из 3
          </Text>
        </View>
        <View
          style={s.progress}
          accessibilityLabel={`Шаг ${step + 1} из 3: ${steps[step].label}`}
        >
          {steps.map((item, index) => (
            <View key={item.label} style={s.progressItem}>
              <View
                style={[
                  s.progressTrack,
                  index <= step && s.progressTrackActive,
                ]}
              />
              <View style={s.progressCaption}>
                <View
                  style={[s.stepCircle, index <= step && s.stepCircleActive]}
                >
                  {index < step ? (
                    <Icon name="check" color={c.white} size={12} />
                  ) : (
                    <Text
                      style={[
                        s.stepNumber,
                        index <= step && { color: c.white },
                      ]}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    s.progressLabel,
                    index === step && s.progressLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.heading}>
          <Text accessibilityRole="header" style={s.title}>
            {steps[step].title}
          </Text>
          <Text style={s.help}>{steps[step].description}</Text>
        </View>
        {error && <Notice tone="error">{error}</Notice>}

        {step === 0 && (
          <View style={s.fields}>
            <Field
              label="Имя на карточке"
              placeholder="Например, Алихан"
              value={values.displayName}
              onChangeText={(v) => change("displayName", v)}
              maxLength={80}
              autoComplete="off"
              editable={!busy}
              returnKeyType="next"
              onSubmitEditing={next}
              error={errors.displayName}
              hint="Можно указать только имя. До 80 символов."
            />
            <View style={s.softNote}>
              <Icon name="user" color={c.muted} size={20} />
              <Text style={s.softNoteText}>
                Достаточно имени и одного экстренного контакта. Карточку можно
                будет изменить в любой момент.
              </Text>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={s.fields}>
            <Field
              label="Имя контакта"
              placeholder="Как зовут вашего близкого"
              value={values.contactName}
              onChangeText={(v) => change("contactName", v)}
              maxLength={80}
              editable={!busy}
              error={errors.contactName}
            />
            <Field
              label="Кем вам приходится · необязательно"
              placeholder="Например, мама, брат или друг"
              value={values.relationship}
              onChangeText={(v) => change("relationship", v)}
              maxLength={40}
              editable={!busy}
              error={errors.relationship}
            />
            <Field
              label="Номер телефона"
              placeholder="+996700123456"
              value={values.phone}
              onChangeText={(v) => change("phone", v)}
              keyboardType="phone-pad"
              autoComplete="off"
              autoCorrect={false}
              editable={!busy}
              returnKeyType="next"
              onSubmitEditing={next}
              error={errors.phone}
              hint="Международный формат: + и 8–15 цифр, без пробелов."
            />
            <View style={s.softNote}>
              <Icon name="phone" color={c.muted} size={20} />
              <Text style={s.softNoteText}>
                Этот номер будет доступен по QR-коду. Заранее согласуйте
                публикацию с вашим контактом.
              </Text>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={s.fields}>
            <Field
              label="Что ещё стоит знать · необязательно"
              placeholder="Короткая информация для человека рядом"
              value={values.importantInfo}
              onChangeText={(v) => change("importantInfo", v)}
              maxLength={500}
              multiline
              editable={!busy}
              error={errors.importantInfo}
              hint={`${values.importantInfo.length}/500 символов`}
            />
            <View style={s.switchRow}>
              <View style={s.switchCopy}>
                <Text style={s.switchTitle}>Показывать важную информацию</Text>
                <Text style={s.small}>
                  {values.publishImportantInfo
                    ? "Текст будет виден любому обладателю ссылки."
                    : "Выключено — текст будет виден только вам."}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Показывать важную информацию"
                value={values.publishImportantInfo}
                onValueChange={(v) => change("publishImportantInfo", v)}
                disabled={busy}
                trackColor={{ false: c.line, true: c.red }}
                thumbColor={c.white}
              />
            </View>
            {errors.publishImportantInfo && (
              <Text accessibilityRole="alert" style={s.fieldError}>
                {errors.publishImportantInfo}
              </Text>
            )}
            <View style={s.summary}>
              <Text style={s.summaryTitle}>Будет видно по QR-коду</Text>
              <View style={s.summaryLine}>
                <Icon name="user" size={17} color={c.muted} />
                <Text style={s.summaryText}>{values.displayName.trim()}</Text>
              </View>
              <View style={s.summaryLine}>
                <Icon name="phone" size={17} color={c.muted} />
                <View style={s.summaryContact}>
                  <Text style={s.summaryText}>
                    {values.contactName.trim()}
                    {values.relationship.trim()
                      ? ` · ${values.relationship.trim()}`
                      : ""}
                  </Text>
                  <Text style={s.small}>{values.phone.trim()}</Text>
                </View>
              </View>
              <Text style={s.small}>
                {values.publishImportantInfo && values.importantInfo.trim()
                  ? "Важная информация тоже будет опубликована."
                  : "Важная информация не будет опубликована."}
              </Text>
            </View>
            <CheckRow
              checked={values.consentToPublish}
              onChange={(v) => change("consentToPublish", v)}
              disabled={busy}
              label="Понимаю, что имя и контакт увидит любой обладатель QR или ссылки. Контакт согласен на публикацию номера"
            />
            {errors.consentToPublish && (
              <Text accessibilityRole="alert" style={s.fieldError}>
                {errors.consentToPublish}
              </Text>
            )}
            <Text style={s.small}>
              Отключение карточки закроет доступ по ссылке, но не удалит уже
              сделанные снимки экрана.
            </Text>
          </View>
        )}

        <View style={s.actions}>
          <Button
            label={
              step === 2
                ? editing
                  ? "Сохранить изменения"
                  : "Создать карточку"
                : "Далее"
            }
            busy={busy}
            icon={step === 2 && editing ? "check" : "arrow"}
            onPress={step === 2 ? () => void submit() : next}
          />
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={back}
              style={({ pressed }) => [
                s.back,
                { opacity: busy ? 0.5 : pressed ? 0.65 : 1 },
              ]}
            >
              <Icon name="back" color={c.muted} size={17} />
              <Text style={s.backLabel}>Назад</Text>
            </Pressable>
          )}
          <Text style={s.submitHint}>
            {step === 0
              ? "Затем добавим контакт для экстренной связи."
              : step === 1
                ? "Остался один шаг — информация и согласие."
                : editing
                  ? "QR останется прежним. Изменения появятся после сохранения."
                  : "Ваш QR-код появится сразу после создания карточки."}
          </Text>
        </View>
      </Panel>
      {step === 2 && !editing && (
        <View style={s.keyNote}>
          <Icon name="lock" color={c.muted} size={17} />
          <Text style={s.small}>
            После создания сохраните секретный ключ — он нужен для
            редактирования.
            {Platform.OS === "web"
              ? " В браузере ключ хранится только до обновления страницы."
              : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", maxWidth: 600, alignSelf: "center", gap: 18 },
  panel: { gap: 24, padding: 24, borderRadius: 22 },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  caption: { fontSize: 13, fontWeight: "600", color: c.ink },
  startLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 28,
    flex: 1,
  },
  counter: { fontSize: 12, color: c.muted },
  progress: { flexDirection: "row", gap: 8 },
  progressItem: { flex: 1, gap: 12 },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: c.line },
  progressTrackActive: { backgroundColor: c.red },
  progressCaption: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepCircle: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: { backgroundColor: c.red },
  stepNumber: { fontSize: 10, fontWeight: "700", color: c.muted },
  progressLabel: { fontSize: 10, color: c.muted, flexShrink: 1 },
  progressLabelActive: { color: c.ink, fontWeight: "700" },
  heading: { gap: 9, marginTop: 8 },
  title: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "700",
    color: c.ink,
    letterSpacing: -0.45,
  },
  help: { fontSize: 14, lineHeight: 22, color: c.muted },
  fields: { gap: 20 },
  softNote: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.background,
  },
  softNoteText: { fontSize: 13, lineHeight: 20, color: c.muted, flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  switchCopy: { flex: 1, gap: 5 },
  switchTitle: { fontSize: 14, fontWeight: "600", color: c.ink },
  summary: {
    backgroundColor: c.background,
    padding: 18,
    borderRadius: 14,
    gap: 13,
  },
  summaryTitle: { fontSize: 13, fontWeight: "700", color: c.ink },
  summaryLine: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryContact: { flex: 1, gap: 3 },
  summaryText: { fontSize: 14, lineHeight: 21, color: c.ink, flexShrink: 1 },
  small: { fontSize: 12, lineHeight: 19, color: c.muted, flexShrink: 1 },
  fieldError: { fontSize: 13, lineHeight: 20, color: c.red },
  actions: { gap: 8, paddingTop: 8 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 44,
  },
  backLabel: { fontSize: 14, fontWeight: "600", color: c.muted },
  submitHint: {
    fontSize: 12,
    lineHeight: 19,
    color: c.muted,
    textAlign: "center",
  },
  keyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 6,
  },
});
