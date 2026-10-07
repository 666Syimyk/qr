import assert from "node:assert/strict";
import test from "node:test";

import {
  cardToForm,
  emptyForm,
  firstErrorStep,
  mapFieldErrors,
  validateForm,
  validateStep,
  type FormValues,
} from "../src/lib/form";

const validValues = (): FormValues => ({
  displayName: "Демо-владелец",
  contactName: "Демо-контакт",
  relationship: "Родственник",
  phone: "+999000000001",
  importantInfo: "",
  publishImportantInfo: false,
  consentToPublish: true,
});

test("a new form requires explicit consent and keeps optional information private", () => {
  assert.equal(emptyForm.publishImportantInfo, false);
  assert.equal(emptyForm.consentToPublish, false);
  const result = validateForm({ ...emptyForm });
  assert.equal(result.input, null);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), [
    "consentToPublish",
    "contactName",
    "displayName",
    "phone",
  ]);
});

test("wizard validates only the visible step and never grants consent implicitly", () => {
  const values = { ...emptyForm, displayName: "Алихан" };
  assert.deepEqual(validateStep(values, 0), {});
  assert.deepEqual(Object.keys(validateStep(values, 1)), [
    "contactName",
    "phone",
  ]);
  assert.deepEqual(Object.keys(validateStep(values, 2)), ["consentToPublish"]);
  assert.equal(values.consentToPublish, false);
  assert.equal(validateForm(values).input, null);
});

test("a filled contact step can advance while an optional draft remains invalid", () => {
  const values = {
    ...validValues(),
    importantInfo: "я".repeat(501),
    consentToPublish: false,
  };
  assert.deepEqual(validateStep(values, 1), {});
  assert.deepEqual(Object.keys(validateStep(values, 2)), [
    "importantInfo",
    "consentToPublish",
  ]);
  assert.equal(validateForm(values).input, null);
});

test("wizard returns to the earliest invalid page, including nested API errors", () => {
  assert.equal(
    firstErrorStep({ phone: "Неверный номер", displayName: "Укажите имя" }),
    0,
  );
  assert.equal(
    firstErrorStep({ "emergencyContact.phone": "Неверный номер" }),
    1,
  );
  assert.equal(
    firstErrorStep({
      "emergencyContact.relationship": "Слишком длинное значение",
    }),
    1,
  );
  assert.equal(firstErrorStep({ importantInfo: "Слишком длинный текст" }), 2);
  assert.equal(firstErrorStep({ consentToPublish: "Подтвердите согласие" }), 2);
});

test("unknown server errors stay on the current wizard page", () => {
  assert.equal(firstErrorStep({ unknownField: "Ошибка" }, 1), 1);
  assert.equal(firstErrorStep({ displayName: "", phone: "Неверный номер" }), 1);
});

test("submission trims every string and converts a blank note to null", () => {
  const values = {
    ...validValues(),
    displayName: "  Демо-владелец  ",
    contactName: "\tДемо-контакт\n",
    relationship: " Родственник ",
    phone: " +999000000001 ",
    importantInfo: " \n\t ",
  };
  assert.deepEqual(validateForm(values), {
    input: {
      displayName: "Демо-владелец",
      emergencyContact: {
        name: "Демо-контакт",
        relationship: "Родственник",
        phone: "+999000000001",
      },
      importantInfo: null,
      publishImportantInfo: false,
      consentToPublish: true,
    },
    fieldErrors: {},
  });
  assert.equal(values.displayName, "  Демо-владелец  ");
});

test("an owner can save a trimmed note while keeping publication disabled", () => {
  const result = validateForm({
    ...validValues(),
    importantInfo: "  Вымышленные сведения.  ",
  });
  assert.equal(result.input?.importantInfo, "Вымышленные сведения.");
  assert.equal(result.input?.publishImportantInfo, false);
});

test("single-character names and an empty relationship are valid", () => {
  const result = validateForm({
    ...validValues(),
    displayName: "Я",
    contactName: "Ю",
    relationship: "  ",
  });
  assert.ok(result.input);
  assert.equal(result.input.emergencyContact.relationship, "");
});

