# API de Pagos — Documentación Técnica

> **Versión**: 1.0.0  
> **Última actualización**: 2026-02-21  
> **Base de datos**: Firebase Firestore  
> **Autenticación**: Firebase Auth (JWT Bearer)

---

## Tabla de Contenidos

1. [Descripción General](#1-descripción-general-del-módulo)
2. [Conceptos Clave](#2-conceptos-clave-del-sistema-de-pagos)
3. [Autenticación y Permisos](#3-autenticación-y-permisos)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Métodos de Pago](#5-métodos-de-pago-soportados)
6. [Estados y Transiciones](#6-estados-del-pago-y-transiciones)
7. [Endpoints](#7-endpoints)
8. [Filtros y Paginación](#8-filtros-y-paginación)
9. [Reglas de Negocio](#9-reglas-de-negocio-críticas)
10. [Manejo de Errores](#10-manejo-de-errores)
11. [Flujo de Integración Frontend](#11-flujo-recomendado-de-integración-frontend)
12. [Buenas Prácticas](#12-buenas-prácticas-de-integración-frontend)
13. [Seguridad](#13-consideraciones-de-seguridad)
14. [Escenarios de Uso](#14-escenarios-reales-de-uso)
15. [Checklist de Integración](#15-checklist-de-integración)

---

## 1. Descripción General del Módulo

### Propósito

El módulo `/payments` gestiona el registro, verificación y seguimiento de pagos asociados a suscripciones de clientes. Proporciona una capa de abstracción sobre múltiples métodos de pago y mantiene un historial trazable de todas las transacciones.

### Responsabilidades

| Responsabilidad | Descripción |
|-----------------|-------------|
| Registro de pagos | Crear registros de pago con validación de campos según método |
| Verificación admin | Permitir aprobación o rechazo de pagos por administradores |
| Historial | Mantener historial completo de pagos por suscripción |
| Consulta | Proporcionar endpoints de listado con filtros y paginación |
| Estadísticas | Generar reportes de estados y montos de pagos |

### Alcance Funcional

- **Creación**: Clientes y admins pueden registrar pagos pendientes de verificación
- **Verificación**: Solo admins pueden aprobar o rechazar pagos
- **Consulta**: Clientes ven sus propios pagos; admins ven todos
- **Retry**: Usuarios pueden reintentar pagos rechazados

---

## 2. Conceptos Clave del Sistema de Pagos

### Definición de Payment

Un **Payment** representa un registro de transacción financiera asociado a una suscripción. Cada pago contiene información del pagador, monto, método utilizado y estado de verificación.

### Estados Posibles

| Estado | Descripción |
|--------|-------------|
| `pending` | Pago registrado,awaiting verificación administrativa |
| `verified` | Pago aprobado por administrador |
| `rejected` | Pago rechazado por administrador |

### Flujo de Vida del Pago

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  CREATED   │────▶│  PENDING   │────▶│  VERIFIED  │
│  (pending) │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘
                        │
                        │ (rechazo)
                        ▼
                   ┌────────────┐
                   │  REJECTED  │
                   │            │
                   └────────────┘
                        │
                        │ (retry)
                        ▼
                   ┌────────────┐
                   │  PENDING   │────▶ (verified)
                   └────────────┘
```

---

## 3. Autenticación y Permisos

### Tipo de Auth

Todas las rutas del módulo requieren autenticación mediante **Firebase JWT Bearer Token**.

```
Authorization: Bearer <firebase_id_token>
```

### Headers Obligatorios

| Header | Valor | Requerido |
|--------|-------|-----------|
| `Authorization` | `Bearer <token>` | Sí |
| `Content-Type` | `application/json` | Sí (POST/PATCH) |

### Permisos por Rol

| Rol | Endpoints Permitidos |
|-----|---------------------|
| `admin` | Todos (crear, listar, verificar, rechazar, estadísticas) |
| `client` | Crear pago, listar propios, ver detalle propio, reintentar |

### Protección de Rutas

```typescript
// Middlewares aplicados
authenticate        // Requiere token válido
requireRole(...)   // Restringe por rol
```

---

## 4. Modelo de Datos

### Colección: `payments`

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|-------------|-------------|---------|
| `id` | string | Auto | ID único del documento Firestore | `payment_abc123` |
| `subscriptionId` | string | Sí | Referencia a la suscripción | `sub_xyz789` |
| `amount` | number | Sí | Monto del pago | `50.00` |
| `currency` | string | Sí | Moneda (USD/VES/USDT) | `USD` |
| `date` | ISO 8601 | Sí | Fecha del pago | `2026-01-15T10:00:00Z` |
| `method` | enum | Sí | Método de pago | `binance` |
| `status` | enum | Auto | Estado del pago | `pending` |
| `reference` | string | Condicional | Referencia única del pago | `BIN_ABC123XYZ` |
| `payerEmail` | string | Condicional | Email del pagador | `usuario@email.com` |
| `payerPhone` | string | Condicional | Teléfono (formato E.164) | `+584121234567` |
| `payerIdNumber` | string | Condicional | Cédula (6-12 dígitos) | `12345678` |
| `bank` | string | Condicional | Banco emisor | `Banco de Venezuela` |
| `receiptUrl` | string | No | URL del comprobante | `https://binance.com/...` |
| `free` | boolean | Condicional | Indica si es promocional | `false` |
| `createdAt` | timestamp | Auto | Fecha de creación | (server timestamp) |
| `createdBy` | string | Auto | UID del creador | `uid_user123` |
| `verifiedAt` | timestamp | Auto | Fecha de verificación | (server timestamp) |
| `verifiedBy` | string | Auto | UID del verificador | `uid_admin456` |
| `notes` | string | No | Notas administrativas | `Comprobante verificado` |

### Tipos Enum

```typescript
type PaymentMethod = 'free' | 'binance' | 'zinli' | 'pago_movil';
type PaymentStatus = 'pending' | 'verified' | 'rejected';
type Currency = 'USD' | 'VES' | 'USDT';
```

---

## 5. Métodos de Pago

### 5.1 Pago Promocional (`free`)

**Descripción**: Meses gratis proporcionados por el proveedor (ej. Starlink).

**Cuándo usarlo**: Cuando se otorga crédito promocional sin costo.

**Campos requeridos**:

| Campo | Valor |
|-------|-------|
| `subscriptionId` | ID de suscripción válido |
| `amount` | `0` |
| `method` | `"free"` |
| `free` | `true` |

**Ejemplo JSON**:

```json
{
  "subscriptionId": "sub_abc123",
  "amount": 0,
  "currency": "USD",
  "method": "free",
  "free": true,
  "date": "2026-01-15T10:00:00Z"
}
```

---

### 5.2 Pago Binance (`binance`)

**Descripción**: Pago con criptomonedas a través de Binance.

**Cuándo usarlo**: Cliente realiza pago mediante transferencia de criptomonedas.

**Campos requeridos**:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `subscriptionId` | Sí | ID de suscripción |
| `amount` | Sí | Monto (> 0) |
| `method` | Sí | `"binance"` |
| `reference` | Sí | ID de transacción Binance |
| `payerEmail` | Sí | Email registrado en Binance |

**Ejemplo JSON**:

```json
{
  "subscriptionId": "sub_abc123",
  "amount": 50.00,
  "currency": "USDT",
  "method": "binance",
  "reference": "BIN_ABC123XYZ",
  "payerEmail": "usuario@email.com",
  "receiptUrl": "https://binance.com/transaction/abc123",
  "date": "2026-01-15T10:00:00Z"
}
```

---

### 5.3 Pago Zinli (`zinli`)

**Descripción**: Pago mediante billetera digital Zinli.

**Cuándo usarlo**: Cliente usa la aplicación Zinli para pagar.

**Campos requeridos**:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `subscriptionId` | Sí | ID de suscripción |
| `amount` | Sí | Monto (> 0) |
| `method` | Sí | `"zinli"` |
| `reference` | Sí | Referencia del pago Zinli |
| `payerEmail` | Sí | Email del usuario Zinli |

**Ejemplo JSON**:

```json
{
  "subscriptionId": "sub_abc123",
  "amount": 50.00,
  "currency": "USD",
  "method": "zinli",
  "reference": "ZN_123456789",
  "payerEmail": "usuario@email.com",
  "receiptUrl": "https://zinli.com/receipt/abc123",
  "date": "2026-01-15T10:00:00Z"
}
```

---

### 5.4 Pago Móvil (`pago_movil`)

**Description**: Transferencia bancaria móvil en Venezuela.

**Cuándo usarlo**: Cliente realiza transferencia vía móvil a cuenta bancaria.

**Campos requeridos**:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `subscriptionId` | Sí | ID de suscripción |
| `amount` | Sí | Monto (> 0) |
| `method` | Sí | `"pago_movil"` |
| `payerPhone` | Sí | Teléfono (formato E.164) |
| `payerIdNumber` | Sí | Cédula (6-12 dígitos) |
| `bank` | Sí | Nombre del banco |

**Ejemplo JSON**:

```json
{
  "subscriptionId": "sub_abc123",
  "amount": 1500.00,
  "currency": "VES",
  "method": "pago_movil",
  "payerPhone": "+584121234567",
  "payerIdNumber": "12345678",
  "bank": "Banco de Venezuela",
  "reference": "REF123456",
  "date": "2026-01-15T10:00:00Z"
}
```

---

## 6. Estados del Pago y Transiciones

### Tabla de Estados

| Estado | Descripción | ¿Editable? |
|--------|-------------|------------|
| `pending` | Pagoawaiting verificación | Sí |
| `verified` | Pago aprobado | No |
| `rejected` | Pago rechazado | Sí (retry) |

### Transiciones Válidas

| Desde | Hacia | Acción | Restricciones |
|-------|-------|--------|---------------|
| `pending` | `verified` | Verificar | Solo admin |
| `pending` | `rejected` | Rechazar | Solo admin |
| `rejected` | `pending` | Retry | Usuario own |
| `verified` | * | — | Prohibido |

### Diagrama de Flujo Textual

```
                        ┌─────────────────┐
                        │   CREAR PAGO    │
                        │   (pending)     │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐            ┌──────▼──────┐
              │  ADMIN    │            │   ADMIN     │
              │  VERIFIES │            │   REJECTS   │
              └─────┬─────┘            └──────┬──────┘
                    │                         │
              ┌─────▼─────┐            ┌──────▼──────┐
              │ VERIFIED  │            │  REJECTED   │
              │ (final)   │            └──────┬──────┘
              └───────────┘                   │
                                              │
                                    ┌─────────┴─────────┐
                                    │   USER RETRIES    │
                                    └─────────┬─────────┘
                                              │
                                              ▼ (pending)
```

---

## 7. Endpoints

### 7.1 Crear Pago

**POST** `/payments`

Crea un nuevo registro de pago en estado `pending`.

| Atributo | Valor |
|----------|-------|
| Método | `POST` |
| Ruta | `/payments` |
| Permisos | `admin`, `client` |
| Content-Type | `application/json` |

#### Parámetros (Body)

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `subscriptionId` | string | Sí | ID de suscripción |
| `amount` | number | Sí | Monto del pago |
| `currency` | string | No | Moneda (default: USD) |
| `date` | ISO 8601 | No | Fecha del pago |
| `method` | enum | Sí | Método de pago |
| `reference` | string | Condicional | Referencia del pago |
| `payerEmail` | string | Condicional | Email del pagador |
| `payerPhone` | string | Condicional | Teléfono |
| `payerIdNumber` | string | Condicional | Cédula |
| `bank` | string | Condicional | Banco |
| `receiptUrl` | string | No | URL del comprobante |
| `free` | boolean | Condicional | Es pago promocional |

#### Ejemplo Request

```http
POST /payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "subscriptionId": "sub_abc123",
  "amount": 50.00,
  "currency": "USDT",
  "method": "binance",
  "reference": "BIN_ABC123XYZ",
  "payerEmail": "usuario@email.com",
  "date": "2026-01-15T10:00:00Z"
}
```

#### Response Éxito (201)

```json
{
  "ok": true,
  "data": {
    "id": "payment_xyz789",
    "subscriptionId": "sub_abc123",
    "amount": 50.00,
    "currency": "USDT",
    "method": "binance",
    "status": "pending",
    "reference": "BIN_ABC123XYZ",
    "payerEmail": "usuario@email.com",
    "createdAt": "2026-01-15T10:05:00Z",
    "createdBy": "uid_user123"
  }
}
```

#### Response Error (400)

```json
{
  "ok": false,
  "message": "Campos requeridos faltantes: reference, payerEmail"
}
```

---

### 7.2 Listar Pagos

**GET** `/payments`

Lista pagos con filtros y paginación.

| Atributo | Valor |
|----------|-------|
| Método | `GET` |
| Ruta | `/payments` |
| Permisos | `admin`, `client` |

#### Query Parameters

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `subscriptionId` | string | — | Filtrar por suscripción |
| `status` | enum | — | Filtrar por estado |
| `method` | enum | — | Filtrar por método |
| `createdBy` | string | — | Filtrar por creador |
| `page` | number | 1 | Página actual |
| `limit` | number | 20 | Resultados por página (max: 100) |

#### Ejemplo Request

```http
GET /payments?status=pending&method=binance&page=1&limit=20
Authorization: Bearer <token>
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": [
    {
      "id": "payment_xyz789",
      "subscriptionId": "sub_abc123",
      "amount": 50.00,
      "currency": "USDT",
      "method": "binance",
      "status": "pending",
      "reference": "BIN_ABC123XYZ",
      "payerEmail": "usuario@email.com",
      "createdAt": "2026-01-15T10:05:00Z",
      "createdBy": "uid_user123"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "hasMore": false
  }
}
```

---

### 7.3 Obtener Pago por ID

**GET** `/payments/:id`

Obtiene el detalle de un pago específico.

| Atributo | Valor |
|----------|-------|
| Método | `GET` |
| Ruta | `/payments/:id` |
| Permisos | `admin`, `client` |

#### Parámetros de Ruta

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | ID del pago |

#### Ejemplo Request

```http
GET /payments/payment_xyz789
Authorization: Bearer <token>
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": {
    "id": "payment_xyz789",
    "subscriptionId": "sub_abc123",
    "amount": 50.00,
    "currency": "USDT",
    "method": "binance",
    "status": "pending",
    "reference": "BIN_ABC123XYZ",
    "payerEmail": "usuario@email.com",
    "createdAt": "2026-01-15T10:05:00Z",
    "createdBy": "uid_user123"
  }
}
```

#### Response Error (404)

```json
{
  "ok": false,
  "message": "Pago no encontrado"
}
```

---

### 7.4 Aprobar Pago (Admin)

**PATCH** `/payments/:id/verify`

Aprueba un pago pendiente. Solo admins.

| Atributo | Valor |
|----------|-------|
| Método | `PATCH` |
| Ruta | `/payments/:id/verify` |
| Permisos | `admin` únicamente |

#### Parámetros

| Tipo | Nombre | Descripción |
|------|--------|-------------|
| path | `id` | ID del pago |
| body | `notes` | Notas opcionales de aprobación |

#### Ejemplo Request

```http
PATCH /payments/payment_xyz789/verify
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "notes": "Comprobante verificado correctamente"
}
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": {
    "id": "payment_xyz789",
    "subscriptionId": "sub_abc123",
    "amount": 50.00,
    "currency": "USDT",
    "method": "binance",
    "status": "verified",
    "reference": "BIN_ABC123XYZ",
    "payerEmail": "usuario@email.com",
    "createdAt": "2026-01-15T10:05:00Z",
    "createdBy": "uid_user123",
    "verifiedAt": "2026-01-15T11:00:00Z",
    "verifiedBy": "uid_admin456",
    "notes": "Comprobante verificado correctamente"
  },
  "message": "Pago aprobado exitosamente"
}
```

#### Response Error (403)

```json
{
  "ok": false,
  "message": "Solo administradores pueden aprobar pagos"
}
```

---

### 7.5 Rechazar Pago (Admin)

**PATCH** `/payments/:id/reject`

Rechaza un pago pendiente. Solo admins.

| Atributo | Valor |
|----------|-------|
| Método | `PATCH` |
| Ruta | `/payments/:id/reject` |
| Permisos | `admin` únicamente |

#### Ejemplo Request

```http
PATCH /payments/payment_xyz789/reject
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "notes": "Comprobante ilegible"
}
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": {
    "id": "payment_xyz789",
    "status": "rejected",
    "notes": "Comprobante ilegible"
  },
  "message": "Pago rechazado"
}
```

---

### 7.6 Reintentar Pago

**PATCH** `/payments/:id/retry`

Reinicia un pago rechazado para volver a intentar.

| Atributo | Valor |
|----------|-------|
| Método | `PATCH` |
| Ruta | `/payments/:id/retry` |
| Permisos | Propietario del pago |

#### Restricciones

- Solo pagos en estado `rejected` pueden ser reintentados
- Solo el propietario del pago (creador) puede reintentar

#### Ejemplo Request

```http
PATCH /payments/payment_xyz789/retry
Authorization: Bearer <token>
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": {
    "id": "payment_xyz789",
    "status": "pending"
  },
  "message": "Pago reintentado"
}
```

#### Response Error (400)

```json
{
  "ok": false,
  "message": "Solo se pueden reintentar pagos rechazados"
}
```

---

### 7.7 Pagos por Suscripción

**GET** `/payments/subscription/:subscriptionId`

Lista todos los pagos asociados a una suscripción.

| Atributo | Valor |
|----------|-------|
| Método | `GET` |
| Ruta | `/payments/subscription/:subscriptionId` |
| Permisos | `admin`, `client` |

#### Ejemplo Request

```http
GET /payments/subscription/sub_abc123
Authorization: Bearer <token>
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": [
    {
      "id": "payment_xyz789",
      "subscriptionId": "sub_abc123",
      "amount": 50.00,
      "status": "verified"
    },
    {
      "id": "payment_def456",
      "subscriptionId": "sub_abc123",
      "amount": 25.00,
      "status": "pending"
    }
  ]
}
```

---

### 7.8 Estadísticas (Admin)

**GET** `/payments/stats`

Obtiene estadísticas globales de pagos.

| Atributo | Valor |
|----------|-------|
| Método | `GET` |
| Ruta | `/payments/stats` |
| Permisos | `admin` únicamente |

#### Query Parameters (Opcionales)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Fecha inicial |
| `endDate` | ISO 8601 | Fecha final |

#### Ejemplo Request

```http
GET /payments/stats?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z
Authorization: Bearer <admin_token>
```

#### Response Éxito (200)

```json
{
  "ok": true,
  "data": {
    "total": 150,
    "pending": 25,
    "verified": 100,
    "rejected": 25,
    "totalAmount": 5000.00
  }
}
```

---

## 8. Filtros y Paginación

### Query Params Disponibles

| Parámetro | Tipo | Valores válidos | Descripción |
|-----------|------|-----------------|-------------|
| `subscriptionId` | string | — | ID de suscripción |
| `status` | string | `pending`, `verified`, `rejected` | Estado del pago |
| `method` | string | `free`, `binance`, `zinli`, `pago_movil` | Método de pago |
| `createdBy` | string | — | UID del creador |
| `page` | number | ≥ 1 | Página (default: 1) |
| `limit` | number | 1-100 | Por página (default: 20) |

### Ejemplos Combinados

```http
# Pagos pendientes de Binance
GET /payments?status=pending&method=binance

# Pagos de un cliente específico, página 2
GET /payments?createdBy=uid_user123&page=2&limit=10

# Pagos de una suscripción con estado específico
GET /payments?subscriptionId=sub_abc123&status=verified
```

### Estructura de Paginación

```json
{
  "pagination": {
    "total": 45,
    "page": 2,
    "limit": 20,
    "hasMore": true
  }
}
```

- `total`: Total de registros que cumplen el filtro
- `page`: Página actual
- `limit`: Registros por página
- `hasMore`: Indica si hay más páginas

---

## 9. Reglas de Negocio Críticas

### Validaciones de Creación

| Regla | Descripción | Error si falla |
|-------|-------------|----------------|
| Suscripción existente | El `subscriptionId` debe existir | `Suscripción no encontrada` |
| Método + campos | Campos requeridos según método | `Campos requeridos faltantes` |
| free + method | Si `free=true`, method debe ser `free` | Validation error |
| free + amount | Si `free=true`, amount debe ser 0 | Validation error |
| amount > 0 | Si `free=false`, amount debe ser > 0 | Validation error |
| **Límite mensual** | Suma de pagos del mes no puede exceder costo mensual | `El monto excede el límite mensual...` |
| Formato email | Debe cumplir regex de email válido | `Email inválido` |
| Formato teléfono | Debe cumplir formato E.164 | `Teléfono con formato inválido` |
| Formato cédula | Debe ser 6-12 dígitos | `Cédula con formato inválido` |
| Formato referencia | Solo alphanumeric + guiones | `Referencia con caracteres inválidos` |

### Validaciones de Transición de Estado

| Transición | Condición | Error |
|------------|-----------|-------|
| → `verified` | Solo admin | 403 Forbidden |
| → `rejected` | Solo admin | 403 Forbidden |
| `verified` → * | Prohibido | `Transición de estado inválida` |
| `rejected` → `pending` | Solo retry | `Solo se pueden reintentar pagos rechazados` |

### Regla de Negocio: Sin Duplicados Verificados

No puede existir más de un pago con estado `verified` para la misma suscripción.

```typescript
// Verificado en servicio
const existingVerified = await payments
  .where('subscriptionId', '==', subscriptionId)
  .where('status', '==', 'verified')
  .get();

if (!existingVerified.empty) {
  throw new Error('Ya existe un pago verificado para esta suscripción');
}
```

### Regla de Negocio: Límite de Pago Mensual

La suma de pagos verificados en un período mensual no puede exceder el costo mensual de la suscripción.

| Concepto | Descripción |
|----------|-------------|
| Período mensual | Desde el `cutDate` de un mes hasta el `cutDate` del siguiente mes |
| Costo mensual | Valor del campo `amount` en la suscripción |
| Validación | Se calcula la suma de todos los pagos `verified` en el período actual |
| Restricción | `nuevo_monto + suma_existente <= costo_mensual` |

**Ejemplo:**
- Suscripción con costo mensual: $90 (cutDate: día 5)
- Período actual: 5 de enero - 5 de febrero
- Cliente paga $50 el 10 de enero → válido, остаётся $40
- Cliente intenta pagar $50 el 20 de enero → **ERROR** ($50 + $50 > $90)
- Cliente paga $40 el 25 de enero → válido, saldo $0

```typescript
// Error thrown
throw new Error(
  `El monto excede el límite mensual. Costo mensual: ${monthlyAmount}. ` +
  `Ya pagado este período: ${currentPeriodPayments}. ` +
  `Monto disponible: ${monthlyAmount - currentPeriodPayments}`
);
```

### Regla de Negocio: Actualización de Suscripción al Verificar Pago

Cuando un pago es verificado y cubre el monto completo mensual:

1. **cutDate se actualiza al mes siguiente**: El nuevo cutDate será el mismo día del siguiente mes
2. **status cambia a "active"**: La suscripción se activa automáticamente

| Condición | Acción |
|-----------|--------|
| Pago cubre mes completo (amount >= monthlyAmount) | Actualizar cutDate al mes siguiente + status = active |
| Pago parcial (amount < monthlyAmount) | Solo status = active (cutDate sin cambios) |

**Ejemplo:**
- Suscripción: cutDate = 2026-02-26, amount = $90, status = active
- Cliente paga $90 el 2026-02-25
- Admin verifica el pago
- Resultado: cutDate = 2026-03-26, status = active

### Casos Borde

| Escenario | Comportamiento |
|-----------|---------------|
| Pago duplicado | Se permite crear; verificación lo rechazará |
| Retry de pago verificado | Error: transición inválida |
| Crear pago para suscripción inexistente | Error 400: Suscripción no encontrada |
| amount negativo | Validación Zod lo rechaza |

---

## 10. Manejo de Errores

### Códigos HTTP

| Código | Significado | Uso |
|--------|-------------|-----|
| 200 | OK | Éxito en GET, PATCH |
| 201 | Created | Éxito en POST |
| 400 | Bad Request | Validación fallida, datos inválidos |
| 401 | Unauthorized | Token faltante o inválido |
| 403 | Forbidden | Permisos insuficientes |
| 404 | Not Found | Recurso no encontrado |
| 500 | Internal Server Error | Error inesperado del servidor |

### Estructura de Error Response

```json
{
  "ok": false,
  "message": "Descripción legible del error"
}
```

### Causas Comunes de Errores

| Código | Causa | Solución |
|--------|-------|----------|
| 400 | Campos requeridos faltantes | Verificar campos obligatorios según método |
| 400 | Suscripción no encontrada | Verificar ID de suscripción válido |
| 400 | Transición inválida | Verificar estado actual del pago |
| 401 | Token inválido | Obtener nuevo token de Firebase |
| 401 | Token expirado | Renovar sesión de usuario |
| 403 | No autorizado | Verificar rol del usuario |
| 404 | Pago no encontrado | Verificar ID del pago |
| 500 | Error de servidor | Contactar soporte técnico |

---

## 11. Flujo Recomendado de Integración Frontend

### Paso 1: Preparar Datos del Pago

```typescript
// Recolectar información según método de pago
const paymentData = {
  subscriptionId: subscriptionId,
  amount: amount,
  currency: currency,
  method: paymentMethod,
  // ... campos específicos del método
};
```

### Paso 2: Crear Pago

```typescript
async function createPayment(data) {
  const response = await fetch('/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error('Error al crear pago');
  }
  
  return response.json();
}
```

### Paso 3: Mostrar Estado al Usuario

```typescript
// Después de crear, mostrar feedback
const { data } = await createPayment(paymentData);

switch (data.status) {
  case 'pending':
    showMessage('Pago registrado. Awaiting verificación.');
    break;
  case 'verified':
    showMessage('Pago aprobado.');
    break;
  case 'rejected':
    showMessage('Pago rechazado. ' + data.notes);
    break;
}
```

### Paso 4: Polling para Actualizaciones (Opcional)

```typescript
async function pollPaymentStatus(paymentId, onUpdate) {
  const poll = setInterval(async () => {
    const response = await fetch(`/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const { data } = await response.json();
    
    onUpdate(data.status);
    
    if (data.status !== 'pending') {
      clearInterval(poll);
    }
  }, 30000); // Cada 30 segundos
  
  return () => clearInterval(poll);
}
```

### Paso 5: Manejar Retry (Si Rechazado)

```typescript
async function retryPayment(paymentId) {
  const response = await fetch(`/payments/${paymentId}/retry`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('No se pudo reintentar el pago');
  }
  
  return response.json();
}
```

---

## 12. Buenas Prácticas de Integración Frontend

### Validaciones Cliente

1. **Validar antes de enviar**: Verificar campos requeridos en cliente antes del request
2. **Formatear datos**: Normalizar teléfono (E.164), email (lowercase), referencia
3. **Feedback inmediato**: Mostrar errores de validación antes de enviar

```typescript
function validatePaymentForm(data) {
  const errors = [];
  
  if (!data.subscriptionId) errors.push('Suscripción requerida');
  if (data.amount <= 0 && !data.free) errors.push('Monto debe ser mayor a 0');
  
  if (data.method === 'binance' || data.method === 'zinli') {
    if (!data.payerEmail) errors.push('Email requerido');
    if (!data.reference) errors.push('Referencia requerida');
  }
  
  if (data.method === 'pago_movil') {
    if (!data.payerPhone) errors.push('Teléfono requerido');
    if (!data.payerIdNumber) errors.push('Cédula requerida');
    if (!data.bank) errors.push('Banco requerido');
  }
  
  return errors;
}
```

### UX Recomendada

| Escenario | Recomendación |
|-----------|---------------|
| Crear pago | Mostrar loading, luego confirmar |
| Pago pendiente | Indicar claramente estado "awaiting verificación" |
| Pago aprobado | Confirmación prominente, redirigir |
| Pago rechazado | Mostrar razón, ofrecer retry |
| Carga de lista | Skeleton o spinner durante carga |
| Error | Mensaje claro con acción a tomar |

### Manejo de Estados

```typescript
const PAYMENT_UI_STATES = {
  pending: {
    color: '#f59e0b', // amber
    label: 'Pendiente',
    description: 'Aguardando verificación administrativa'
  },
  verified: {
    color: '#10b981', // green
    label: 'Aprobado',
    description: 'Pago verificado correctamente'
  },
  rejected: {
    color: '#ef4444', // red
    label: 'Rechazado',
    description: 'Pago rechazado. Puedes reintentar.'
  }
};
```

### Manejo de Retries

1. **Retry automático**: No recomendado para creación de pagos
2. **Retry manual**: Ofrecer botón al usuario tras rechazo
3. **Límite de intentos**: Considerar máximo 3 reintentos
4. **Backoff**: Si implementas polling, usar backoff exponencial

---

## 13. Consideraciones de Seguridad

### Validaciones Críticas

| Validación | Implementación |
|------------|----------------|
| Autenticación | Todas las rutas requieren token Bearer válido |
| Autorización | Rutas admin con `requireRole('admin')` |
| Ownership | Usuario solo accede a sus propios datos |
| Input sanitization | Zod sanitiza campos antes de procesar |
| Validación de tipos | Enums estrictos para method, status, currency |

### Controles de Acceso

```typescript
// Middleware de autenticación
authenticate

// Middleware de autorización por rol
requireRole('admin')     // Solo admin
requireRole('admin', 'client')  // Admin o client
```

### Riesgos Comunes y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Replay attack | Token con expiración corta (Firebase ya maneja) |
| Manipulación de datos | Validación en servidor, no confiar en cliente |
| Enumeration attacks | No revelar existencia de recursos ajenos |
| SQL/NoSQL injection | Uso de ORMs/persistencia tipada (Firestore) |
| XSS | Sanitizar respuestas antes de renderizar |

---

## 14. Escenarios Reales de Uso

### Escenario 1: Pago Aprobado

```
1. Cliente registra pago con método Binance
2. Sistema crea pago en estado "pending"
3. Admin revisa comprobante
4. Admin verifica el pago (PATCH /payments/:id/verify)
5. Sistema actualiza estado a "verified"
6. Cliente ve confirmación en frontend
```

### Escenario 2: Pago Rechazado

```
1. Cliente registra pago
2. Admin revisa comprobante
3. Admin detecta inconsistencia
4. Admin rechaza el pago (PATCH /payments/:id/reject)
5. Sistema incluye nota explicativa
6. Cliente recibe notificación
7. Cliente corrige y reintenta
```

### Escenario 3: Retry de Pago

```
1. Pago anterior fue rechazado
2. Cliente llama PATCH /payments/:id/retry
3. Estado cambia de "rejected" a "pending"
4. Cliente debe subir nuevo comprobante
5. Proceso de verificación se reinicia
```

### Escenario 4: Intentos Duplicados

```
1. Cliente intenta crear pago 1
2. Cliente intenta crear pago 2 (sin esperar)
3. Ambos quedan en "pending"
4. Admin aprueba pago 1, rechaza pago 2
5. Sistema permite ambos porque no hay restricción en creación
```

---

## 15. Checklist de Integración

### Pre-Desarrollo

- [ ] Revisar documentación completa
- [ ] Identificar método(s) de pago a soportar
- [ ] Definir flujo UX según método
- [ ] Entender regla de límite mensual

### Implementación

- [ ] Integrar Firebase Auth en frontend
- [ ] Implementar función de obtener token JWT
- [ ] Crear formulario de pago con validaciones según método
- [ ] Manejar todos los estados de respuesta
- [ ] Implementar polling o webhooks para actualizaciones

### Validación

- [ ] Probar cada método de pago con datos reales
- [ ] Verificar mensajes de error en cada caso
- [ ] Probar flujo completo: crear → verificar → aprobar
- [ ] Probar flujo de rechazo y retry
- [ ] Verificar paginación en listados
- [ ] Probar filtros combinando múltiples parámetros

### Producción

- [ ] Configurar manejo de errores en producción
- [ ] Implementar logging de transacciones
- [ ] Definir SLA de respuesta esperado
- [ ] Documentar contactos de soporte para errores

---

## Referencia Rápida

### Headers Requeridos

```
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

### Endpoints Principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/payments` | Crear pago |
| GET | `/payments` | Listar pagos |
| GET | `/payments/:id` | Ver detalle |
| PATCH | `/payments/:id/verify` | Aprobar (admin) |
| PATCH | `/payments/:id/reject` | Rechazar (admin) |
| PATCH | `/payments/:id/retry` | Reintentar |

### Estados

```
pending → verified (admin approve)
pending → rejected (admin reject)
rejected → pending (user retry)
```

---

*Documento generado para el módulo de Pagos API v1.0.0*
