/**
 * Progressive Memory System - 渐进式遗忘记忆系统
 * 
 * 设计特点：
 * - 近期记忆保持清晰
 * - 远期记忆自然淡化
 * - 重要记忆不容易遗忘
 * - 经常访问的记忆会被强化
 */

const fs = require('fs');
const path = require('path');
const { MemoryItem } = require('./MemoryItem');
const natural = require('natural');
const TfIdf = natural.TfIdf;

class ProgressiveMemorySystem {
  constructor(options = {}) {
    this.agentId = options.agentId || 'default';
    this.memoryDir = options.memoryDir || path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai',
      'agents',
      this.agentId,
      'memory'
    );
    this.decayRate = options.decayRate || 0.001; // 默认每日衰减率
    this.forgettingThreshold = options.forgettingThreshold || 0.1;
    this.maxActiveMemories = options.maxActiveMemories || 10000;
    this.memories = new Map();
    this.tfidf = new TfIdf();
    this.documentIndex = new Map(); // id -> content
    this.lastCompilation = null;
  }

  /**
   * 初始化，加载已有记忆
   */
  async initialize() {
    // 确保目录存在
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }

    // 加载所有记忆
    await this.loadMemories();
    this.rebuildIndex();

    console.log(`[ProgressiveMemorySystem] Loaded ${this.memories.size} memories for agent ${this.agentId}`);
  }

  /**
   * 从磁盘加载记忆
   */
  async loadMemories() {
    if (!fs.existsSync(this.memoryDir)) return;

    const files = fs.readdirSync(this.memoryDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.memoryDir, file), 'utf8');
          const data = JSON.parse(content);
          const item = MemoryItem.fromJSON(data);
          this.memories.set(item.id, item);
        } catch (e) {
          console.warn(`[ProgressiveMemorySystem] Failed to load memory ${file}:`, e.message);
        }
      }
    }
  }

  /**
   * 重建TF-IDF索引
   */
  rebuildIndex() {
    this.tfidf = new TfIdf();
    this.documentIndex.clear();

    let index = 0;
    for (const [id, item] of this.memories) {
      if (!item.shouldForget(this.forgettingThreshold)) {
        this.tfidf.addDocument(item.content);
        this.documentIndex.set(index, id);
        index++;
      }
    }
  }

  /**
   * 添加新记忆
   */
  addMemory(content, options = {}) {
    const item = new MemoryItem({
      content,
      importance: options.importance || 1.0,
      tags: options.tags || [],
      decayRate: this.decayRate,
      metadata: options.metadata || {}
    });

    this.memories.set(item.id, item);
    this.tfidf.addDocument(content);
    this.documentIndex.set(this.documentIndex.size, item.id);

    // 持久化
    this.saveMemory(item);

    // 执行过期清理（如果超过限制）
    if (this.memories.size > this.maxActiveMemories) {
      this.cleanupForgotten();
    }

    return item;
  }

  /**
   * 保存单个记忆到磁盘
   */
  saveMemory(item) {
    const filePath = path.join(this.memoryDir, `${item.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(item.toJSON(), null, 2), 'utf8');
  }

  /**
   * 获取记忆并更新访问记录（强化记忆）
   */
  getMemory(memoryId) {
    const item = this.memories.get(memoryId);
    if (item) {
      item.access();
      this.saveMemory(item);
    }
    return item;
  }

  /**
   * 语义搜索相关记忆
   * 返回按权重排序的结果
   */
  search(query, limit = 10) {
    const results = [];

    this.tfidf.listTerms(query, (index, score) => {
      const memoryId = this.documentIndex.get(index);
      if (!memoryId) return;

      const item = this.memories.get(memoryId);
      if (!item) return;

      // 结合TF-IDF分数和记忆权重
      const currentWeight = item.getCurrentWeight();
      const combinedScore = score * currentWeight;

      results.push({
        id: memoryId,
        item: item,
        tfidfScore: score,
        memoryWeight: currentWeight,
        combinedScore
      });
    });

    // 按组合分数排序
    return results
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
  }

  /**
   * 按标签搜索
   */
  searchByTag(tag, limit = 10) {
    const results = [];
    for (const [id, item] of this.memories) {
      if (item.tags.includes(tag) && !item.shouldForget(this.forgettingThreshold)) {
        results.push({
          id,
          item,
          weight: item.getCurrentWeight()
        });
      }
    }

    return results
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /**
   * 清理已经被遗忘的记忆
   */
  cleanupForgotten() {
    let cleaned = 0;
    for (const [id, item] of this.memories) {
      if (item.shouldForget(this.forgettingThreshold)) {
        this.deleteMemory(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.rebuildIndex();
      console.log(`[ProgressiveMemorySystem] Cleaned up ${cleaned} forgotten memories for ${this.agentId}`);
    }

    return cleaned;
  }

  /**
   * 删除记忆
   */
  deleteMemory(memoryId) {
    const filePath = path.join(this.memoryDir, `${memoryId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.memories.delete(memoryId);
  }

  /**
   * 编译记忆（使用大模型总结遗忘的记忆）
   * 将多个低权重记忆合并为一个更高权重的摘要记忆
   */
  async compileMemories(largeModel, options = {}) {
    const forgotten = [];
    const active = [];

    for (const [id, item] of this.memories) {
      const weight = item.getCurrentWeight();
      if (weight < 0.3 && weight >= this.forgettingThreshold) {
        forgotten.push(item);
      } else {
        active.push(item);
      }
    }

    if (forgotten.length < options.minCompileCount || 5) {
      return { compiled: 0, message: 'Not enough forgotten memories to compile' };
    }

    // 这里会调用大模型将多个低权重记忆总结为更少的高权重记忆
    // 具体实现依赖modelManager调用大模型
    // 这里定义接口，实际调用由上层处理

    this.lastCompilation = {
      timestamp: Date.now(),
      beforeCount: this.memories.size,
      forgottenCount: forgotten.length,
      activeCount: active.length
    };

    return this.lastCompilation;
  }

  /**
   * 获取记忆统计
   */
  getStats() {
    let activeCount = 0;
    let forgottenCount = 0;
    let totalImportance = 0;

    for (const [id, item] of this.memories) {
      totalImportance += item.importance;
      if (item.shouldForget(this.forgettingThreshold)) {
        forgottenCount++;
      } else {
        activeCount++;
      }
    }

    return {
      totalMemories: this.memories.size,
      activeMemories: activeCount,
      forgottenMemories: forgottenCount,
      avgImportance: totalImportance / this.memories.size,
      lastCompilation: this.lastCompilation
    };
  }

  /**
   * 更新重要性
   */
  setImportance(memoryId, importance) {
    const item = this.memories.get(memoryId);
    if (item) {
      item.setImportance(importance);
      this.saveMemory(item);
    }
  }

  /**
   * 强化记忆（增加重要性）
   */
  reinforce(memoryId, delta = 0.5) {
    const item = this.memories.get(memoryId);
    if (item) {
      item.access();
      item.setImportance(item.importance + delta);
      this.saveMemory(item);
    }
  }

  /**
   * 关闭持久化内存
   */
  shutdown() {
    // 保存所有变更（已经增量保存了，这里只需要清空内存）
    this.memories.clear();
    this.documentIndex.clear();
  }
}

module.exports = { ProgressiveMemorySystem };
