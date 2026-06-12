import { z } from 'zod';

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const normalized = date.toISOString().slice(0, 10);
  return normalized === value;
}

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidIsoDate(value), { message: 'Invalid ISO date (YYYY-MM-DD)' });

const amountSchema = z.union([
  z.number().positive(),
  z
    .string()
    .trim()
    .refine((value) => /^\$?\d+(?:\.\d{1,2})?$/.test(value), {
      message: 'Invalid amount format (e.g. 50, 50.00 or $50)'
    })
]);

const cycleDaySchema = z.preprocess((value) => {
  if (typeof value === 'string') return Number(value);
  return value;
}, z.number().int().min(1).max(31));

export const createSubscriptionSchema = z
  .object({
    ownerId: z.string().trim().min(1).optional(),
    clientId: z.string().trim().min(1).optional(),
    startDate: isoDateSchema.optional(),
    cutDate: isoDateSchema.optional(),
    nextCutDate: isoDateSchema.optional(),
    plan: z.enum(['Itinerante Ilimitado', 'Itinerante 100GB', 'Residencial']),
    amount: amountSchema,
    cycleDay: cycleDaySchema.optional(),
    passwordSub: z.string().trim().min(1).optional(),
    kitNumber: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional()
  })
  .strict()
  .refine((data) => Boolean(data.ownerId || data.clientId), {
    message: 'ownerId or clientId is required',
    path: ['ownerId']
  })
  .refine((data) => Boolean(data.nextCutDate || data.cutDate || data.startDate), {
    message: 'nextCutDate, cutDate or startDate is required',
    path: ['nextCutDate']
  });

export const updateSubscriptionSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    cutDate: isoDateSchema.optional(),
    nextCutDate: isoDateSchema.optional(),
    plan: z.enum(['Itinerante Ilimitado', 'Itinerante 100GB', 'Residencial']).optional(),
    amount: amountSchema.optional(),
    cycleDay: cycleDaySchema.optional(),
    kitNumber: z.string().trim().min(1).optional(),
    passwordSub: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    status: z.enum(['active', 'about_to_expire', 'suspended', 'paused', 'cancelled']).optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const statusSchema = z
  .object({
    status: z.enum(['active', 'about_to_expire', 'suspended', 'paused', 'cancelled'])
  })
  .strict();

export type StatusInput = z.infer<typeof statusSchema>;
