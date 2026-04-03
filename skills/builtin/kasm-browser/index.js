/**
 * Kasm Browser Skill
 * 
 * 在 Kasm 隔离环境中启动 Chrome 浏览器
 * 支持 AI 自动化网页操作，类似 Manus
 */

module.exports = {
  id: 'kasm-browser',
  name: 'Kasm 浏览器自动化',
  description: '在隔离的 Kasm 工作区中启动 Chrome 浏览器，支持 AI 网页自动化操作',
  version: '1.0.0',
  author: 'MOSS-AI',
  tags: ['browser', 'automation', 'kasm', 'isolation'],
  
  // Kasm 配置
  kasm: {
    imageId: 'kasmweb/chrome:latest',
    requiresKasm: true,
    idleTimeout: 7200 // 2小时
  },

  /**
   * 技能入口
   */
  async execute(params, context) {
    // SkillManager 调用顺序: execute(params, context)
    const { agentId, url = 'https://www.google.com' } = params;
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

      // 如果提供了 URL，浏览器会自动打开
      // Kasm 的 Chrome 镜像支持通过参数打开 URL

      return {
        success: true,
        message: 'Kasm Chrome 浏览器已启动',
        data: {
          workspaceId: env.workspace_id,
          connectionUrl: env.connection_url,
          url: url,
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
