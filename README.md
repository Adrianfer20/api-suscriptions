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
  - **Nota:** Si se crea un cliente con un número de teléfono que ya tiene un historial de conversación (como "Desconocido"), el sistema vinculará automáticamente el chat existente al nuevo cliente, preservando el historial.
  - **Respuesta:** `{ "ok": true, "data": { ...client } }`
- **`GET /clients`**
  - **Query:** `limit` (número), `startAfter` (cursor para paginación).
  - **Respuesta:** Lista de clientes registrados.
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
      "amount": "$100.00",
      "kitNumber": "KIT4M01422983C2H", // opcional; si no se proporciona será "Valor No Disponible"
      "country": "VES"
    }
    ```
- **`GET /subscriptions`**
  - **Query:** `limit`, `startAfter`.
- **`GET /subscriptions/:id`**
  - **Uso:** Ver detalles de una suscripción.
- **`POST /subscriptions/:id/renew`**
  - **Uso:** Renovar una suscripción manualmente (extiende la fecha de corte).
- **`DELETE /subscriptions/:id`**
  - **Uso:** Eliminar permanentemente una suscripción (Admin).
- **`PATCH /subscriptions/:id`**
  - **Body:** Campos a actualizar (`startDate`, `cutDate`, `plan`, `amount`, `kitNumber`).
    - **Nota:** No permite cambiar `status`. Para cambiar el estado use `PATCH /subscriptions/:id/status`.
  - **Uso:** Actualizar información de la suscripción (no incluye cambio de `status`).
- **`PATCH /subscriptions/:id/status`**
  - **Body:** `{ "status": "active|about_to_expire|suspended|paused|cancelled" }`
  - **Uso:** Cambiar únicamente el `status` de la suscripción. Requiere rol `admin`.
  - **Nota:** Este es el único endpoint que puede modificar el `status`.

### Comunicaciones (`/communications`)
- **`GET /communications/conversations`** (Admin/Staff)
  - **Uso:** Obtener lista de conversaciones (mezcla de Clientes y Desconocidos).
  - **Identificadores:** Utiliza el campo `phone` como ID único.
  - **Respuesta:** Objeto `Conversation` (ver Modelos).
- **`GET /communications/messages/:id`**
  - **Param :id:** Puede ser el `clientId` (viejo) o el `phoneNumber` (nuevo, recomendado para desconocidos).
  - **Uso:** Ver historial de mensajes de una conversación.
- **`POST /communications/conversations/:id/read`**
  - **Param :id:** Puede ser el `clientId` o el `phoneNumber`.
  - **Uso:** Marcar todos los mensajes entrantes como leídos.
- **`POST /communications/send-template`** (Admin)
  - **Body:** `{ "clientId": "...", "template": "nombre_plantilla" }`
  - **Nota:** El campo `clientId` acepta también un número de teléfono directo (ej. `+52...`) para enviar a prospectos.
  - **Uso:** Enviar plantillas WhatsApp a Clientes o Prospectos.
- **`POST /communications/send`** (Admin/Staff)
  - **Body:** `{ "clientId": "...", "body": "Texto libre..." }`
  - **Nota:** El campo `clientId` acepta también un número de teléfono directo (ej. `+52...`) para chatear con prospectos.
  - **Uso:** Responder con texto libre (requiere sesión abierta 24h).
- **`POST /communications/webhook`**
  - **Uso:** Endpoint público (Twilio) para recibir mensajes. Crea una conversación "Desconocido" si el número no es cliente.

### Automatización (`/automation`)
- **`POST /automation/run-daily`** (Admin)
  - **Query:** `?dryRun=true` (opcional, para simular sin ejecutar cambios).
  - **Body:** `{ "reason": "manual-check" }` (opcional).
  - **Uso:** Ejecutar manualmente el job diario que verifica vencimientos y envía recordatorios.

  - **Reglas de estado automáticas (resumen):**
    - Al crear la suscripción: `active`.
    - Si pasan 1 mes desde el `cutDate` sin renovación: el job marcará `about_to_expire` ("Por vencer").
    - Si pasan 2 meses desde el `cutDate` sin renovación: el job marcará `suspended` ("Suspendida") y enviará el aviso correspondiente.
    - `paused` y `cancelled` son estados que pueden establecerse por petición del cliente o por admin, y no son sobreescritos automáticamente por la regla de mora.

## 6. Modelos de Datos (Resumen)

### Conversation
Ahora las conversaciones son independientes de los clientes.
```json
{
  "id": "+521234567890", 
  "phone": "+521234567890",
  "name": "Cliente Nombre" || "WhatsApp Profile",
  "clientId": "firebase_doc_id" || null, // null = Desconocido (Prospecto)
  "prospect": true || false,
  "unreadCount": 1,
  "lastMessageAt": "Timestamp",
  "lastMessageBody": "..."
}
```

### Subscription
- **Estado:** `active`, `about_to_expire`, `suspended`, `paused`, `cancelled`.
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