test("whitespace-only names are rejected separately", () => {
  const result = validateForm({
    ...validValues(),
    displayName: " \t",
    contactName: "\n ",
  });
  assert.equal(result.input, null);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), [
    "contactName",
    "displayName",
  ]);
});

for (const [field, limit] of [
  ["displayName", 80],
  ["contactName", 80],
  ["relationship", 40],
  ["importantInfo", 500],
] as const) {
  test(`${field} accepts exactly ${limit} characters after trimming`, () => {
    const result = validateForm({
      ...validValues(),
      [field]: ` ${"я".repeat(limit)} `,
    });
    assert.ok(result.input);
    assert.deepEqual(result.fieldErrors, {});
  });

  test(`${field} rejects ${limit + 1} characters`, () => {
    const result = validateForm({
      ...validValues(),
      [field]: "я".repeat(limit + 1),
    });
    assert.equal(result.input, null);
    assert.deepEqual(Object.keys(result.fieldErrors), [field]);
  });
}

for (const phone of ["+12345678", "+123456789012345"]) {
  test(`accepts international phone boundary ${phone.length - 1} digits`, () => {
    assert.equal(
      validateForm({ ...validValues(), phone }).input?.emergencyContact.phone,
      phone,
    );
  });
}

for (const phone of [
  "",
  "12345678",
  "+02345678",
  "+1234567",
  "+1234567890123456",
  "+1234 5678",
  "+1234-5678",
  "+１２３４５６７８",
  "+12345678\n9",
]) {
  test(`rejects malformed international phone ${JSON.stringify(phone)}`, () => {
    const result = validateForm({ ...validValues(), phone });
    assert.equal(result.input, null);
    assert.deepEqual(Object.keys(result.fieldErrors), ["phone"]);
  });
}

test("consent must be strictly true and publication must be a boolean", () => {
  for (const consentToPublish of [false, undefined, "true", 1]) {
    const result = validateForm({
      ...validValues(),
      consentToPublish,
    } as FormValues);
    assert.equal(result.input, null);
    assert.ok(result.fieldErrors.consentToPublish);
  }
  const result = validateForm({
    ...validValues(),
    publishImportantInfo: "false",
  } as unknown as FormValues);
  assert.equal(result.input, null);
  assert.ok(result.fieldErrors.publishImportantInfo);
});

test("cardToForm retains unpublished notes and maps nested contact fields", () => {
  assert.deepEqual(
    cardToForm({
      displayName: "Демо-владелец",
      emergencyContact: {
        name: "Демо-контакт",
        relationship: "",
        phone: "+999000000001",
      },
      importantInfo: "Вымышленные сведения.",
      publishImportantInfo: false,
      consentToPublish: true,
    }),
    {
      displayName: "Демо-владелец",
      contactName: "Демо-контакт",
      relationship: "",
      phone: "+999000000001",
      importantInfo: "Вымышленные сведения.",
      publishImportantInfo: false,
      consentToPublish: true,
    },
  );
});

test("cardToForm converts a null note to an editable empty string", () => {
  const result = cardToForm({
    displayName: "Демо-владелец",
    emergencyContact: {
      name: "Демо-контакт",
      relationship: "",
      phone: "+999000000001",
    },
    importantInfo: null,
    publishImportantInfo: true,
    consentToPublish: true,
  });
  assert.equal(result.importantInfo, "");
  assert.equal(result.publishImportantInfo, true);
});

test("server contact errors map to editable fields without discarding other errors", () => {
  assert.deepEqual(
    mapFieldErrors({
      displayName: "Имя слишком длинное",
      "emergencyContact.name": "Укажите контакт",
      "emergencyContact.relationship": "Слишком длинное значение",
      "emergencyContact.phone": "Неверный формат",
      consentToPublish: "Подтвердите согласие",
      unknownField: "Неподдерживаемое поле",
    }),
    {
      displayName: "Имя слишком длинное",
      contactName: "Укажите контакт",
      relationship: "Слишком длинное значение",
      phone: "Неверный формат",
      consentToPublish: "Подтвердите согласие",
      unknownField: "Неподдерживаемое поле",
    },
  );
});
