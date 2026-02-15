# API de Suscripciones (Node.js + Firebase Admin + Twilio)

Backend modular en TypeScript para gestionar clientes, suscripciones y comunicaciones, con automatizaciones diarias basadas en reglas de negocio. Integra Firebase Admin (Auth + Firestore) y Twilio (WhatsApp) para notificaciones operativas.

## 1) Descripcion general

Esta API permite:

- Administrar clientes y suscripciones.
- Renovar suscripciones y marcar inactivas cuando llega la fecha de corte.
- Enviar comunicaciones automatizadas via WhatsApp.
- Ejecutar un job diario que evalua reglas de suscripcion.

Proposito: centralizar la gestion operativa de suscripciones y automatizar procesos repetitivos.
Problema que resuelve: reduce trabajo manual, evita errores y estandariza la comunicacion con clientes.

## 2) Tecnologias utilizadas

- Node.js + Express (API REST)
- TypeScript
- Firebase Admin SDK (Auth + Firestore)
- Twilio (WhatsApp)
- Zod (validacion de clients y subscriptions)
- express-validator (validacion en auth y communications)
- helmet, cors, express-rate-limit (seguridad basica)
- node-cron (automatizacion diaria)

## 3) Arquitectura

### Estructura de carpetas

```
src/
   auth/           # autenticacion, roles, middlewares
   clients/        # CRUD de clientes
   subscriptions/  # suscripciones y renovaciones
   communications/ # envio de mensajes y plantillas
   automation/     # job diario y reglas
   config/         # firebase, twilio, env
   middlewares/    # validadores y error handler
```

### Patron controller/service

- Controllers: reciben request, validan input, llaman al service.
- Services: contienen la logica de negocio.
- Firestore: acceso desde services, nunca desde controllers.

## 4) Autenticacion y roles

- Autenticacion mediante Firebase ID Token.
- Roles definidos en custom claims: `admin`, `staff`, `client`, `guest`.
- Middlewares:
   - `authenticate` valida token
   - `requireRole` restringe rutas

### Roles y permisos

| Accion | Admin | Cliente |
| --- | --- | --- |
| Crear clientes | ✔ | ✖ |
| Editar clientes | ✔ | ✖ |
| Crear suscripciones | ✔ | ✖ |
| Renovar suscripciones | ✔ | ✖ |
| Ver sus propios datos | ✔ | ✔ |
| Cambiar su propia clave | ✖ | ✔ |

Nota: el backend actual expone rutas administrativas; no existen endpoints self-service para cliente.

## 5) Endpoints

### Health

**GET /**

```json
{
   "status": "ok",
   "firebaseClient": "not-initialized",
   "firebaseAdmin": "admin-initialized",
   "twilio": "available"
}
```

### Auth

**POST /auth/create** (admin)

```json
{
   "email": "user@ejemplo.com",
   "password": "secret123",
   "displayName": "Nombre",
   "role": "client"
}
```

**GET /auth/me** (autenticado)

### Clients (solo admin)

**POST /clients**

```json
{
   "uid": "firebaseUID",
   "name": "Juan Perez",
   "phone": "+584123456789",
   "address": "Calle 1"
}
```

**GET /clients** (paginacion: `limit`, `startAfter`)

**GET /clients/:id**

**PATCH /clients/:id** (whitelist)

### Subscriptions (solo admin)

**POST /subscriptions**

```json
{
   "clientId": "firebaseUID",
   "startDate": "2026-02-11",
   "cutDate": "2026-03-11",
   "plan": "starlink-basic",
   "amount": "$50"
}
```

- `startDate`: fecha de inicio del servicio/activación. Si es futura, el estado será `pending`; al llegar la fecha, un job diario la activa automáticamente.
- `cutDate`: fecha de corte del servicio. Al llegar este día, si no se ha renovado, el sistema corta el servicio (`inactive`) y notifica al cliente.

**GET /subscriptions** (paginacion: `limit`, `startAfter`)

**GET /subscriptions/:id**

**POST /subscriptions/:id/renew**

Nota: no existe PATCH general para suscripciones.

### Communications

**POST /communications/send** (admin)

```json
{
   "clientId": "firebaseUID",
   "template": "subscription_cutoff_day_2v"
}
```

**GET /communications/messages/:clientId**

### Automation

**POST /automation/run-daily** (admin)

## 6) Modelos de datos

### Client

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| uid | string | UID de Firebase |
| name | string | Nombre del cliente |
| phone | string | Telefono E.164 |
| address | string | Direccion |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

### Subscription

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| clientId | string | ID del cliente |
| startDate | string | ISO YYYY-MM-DD |
| cutDate | string | ISO YYYY-MM-DD |
| plan | string | Nombre del plan |
| amount | string | Monto con moneda (ej. $50) |
| status | enum | active, pending, suspended, inactive |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

### Message

| Campo | Tipo |
| --- | --- |
| clientId | string |
| template | string |
| body | string |
| to | string |
| status | queued/sent/failed |
| twilioSid | string |
| error | string |

## 7) Plantillas WhatsApp (Twilio)

Templates permitidos (allowlist):

- `subscription_reminder_3days_2v` (variables: `name`, `dueDate`)
- `subscription_suspended_notice_2v` (variables: `name`, `subscriptionLabel`)
- `subscription_cutoff_day_2v` (variables: `name`, `subscriptionLabel`, `cutoffDate`)

Nota: el endpoint `/communications/send` solo recibe `clientId` y `template`. Las variables adicionales se usan desde flujos internos (por ejemplo automation).

## 8) Reglas de negocio

- Campos criticos de suscripcion no se modifican por PATCH.
- `status` se calcula en el service al crear: `pending` si `startDate` es futura, si no `active`.
- Renovacion incrementa `cutDate` en +1 mes con zona horaria fija.
- Automation marca `inactive` cuando `cutDate` llega o supera la fecha actual.
- Fechas con TZ fija via `AUTOMATION_TZ` (default `America/Caracas` en util de suscripciones).

## 9) Instalacion y configuracion

Variables de entorno principales:

```
PORT=3000
NODE_ENV=development
GOOGLE_APPLICATION_CREDENTIALS=./config/firebase.json
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
CORS_ORIGIN=http://localhost:5173
AUTOMATION_CRON=0 8 * * *
AUTOMATION_TZ=America/Caracas
AUTOMATION_JOB_DISABLED=false
```

Tambien puedes permitir varios origenes separando por coma, por ejemplo:

```env
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

Instalacion:

```bash
npm install
npm run dev
```

## 10) Ejemplos de uso

Crear cliente:

```bash
curl -X POST http://localhost:3000/clients \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"uid":"firebaseUID","name":"Juan Perez"}'
```

Crear suscripcion:

```bash
curl -X POST http://localhost:3000/subscriptions \
   -H "Authorization: Bearer $TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"clientId":"firebaseUID","startDate":"2026-02-11","cutDate":"2026-03-11","plan":"starlink-basic","amount":"$50","billingDate":"2026-02-08"}'
```

## 11) Notas

- Automation genera logs en `automationLogs`.
- CORS configurable por entorno (`CORS_ORIGIN`).
- Paginacion basada en cursor (`startAfter`).

Rate limiting por ruta sensible.
