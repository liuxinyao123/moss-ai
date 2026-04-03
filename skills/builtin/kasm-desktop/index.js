/**
 * Kasm Desktop Skill
 * 
 * 在 Kasm 隔离环境中启动完整 Ubuntu 桌面
 * 支持完整 GUI 操作环境
 */

module.exports = {
  id: 'kasm-desktop',
  name: 'Kasm 完整桌面环境',
  description: '在隔离的 Kasm 工作区中启动完整 Ubuntu 桌面环境',
  version: '1.0.0',
  author: 'DSClaw',
  tags: ['desktop', 'gui', 'kasm', 'isolation'],
  
  // Kasm 配置
  kasm: {
    imageId: 'kasmweb/ubuntu-22.04-desktop:latest',
    requiresKasm: true,
    idleTimeout: 7200 // 2小时
  },

  /**
   * 技能入口
   */
  async execute(params, context) {
    // SkillManager 调用顺序: execute(params, context)
    const { agentId } = params;
    const { skillAdapter } = context;

    if (!skillAdapter || !skillAdapter.isEnabled()) {
      return {
        success: false,
        error: 'Kasm 未启用或不可用，请先配置 Kasm Workspaces'
      };
    }

    try {
      // 准备 Kasm 环境
      const env = await skillAdapter.prepareEnvironment(
        this.id,
        agentId,
        this.kasm
      );

      return {
        success: true,
        message: 'Kasm Ubuntu 桌面已启动',
        data: {
          workspaceId: env.workspace_id,
          connectionUrl: env.connection_url,
          agentId: agentId
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * 获取当前状态
   */
  async getStatus(agentId, context) {
    const { skillAdapter } = context;
    
    if (!skillAdapter || !skillAdapter.isEnabled()) {
      return { enabled: false };
    }

    return skillAdapter.getConnectionInfo(agentId);
  },

  /**
   * 截图
   */
  async capture(agentId, context) {
    const { skillAdapter } = context;
    return skillAdapter.captureScreenshot(agentId);
  },

  /**
   * 清理
   */
  async cleanup(agentId, context) {
    const { skillAdapter } = context;
    if (skillAdapter) {
      await skillAdapter.cleanupEnvironment(agentId);
    }
  }
};
