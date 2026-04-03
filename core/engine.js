/**
 * MOSS-AI Core Engine
 * 
 * 引擎编排 + 管理器统一门面
 * 参照OpenHanako架构设计，职责分离
 */

const { AgentManager } = require('./AgentManager');
const { SessionManager } = require('./SessionManager');
const { ModelManager } = require('./ModelManager');
const { PreferencesManager } = require('./PreferencesManager');
const { SkillManager } = require('./SkillManager');
const { ChannelManager } = require('./ChannelManager');
const { BridgeSessionManager } = require('./BridgeSessionManager');

class Engine {
  constructor(options = {}) {
    this.options = options;
    this.agentManager = null;
    this.sessionManager = null;
    this.modelManager = null;
    this.preferencesManager = null;
    this.skillManager = null;
    this.channelManager = null;
    this.bridgeSessionManager = null;
    this.initialized = false;
  }

  /**
   * 初始化所有管理器
   */
  async initialize() {
    // 首选项最先加载
    this.preferencesManager = new PreferencesManager(this);
    await this.preferencesManager.load();

    // 模型管理器
    this.modelManager = new ModelManager(this);
    await this.modelManager.initialize();

    // 智能体管理器
    this.agentManager = new AgentManager(this);
    await this.agentManager.initialize();

    // 会话管理器
    this.sessionManager = new SessionManager(this);
    await this.sessionManager.initialize();

    // 技能管理器
    this.skillManager = new SkillManager(this);
    await this.skillManager.initialize();

    // 频道管理器
    this.channelManager = new ChannelManager(this);
    await this.channelManager.initialize();

    // 桥接会话管理器 (多平台)
    this.bridgeSessionManager = new BridgeSessionManager(this);
    await this.bridgeSessionManager.initialize();

    this.initialized = true;
    console.log('[Core] MOSS Engine initialized');
  }

  /**
   * 获取统一门面API
   */
  getApi() {
    return {
      agents: this.agentManager,
      sessions: this.sessionManager,
      models: this.modelManager,
      preferences: this.preferencesManager,
      skills: this.skillManager,
      channels: this.channelManager,
      bridges: this.bridgeSessionManager,
      engine: this
    };
  }

  /**
   * 关闭引擎，清理资源
   */
  async shutdown() {
    await this.bridgeSessionManager.shutdown();
    await this.skillManager.shutdown();
    await this.sessionManager.shutdown();
    await this.agentManager.shutdown();
    await this.modelManager.shutdown();
    this.initialized = false;
  }
}

module.exports = { Engine };
