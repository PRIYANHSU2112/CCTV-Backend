import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

export class RequestContextService {
  static get store() {
    return asyncLocalStorage.getStore() || new Map();
  }

  static run(store, callback) {
    return asyncLocalStorage.run(store, callback);
  }

  static set(key, value) {
    const currentStore = asyncLocalStorage.getStore();
    if (currentStore) {
      currentStore.set(key, value);
    }
  }

  static get(key) {
    const currentStore = asyncLocalStorage.getStore();
    return currentStore ? currentStore.get(key) : undefined;
  }

  static get requestId() {
    return this.get('requestId');
  }

  static get correlationId() {
    return this.get('correlationId');
  }

  static get currentUser() {
    return this.get('user');
  }
}
