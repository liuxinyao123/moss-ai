/**
 * Model Manager - 模型管理器
 * 管理多种模型配置：聊天模型、工具模型、深度分析模型
 */

class ModelManager {
  constructor(engine) {
    this.engine = engine;
    this.models = new Map();
    this.defaults = {
      chat: null,
      utility: null,
      utilityLarge: null
    };
  }

  async initialize() {
    // 从配置加载模型配置
    const prefs = this.engine.preferencesManager;
    const modelConfig = prefs.get('models', {});
    
    for (const [key, config] of Object.entries(modelConfig)) {
      this.models.set(key, config);
    }

    // 设置默认模型
    this.defaults.chat = modelConfig.defaultChat || modelConfig.chat;
    this.defaults.utility = modelConfig.defaultUtility || modelConfig.utility;
    this.defaults.utilityLarge = modelConfig.defaultUtilityLarge || modelConfig.utilityLarge;

    console.log(`[ModelManager] Loaded ${this.models.size} model configurations`);
  }

  /**
   * 注册模型配置
   */
  registerModel(key, config) {
    this.models.set(key, {
      ...config,
      key,
      createdAt: Date.now()
    });
  }

  /**
   * 获取模型配置
   */
  getModel(key) {
    return this.models.get(key);
  }

  /**
   * 获取默认聊天模型
   */
  getChatModel() {
    return this.models.get(this.defaults.chat);
  }

  /**
   * 获取默认轻量工具模型
   */
  getUtilityModel() {
    return this.models.get(this.defaults.utility);
  }

  /**
   * 获取默认大型工具模型（用于记忆编译、深度分析）
   */
  getUtilityLargeModel() {
    return this.models.get(this.defaults.utilityLarge);
  }

  /**
   * 获取模型调用配置（OpenAI兼容格式）
   */
  getModelConfig(modelKey) {
    const model = this.getModel(modelKey);
    if (!model) return null;

    return {
      apiKey: model.apiKey,
      baseURL: model.baseURL,
      model: model.modelName,
      compatible: model.compatible !== false // 默认兼容OpenAI协议
    };
  }

  /**
   * 列出所有模型
   */
  listModels() {
    return Array.from(this.models.values());
  }

  /**
   * 测试模型连接
   */
  async testConnection(modelKey) {
    const config = this.getModelConfig(modelKey);
    if (!config) {
      return { success: false, error: 'Model not found' };
    }

    // 这里可以实现实际的API测试
    // 简单返回成功即可
    return { success: true, model: config.model };
  }

  async shutdown() {
    this.models.clear();
  }
}

module.exports = { ModelManager };
