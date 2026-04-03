/**
 * Feishu Bridge - 飞书桥接适配器
 */

const { BridgeAdapter } = require('./BridgeAdapter');

class FeishuBridge extends BridgeAdapter {
  constructor(config) {
    super({ platform: 'feishu', config });
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * 验证配置
   */
  validateConfig() {
    if (!this.appId || !this.appSecret) {
      return {
        valid: false,
        error: 'appId and appSecret are required'
      };
    }
    return { valid: true };
  }

  async connect() {
    // 这里实际连接飞书开放平台
    // 验证获取access_token
    console.log('[FeishuBridge] Connecting...');
    this.connected = true;
    console.log('[FeishuBridge] Connected');
  }

  async disconnect() {
    this.connected = false;
    console.log('[FeishuBridge] Disconnected');
  }

  /**
   * 发送消息到飞书
   */
  async send(options) {
    const { chatId, content } = options;
    console.log(`[FeishuBridge] Sending to ${chatId}: ${content.slice(0, 50)}...`);
    
    // 实际调用飞书API发送消息
    // 这里占位，实际由OpenClaw路由处理
    return { success: true, messageId: Date.now() };
  }
}

module.exports = { FeishuBridge };
