# API de Suscripciones con Facturación por Períodos

Backend modular en TypeScript para gestionar clientes, suscripciones, facturación periódica, pagos, comunicaciones y automatización. Integra Firebase Admin (Auth + Firestore) y Twilio para notificaciones operativas.

## Descripción General

La API actualmente está diseñada alrededor de un dominio de facturación estructurado en:
- `clients`: clientes finales.
- `subscriptions`: contratos de servicio.
- `billingPeriods`: períodos de facturación / facturas.
- `payments`: registros de pagos verificados o rechazados.
- `communications`: mensajería y conversaciones.
- `automation`: reglas diarias de vencimiento y recordatorios.
- `dashboard`: métricas operativas.

### Arquitectura de relaciones

Cliente
└── Suscripción
      ├── BillingPeriod May-Jun
      │      └── Payment
      ├── BillingPeriod Jun-Jul
      │      └── Payment
      └── BillingPeriod Jul-Aug

### Evaluación rápida

- **Estructura fuerte:** el código está bien separado en módulos por dominio.
- **Factura simple y clara:** la lógica de `renew` ya no es el único camino; los pagos se registran en períodos de facturación.
- **Buen control de roles:** `client` y `admin` tienen endpoints distintos y acceso restringido.
- **Puntos a reforzar:** documentación de relaciones entre entidades, pruebas de integración para el flujo de facturación y consistencia en errores HTTP.

## Tecnologías

- Node.js, Express, TypeScript
- Firebase Admin SDK (Firestore + Auth)
- Twilio
- Zod
- Helmet
- CORS
- express-rate-limit
- node-cron

## Instalación

```bash
npm install
```

Configura tu entorno en `.env` y asegúrate de tener el servicio de Firebase Admin disponible en `config/firebase.json` o mediante variables de entorno.

Comandos útiles:

```bash
npm run dev
npm run build
npm test
```

## Autenticación y Seguridad

- Header: `Authorization: Bearer <ID_TOKEN>`
- Roles principales: `admin`, `client`
- `admin`: acceso total.
- `client`: acceso a sus propios datos y funcionalidades de autoservicio.

## Endpoints principales

### Health Check
- `GET /`
  - Estado del servicio y conexiones externas.

### Auth
- `POST /auth/create` (admin)
- `GET /auth/me`
- `GET /auth/user/:uid`

### Clientes (`/clients`)
- `POST /clients`
- `GET /clients`
- `GET /clients/:id`
- `PATCH /clients/:id`

### Administradores (`/admins`)
- `POST /admins`
- `GET /admins`
- `GET /admins/:id`
- `PATCH /admins/:id`
- `DELETE /admins/:id`

### Suscripciones públicas (`/subscriptions`)
- `GET /subscriptions/plans`
- `GET /subscriptions` (client/admin)
- `GET /subscriptions/:id` (client/admin)

> Los clientes no crean suscripciones. La creación, modificación y suspensión se realiza desde `/admin/subscriptions`.

### Suscripciones admin (`/admin/subscriptions`)
- `POST /admin/subscriptions`
- `GET /admin/subscriptions`
- `GET /admin/subscriptions/:id`
- `PATCH /admin/subscriptions/:id`
- `PATCH /admin/subscriptions/:id/status`
- `POST /admin/subscriptions/:id/renew`
  - **Depreciado**: devuelve `410 Gone`. Use la facturación por períodos y registros de pago.

### Períodos de facturación (`/billing-periods`)
- `GET /billing-periods`
- `GET /billing-periods/:id`
- `PATCH /billing-periods/:id` (admin)
- `DELETE /billing-periods/:id` (admin)
- `POST /billing-periods/:id/pay` (admin/client)

> `POST /billing-periods/:id/pay` es la ruta canónica para registrar un pago. Internamente:
> 1. crea el `Payment`;
> 2. marca el `BillingPeriod` como `paid`;
> 3. genera el siguiente `BillingPeriod`.
> 
> El módulo `/payments` se usa principalmente para consulta y administración de estado.

### Pagos (`/payments`)
- `GET /payments`
- `GET /payments/stats` (admin)
- `GET /payments/subscription/:subscriptionId`
- `GET /payments/:id`
- `PATCH /payments/:id/verify` (admin)
- `PATCH /payments/:id/reject` (admin)
- `PATCH /payments/:id/retry`

> El registro de pagos se realiza preferentemente a través de `POST /billing-periods/:id/pay`.
> `/payments` es principalmente un módulo de consulta e historial.

### Dashboard (`/dashboard`)
- `GET /dashboard`
- `GET /dashboard/billing-periods`

### Comunicaciones (`/communications`)
- Envío de plantillas y mensajes libres.
- Gestión de conversaciones vinculadas a números y suscripciones.
- Gestión de webhooks de Twilio.

### Automatización (`/automation`)
- Reglas diarias de vencimiento.
- `POST /automation/run-daily`

## Flujo de facturación actual

1. Se crea una `subscription`.
2. Se genera automáticamente un `billingPeriod` inicial.
3. Un pago registrado y verificado contra un `billingPeriod` cambia su estado a `paid`.
4. Cuando el período queda pagado, se crea el siguiente período automáticamente.
5. El `nextCutDate` de la suscripción se actualiza con la fecha del nuevo período.

## Recomendaciones

- Priorizar la creación de tests que cubran:
  - creación de suscripción + primer período automático.
  - pago de período y creación del siguiente período.
  - acceso de cliente vs admin.
- Asegurar que los clientes solo puedan ver sus propias suscripciones y períodos relacionados.
- Mantener el endpoint `renew` como compatibilidad solo hasta migrar completamente al flujo de `billingPeriods`.
