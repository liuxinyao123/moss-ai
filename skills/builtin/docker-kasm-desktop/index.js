/**
 * Docker Kasm Ubuntu Desktop Skill
 * 
 * 直接通过 Docker 启动 Kasm Ubuntu 完整桌面
 * 不需要完整的 Kasm Workspaces Manager，嵌入 MOSS-AI 使用
 */

const { DockerKasmAdapter } = require('../../../lib/kasm');

module.exports = {
  id: 'docker-kasm-desktop',
  name: 'Docker Kasm Ubuntu 桌面',
  description: '直接通过 Docker 启动完整 Ubuntu 桌面环境',
  version: '1.0.0',
  author: 'MOSS-AI',
  tags: ['desktop', 'kasm', 'docker', 'gui', 'isolation'],
  
  requiresDocker: true,

  /**
   * 技能入口
   */
  async execute(params, context) {
    const { agentId } = params;
    
    // 获取 DockerKasmAdapter
    let adapter = context.skillManager?.dockerKasmAdapter;
    
    if (!adapter) {
      adapter = new DockerKasmAdapter({
        portStart: 8000
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
      // 创建桌面工作区
      const result = await adapter.createDesktopWorkspace(agentId);
      
      return {
        success: true,
        message: 'Kasm Ubuntu 桌面已启动',
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
    const adapter = context.skillManager?.dockerKasmAdapter;
    if (!adapter) {
      return null;
    }
    return adapter.getWorkspace(agentId);
  },

  /**
   * 关闭工作区
   */
  async cleanup(agentId, context) {
    const adapter = context.skillManager?.dockerKasmAdapter;
    if (adapter) {
      await adapter.destroyWorkspace(agentId);
    }
  }
};
