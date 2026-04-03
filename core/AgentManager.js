/**
 * Agent Manager - 智能体管理器
 * 管理所有智能体的生命周期、加载、存储
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AgentManager {
  constructor(engine) {
    this.engine = engine;
    this.agents = new Map();
    this.agentsDir = path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai',
      'agents'
    );
  }

  async initialize() {
    // 确保目录存在
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }

    // 加载所有已保存的智能体
    await this.loadAllAgents();
    console.log(`[AgentManager] Loaded ${this.agents.size} agents`);
  }

  /**
   * 从磁盘加载所有智能体
   */
  async loadAllAgents() {
    const items = fs.readdirSync(this.agentsDir);
    
    for (const item of items) {
      const agentDir = path.join(this.agentsDir, item);
      if (fs.statSync(agentDir).isDirectory()) {
        const configPath = path.join(agentDir, 'config.json');
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            this.agents.set(config.id, config);
          } catch (e) {
            console.warn(`[AgentManager] Failed to load agent ${item}:`, e.message);
          }
        }
      }
    }
  }

  /**
   * 创建新智能体
   */
  async createAgent(options) {
    const agentId = options.id || `agent_${Date.now()}_${uuidv4().slice(0, 9)}`;
    const now = Date.now();
    
    const agent = {
      id: agentId,
      name: options.name || 'Agent',
      description: options.description || '',
      personalityTemplate: options.personalityTemplate || 'default',
      createdAt: now,
      updatedAt: now,
      deskPath: path.join(this.agentsDir, agentId, 'desk'),
      settings: options.settings || {},
      ...options
    };

    // 创建智能体目录结构
    const agentDir = path.join(this.agentsDir, agentId);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(agent.deskPath, { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });

    // 保存配置
    this.saveAgent(agent);
    this.agents.set(agentId, agent);

    console.log(`[AgentManager] Created agent: ${agentId} (${agent.name})`);
    return agent;
  }

  /**
   * 保存智能体配置到磁盘
   */
  saveAgent(agent) {
    const agentDir = path.join(this.agentsDir, agent.id);
    const configPath = path.join(agentDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(agent, null, 2), 'utf8');
  }

  /**
   * 获取智能体
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * 列出所有智能体
   */
  listAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * 删除智能体
   */
  async deleteAgent(agentId) {
    const agentDir = path.join(this.agentsDir, agentId);
    if (fs.existsSync(agentDir)) {
      // 简单删除（生产环境可使用rm-rf，但这里保持简单）
      this.deleteDirectory(agentDir);
    }
    this.agents.delete(agentId);
    console.log(`[AgentManager] Deleted agent: ${agentId}`);
  }

  /**
   * 递归删除目录
   */
  deleteDirectory(dir) {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach((file) => {
        const curPath = path.join(dir, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this.deleteDirectory(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dir);
    }
  }

  /**
   * 获取智能体Desk路径
   */
  getAgentDeskPath(agentId) {
    const agent = this.getAgent(agentId);
    return agent ? agent.deskPath : null;
  }

  async shutdown() {
    // 保存所有更改
    for (const agent of this.agents.values()) {
      this.saveAgent(agent);
    }
    this.agents.clear();
  }
}

module.exports = { AgentManager };
