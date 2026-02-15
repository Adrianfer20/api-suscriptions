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

const amountSchema = z
  .string()
  .trim()
  .refine((value) => /^\$\d+(?:\.\d{1,2})?$/.test(value), { message: 'Invalid amount format (e.g. $50 or $50.00)' });

export const createSubscriptionSchema = z
  .object({
    clientId: z.string().trim().min(1),
    startDate: isoDateSchema,
    cutDate: isoDateSchema,
    plan: z.string().trim().min(1),
    amount: amountSchema
  })
  .strict();

export const updateSubscriptionSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    cutDate: isoDateSchema.optional(),
    plan: z.string().trim().min(1).optional(),
    amount: amountSchema.optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
