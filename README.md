# API de Suscripciones (Node.js + Firebase Admin + Twilio)

Backend modular en TypeScript para gestionar clientes, suscripciones y comunicaciones, con automatizaciones diarias basadas en reglas de negocio. Integra Firebase Admin (Auth + Firestore) y Twilio (WhatsApp) para notificaciones operativas.

## 1. Descripción General

Esta API permite:
- **Gestión de Clientes:** Crear, listar y actualizar información de clientes.
- **Gestión de Suscripciones:** Crear nuevas suscripciones, listar, ver detalles y renovar suscripciones manualmente.
- **Comunicaciones:** Enviar mensajes de plantilla (WhatsApp Template) y mensajes de texto libre, así como consultar el historial de conversaciones.
- **Automatización:** Ejecutar trabajos diarios para verificar vencimientos y enviar recordatorios automáticamente.

## 2. Tecnologías Utilizadas

- **Core:** Node.js, Express, TypeScript
- **Base de Datos & Auth:** Firebase Admin SDK (Auth + Firestore)
- **Mensajería:** Twilio (WhatsApp)
- **Validación:** Zod (schemas), express-validator
- **Seguridad:** helmet, cors, rate-limit, autenticación por token (Bearer)
- **Tareas Programadas:** node-cron

## 3. Configuración e Instalación

1.  Clonar el repositorio.
2.  Instalar dependencias: `npm install`
3.  Configurar variables de entorno en `.env` (puerto, credenciales de Firebase, Twilio, etc.).
4.  Colocar las credenciales de servicio de Firebase en `config/firebase.json` (o configurar via variables de entorno).

## 4. Autenticación y Seguridad

La mayoría de los endpoints están protegidos y requieren un token de Firebase Authentication.
- **Header:** `Authorization: Bearer <ID_TOKEN>`
- **Roles:** El sistema maneja roles en los Custom Claims del usuario (`admin`, `staff`, `client`).
    - `admin`: Acceso total.
    - `staff`: Acceso limitado (principalmente comunicaciones).
    - `client`: Acceso restringido a sus propios datos (actualmente limitado).

## 5. Referencia de API

### Health Check
- **`GET /`**
  - **Uso:** Verificar el estado del servicio y las conexiones externas.
  - **Respuesta:**
    ```json
    {
      "status": "ok",
      "firebaseClient": "initialized",
      "firebaseAdmin": "admin-initialized",
      "twilio": "available"
    }
    ```

### Autenticación (`/auth`)
- **`POST /auth/create`** (Admin)
  - **Body:** `{ "email": "user@mail.com", "password": "pass", "role": "admin|staff|client", "displayName": "Name" }`
  - **Respuesta:** `{ "ok": true, "uid": "...", "role": "..." }`
- **`GET /auth/me`** (Auth required)
  - **Uso:** Obtener información del usuario actual.
- **`GET /auth/user/:uid`** (Auth required)
  - **Uso:** Obtener información pública básica de un usuario por UID.

### Clientes (`/clients`)
Gestionado por administradores.
- **`POST /clients`**
  - **Body:** `{ "uid": "firebase-uid", "name": "Nombre", "phone": "+52...", "address": "..." }`
  - **Respuesta:** `{ "ok": true, "data": { ...client } }`
- **`GET /clients`**
  - **Query:** `limit` (número), `startAfter` (cursor para paginación).
  - **Respuesta:** Lista de clientes.
- **`GET /clients/:id`**
  - **Uso:** Obtener detalle de un cliente.
- **`PATCH /clients/:id`**
  - **Body:** Campos a actualizar (`name`, `phone`, `address`).

### Suscripciones (`/subscriptions`)
Gestionado por administradores.
- **`POST /subscriptions`**
  - **Body:** 
    ```json
    {
      "clientId": "client-id",
      "startDate": "YYYY-MM-DD",
      "cutDate": "YYYY-MM-DD",
      "plan": "Plan Name",
      "amount": "$100.00"
    }
    ```
- **`GET /subscriptions`**
  - **Query:** `limit`, `startAfter`.
- **`GET /subscriptions/:id`**
  - **Uso:** Ver detalles de una suscripción.
- **`POST /subscriptions/:id/renew`**
  - **Uso:** Renovar una suscripción manualmente (extiende la fecha de corte).

### Comunicaciones (`/communications`)
- **`POST /communications/send-template`** (Admin)
  - **Body:** `{ "clientId": "...", "template": "nombre_plantilla" }`
  - **Uso:** Enviar mensajes pre-aprobados por WhatsApp (inicio de conversación).
- **`POST /communications/send`** (Admin/Staff)
  - **Body:** `{ "clientId": "...", "body": "Texto libre..." }`
  - **Uso:** Enviar respuesta de texto libre (solo dentro de la ventana de 24h).
- **`GET /communications/conversations`** (Admin/Staff)
  - **Uso:** Listar conversaciones activas.
- **`GET /communications/messages/:clientId`**
  - **Uso:** Ver historial de mensajes con un cliente específico.
- **`POST /communications/webhook`**
  - **Uso:** Endpoint público para recibir eventos de Twilio (mensajes entrantes).

### Automatización (`/automation`)
- **`POST /automation/run-daily`** (Admin)
  - **Query:** `?dryRun=true` (opcional, para simular sin ejecutar cambios).
  - **Body:** `{ "reason": "manual-check" }` (opcional).
  - **Uso:** Ejecutar manualmente el job diario que verifica vencimientos y envía recordatorios.

## 6. Modelos de Datos (Resumen)

### Subscription
- **Estado:** `active`, `inactive`, `past_due`, `cancelled`.
- **Fechas:** Formato ISO `YYYY-MM-DD` para `startDate` y `cutDate`.
- **Amount:** Cadena con formato moneda (ej. `$50.00`).

### Client
- **Phone:** Formato E.164 (ej. `+521234567890`).

## 7. Manejo de Errores

Las respuestas de error siguen el formato:
```json
{
  "ok": false,
  "message": "Descripción del error",
  "errors": [] // Opcional, detalles de validación
}
```
