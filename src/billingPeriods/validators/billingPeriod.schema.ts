import { z } from 'zod';
import { currencySchema, paymentMethodSchema } from '../../payments/validators/payment.schema';

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

export const createBillingPeriodSchema = z
  .object({
    subscriptionId: z.string().trim().min(1),
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    dueDate: isoDateSchema,
    amount: z.number().positive(),
    status: z.enum(['pending', 'paid', 'overdue', 'suspended']).optional().default('pending')
  })
  .strict();

export const updateBillingPeriodSchema = z
  .object({
    periodStart: isoDateSchema.optional(),
    periodEnd: isoDateSchema.optional(),
    dueDate: isoDateSchema.optional(),
    amount: z.number().positive().optional(),
    status: z.enum(['pending', 'paid', 'overdue', 'suspended']).optional(),
    paidAt: isoDateSchema.optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export const payBillingPeriodSchema = z
  .object({
    amount: z.number().positive(),
    currency: currencySchema.optional().default('USD'),
    date: isoDateSchema.optional(),
    method: paymentMethodSchema,
    reference: z.string().optional(),
    payerEmail: z.string().email('Email inválido').optional().or(z.literal('')),
    payerPhone: z.string().optional(),
    payerIdNumber: z.string().optional(),
    bank: z.string().optional(),
    receiptUrl: z.string().url('URL de comprobante inválida').optional(),
    free: z.boolean().optional()
  })
  .strict();

export const listBillingPeriodsSchema = z
  .object({
    subscriptionId: z.string().optional(),
    status: z.enum(['pending', 'paid', 'overdue', 'suspended']).optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20)
  })
  .strict();

export type CreateBillingPeriodInput = z.infer<typeof createBillingPeriodSchema>;
export type UpdateBillingPeriodInput = z.infer<typeof updateBillingPeriodSchema>;
export type PayBillingPeriodInput = z.infer<typeof payBillingPeriodSchema>;
export type ListBillingPeriodsInput = z.infer<typeof listBillingPeriodsSchema>;
