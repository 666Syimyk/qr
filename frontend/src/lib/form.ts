import type { CardInput } from "../types/contracts";

export interface FormValues {
  displayName: string;
  contactName: string;
  relationship: string;
  phone: string;
  importantInfo: string;
  publishImportantInfo: boolean;
  consentToPublish: boolean;
}

export type FormStep = 0 | 1 | 2;

const stepFields: Record<FormStep, (keyof FormValues)[]> = {
  0: ["displayName"],
  1: ["contactName", "relationship", "phone"],
  2: ["importantInfo", "publishImportantInfo", "consentToPublish"],
};

/** Validate only the visible page; the final request still validates everything. */
export function validateStep(values: FormValues, step: FormStep) {
  const { fieldErrors } = validateForm(values);
  return Object.fromEntries(
    Object.entries(fieldErrors).filter(([field]) =>
      stepFields[step].includes(field as keyof FormValues),
    ),
  );
}

/** Return to the first affected page, including nested API field errors. */
export function firstErrorStep(
  errors: Record<string, string>,
  fallback: FormStep = 2,
): FormStep {
  const mapped = mapFieldErrors(errors);
  for (const step of [0, 1, 2] as const) {
    if (stepFields[step].some((field) => !!mapped[field])) return step;
  }
  return fallback;
}

export const emptyForm: FormValues = {
  displayName: "",
  contactName: "",
  relationship: "",
  phone: "",
  importantInfo: "",
  publishImportantInfo: false,
  consentToPublish: false,
};

export function cardToForm(card: CardInput): FormValues {
  return {
    displayName: card.displayName,
    contactName: card.emergencyContact.name,
    relationship: card.emergencyContact.relationship,
    phone: card.emergencyContact.phone,
    importantInfo: card.importantInfo ?? "",
    publishImportantInfo: card.publishImportantInfo,
    consentToPublish: card.consentToPublish,
  };
}

export function validateForm(values: FormValues): {
  input: CardInput | null;
  fieldErrors: Record<string, string>;
} {
  const displayName = values.displayName.trim();
  const contactName = values.contactName.trim();
  const relationship = values.relationship.trim();
  const phone = values.phone.trim();
  const importantInfo = values.importantInfo.trim();
  const fieldErrors: Record<string, string> = {};

  if (!displayName) fieldErrors.displayName = "Укажите имя владельца.";
  else if (displayName.length > 80)
    fieldErrors.displayName = "Имя должно содержать не больше 80 символов.";

  if (!contactName)
    fieldErrors.contactName = "Укажите имя экстренного контакта.";
  else if (contactName.length > 80)
    fieldErrors.contactName =
      "Имя контакта должно содержать не больше 80 символов.";

  if (relationship.length > 40)
    fieldErrors.relationship = "Не больше 40 символов.";
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    fieldErrors.phone =
      "Введите номер в международном формате: + и от 8 до 15 цифр, без пробелов.";
  }
  if (importantInfo.length > 500)
    fieldErrors.importantInfo =
      "Важная информация должна содержать не больше 500 символов.";
  if (typeof values.publishImportantInfo !== "boolean") {
    fieldErrors.publishImportantInfo =
      "Выберите, публиковать ли важную информацию.";
  }
  if (values.consentToPublish !== true) {
    fieldErrors.consentToPublish =
      "Подтвердите согласие на публикацию имени и контакта.";
  }

  if (Object.keys(fieldErrors).length) return { input: null, fieldErrors };

  return {
    input: {
      displayName,
      emergencyContact: { name: contactName, relationship, phone },
      importantInfo: importantInfo || null,
      publishImportantInfo: values.publishImportantInfo,
      consentToPublish: true,
    },
    fieldErrors,
  };
}

export function mapFieldErrors(
  errors: Record<string, string>,
): Record<string, string> {
  const contactFields: Record<string, string> = {
    "emergencyContact.name": "contactName",
    "emergencyContact.relationship": "relationship",
    "emergencyContact.phone": "phone",
  };
  return Object.fromEntries(
    Object.entries(errors).map(([key, message]) => [
      Object.hasOwn(contactFields, key) ? contactFields[key] : key,
      message,
    ]),
  );
}
