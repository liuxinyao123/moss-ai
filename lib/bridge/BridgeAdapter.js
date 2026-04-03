/**
 * Bridge Adapter - 桥接适配器抽象基类
 * 所有平台适配器继承此类
 */

class BridgeAdapter {
  constructor(options = {}) {
    this.platform = options.platform;
    this.config = options.config || {};
    this.connected = false;
    this.messageHandler = null;
  }

  /**
   * 连接平台
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.connected = false;
  }

  /**
   * 发送消息到平台
   */
  async send(message) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * 设置消息处理器
   * handler: (message: {from, content, chatId, metadata}) => void
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }

  /**
   * 触发收到的消息
   */
  emitMessage(message) {
    if (this.messageHandler) {
      this.messageHandler({
        platform: this.platform,
        timestamp: Date.now(),
        ...message
      });
    }
  }

  /**
   * 获取连接状态
   */
  isConnected() {
    return this.connected;
  }

  /**
   * 获取平台名称
   */
  getPlatform() {
    return this.platform;
  }

  /**
   * 获取登录二维码（如果需要）
   */
  getQrCode() {
    return null;
  }

  /**
   * 验证配置
   */
  validateConfig() {
    return { valid: true };
  }
}

module.exports = { BridgeAdapter };
