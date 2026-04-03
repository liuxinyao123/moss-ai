/**
 * Personality Manager - 人格模板管理器
 * 管理不同智能体的人格模板
 */

const fs = require('fs');
const path = require('path');
const { PersonalityTemplate, DefaultTemplates } = require('./PersonalityTemplate');

class PersonalityManager {
  constructor() {
    this.templates = new Map();
    this.loaded = false;
  }

  /**
   * 初始化，加载默认模板
   */
  initialize() {
    // 加载内置默认模板
    for (const [id, template] of Object.entries(DefaultTemplates)) {
      this.templates.set(id, template);
    }

    this.loaded = true;
    console.log(`[PersonalityManager] Loaded ${this.templates.size} personality templates`);
  }

  /**
   * 获取模板
   */
  getTemplate(id) {
    return this.templates.get(id);
  }

  /**
   * 注册新模板
   */
  registerTemplate(template) {
    if (!(template instanceof PersonalityTemplate)) {
      template = new PersonalityTemplate(template);
    }
    this.templates.set(template.id, template);
    console.log(`[PersonalityManager] Registered template: ${template.id}`);
    return template;
  }

  /**
   * 删除模板
   */
  deleteTemplate(id) {
    // 不允许删除默认模板
    if (Object.keys(DefaultTemplates).includes(id)) {
      return false;
    }
    return this.templates.delete(id);
  }

  /**
   * 列出所有模板
   */
  listTemplates() {
    return Array.from(this.templates.values()).map(t => t.toJSON());
  }

  /**
   * 从目录加载自定义模板
   */
  loadFromDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let loaded = 0;
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
          this.registerTemplate(data);
          loaded++;
        } catch (e) {
          console.warn(`[PersonalityManager] Failed to load template ${file}:`, e.message);
        }
      }
    }

    console.log(`[PersonalityManager] Loaded ${loaded} custom templates from ${dirPath}`);
    return loaded;
  }

  /**
   * 为智能体构建系统提示词
   */
  buildSystemPrompt(templateId, context = {}) {
    const template = this.getTemplate(templateId);
    if (!template) {
      return this.getTemplate('default').buildSystemPrompt(context);
    }
    return template.buildSystemPrompt(context);
  }

  /**
   * 获取生成配置
   */
  getGenerationConfig(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      return this.getTemplate('default').getGenerationConfig();
    }
    return template.getGenerationConfig();
  }
}

module.exports = { PersonalityManager };
