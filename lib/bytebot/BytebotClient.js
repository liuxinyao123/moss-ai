const axios = require('axios');

class BytebotClient {
  constructor(config = {}) {
    this.enabled = Boolean(config.enabled);
    this.uiUrl = String(config.uiUrl || 'http://localhost:9992').replace(/\/+$/, '');
    this.tasksApiUrl = String(config.tasksApiUrl || 'http://localhost:9991').replace(/\/+$/, '');
    this.computerUseApiUrl = String(config.computerUseApiUrl || 'http://localhost:9990').replace(/\/+$/, '');
    this.timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 5000;
  }

  isEnabled() {
    return this.enabled;
  }

  async ping() {
    if (!this.enabled) return false;
    try {
      // Bytebot UI is expected to answer with 200 HTML.
      await axios.get(this.uiUrl, { timeout: this.timeoutMs, validateStatus: () => true });
      return true;
    } catch {
      return false;
    }
  }

  getUiUrl() {
    return this.uiUrl;
  }

  /**
   * Create a task in Bytebot (best-effort).
   * Bytebot README shows POST http://localhost:9991/tasks
   */
  async createTask(description, extra = {}) {
    if (!this.enabled) throw new Error('Bytebot is disabled');
    const payload = { description, ...extra };
    const res = await axios.post(`${this.tasksApiUrl}/tasks`, payload, {
      timeout: this.timeoutMs,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300) return res.data;
    const msg = (res.data && (res.data.error || res.data.message)) || `HTTP ${res.status}`;
    throw new Error(`Bytebot createTask failed: ${msg}`);
  }
}

module.exports = { BytebotClient };

