/**
 * PathGuard - 应用层路径访问控制
 * 第一层安全隔离，四个访问层级
 */

const fs = require('fs');
const path = require('path');
const { AccessTier, TierNames } = require('./AccessTier');

class PathGuard {
  constructor(options = {}) {
    this.allowList = new Map(); // path -> tier
    this.denyList = new Set(); // blocked paths
    this.defaultTier = options.defaultTier || AccessTier.BLOCKED;
    this.workspaceRoot = options.workspaceRoot || path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai'
    );
    
    // 初始化默认规则
    this.initDefaultRules();
  }

  /**
   * 初始化默认安全规则
   */
  initDefaultRules() {
    const home = process.env.HOME;

    // 允许读写工作区内所有内容
    this.allow(this.workspaceRoot, AccessTier.FULL);

    // 允许读取agent-desks
    this.allow(path.join(this.workspaceRoot, 'agents'), AccessTier.FULL);

    // 允许读取uploads
    this.allow(path.join(this.workspaceRoot, 'uploads'), AccessTier.FULL);

    // 禁止访问敏感目录
    this.block('/etc');
    this.block('/dev');
    this.block('/proc');
    this.block('/sys');
    this.block(path.join(home, '.ssh'));
    this.block(path.join(home, '.aws'));
    this.block(path.join(home, '.git-credentials'));
    this.block(path.join(home, '.npmrc'));
    this.block('/root');
    this.block('/bin');
    this.block('/sbin');
    this.block('/usr/bin');
    this.block('/usr/sbin');
  }

  /**
   * 允许路径访问
   */
  allow(filePath, tier) {
    const resolved = path.resolve(filePath);
    this.allowList.set(resolved, tier);
  }

  /**
   * 阻止路径访问
   */
  block(filePath) {
    const resolved = path.resolve(filePath);
    this.denyList.add(resolved);
  }

  /**
   * 移除规则
   */
  remove(filePath) {
    const resolved = path.resolve(filePath);
    this.allowList.delete(resolved);
    this.denyList.delete(resolved);
  }

  /**
   * 检查路径是否在某个父目录下
   */
  isChildOf(childPath, parentPath) {
    const child = path.resolve(childPath);
    const parent = path.resolve(parentPath);
    return child.startsWith(parent);
  }

  /**
   * 获取路径的访问层级
   */
  getAccessTier(requestedPath) {
    const resolved = path.resolve(requestedPath);

    // 首先检查拒绝列表
    for (const denied of this.denyList) {
      if (this.isChildOf(resolved, denied)) {
        return AccessTier.BLOCKED;
      }
    }

    // 查找最长匹配的允许规则
    let bestMatch = null;
    let bestLength = -1;
    
    for (const [allowedPath, tier] of this.allowList) {
      if (this.isChildOf(resolved, allowedPath)) {
        if (allowedPath.length > bestLength) {
          bestLength = allowedPath.length;
          bestMatch = tier;
        }
      }
    }

    return bestMatch !== null ? bestMatch : this.defaultTier;
  }

  /**
   * 检查是否允许读取
   */
  canRead(filePath) {
    const tier = this.getAccessTier(filePath);
    return tier >= AccessTier.READONLY;
  }

  /**
   * 检查是否允许写入
   */
  canWrite(filePath) {
    const tier = this.getAccessTier(filePath);
    return tier >= AccessTier.RESTRICTED;
  }

  /**
   * 检查是否允许执行
   */
  canExecute(filePath) {
    const tier = this.getAccessTier(filePath);
    return tier >= AccessTier.FULL;
  }

  /**
   * 检查访问，抛出错误如果不允许
   */
  checkRead(filePath) {
    if (!this.canRead(filePath)) {
      const tier = this.getAccessTier(filePath);
      throw new Error(`[PathGuard] Read blocked: ${filePath} (${TierNames[tier]})`);
    }
  }

  /**
   * 检查写入
   */
  checkWrite(filePath) {
    if (!this.canWrite(filePath)) {
      const tier = this.getAccessTier(filePath);
      throw new Error(`[PathGuard] Write blocked: ${filePath} (${TierNames[tier]})`);
    }
  }

  /**
   * 安全读取文件
   */
  readFileSync(filePath, encoding = 'utf8') {
    this.checkRead(filePath);
    return fs.readFileSync(filePath, encoding);
  }

  /**
   * 安全写入文件
   */
  writeFileSync(filePath, content, encoding = 'utf8') {
    this.checkWrite(filePath);
    // 确保父目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fs.writeFileSync(filePath, content, encoding);
  }

  /**
   * 列出允许的规则
   */
  listRules() {
    return {
      allowList: Array.from(this.allowList.entries()).map(([path, tier]) => ({
        path,
        tier: TierNames[tier],
        tierValue: tier
      })),
      denyList: Array.from(this.denyList),
      defaultTier: TierNames[this.defaultTier]
    };
  }

  /**
   * 添加技能允许目录
   */
  allowSkillDirectory(skillId) {
    const skillPath = path.join(this.workspaceRoot, 'skills', skillId);
    this.allow(skillPath, AccessTier.FULL);
  }
}

module.exports = { PathGuard };
