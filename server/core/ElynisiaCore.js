import http from 'http';
import { EventEmitter } from 'events';
import { URL } from 'url';

class ElynisiaCore extends EventEmitter {
  constructor() {
    super();
    this.variables = new Map(); // Penyimpanan instance (bot, db, dll)
    this.modules = new Map();   // Penyimpanan module/tool yang diregistrasi
    this.routes = new Map();    // Penyimpanan route untuk server HTTP
    this.server = null;
  }

  // 1. Dependency Injection (Menyimpan Variabel Global)
  registerVariable(key, value) {
    this.variables.set(key, value);
    this.emit('variableRegistered', { key });
    return this;
  }

  getVariable(key) {
    if (!this.variables.has(key)) {
      throw new Error(`Variabel '${key}' belum diregistrasi!`);
    }
    return this.variables.get(key);
  }

  // 2. Modular Plugin/Tool Registry
  // Module bisa berupa fungsi, tool AI, atau plugin eksternal
  registerModule(moduleName, moduleDefinition) {
    this.modules.set(moduleName, moduleDefinition);
    this.emit('moduleRegistered', { moduleName });
    return this;
  }

  getModule(moduleName) {
    return this.modules.get(moduleName);
  }

  // 3. Eksekusi Modul Secara Dinamis
  async executeModule(moduleName, args = {}) {
    const mod = this.getModule(moduleName);
    if (!mod || typeof mod.execute !== 'function') {
      throw new Error(`Module '${moduleName}' tidak valid atau tidak memiliki method 'execute'`);
    }
    // Inject Elynisia instance ke dalam module agar bisa akses variabel lain
    return await mod.execute(args, this);
  }

  // 4. Integrasi Web Server (API Router)
  openServer(port = 3000) {
    this.server = http.createServer((req, res) => {
      this.handleServerRequest(req, res);
    });

    this.server.listen(port, () => {
      console.log(`[Elynisia] Web Server berjalan di port ${port}`);
      this.emit('serverStarted', port);
    });

    return this;
  }

  createRouter(routePath, handler) {
    this.routes.set(routePath, handler);
    return this;
  }

  handleServerRequest(req, res) {
    // Basic routing logika (Bisa dikembangkan memakai regex atau library external seperti Express)
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `http://${host}`);
    const pathname = url.pathname;

    // Cari route yang cocok
    let matchedHandler = null;
    let matchedRoute = null;

    for (const [route, handler] of this.routes.entries()) {
      if (typeof route === 'string' && route === pathname) {
        matchedHandler = handler;
        matchedRoute = route;
        break;
      } else if (route instanceof RegExp && route.test(pathname)) {
        matchedHandler = handler;
        matchedRoute = route;
        break;
      }
    }

    if (matchedHandler) {
      // Parsing query & param
      const query = Object.fromEntries(url.searchParams);
      // Execute the handler, passing the request context and the Elynisia instance
      try {
        matchedHandler({ req, res, query, url, route: matchedRoute }, this);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', details: err.message }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found' }));
    }
  }
}

// Export sebagai Singleton agar seluruh project memakai instance yang sama
export const elynisia = new ElynisiaCore();
