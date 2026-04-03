/**
 * Channel Manager - 频道管理器
 * 管理多个智能体之间的协作频道
 */

const { v4: uuidv4 } = require('uuid');

class ChannelManager {
  constructor(engine) {
    this.engine = engine;
    this.channels = new Map();
  }

  async initialize() {
    // 从数据库加载频道
    console.log('[ChannelManager] Initialized');
  }

  /**
   * 创建新频道
   */
  createChannel(options) {
    const channelId = options.id || `channel_${uuidv4()}`;
    const channel = {
      id: channelId,
      name: options.name || 'New Channel',
      description: options.description || '',
      agentIds: options.agentIds || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      metadata: options.metadata || {}
    };

    this.channels.set(channelId, channel);
    console.log(`[ChannelManager] Created channel: ${channelId}`);
    return channel;
  }

  /**
   * 获取频道
   */
  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  /**
   * 添加智能体到频道
   */
  addAgentToChannel(channelId, agentId) {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    if (!channel.agentIds.includes(agentId)) {
      channel.agentIds.push(agentId);
      channel.updatedAt = Date.now();
    }

    return channel;
  }

  /**
   * 从频道移除智能体
   */
  removeAgentFromChannel(channelId, agentId) {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    channel.agentIds = channel.agentIds.filter(id => id !== agentId);
    channel.updatedAt = Date.now();
    return channel;
  }

  /**
   * 发送消息到频道
   */
  sendMessage(channelId, fromAgentId, content, metadata = {}) {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    channel.messages.push({
      id: `msg_${uuidv4().slice(0, 8)}`,
      fromAgentId,
      content,
      timestamp: Date.now(),
      metadata
    });
    channel.updatedAt = Date.now();

    // 触发事件总线，通知订阅者
    this.notifyMessage(channelId, channel.messages[channel.messages.length - 1]);

    return channel.messages[channel.messages.length - 1];
  }

  /**
   * 通知事件总线（由hub处理）
   */
  notifyMessage(channelId, message) {
    // 这里实际由eventBus代理
    if (global.eventBus) {
      global.eventBus.emit('channel:message', { channelId, message });
    }
  }

  /**
   * 获取频道历史消息
   */
  getMessages(channelId, limit = 50) {
    const channel = this.channels.get(channelId);
    if (!channel) return [];
    
    if (limit && channel.messages.length > limit) {
      return channel.messages.slice(-limit);
    }
    return channel.messages;
  }

  /**
   * 列出所有频道
   */
  listChannels() {
    return Array.from(this.channels.values());
  }

  /**
   * 获取智能体参与的所有频道
   */
  getAgentChannels(agentId) {
    return Array.from(this.channels.values())
      .filter(c => c.agentIds.includes(agentId));
  }

  /**
   * 删除频道
   */
  deleteChannel(channelId) {
    return this.channels.delete(channelId);
  }

  async shutdown() {
    this.channels.clear();
  }
}

module.exports = { ChannelManager };
