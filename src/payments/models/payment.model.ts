import { PaymentMethod, PaymentStatus, Currency } from '../types';

/**
 * Modelo de Payment para Firebasea un
 * Represent registro de pago en la colección 'payments'
 */
export interface PaymentModel {
  id?: string;
  subscriptionId: string;
  amount: number;
  currency: Currency;
  date: any; // Firebase Timestamp
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerIdNumber?: string;
  bank?: string;
  receiptUrl?: string;
  free?: boolean;
  createdAt: any; // Firebase Timestamp
  createdBy: string; // uid del usuario
  verifiedAt?: any; // Firebase Timestamp
  verifiedBy?: string; // uid del admin
  notes?: string;
}

/**
 * Crea un objeto PaymentModel vacío con valores por defecto
 */
export const createEmptyPaymentModel = (): Omit<PaymentModel, 'id'> => ({
  subscriptionId: '',
  amount: 0,
  currency: 'USD',
  date: null,
  method: 'free',
  status: 'pending',
  createdAt: null,
  createdBy: '',
});

/**
 * Convierte un PaymentModel a formato serializable para Firebase
 */
export const toFirestoreData = (payment: Partial<PaymentModel>): Record<string, any> => {
  const data: Record<string, any> = {};
  
  if (payment.subscriptionId !== undefined) data.subscriptionId = payment.subscriptionId;
  if (payment.amount !== undefined) data.amount = payment.amount;
  if (payment.currency !== undefined) data.currency = payment.currency;
  if (payment.date !== undefined) data.date = payment.date;
  if (payment.method !== undefined) data.method = payment.method;
  if (payment.status !== undefined) data.status = payment.status;
  if (payment.reference !== undefined) data.reference = payment.reference;
  if (payment.payerEmail !== undefined) data.payerEmail = payment.payerEmail;
  if (payment.payerPhone !== undefined) data.payerPhone = payment.payerPhone;
  if (payment.payerIdNumber !== undefined) data.payerIdNumber = payment.payerIdNumber;
  if (payment.bank !== undefined) data.bank = payment.bank;
  if (payment.receiptUrl !== undefined) data.receiptUrl = payment.receiptUrl;
  if (payment.free !== undefined) data.free = payment.free;
  if (payment.createdAt !== undefined) data.createdAt = payment.createdAt;
  if (payment.createdBy !== undefined) data.createdBy = payment.createdBy;
  if (payment.verifiedAt !== undefined) data.verifiedAt = payment.verifiedAt;
  if (payment.verifiedBy !== undefined) data.verifiedBy = payment.verifiedBy;
  if (payment.notes !== undefined) data.notes = payment.notes;
  
  return data;
};
