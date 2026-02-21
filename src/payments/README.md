# Módulo de Pagos (Payments)

Este módulo gestiona el sistema de pagos de la API con persistencia en Firebase, soportando múltiples métodos de pago y garantizando consistencia, trazabilidad y extensibilidad.

---

## 📋 Tabla de Contenidos

1. [Casos de Uso](#casos-de-uso)
2. [Modelo de Datos](#modelo-de-datos)
3. [Estados y Transiciones](#estados-y-transiciones)
4. [Endpoints](#endpoints)
5. [Validaciones](#validaciones)
6. [Reglas de Negocio](#reglas-de-negocio)
7. [Estructura del Módulo](#estructura-del-módulo)
8. [Buenas Prácticas](#buenas-prácticas)

---

## 💳 Casos de Uso

| Tipo | Método | Descripción | Campos Requeridos |
|------|--------|-------------|-------------------|
| Pago promocional | `free` | Meses gratis proporcionados por el proveedor | Ninguno adicional |
| Pago cripto | `binance` | Pago con criptomonedas vía Binance | `email`, `reference` |
| Pago billetera | `zinli` | Pago con billetera digital Zinli | `email`, `reference` |
| Transferencia | `pago_movil` | Transferencia bancaria móvil | `payerPhone`, `payerIdNumber`, `bank` |

### Especificaciones de cada caso

#### 1. Pago Promocional (`free`)
```typescript
{
  subscriptionId: "sub_123",
  amount: 0,
  method: "free",
  free: true,
  // El resto de campos de pago deben ser null
}
```

#### 2. Pago Binance (`binance`)
```typescript
{
  subscriptionId: "sub_123",
  amount: 50.00,
  currency: "USDT",
  method: "binance",
  payerEmail: "usuario@email.com",
  reference: "BIN_ABC123XYZ",
  receiptUrl: "https://binance.com/..."
}
```

#### 3. Pago Zinli (`zinli`)
```typescript
{
  subscriptionId: "sub_123",
  amount: 50.00,
  currency: "USD",
  method: "zinli",
  payerEmail: "usuario@email.com",
  reference: "ZN_123456",
  receiptUrl: "https://zinli.com/..."
}
```

#### 4. Pago Móvil (`pago_movil`)
```typescript
{
  subscriptionId: "sub_123",
  amount: 50.00,
  currency: "VES",
  method: "pago_movil",
  payerPhone: "+584121234567",
  payerIdNumber: "12345678",
  bank: "Banco de Venezuela",
  reference: "REF123456"
}
```

---

## 🗄️ Modelo de Datos

### Colección: `payments`

```typescript
interface Payment {
  id: string;                    // ID único del documento
  subscriptionId: string;       // Referencia a la suscripción
  amount: number;               // Monto del pago
  currency: "USD" | "VES" | "USDT";  // Moneda
  date: Timestamp;              // Fecha del pago
  method: PaymentMethod;       // Método de pago
  status: PaymentStatus;       // Estado del pago
  reference?: string;           // Referencia única del pago
  payerEmail?: string;          // Email del pagador
  payerPhone?: string;          // Teléfono (formato E.164)
  payerIdNumber?: string;       // Cédula (6-12 dígitos)
  bank?: string;                // Banco emisor
  receiptUrl?: string;          // URL del comprobante
  free?: boolean;              // Indica si es promocional
  createdAt: Timestamp;        // Fecha de creación
  createdBy: string;            // UID del usuario que creó
  verifiedAt?: Timestamp;      // Fecha de verificación
  verifiedBy?: string;          // UID del admin que verificó
  notes?: string;              // Notas administrativas
}
```

### Tipos definidos en [`types/payment.types.ts`](types/payment.types.ts)

```typescript
type PaymentMethod = 'free' | 'binance' | 'zinli' | 'pago_movil';
type PaymentStatus = 'pending' | 'verified' | 'rejected';
type Currency = 'USD' | 'VES' | 'USDT';
```

---

## 🔄 Estados y Transiciones

### Máquina de estados

```
┌──────────┐     approve      ┌──────────┐
│ pending  │ ──────────────→  │ verified │
└──────────┘                  └──────────┘
      │                            ↑
      │ reject                     │
      ↓                            │
┌──────────┐                       │
│ rejected │ ───── retry ──────────┘
└──────────┘
```

### Transiciones válidas

| Desde | Hacia | Condición |
|-------|-------|-----------|
| `pending` | `verified` | Solo admin, sin duplicados |
| `pending` | `rejected` | Solo admin |
| `rejected` | `pending` | Retry por cualquier usuario |
| `verified` | `*` | ❌ No permitido |
| `*` | `verified` | ❌ No permitido si ya verificado |

> **Importante**: Un pago en estado `verified` nunca puede volver a `pending` ni ser `rejected`.

---

## 🌐 Endpoints

### Rutas base: `/payments`

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| POST | `/payments` | Cliente/Admin | Crear nuevo pago |
| GET | `/payments` | Cliente/Admin | Listar pagos (con filtros) |
| GET | `/payments/stats` | Admin | Estadísticas de pagos |
| GET | `/payments/subscription/:id` | Cliente/Admin | Pagos por suscripción |
| GET | `/payments/:id` | Cliente/Admin | Detalle de pago |
| PATCH | `/payments/:id/verify` | Admin | Aprobar pago |
| PATCH | `/payments/:id/reject` | Admin | Rechazar pago |
| PATCH | `/payments/:id/retry` | Usuario | Reintentar pago |

### Filtros para GET /payments

Los filtros se pasan como **query parameters** en la URL:

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `subscriptionId` | string | Filtrar por ID de suscripción | `?subscriptionId=sub_abc123` |
| `status` | string | Filtrar por estado | `?status=pending` |
| `method` | string | Filtrar por método de pago | `?method=binance` |
| `createdBy` | string | Filtrar por usuario creador | `?createdBy=uid123` |
| `page` | number | Página actual (default: 1) | `?page=1` |
| `limit` | number | Resultados por página (max: 100, default: 20) | `?limit=20` |

#### Estados válidos
- `pending` - Pagos pendientes
- `verified` - Pagos verificados/aprobados
- `rejected` - Pagos rechazados

#### Métodos válidos
- `free` - Pago promocional/gratis
- `binance` - Pago con criptomonedas
- `zinli` - Billetera digital
- `pago_movil` - Transferencia bancaria móvil

### Ejemplos de uso

#### Crear pago
```bash
POST /payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "subscriptionId": "sub_abc123",
  "amount": 50,
  "currency": "USD",
  "date": "2024-01-15T10:00:00Z",
  "method": "binance",
  "payerEmail": "cliente@email.com",
  "reference": "BIN_ABC123"
}
```

#### Listar pagos (todos)
```bash
GET /payments
Authorization: Bearer <token>
```

#### Listar pagos con filtros (query params)
```bash
GET /payments?status=pending&method=binance&page=1&limit=20
Authorization: Bearer <token>
```

#### Listar pagos por suscripción
```bash
GET /payments?subscriptionId=sub_abc123
Authorization: Bearer <token>
```

#### Aprobar pago (admin)
```bash
PATCH /payments/payment_123/verify
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "notes": "Comprobante verificado correctamente"
}
```

---

## ✅ Validaciones

### Validaciones de estructura (Zod)

Las validaciones se encuentran en [`validators/payment.schema.ts`](validators/payment.schema.ts):

```typescript
// Schema principal de creación
createPaymentSchema: z.object({
  subscriptionId: z.string().min(1),
  amount: z.number().min(0).max(1000000),
  currency: z.enum(['USD', 'VES', 'USDT']).default('USD'),
  date: z.coerce.date(),
  method: z.enum(['free', 'binance', 'zinli', 'pago_movil']),
  reference: z.string().optional(),
  payerEmail: z.string().email().optional(),
  payerPhone: z.string().optional(),
  payerIdNumber: z.string().optional(),
  bank: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  free: z.boolean().optional(),
})
```

### Validaciones de formato

| Campo | Regex | Descripción |
|-------|-------|-------------|
| `payerEmail` | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Email válido |
| `payerPhone` | `/^\+?[1-9]\d{1,14}$/` | Formato E.164 |
| `reference` | `/^[a-zA-Z0-9-_]+$/` | Alfanumérico con guiones |
| `payerIdNumber` | `/^[0-9]{6,12}$/` | Cédula de 6-12 dígitos |

### Validaciones condicionales por método

Cada método de pago tiene campos obligatorios específicos definidos en `PAYMENT_METHOD_REQUIREMENTS`:

```typescript
const PAYMENT_METHOD_REQUIREMENTS = {
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
```

---

## 📜 Reglas de Negocio

### Reglas principales

1. **free=true ⇒ method="free"**: Si el pago es promocional, el método debe ser `free`
2. **free=true ⇒ amount=0**: Los pagos gratuitos tienen monto cero
3. **free=false ⇒ amount>0**: Los pagos normales deben tener monto mayor a cero
4. **Suscripción existente**: No se puede registrar pago si la suscripción no existe
5. **Solo admins pueden verificar**: Solo usuarios con rol `admin` pueden aprobar pagos
6. **Sin duplicados verificados**: No puede haber dos pagos verificados para la misma suscripción

### Regla de negocio: Pago promocional Starlink

Cuando el proveedor Starlink otorgue meses gratis:
- Registrar payment con `amount=0`, `free=true`, `method=free`
- Esto mantiene consistencia histórica para reportes financieros

---

## 📁 Estructura del Módulo

```
src/payments/
├── index.ts                    # Exports públicos del módulo
├── README.md                   # Este archivo
├── types/
│   ├── index.ts
│   └── payment.types.ts       # Tipos TypeScript
├── models/
│   ├── index.ts
│   └── payment.model.ts       # Modelo Firebase
├── validators/
│   ├── index.ts
│   └── payment.schema.ts      # Schemas Zod
├── services/
│   ├── index.ts
│   └── payment.service.ts     # Lógica de negocio
├── controllers/
│   ├── index.ts
│   └── payment.controller.ts  # Controladores Express
└── routes/
    ├── index.ts
    └── payment.routes.ts      # Definición de rutas
```

---

## 🔧 Buenas Prácticas

### 1. Separación de responsabilidades

- **Validators**: Solo validan estructura y formato de datos
- **Services**: Contienen lógica de negocio pura
- **Controllers**: Manejan HTTP request/response

### 2. Validaciones en múltiples capas

```
Cliente → Validación Zod (schema) → Validación Service → Respuesta
         (tipo y formato)          (reglas de negocio)
```

### 3. Auditoría y trazabilidad

Siempre registrar:
- `createdBy`: Quién creó el registro
- `verifiedBy`: Quién aprobó/rechazó
- `verifiedAt`: Cuándo se verificó
- `notes`: Razón de decisiones administrativas

### 4. Manejo de errores

```typescript
try {
  const payment = await paymentService.create(data, userId);
  return res.status(201).json({ ok: true, data: payment });
} catch (err: any) {
  // Errores de validación: 400
  // No encontrado: 404
  // Error de servidor: 500
  return res.status(400).json({ ok: false, message: err.message });
}
```

### 5. Índices recomendados en Firebase

Crear índices compuestos para optimizar consultas:

| Índice | Campos |
|--------|--------|
| `payments_subscriptionId_date` | subscriptionId + date |
| `payments_status` | status |
| `payments_createdBy` | createdBy |
| `payments_subscriptionId_status` | subscriptionId + status |

### 6. Extensibilidad

Para agregar un nuevo método de pago:

1. Agregar al enum en [`types/payment.types.ts`](types/payment.types.ts):
   ```typescript
   type PaymentMethod = 'free' | 'binance' | 'zinli' | 'pago_movil' | 'nuevo_metodo';
   ```

2. Agregar requisitos en `PAYMENT_METHOD_REQUIREMENTS`

3. Opcional: Agregar validaciones específicas en schema

### 7. Seguridad

- Todas las rutas requieren autenticación (`authenticate`)
- Rutas administrativas requieren rol admin (`requireRole('admin')`)
- Validar que el usuario solo acceda a sus propios datos (cuando sea applicable)

---

## 📊 Estadísticas

El endpoint `/payments/stats` retorna:

```typescript
{
  total: number;        // Total de pagos
  pending: number;     // Pagos pendientes
  verified: number;    // Pagos verificados
  rejected: number;    // Pagos rechazados
  totalAmount: number; // Monto total de pagos verificados
}
```

---

## 🔗 Referencias

- [Documentación Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Zod Validation](https://zod.dev/)
- [Express.js](https://expressjs.com/)
