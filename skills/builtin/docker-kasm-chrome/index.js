/**
 * Docker Kasm Chrome Skill
 * 
 * 直接通过 Docker 启动 Kasm Chrome 容器
 * 不需要完整的 Kasm Workspaces Manager，嵌入 MOSS-AI 使用
 */

const { DockerKasmAdapter } = require('../../../lib/kasm');

module.exports = {
  id: 'docker-kasm-chrome',
  name: 'Docker Kasm Chrome',
  description: '直接通过 Docker 启动隔离 Chrome 浏览器，嵌入 MOSS-AI 使用',
  version: '1.0.0',
  author: 'MOSS-AI',
  tags: ['browser', 'kasm', 'docker', 'isolation', 'automation'],
  
  // 是否需要 Docker
  requiresDocker: true,

  /**
   * 技能入口
   */
  async execute(params, context) {
    const { agentId } = params;
    
    // 获取 DockerKasmAdapter（从 SkillManager 或创建）
    let adapter = context.skillManager?.kasmAdapter;
    
    if (!adapter) {
      // 如果没有，创建一个新的
      adapter = new DockerKasmAdapter({
        portStart: 7000
      });
      
      const available = await adapter.ping();
      if (!available) {
        return {
          success: false,
          error: 'Docker 不可用，请检查 Docker 是否启动'
        };
      }
    }

    try {
      // 创建 Chrome 工作区
      const result = await adapter.createChromeWorkspace(agentId);
      
      return {
        success: true,
        message: 'Kasm Chrome 已启动',
        data: {
          agentId: result.agentId,
          containerId: result.containerId,
          connectionUrl: result.connectionUrl,
          port: result.port,
          password: result.password
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
   * 获取连接信息
   */
  async getConnection(agentId, context) {
    const adapter = context.skillManager?.kasmAdapter;
    if (!adapter) {
      return null;
    }
    return adapter.getWorkspace(agentId);
  },

  /**
   * 关闭工作区
   */
  async cleanup(agentId, context) {
    const adapter = context.skillManager?.kasmAdapter;
    if (adapter) {
      await adapter.destroyWorkspace(agentId);
    }
  }
};
