import { z } from 'zod';
import type { RequestHandler } from 'express';
import { ApiFailure } from './security.ts';

export const cardSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  emergencyContact: z.strictObject({
    name: z.string().trim().min(1).max(80), relationship: z.string().trim().max(40),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  }),
  importantInfo: z.string().trim().min(1).max(500).nullable(),
  publishImportantInfo: z.boolean(), consentToPublish: z.literal(true),
});
export const statusSchema = z.strictObject({ status: z.enum(['active', 'inactive']) });
export const rotateSchema = z.strictObject({});
export const profilePhotoSchema = z.strictObject({
  photoDataUrl: z.string()
    .max(350_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable(),
});
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || 'body';
    fields[key] = issue.code === 'unrecognized_keys' ? 'Неизвестные поля запрещены.' : 'Проверьте тип, формат и длину поля.';
  }
  throw new ApiFailure(400, 'VALIDATION_ERROR', 'Проверьте поля запроса.', fields);
}
export const requireJson: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json')) return next(new ApiFailure(415, 'VALIDATION_ERROR', 'Используйте Content-Type: application/json.'));
  next();
};
