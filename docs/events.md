# Catálogo de eventos del dominio

Objetivo: documentar eventos internos, payloads, emisores y responsabilidades de listeners.

- EVENT_PAYMENT_VERIFIED
  - Emisor: `paymentService` (cuando un pago se marca `verified` o auto-verificado)
  - Payload: `{ payment }` donde `payment` es `PaymentModel`
  - Responsabilidad del listener: delegar a `billingPeriodService.applyPayment(payment)` (decisiones), notificar/logging mínimo.

- EVENT_BILLING_PERIOD_PAID
  - Emisor: `billingPeriodService` (cuando un periodo pasa a `paid`)
  - Payload: `{ period }` donde `period` es `BillingPeriod`
  - Responsabilidad del listener: notificar (recibir y delegar a `communicationsService.notifyBillingPeriodPaid(period)`), no realizar lógica de negocio.

- EVENT_BILLING_PERIOD_OVERDUE
  - Emisor: `billingPeriodService` (cuando un periodo pasa a `overdue`)
  - Payload: `{ period }`
  - Responsabilidad del listener: notificar (delegar a `communicationsService.notifyBillingPeriodOverdue(period)`), logging mínimo.

- EVENT_SUBSCRIPTION_SUSPENDED
  - Emisor: `billingPeriodService` (cuando una suscripción se suspende)
  - Payload: `{ period }`
  - Responsabilidad del listener: notificar (delegar a `communicationsService.notifySubscriptionSuspended(period)`), no cambiar estado.

Reglas de oro (resumen):
- `billingPeriodService` es la única fuente de decisiones sobre estados de facturación y suscripción.
- Listeners deben ser "thin": solo delegar a servicios y realizar logging/metricas; NO contener reglas de negocio.
- Events son notificaciones y no deben contener lógica de negocio duplicada.
- No introducir eventos adicionales sin una razón clara y documentada.

Recomendación de acciones:
- Añadir tests de integración para la secuencia `PAYMENT_VERIFIED -> billingPeriodService -> emitted events`.
- Mantener este archivo actualizado cuando se añadan nuevos eventos o cambien contratos.
