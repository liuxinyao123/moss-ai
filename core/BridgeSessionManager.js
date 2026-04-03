/**
 * Bridge Session Manager - 桥接会话管理器
 * 管理多平台（飞书、QQ、微信、Telegram）桥接会话
 */

class BridgeSessionManager {
  constructor(engine) {
    this.engine = engine;
    this.bridges = new Map();
    this.sessions = new Map();
  }

  async initialize() {
    // 发现并初始化所有桥接适配器
    console.log('[BridgeSessionManager] Initialized');
  }

  /**
   * 注册桥接适配器
   */
  registerBridge(platform, adapter) {
    this.bridges.set(platform, adapter);
    console.log(`[BridgeSessionManager] Registered bridge: ${platform}`);
  }

  /**
   * 获取桥接适配器
   */
  getBridge(platform) {
    return this.bridges.get(platform);
  }

  /**
   * 创建桥接会话
   */
  createSession(platform, externalId, agentId, metadata = {}) {
    const sessionId = `${platform}_${externalId}`;
    const session = {
      id: sessionId,
      platform,
      externalId,
      agentId,
      createdAt: Date.now(),
      lastMessageAt: null,
      metadata
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 获取桥接会话
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 通过平台和外部ID获取会话
   */
  getSessionByExternalId(platform, externalId) {
    const sessionId = `${platform}_${externalId}`;
    return this.sessions.get(sessionId);
  }

  /**
   * 获取代理关联的所有会话
   */
  getAgentSessions(agentId) {
    return Array.from(this.sessions.values())
      .filter(s => s.agentId === agentId);
  }

  /**
   * 更新会话活动时间
   */
  touchSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastMessageAt = Date.now();
    }
  }

  /**
   * 列出所有已注册桥接
   */
  listBridges() {
    return Array.from(this.bridges.keys());
  }

  /**
   * 列出所有活跃会话
   */
  listSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * 广播消息到所有桥接
   */
  async broadcast(message, filter = () => true) {
    const results = [];
    for (const [platform, bridge] of this.bridges) {
      if (filter(bridge)) {
        try {
          const result = await bridge.send(message);
          results.push({ platform, success: true, result });
        } catch (e) {
          results.push({ platform, success: false, error: e.message });
        }
      }
    }
    return results;
  }

  async shutdown() {
    // 断开所有桥接
    for (const [platform, bridge] of this.bridges) {
      if (typeof bridge.disconnect === 'function') {
        try {
          await bridge.disconnect();
        } catch (e) {
          console.warn(`[BridgeSessionManager] Failed to disconnect ${platform}:`, e.message);
        }
      }
    }
    this.bridges.clear();
    this.sessions.clear();
  }
}

module.exports = { BridgeSessionManager };
