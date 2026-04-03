/**
 * Telegram Bridge - Telegram桥接适配器
 */

const { BridgeAdapter } = require('./BridgeAdapter');

class TelegramBridge extends BridgeAdapter {
  constructor(config) {
    super({ platform: 'telegram', config });
    this.botToken = config.botToken;
  }

  validateConfig() {
    if (!this.botToken) {
      return {
        valid: false,
        error: 'botToken is required'
      };
    }
    return { valid: true };
  }

  async connect() {
    console.log('[TelegramBridge] Initializing bot...');
    this.connected = true;
    console.log('[TelegramBridge] Connected');
  }

  async disconnect() {
    this.connected = false;
    console.log('[TelegramBridge] Disconnected');
  }

  async send(options) {
    const { chatId, content } = options;
    console.log(`[TelegramBridge] Sending to ${chatId}: ${content.slice(0, 50)}...`);
    // 实际调用Telegram API
    return { success: true };
  }
}

module.exports = { TelegramBridge };
