/**
 * Hub EventBus - 事件总线
 * 统一事件分发，解耦各模块
 */

const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    // 设置最大监听器数量
    this.setMaxListeners(100);
    this.history = [];
    this.maxHistory = 1000;
  }

  /**
   * 发布事件
   */
  emit(eventName, data) {
    // 记录历史
    this.history.push({
      eventName,
      data,
      timestamp: Date.now()
    });

    // 裁剪历史
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    return super.emit(eventName, data);
  }

  /**
   * 发布带名称空间的事件
   */
  emitNamespace(namespace, event, data) {
    return this.emit(`${namespace}:${event}`, data);
  }

  /**
   * 获取事件历史
   */
  getHistory(filter = null) {
    if (filter) {
      return this.history.filter(item => filter(item));
    }
    return this.history;
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * 等待某个事件一次
   */
  waitFor(eventName, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeoutMs);

      this.once(eventName, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(eventName) {
    return super.removeAllListeners(eventName);
  }
}

module.exports = { EventBus };
