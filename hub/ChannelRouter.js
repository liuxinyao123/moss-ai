/**
 * Hub ChannelRouter - 频道路由器
 * 将不同桥接平台的消息路由到对应智能体，处理Agent间对话
 */

class ChannelRouter {
  constructor(eventBus, channelManager) {
    this.eventBus = eventBus;
    this.channelManager = channelManager;
    this.routes = new Map();
  }

  /**
   * 路由外部平台消息到智能体
   */
  routeExternalMessage(platform, externalChatId, agentId, message) {
    const routeKey = `${platform}:${externalChatId}`;
    
    // 记录路由映射
    if (!this.routes.has(routeKey)) {
      this.routes.set(routeKey, {
        platform,
        externalChatId,
        agentId,
        connectedAt: Date.now()
      });
    }

    // 发布事件让处理器处理
    this.eventBus.emit('external:message', {
      platform,
      externalChatId,
      agentId,
      message,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 获取路由
   */
  getRoute(platform, externalChatId) {
    const routeKey = `${platform}:${externalChatId}`;
    return this.routes.get(routeKey);
  }

  /**
   * 解绑路由
   */
  unbindRoute(platform, externalChatId) {
    const routeKey = `${platform}:${externalChatId}`;
    return this.routes.delete(routeKey);
  }

  /**
   * 路由智能体消息到频道
   */
  routeAgentMessage(fromAgentId, channelId, content, metadata = {}) {
    const message = this.channelManager.sendMessage(channelId, fromAgentId, content, metadata);
    
    // 发布事件
    this.eventBus.emit('channel:message', {
      channelId,
      message,
      fromAgentId
    });

    return message;
  }

  /**
   * 直接路由智能体消息到另一个智能体
   */
  routeAgentToAgent(fromAgentId, toAgentId, content, metadata = {}) {
    this.eventBus.emit('agent:message', {
      fromAgentId,
      toAgentId,
      content,
      metadata,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 列出所有路由
   */
  listRoutes() {
    return Array.from(this.routes.values());
  }
}

module.exports = { ChannelRouter };
