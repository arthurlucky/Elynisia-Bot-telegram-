import { EventEmitter } from "events";

class ElyniaEventBus extends EventEmitter {
  constructor() {
    super();
  }

  // Wrapper for emit
  emitEvent(event, data) {
    this.emit(event, data);
  }

  // Wrapper for subscribe
  subscribe(event, listener) {
    this.on(event, listener);
  }

  // Wrapper for unsubscribe
  unsubscribe(event, listener) {
    this.off(event, listener);
  }
}

export const eventBus = new ElyniaEventBus();
export default eventBus;
