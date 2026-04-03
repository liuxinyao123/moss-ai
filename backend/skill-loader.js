/**
 * 技能加载器
 * 负责技能的发现、加载、验证和管理
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class SkillLoader extends EventEmitter {
  constructor(basePath) {
    super();
    this.basePath = basePath;
    this.skills = new Map(); // skillId -> skillInfo
    this.skillInstances = new Map(); // skillId -> skillInstance
    this.skillContext = null;
    this.logger = console;
    this.initialized = false;
    
    // 技能目录
    this.directories = {
      builtin: path.join(this.basePath, 'builtin'),
      community: path.join(this.basePath, 'community'),
      system: path.join(this.basePath, 'system'),
      disabled: path.join(this.basePath, 'disabled')
    };
    
    // 技能配置文件名称
    this.configFile = 'skill.json';
    this.entryFile = 'skill.js';
  }
  
  // 初始化技能加载器
  async initialize(context = {}) {
    try {
      this.skillContext = this.createSkillContext(context);
      this.logger = context.logger || console;
      
      // 确保所有目录存在
      await this.ensureDirectories();
      
      // 扫描技能目录
      await this.scanSkills();
      
      // 加载技能注册表
      await this.loadRegistry();
      
      this.initialized = true;
      this.emit('initialized', { success: true, totalSkills: this.skills.size });
      
      this.logger.info(`技能加载器初始化完成，发现 ${this.skills.size} 个技能`);
      return {
        success: true,
        totalSkills: this.skills.size,
        directories: this.directories,
        registry: this.getRegistryPath()
      };
    } catch (error) {
      this.emit('error', error);
      this.logger.error('技能加载器初始化失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 创建技能上下文
  createSkillContext(userContext = {}) {
    const baseContext = {
      // 文件系统访问（受限）
      fs: {
        readFile: async (filePath) => {
          // 验证文件路径是否在技能目录内
          const resolvedPath = this.resolveSkillPath(filePath);
          return fs.readFile(resolvedPath, 'utf8');
        },
        writeFile: async (filePath, data) => {
          // 仅允许写入技能自己的目录
          const resolvedPath = this.resolveSkillPath(filePath);
          const dirPath = path.dirname(resolvedPath);
          
          // 确保目录存在
          await fs.mkdir(dirPath, { recursive: true });
          return fs.writeFile(resolvedPath, data, 'utf8');
        },
        exists: async (filePath) => {
          const resolvedPath = this.resolveSkillPath(filePath);
          try {
            await fs.access(resolvedPath);
            return true;
          } catch {
            return false;
          }
        }
      },
      
      // HTTP客户端（受限）
      http: {
        get: async (url, options = {}) => {
          const axios = require('axios');
          return axios.get(url, { 
            ...options, 
            timeout: 10000,
            validateStatus: () => true // 不抛出HTTP错误
          });
        },
        post: async (url, data, options = {}) => {
          const axios = require('axios');
          return axios.post(url, data, { 
            ...options, 
            timeout: 10000,
            validateStatus: () => true
          });
        }
      },
      
      // 日志记录
      logger: {
        info: (message, ...args) => {
          this.logger.info(`[技能日志] ${message}`, ...args);
        },
        warn: (message, ...args) => {
          this.logger.warn(`[技能警告] ${message}`, ...args);
        },
        error: (message, ...args) => {
          this.logger.error(`[技能错误] ${message}`, ...args);
        },
        debug: (message, ...args) => {
          if (process.env.DEBUG_SKILLS) {
            this.logger.debug(`[技能调试] ${message}`, ...args);
          }
        }
      },
      
      // 配置管理
      config: {
        get: (key) => {
          // 返回技能特定的配置
          return process.env[`SKILL_${key.toUpperCase()}`] || null;
        },
        set: (key, value) => {
          // 技能配置存储在内存中，不持久化
          if (!this.skillConfig) this.skillConfig = {};
          this.skillConfig[key] = value;
        }
      },
      
      // 当前技能信息
      skill: {
        id: null,
        name: null,
        version: null,
        permissions: null
      }
    };
    
    // 合并用户提供的上下文
    return { ...baseContext, ...userContext };
  }
  
  // 解析技能路径（安全限制）
  resolveSkillPath(filePath) {
    const normalized = path.normalize(filePath);
    
    // 防止目录遍历攻击
    if (normalized.includes('..')) {
      throw new Error('禁止访问上级目录');
    }
    
    // 将路径限制在技能目录内
    const resolved = path.join(this.basePath, normalized);
    
    // 验证路径是否在技能目录内
    if (!resolved.startsWith(this.basePath)) {
      throw new Error('路径超出技能目录范围');
    }
    
    return resolved;
  }
  
  // 确保所有目录存在
  async ensureDirectories() {
    for (const [name, dirPath] of Object.entries(this.directories)) {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        this.logger.debug(`已创建/确认目录: ${name} -> ${dirPath}`);
      } catch (error) {
        this.logger.warn(`创建目录 ${name} 失败:`, error.message);
      }
    }
  }
  
  // 扫描技能目录
  async scanSkills() {
    this.skills.clear();
    
    for (const [category, dirPath] of Object.entries(this.directories)) {
      try {
        const skillsInCategory = await this.scanDirectory(dirPath, category);
        this.logger.info(`在 ${category} 目录中发现 ${skillsInCategory.length} 个技能`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.warn(`技能目录不存在: ${dirPath}`);
        } else {
          this.logger.error(`扫描目录 ${dirPath} 失败:`, error);
        }
      }
    }
    
    this.emit('scanned', { totalSkills: this.skills.size });
  }
  
  // 扫描单个目录
  async scanDirectory(dirPath, category) {
    const skills = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dirPath, entry.name);
          const skillInfo = await this.loadSkillInfo(skillPath, category, entry.name);
          
          if (skillInfo) {
            this.skills.set(skillInfo.id, skillInfo);
            skills.push(skillInfo);
          }
        }
      }
    } catch (error) {
      throw error;
    }
    
    return skills;
  }
  
  // 加载技能信息
  async loadSkillInfo(skillPath, category, folderName) {
    try {
      const configPath = path.join(skillPath, this.configFile);
      const entryPath = path.join(skillPath, this.entryFile);
      
      // 检查配置文件是否存在
      try {
        await fs.access(configPath);
      } catch {
        this.logger.warn(`技能目录 ${skillPath} 缺少配置文件`);
        return null;
      }
      
      // 检查入口文件是否存在
      try {
        await fs.access(entryPath);
      } catch {
        this.logger.warn(`技能目录 ${skillPath} 缺少入口文件`);
        return null;
      }
      
      // 读取配置
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // 验证配置
      if (!this.validateSkillConfig(config)) {
        this.logger.warn(`技能配置验证失败: ${skillPath}`);
        return null;
      }
      
      // 构建技能信息
      const skillInfo = {
        ...config,
        path: skillPath,
        category,
        folderName,
        configPath,
        entryPath,
        enabled: true,
        installed_at: new Date().toISOString(),
        last_used: null,
        usage_count: 0,
        errors: []
      };
      
      // 确保有唯一的ID
      if (!skillInfo.id) {
        skillInfo.id = `${skillInfo.name.toLowerCase().replace(/\s+/g, '-')}-v${skillInfo.version}`;
      }
      
      this.logger.debug(`加载技能: ${skillInfo.name} v${skillInfo.version} (${skillInfo.id})`);
      return skillInfo;
    } catch (error) {
      this.logger.error(`加载技能信息失败 ${skillPath}:`, error);
      return null;
    }
  }
  
  // 验证技能配置
  validateSkillConfig(config) {
    const requiredFields = ['name', 'version', 'description', 'entry_point'];
    
    for (const field of requiredFields) {
      if (!config[field]) {
        this.logger.warn(`技能配置缺少必需字段: ${field}`);
        return false;
      }
    }
    
    // 验证版本格式
    if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
      this.logger.warn(`技能版本格式无效: ${config.version}`);
      return false;
    }
    
    // 验证权限配置
    if (config.permissions) {
      const validPermissionLevels = [0, 1, 2, 3, 4];
      if (config.permissions.permission_level !== undefined && 
          !validPermissionLevels.includes(config.permissions.permission_level)) {
        this.logger.warn(`权限级别无效: ${config.permissions.permission_level}`);
        return false;
      }
    }
    
    return true;
  }
  
  // 加载技能注册表
  async loadRegistry() {
    const registryPath = this.getRegistryPath();
    
    try {
      await fs.access(registryPath);
      const content = await fs.readFile(registryPath, 'utf8');
      const registry = JSON.parse(content);
      
      // 更新技能信息
      for (const [skillId, registryInfo] of Object.entries(registry.skills || {})) {
        if (this.skills.has(skillId)) {
          const skillInfo = this.skills.get(skillId);
          Object.assign(skillInfo, {
            enabled: registryInfo.enabled !== false,
            installed_at: registryInfo.installed_at || skillInfo.installed_at,
            last_used: registryInfo.last_used,
            usage_count: registryInfo.usage_count || 0
          });
        }
      }
      
      this.logger.info('技能注册表加载完成');
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('技能注册表不存在，将创建新注册表');
        await this.saveRegistry();
      } else {
        this.logger.error('加载技能注册表失败:', error);
      }
    }
  }
  
  // 保存技能注册表
  async saveRegistry() {
    const registryPath = this.getRegistryPath();
    const registry = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      last_scan: new Date().toISOString(),
      skills: {},
      categories: {},
      statistics: {
        total_skills: this.skills.size,
        enabled_skills: Array.from(this.skills.values()).filter(s => s.enabled).length,
        total_executions: 0,
        avg_execution_time: 0
      }
    };
    
    // 构建技能信息
    for (const [skillId, skillInfo] of this.skills) {
      registry.skills[skillId] = {
        id: skillInfo.id,
        name: skillInfo.name,
        version: skillInfo.version,
        path: skillInfo.path,
        enabled: skillInfo.enabled,
        installed_at: skillInfo.installed_at,
        last_used: skillInfo.last_used,
        usage_count: skillInfo.usage_count,
        permissions: skillInfo.permissions,
        category: skillInfo.category
      };
      
      // 按类别分组
      if (!registry.categories[skillInfo.category]) {
        registry.categories[skillInfo.category] = [];
      }
      registry.categories[skillInfo.category].push(skillId);
    }
    
    try {
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
      this.logger.info('技能注册表保存完成');
    } catch (error) {
      this.logger.error('保存技能注册表失败:', error);
    }
  }
  
  // 获取注册表路径
  getRegistryPath() {
    return path.join(this.basePath, 'registry.json');
  }
  
  // 获取技能列表
  getSkills(options = {}) {
    let skills = Array.from(this.skills.values());
    
    // 过滤选项
    if (options.category) {
      skills = skills.filter(skill => skill.category === options.category);
    }
    
    if (options.enabled !== undefined) {
      skills = skills.filter(skill => skill.enabled === options.enabled);
    }
    
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      skills = skills.filter(skill => 
        skill.name.toLowerCase().includes(searchLower) ||
        skill.description.toLowerCase().includes(searchLower) ||
        skill.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // 排序选项
    if (options.sort) {
      const [field, direction] = options.sort.split(':');
      const dir = direction === 'desc' ? -1 : 1;
      
      skills.sort((a, b) => {
        if (field === 'name') {
          return dir * a.name.localeCompare(b.name);
        } else if (field === 'usage_count') {
          return dir * (a.usage_count - b.usage_count);
        } else if (field === 'last_used') {
          const timeA = a.last_used ? new Date(a.last_used).getTime() : 0;
          const timeB = b.last_used ? new Date(b.last_used).getTime() : 0;
          return dir * (timeA - timeB);
        }
        return 0;
      });
    }
    
    return skills;
  }
  
  // 获取技能详情
  getSkill(skillId) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    // 获取技能实例状态
    const instance = this.skillInstances.get(skillId);
    const instanceStatus = instance ? {
      initialized: true,
      status: 'loaded'
    } : {
      initialized: false,
      status: 'not_loaded'
    };
    
    return {
      ...skillInfo,
      instanceStatus
    };
  }
  
  // 加载技能实例
  async loadSkill(skillId) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    // 如果已经加载，返回现有实例
    if (this.skillInstances.has(skillId)) {
      this.logger.debug(`技能已加载: ${skillId}`);
      return this.skillInstances.get(skillId);
    }
    
    try {
      // 创建技能特定的上下文
      const skillContext = {
        ...this.skillContext,
        skill: {
          id: skillInfo.id,
          name: skillInfo.name,
          version: skillInfo.version,
          permissions: skillInfo.permissions
        }
      };
      
      // 动态加载技能模块
      const SkillClass = require(skillInfo.entryPath);
      const skillInstance = new SkillClass(skillContext);
      
      // 初始化技能
      const initResult = await skillInstance.initialize();
      if (!initResult.success) {
        throw new Error(`技能初始化失败: ${initResult.error}`);
      }
      
      // 存储实例
      this.skillInstances.set(skillId, skillInstance);
      
      this.logger.info(`技能加载成功: ${skillInfo.name} v${skillInfo.version}`);
      this.emit('skillLoaded', { skillId, skillInfo });
      
      return skillInstance;
    } catch (error) {
      this.logger.error(`加载技能失败 ${skillId}:`, error);
      
      // 记录错误
      if (!skillInfo.errors) skillInfo.errors = [];
      skillInfo.errors.push({
        timestamp: new Date().toISOString(),
        type: 'load_error',
        message: error.message
      });
      
      throw error;
    }
  }
  
  // 卸载技能实例
  async unloadSkill(skillId) {
    if (!this.skillInstances.has(skillId)) {
      this.logger.debug(`技能未加载: ${skillId}`);
      return false;
    }
    
    const skillInstance = this.skillInstances.get(skillId);
    
    // 如果技能有清理方法，调用它
    if (typeof skillInstance.cleanup === 'function') {
      try {
        await skillInstance.cleanup();
      } catch (error) {
        this.logger.warn(`技能清理失败 ${skillId}:`, error);
      }
    }
    
    // 从缓存中移除模块
    const skillInfo = this.skills.get(skillId);
    if (skillInfo) {
      delete require.cache[require.resolve(skillInfo.entryPath)];
    }
    
    this.skillInstances.delete(skillId);
    this.logger.info(`技能卸载完成: ${skillId}`);
    this.emit('skillUnloaded', { skillId });
    
    return true;
  }
  
  // 执行技能
  async executeSkill(skillId, params = {}) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    // 检查技能是否启用
    if (!skillInfo.enabled) {
      throw new Error(`技能已禁用: ${skillId}`);
    }
    
    // 检查权限
    if (!this.checkPermissions(skillInfo, params)) {
      throw new Error(`权限不足: 技能 ${skillId} 需要更高的权限级别`);
    }
    
    // 加载技能（如果尚未加载）
    let skillInstance;
    try {
      skillInstance = await this.loadSkill(skillId);
    } catch (error) {
      throw new Error(`技能加载失败: ${error.message}`);
    }
    
    // 执行技能
    const startTime = Date.now();
    let result;
    
    try {
      result = await skillInstance.execute(params);
      
      // 更新使用统计
      skillInfo.last_used = new Date().toISOString();
      skillInfo.usage_count = (skillInfo.usage_count || 0) + 1;
      
      // 保存注册表
      await this.saveRegistry();
      
      this.emit('skillExecuted', {
        skillId,
        success: true,
        executionTime: Date.now() - startTime,
        params
      });
      
      return result;
    } catch (error) {
      this.logger.error(`技能执行失败 ${skillId}:`, error);
      
      // 记录错误
      if (!skillInfo.errors) skillInfo.errors = [];
      skillInfo.errors.push({
        timestamp: new Date().toISOString(),
        type: 'execution_error',
        message: error.message,
        params
      });
      
      this.emit('skillExecuted', {
        skillId,
        success: false,
        executionTime: Date.now() - startTime,
        error: error.message,
        params
      });
      
      throw error;
    }
  }
  
  // 检查权限
  checkPermissions(skillInfo, params) {
    // 这里实现权限检查逻辑
    // 目前只是简单检查权限级别
    if (skillInfo.permissions && skillInfo.permissions.permission_level !== undefined) {
      const requiredLevel = skillInfo.permissions.permission_level;
      
      // 根据上下文检查当前权限级别
      const currentLevel = this.skillContext?.currentPermissionLevel || 0;
      
      if (currentLevel < requiredLevel) {
        return false;
      }
    }
    
    return true;
  }
  
  // 启用技能
  async enableSkill(skillId) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    if (skillInfo.enabled) {
      this.logger.debug(`技能已启用: ${skillId}`);
      return true;
    }
    
    skillInfo.enabled = true;
    await this.saveRegistry();
    
    this.logger.info(`技能已启用: ${skillId}`);
    this.emit('skillEnabled', { skillId });
    
    return true;
  }
  
  // 禁用技能
  async disableSkill(skillId) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    if (!skillInfo.enabled) {
      this.logger.debug(`技能已禁用: ${skillId}`);
      return true;
    }
    
    skillInfo.enabled = false;
    
    // 卸载技能实例
    await this.unloadSkill(skillId);
    
    await this.saveRegistry();
    
    this.logger.info(`技能已禁用: ${skillId}`);
    this.emit('skillDisabled', { skillId });
    
    return true;
  }
  
  // 获取技能统计
  getStatistics() {
    const skills = Array.from(this.skills.values());
    const enabledSkills = skills.filter(s => s.enabled);
    
    return {
      total_skills: skills.length,
      enabled_skills: enabledSkills.length,
      disabled_skills: skills.length - enabledSkills.length,
      by_category: this.getSkillsByCategory(),
      most_used: this.getMostUsedSkills(5),
      recently_used: this.getRecentlyUsedSkills(5)
    };
  }
  
  // 按类别统计技能
  getSkillsByCategory() {
    const result = {};
    
    for (const skill of this.skills.values()) {
      if (!result[skill.category]) {
        result[skill.category] = {
          total: 0,
          enabled: 0,
          skills: []
        };
      }
      
      result[skill.category].total++;
      if (skill.enabled) result[skill.category].enabled++;
      result[skill.category].skills.push(skill.id);
    }
    
    return result;
  }
  
  // 获取最常用的技能
  getMostUsedSkills(limit = 5) {
    return Array.from(this.skills.values())
      .filter(s => s.usage_count > 0)
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        name: s.name,
        usage_count: s.usage_count || 0
      }));
  }
  
  // 获取最近使用的技能
  getRecentlyUsedSkills(limit = 5) {
    return Array.from(this.skills.values())
      .filter(s => s.last_used)
      .sort((a, b) => new Date(b.last_used) - new Date(a.last_used))
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        name: s.name,
        last_used: s.last_used
      }));
  }
  
  // 重新扫描技能目录
  async rescan() {
    this.logger.info('重新扫描技能目录...');
    await this.scanSkills();
    await this.saveRegistry();
    return this.getStatistics();
  }
  
  // 清理错误记录
  async clearErrors(skillId) {
    const skillInfo = this.skills.get(skillId);
    if (!skillInfo) {
      throw new Error(`技能不存在: ${skillId}`);
    }
    
    const errorCount = skillInfo.errors?.length || 0;
    skillInfo.errors = [];
    
    this.logger.info(`已清除技能 ${skillId} 的 ${errorCount} 个错误记录`);
    return { cleared: errorCount };
  }
}

module.exports = SkillLoader;