/**
 * Kasm Workspace Manager
 * 管理 DSClaw Agent 与 Kasm 工作区的映射关系
 * 每个 Agent 可以有一个独立的 Kasm 工作区
 */

const { KasmClient } = require('./KasmClient');

class KasmWorkspaceManager {
  constructor(options = {}) {
    this.client = new KasmClient(options);
    this.workspaceMapping = new Map(); // agentId → workspaceInfo
    this.config = {
      defaultImageId: options.defaultImageId || 'kasmweb/chrome:latest',
      defaultIdleTimeout: options.defaultIdleTimeout || 3600, // 1小时
      autoCleanup: options.autoCleanup !== false,
      ...options
    };
  }

  /**
   * 检查 Kasm 服务是否可用
   */
  async isAvailable() {
    const health = await this.client.healthCheck();
    return health.available;
  }

  /**
   * 为 Agent 获取或创建工作区
   */
  async getOrCreateWorkspace(agentId, imageId = null) {
    // 检查是否已有工作区
    if (this.workspaceMapping.has(agentId)) {
      const existing = this.workspaceMapping.get(agentId);
      
      // 检查工作区是否还在运行
      try {
        const info = await this.client.getWorkspace(existing.workspaceId);
        if (info.status === 'running') {
          return info;
        }
      } catch (error) {
        // 工作区不存在，需要重新创建
        this.workspaceMapping.delete(agentId);
      }
    }

    // 创建新工作区
    const selectedImage = imageId || this.config.defaultImageId;
    const result = await this.client.createWorkspace(
      selectedImage,
      agentId,
      { idleTimeout: this.config.defaultIdleTimeout }
    );

    if (result.workspace_id) {
      this.workspaceMapping.set(agentId, {
        workspaceId: result.workspace_id,
        imageId: selectedImage,
        createdAt: Date.now()
      });
    }

    return result;
  }

  /**
   * 获取 Agent 的工作区连接 URL
   */
  async getAgentConnectionUrl(agentId) {
    const mapping = this.workspaceMapping.get(agentId);
    if (!mapping) {
      return null;
    }
    return this.client.getConnectionUrl(mapping.workspaceId);
  }

  /**
   * 获取 Agent 工作区截图
   */
  async getAgentScreenshot(agentId) {
    const mapping = this.workspaceMapping.get(agentId);
    if (!mapping) {
      return null;
    }
    return this.client.getScreenshot(mapping.workspaceId);
  }

  /**
   * 销毁 Agent 工作区
   */
  async destroyWorkspace(agentId) {
    const mapping = this.workspaceMapping.get(agentId);
    if (!mapping) {
      return true;
    }

    try {
      await this.client.deleteWorkspace(mapping.workspaceId);
    } catch (error) {
      console.warn(`[KasmWorkspaceManager] Failed to delete workspace for agent ${agentId}:`, error.message);
    }

    this.workspaceMapping.delete(agentId);
    return true;
  }

  /**
   * 清理所有已空闲的工作区
   */
  async cleanupIdleWorkspaces(maxAge = 3600000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [agentId, mapping] of this.workspaceMapping.entries()) {
      if (now - mapping.createdAt > maxAge) {
        await this.destroyWorkspace(agentId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 列出所有当前工作区
   */
  listWorkspaces() {
    return Array.from(this.workspaceMapping.entries()).map(([agentId, info]) => ({
      agentId,
      ...info
    }));
  }

  /**
   * 获取可用镜像列表
   */
  async getAvailableImages() {
    return this.client.getImages();
  }

  /**
   * 在 Kasm 工作区中执行命令（如果启用了 exec 权限）
   * 注意：需要镜像配置允许 exec
   */
  async executeCommand(agentId, command) {
    const mapping = this.workspaceMapping.get(agentId);
    if (!mapping) {
      throw new Error(`No workspace found for agent ${agentId}`);
    }

    return this.client.request('/api/workspaces/exec', 'POST', {
      workspace_id: mapping.workspaceId,
      command: command
    });
  }
}

module.exports = { KasmWorkspaceManager };
