/**
 * Memory Item - 记忆项
 * 包含衰减分数，用于渐进式遗忘
 */

class MemoryItem {
  constructor(options) {
    this.id = options.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.content = options.content;
    this.timestamp = options.timestamp || Date.now();
    this.lastAccessed = options.lastAccessed || this.timestamp;
    this.accessCount = options.accessCount || 0;
    this.importance = options.importance || 1.0; // 0-10，越高越重要
    this.tags = options.tags || [];
    this.metadata = options.metadata || {};
    this.decayRate = options.decayRate || 0.001; // 每天衰减比例
  }

  /**
   * 计算当前记忆权重（考虑时间衰减）
   * 近期高访问重要记忆权重高，远期低重要记忆自然淡化
   */
  getCurrentWeight() {
    const now = Date.now();
    const daysPassed = (now - this.timestamp) / (1000 * 60 * 60 * 24);
    
    // 基础衰减：时间越久权重越低
    let weight = this.importance * Math.exp(-this.decayRate * daysPassed);
    
    // 访问奖励：越常访问权重越高
    weight *= (1 + 0.1 * Math.log(this.accessCount + 1));
    
    // 最近访问奖励
    const daysSinceAccess = (now - this.lastAccessed) / (1000 * 60 * 60 * 24);
    weight *= (1 + 0.5 / (1 + daysSinceAccess));
    
    return weight;
  }

  /**
   * 访问记忆，更新访问时间和计数
   */
  access() {
    this.lastAccessed = Date.now();
    this.accessCount++;
    return this;
  }

  /**
   * 更新重要性
   */
  setImportance(importance) {
    this.importance = Math.max(0, Math.min(10, importance));
  }

  /**
   * 添加标签
   */
  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }

  /**
   * 是否应该被遗忘（权重低于阈值）
   */
  shouldForget(threshold = 0.1) {
    return this.getCurrentWeight() < threshold;
  }

  /**
   * 序列化为JSON
   */
  toJSON() {
    return {
      id: this.id,
      content: this.content,
      timestamp: this.timestamp,
      lastAccessed: this.lastAccessed,
      accessCount: this.accessCount,
      importance: this.importance,
      tags: this.tags,
      metadata: this.metadata,
      decayRate: this.decayRate,
      weight: this.getCurrentWeight()
    };
  }

  /**
   * 从JSON反序列化
   */
  static fromJSON(data) {
    return new MemoryItem(data);
  }
}

module.exports = { MemoryItem };
