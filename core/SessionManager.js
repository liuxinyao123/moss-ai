/**
 * Session Manager - 会话管理器
 * 管理活跃会话，对话上下文
 */

class SessionManager {
  constructor(engine) {
    this.engine = engine;
    this.sessions = new Map();
  }

  async initialize() {
    // 加载持久化会话（可选）
    console.log('[SessionManager] Initialized');
  }

  /**
   * 创建新会话
   */
  createSession(agentId, options = {}) {
    const sessionId = `${agentId}_${Date.now()}`;
    const session = {
      id: sessionId,
      agentId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      messages: [],
      metadata: options.metadata || {},
      context: options.context || {}
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 添加消息到会话
   */
  addMessage(sessionId, role, content, metadata = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.messages.push({
      role,
      content,
      timestamp: Date.now(),
      metadata
    });
    session.lastActivityAt = Date.now();
    return session;
  }

  /**
   * 获取会话历史
   */
  getMessages(sessionId, limit = null) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    if (limit && session.messages.length > limit) {
      return session.messages.slice(-limit);
    }
    return session.messages;
  }

  /**
   * 获取Agent的所有会话
   */
  getAgentSessions(agentId) {
    return Array.from(this.sessions.values())
      .filter(s => s.agentId === agentId)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > maxAgeMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  async shutdown() {
    // 这里可以实现会话持久化
    this.sessions.clear();
  }
}

module.exports = { SessionManager };
