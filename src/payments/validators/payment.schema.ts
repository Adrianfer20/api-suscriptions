import { z } from 'zod';
import { PAYMENT_CONSTANTS, PAYMENT_METHOD_REQUIREMENTS, PaymentMethod } from '../types';

// Tipo para los datos del schema de creación de pago
type CreatePaymentData = {
  method: PaymentMethod;
  reference?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerIdNumber?: string;
  bank?: string;
  free?: boolean;
  amount: number;
};

/**
 * Schema base para métodos de pago
 */
const paymentMethodSchema = z.enum(['free', 'binance', 'zinli', 'pago_movil']);

/**
 * Schema para estado de pago
 */
const paymentStatusSchema = z.enum(['pending', 'verified', 'rejected']);

/**
 * Schema para moneda
 */
const currencySchema = z.enum(['USD', 'VES', 'USDT']);

/**
 * Schema para crear un pago
 */
export const createPaymentSchema = z
  .object({
    subscriptionId: z.string().min(1, 'El ID de suscripción es requerido'),
    amount: z
      .number()
      .min(PAYMENT_CONSTANTS.MIN_AMOUNT, 'El monto no puede ser negativo')
      .max(PAYMENT_CONSTANTS.MAX_AMOUNT, 'El monto excede el límite permitido'),
    currency: currencySchema.optional().default('USD'),
    date: z.string().datetime({ message: 'Fecha inválida, use formato ISO 8601' }).optional(),
    method: paymentMethodSchema,
    reference: z.string().optional(),
    payerEmail: z
      .string()
      .email('Email inválido')
      .optional()
      .or(z.literal('')),
    payerPhone: z.string().optional(),
    payerIdNumber: z.string().optional(),
    bank: z.string().optional(),
    receiptUrl: z.string().url('URL de comprobante inválida').optional(),
    free: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // Si free=true, method debe ser 'free'
      if (data.free === true && data.method !== 'free') {
        return false;
      }
      return true;
    },
    {
      message: 'Si free=true, el método debe ser "free"',
      path: ['free'],
    }
  )
  .refine(
    (data) => {
      // Si free=true, amount debe ser 0
      if (data.free === true && data.amount !== 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Si free=true, el monto debe ser 0',
      path: ['amount'],
    }
  )
  .refine(
    (data) => {
      // free=false debe tener amount > 0
      if (data.free === false && data.amount <= 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Si free=false, el monto debe ser mayor a 0',
      path: ['amount'],
    }
  )
  .refine(
    (data) => {
      const requirements = PAYMENT_METHOD_REQUIREMENTS[data.method];
      
      // Validar campos obligatorios
      for (const field of requirements.requiredFields) {
        const value = (data as Record<string, unknown>)[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Faltan campos requeridos para el método de pago seleccionado',
      path: ['method'],
    }
  );

/**
 * Schema para validar campos específicos por método
 */
export const validateMethodFields = (data: CreatePaymentData): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const requirements = PAYMENT_METHOD_REQUIREMENTS[data.method];

  // Validar campos obligatorios
  for (const field of requirements.requiredFields) {
    const value = (data as Record<string, unknown>)[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      errors.push(`El campo ${field} es requerido para el método ${data.method}`);
    }
  }

  // Validaciones específicas por método
  if (data.payerEmail && !PAYMENT_CONSTANTS.EMAIL_REGEX.test(data.payerEmail)) {
    errors.push('Email con formato inválido');
  }

  if (data.payerPhone && !PAYMENT_CONSTANTS.PHONE_REGEX.test(data.payerPhone)) {
    errors.push('Teléfono con formato inválido (use formato E.164)');
  }

  if (data.reference && !PAYMENT_CONSTANTS.REFERENCE_REGEX.test(data.reference)) {
    errors.push('Referencia con caracteres inválidos');
  }

  if (data.payerIdNumber && !PAYMENT_CONSTANTS.ID_NUMBER_REGEX.test(data.payerIdNumber)) {
    errors.push('Cédula con formato inválido (6-12 dígitos)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Schema para actualizar el estado de un pago (verify/reject)
 */
export const updatePaymentStatusSchema = z
  .object({
    status: paymentStatusSchema,
    notes: z.string().optional(),
  })
  .strict();

/**
 * Schema para verificar un pago (admin)
 */
export const verifyPaymentSchema = z
  .object({
    notes: z.string().optional(),
  })
  .strict();

/**
 * Schema para filtros de búsqueda
 */
export const paymentFiltersSchema = z
  .object({
    subscriptionId: z.string().optional(),
    status: paymentStatusSchema.optional(),
    method: paymentMethodSchema.optional(),
    createdBy: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  })
  .strict();

/**
 * Tipos inferidos de los schemas
 */
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type PaymentFiltersInput = z.infer<typeof paymentFiltersSchema>;
