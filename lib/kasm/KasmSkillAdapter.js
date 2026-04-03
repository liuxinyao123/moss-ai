/**
 * Kasm Skill Adapter
 * 将 Kasm 工作区能力暴露给 DSClaw Skill 系统
 * 支持技能在隔离的容器环境中执行
 */

const { KasmWorkspaceManager } = require('./KasmWorkspaceManager');

class KasmSkillAdapter {
  constructor(options = {}) {
    this.workspaceManager = new KasmWorkspaceManager(options);
    this.enabled = false;
  }

  /**
   * 初始化，检查连接
   */
  async initialize() {
    try {
      const available = await this.workspaceManager.isAvailable();
      this.enabled = available;
      return available;
    } catch (error) {
      console.warn('[KasmSkillAdapter] Kasm not available:', error.message);
      this.enabled = false;
      return false;
    }
  }

  /**
   * 是否启用
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 为技能执行准备环境
   * @param {string} skillId - 技能 ID
   * @param {string} agentId - 智能体 ID
   * @param {object} options - 选项 { imageId }
   */
  async prepareEnvironment(skillId, agentId, options = {}) {
    if (!this.enabled) {
      throw new Error('Kasm is not available');
    }

    const workspace = await this.workspaceManager.getOrCreateWorkspace(
      agentId,
      options.imageId || null
    );

    const connectionUrl = await this.workspaceManager.getAgentConnectionUrl(agentId);

    return {
      ...workspace,
      connection_url: connectionUrl,
      skill_id: skillId,
      agent_id: agentId
    };
  }

  /**
   * 执行完毕后清理（可选，因为有空置自动清理）
   */
  async cleanupEnvironment(agentId) {
    if (!this.enabled) return;
    await this.workspaceManager.destroyWorkspace(agentId);
  }

  /**
   * 获取当前环境截图
   */
  async captureScreenshot(agentId) {
    if (!this.enabled) return null;
    return this.workspaceManager.getAgentScreenshot(agentId);
  }

  /**
   * 获取连接信息用于前端展示
   */
  async getConnectionInfo(agentId) {
    if (!this.enabled) return null;

    const url = await this.workspaceManager.getAgentConnectionUrl(agentId);
    const screenshot = await this.captureScreenshot(agentId);

    return {
      enabled: this.enabled,
      connectionUrl: url,
      screenshot: screenshot,
      workspace: this.workspaceManager.workspaceMapping.get(agentId)
    };
  }

  /**
   * 获取工作区管理器实例
   */
  getWorkspaceManager() {
    return this.workspaceManager;
  }

  /**
   * 定期清理空闲工作区（供 Hub Scheduler 调用）
   */
  async periodicCleanup(maxAge = 3600000) {
    if (!this.enabled) return 0;
    return this.workspaceManager.cleanupIdleWorkspaces(maxAge);
  }
}

module.exports = { KasmSkillAdapter };
