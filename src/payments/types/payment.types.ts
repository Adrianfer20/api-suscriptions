/**
 * Tipos y constantes para el módulo de Payments
 */

// Métodos de pago soportados
export type PaymentMethod = 'free' | 'binance' | 'zinli' | 'pago_movil';

// Estados del pago
export type PaymentStatus = 'pending' | 'verified' | 'rejected';

// Monedas soportadas
export type Currency = 'USD' | 'VES' | 'USDT';

// Interfasa principal de Payment
export interface Payment {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: Currency;
  date: Date;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerIdNumber?: string;
  bank?: string;
  receiptUrl?: string;
  free?: boolean;
  createdAt: Date;
  createdBy: string;
  verifiedAt?: Date;
  verifiedBy?: string;
  notes?: string;
}

// DTO para crear un nuevo pago
export interface CreatePaymentDTO {
  subscriptionId: string;
  amount: number;
  currency?: Currency;
  date: Date;
  method: PaymentMethod;
  reference?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerIdNumber?: string;
  bank?: string;
  receiptUrl?: string;
  free?: boolean;
}

// DTO para actualizar el estado de un pago
export interface UpdatePaymentStatusDTO {
  status: PaymentStatus;
  notes?: string;
}

// DTO para verificar un pago (admin)
export interface VerifyPaymentDTO {
  notes?: string;
}

// Interfasa para validar campos obligatorios por método
export interface PaymentMethodRequirements {
  requiredFields: (keyof Payment)[];
  optionalFields: (keyof Payment)[];
}

// Mapeo de requisitos por método de pago
export const PAYMENT_METHOD_REQUIREMENTS: Record<PaymentMethod, PaymentMethodRequirements> = {
  free: {
    requiredFields: [],
    optionalFields: ['reference', 'payerEmail', 'notes'],
  },
  binance: {
    requiredFields: ['reference', 'payerEmail'],
    optionalFields: ['receiptUrl', 'notes'],
  },
  zinli: {
    requiredFields: ['reference', 'payerEmail'],
    optionalFields: ['receiptUrl', 'notes'],
  },
  pago_movil: {
    requiredFields: ['payerPhone', 'payerIdNumber', 'bank'],
    optionalFields: ['reference', 'receiptUrl', 'notes'],
  },
};

// Constantes de validación
export const PAYMENT_CONSTANTS = {
  MIN_AMOUNT: 0,
  MAX_AMOUNT: 1000000,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\+?[1-9]\d{1,14}$/, // E.164
  REFERENCE_REGEX: /^[a-zA-Z0-9-_]+$/,
  ID_NUMBER_REGEX: /^[0-9]{6,12}$/,
} as const;

// Tipo para filtros de búsqueda de pagos
export interface PaymentFilters {
  subscriptionId?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  createdBy?: string;
  startDate?: Date;
  endDate?: Date;
}

// Respuesta paginada
export interface PaginatedPayments {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
