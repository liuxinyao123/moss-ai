/**
 * Preferences Manager - 首选项管理器
 * 全局用户偏好设置管理
 */

const fs = require('fs');
const path = require('path');

class PreferencesManager {
  constructor(engine) {
    this.engine = engine;
    this.preferences = {};
    this.configPath = path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai',
      'config',
      'preferences.json'
    );
  }

  async load() {
    // 确保目录存在
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 加载配置
    if (fs.existsSync(this.configPath)) {
      try {
        this.preferences = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (e) {
        console.warn('[PreferencesManager] Failed to load preferences, using defaults:', e.message);
        this.preferences = {};
      }
    } else {
      this.preferences = {};
      this.save();
    }

    console.log('[PreferencesManager] Loaded preferences');
  }

  /**
   * 获取配置项
   */
  get(key, defaultValue = null) {
    if (key in this.preferences) {
      return this.preferences[key];
    }
    return defaultValue;
  }

  /**
   * 设置配置项
   */
  set(key, value) {
    this.preferences[key] = value;
    this.save();
  }

  /**
   * 删除配置项
   */
  delete(key) {
    delete this.preferences[key];
    this.save();
  }

  /**
   * 检查是否存在
   */
  has(key) {
    return key in this.preferences;
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.preferences };
  }

  /**
   * 保存到磁盘
   */
  save() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.preferences, null, 2), 'utf8');
    } catch (e) {
      console.error('[PreferencesManager] Failed to save preferences:', e.message);
    }
  }

  /**
   * 重置为默认
   */
  reset() {
    this.preferences = {};
    this.save();
  }
}

module.exports = { PreferencesManager };
