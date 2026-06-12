# ADR 0001 — Fase 3: Arquitectura interna basada en eventos

Fecha: 2026-06-12
Estado: accepted
Autores: Equipo de auditoría

## Contexto

El proyecto es una API de suscripciones con piezas críticas: cobros, periodos de facturación, notificaciones y automatizaciones diarias.
Antes de la intervención, la lógica de decisión y reglas estaba distribuida entre múltiples módulos (automation, payments, billingPeriods), lo que provocaba duplicación y riesgo de inconsistencia.

El objetivo de Fase 3 es estabilizar una arquitectura interna basada en eventos, con responsabilidades claras:

- Estado: `billingPeriodService` como único decision-maker para el estado de los `billingPeriod`.
- Reglas: funciones puras / servicios independientes que calculan evaluación y transiciones (evaluate -> actions).
- Flujo: `eventBus` (in-process) + `automation` para orquestar cuándo evaluar, sin que la automatización tome decisiones.

## Decisión

Adoptar un bus de eventos in-process (Node `EventEmitter`) como mecanismo de desacoplo entre productores y consumidores internos, manteniendo `billingPeriodService` como la única fuente de verdad para transiciones de estado.

Reglas concretas:

1. Los listeners deben ser "thin": solo delegan a servicios (ej. `communicationsService`) y no contener lógica de negocio ni emitir decisions.
2. `billingPeriodService` contiene la lógica para `applyPayment`, `evaluateBillingPeriod` y emitir eventos de resultado (`EVENT_BILLING_PERIOD_PAID`, `EVENT_BILLING_PERIOD_OVERDUE`, `EVENT_SUBSCRIPTION_SUSPENDED`).
3. `automation` emite solicitudes de evaluación (`EVENT_BILLING_PERIOD_EVALUATION_REQUEST`) y no aplica acciones directamente.

## Consecuencias

- Ventajas:
  - Desacoplamiento claro entre módulos.
  - Un único punto de decisión evita duplicación y race conditions.
  - Fácil de probar: se crean tests de flujo por eventos.

- Riesgos / mitigaciones:
  - Crecimiento no controlado de listeners: mitigar con `eventBus.setMaxListeners(n)` y telemetría para contar listeners y emisiones.
  - EventEmitter in-process no escala a multi-instancia horizontal sin un broker externo. Si se requiere, considerar migración a un bus externo (Kafka, Pub/Sub) y versionar los contratos de eventos.
  - Cron/job lifecycle: garantizar shutdown limpio (SIGTERM/SIGINT) que pare los `cron` y cierre conexiones.

## Alternativas consideradas

- Usar un message broker externo: descartado por complejidad y sobrecoste operativo en esta fase.
- Mantener lógica distribuida: descartado por alto riesgo de inconsistencias y tests difíciles.

## Tareas de seguimiento

1. Añadir telemetría básica: contador de emisiones por evento y número de listeners.
2. Aplicar `eventBus.setMaxListeners(50)` o valor configurable.
3. Implementar shutdown ordenado en `src/index.ts` que llame a `stopDailyAutomationJob()` y cierre recursos.
4. Redactar pruebas de integración para flujos críticos (pagos -> evaluación -> notificaciones).

---

Referencia: `src/events/eventBus.ts`, `src/billingPeriods/services/billingPeriod.service.ts`, `src/automation/services/automation.service.ts`, `src/events/registerEventListeners.ts`
