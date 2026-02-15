import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^\+[1-9]\d{6,14}$/.test(value), {
    message: 'Phone must be in E.164 format'
  });

export const createClientSchema = z
  .object({
    uid: z.string().trim().min(1),
    name: z.string().trim().min(2),
    phone: phoneSchema.optional(),
    address: z.string().trim().min(3).optional()
  })
  .strict();

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    phone: phoneSchema.optional(),
    address: z.string().trim().min(3).optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
