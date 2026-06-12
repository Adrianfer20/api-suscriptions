import { EventEmitter } from 'events';

class EventBus extends EventEmitter {}

const eventBus = new EventBus();
// Prevent accidental memory leak warnings when listeners grow in production.
// 50 is a conservative upper bound; make configurable if needed.
eventBus.setMaxListeners(50);

export default eventBus;
