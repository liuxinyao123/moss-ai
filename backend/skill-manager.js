/**
 * 技能管理器
 * 整合技能加载器、执行器和API接口
 */

const path = require('path');
const SkillLoader = require('./skill-loader');
const SkillExecutor = require('./skill-executor');
const SkillAPI = require('./skill-api');

class SkillManager {
  constructor(options = {}) {
    this.options = {
      skillsBasePath: path.join(__dirname, '..', 'skills'),
      enableAPI: true,
      enableExecutor: true,
      enableRepository: true,
      autoInitialize: true,
      logger: console,
      ...options
    };
    
    this.skillLoader = null;
    this.skillExecutor = null;
    this.skillAPI = null;
    this.skillRepositoryAPI = null;
    this.initialized = false;
    this.logger = this.options.logger;
    
    // 如果启用自动初始化，则立即初始化
    if (this.options.autoInitialize) {
      this.initialize().catch(error => {
        this.logger.error('技能管理器自动初始化失败:', error);
      });
    }
  }
  
  // 初始化技能管理器
  async initialize() {
    try {
      this.logger.info('正在初始化技能管理器...');
      
      // 1. 创建技能加载器
      this.logger.debug('创建技能加载器...');
      this.skillLoader = new SkillLoader(this.options.skillsBasePath);
      
      // 2. 初始化技能加载器
      const loaderResult = await this.skillLoader.initialize({
        logger: this.logger,
        currentPermissionLevel: 1 // 默认权限级别
      });
      
      if (!loaderResult.success) {
        throw new Error(`技能加载器初始化失败: ${loaderResult.error}`);
      }
      
      this.logger.info(`技能加载器初始化成功，发现 ${loaderResult.totalSkills} 个技能`);
      
      // 3. 创建技能执行器（如果启用）
      if (this.options.enableExecutor) {
        this.logger.debug('创建技能执行器...');
        this.skillExecutor = new SkillExecutor(this.skillLoader, {
          logger: this.logger,
          maxConcurrent: 5
        });
        
        this.logger.info('技能执行器已启动');
      }
      
      // 4. 创建技能API（如果启用）
      if (this.options.enableAPI) {
        this.logger.debug('创建技能API...');
        
        // 创建技能仓库API
        let skillRepositoryAPI = null;
        if (this.options.enableRepository) {
          this.logger.debug('创建技能仓库API...');
          const SkillRepositoryAPI = require('./skill-repository-api');
          skillRepositoryAPI = new SkillRepositoryAPI(this.skillLoader, {
            basePath: this.options.skillsBasePath
          });
          this.skillRepositoryAPI = skillRepositoryAPI;
        }
        
        this.skillAPI = new SkillAPI(this.skillLoader, this.skillExecutor, this.skillRepositoryAPI);
        
        this.logger.info('技能API已创建');
      }
      
      // 5. 监听事件
      this.setupEventListeners();
      
      this.initialized = true;
      this.logger.info('技能管理器初始化完成');
      
      return {
        success: true,
        loader: loaderResult,
        executor: this.skillExecutor ? true : false,
        api: this.skillAPI ? true : false
      };
    } catch (error) {
      this.logger.error('技能管理器初始化失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 设置事件监听器
  setupEventListeners() {
    // 技能加载器事件
    if (this.skillLoader) {
      this.skillLoader.on('initialized', (data) => {
        this.logger.debug('技能加载器已初始化:', data);
      });
      
      this.skillLoader.on('skillLoaded', (data) => {
        this.logger.debug(`技能已加载: ${data.skillId} - ${data.skillInfo.name}`);
      });
      
      this.skillLoader.on('skillUnloaded', (data) => {
        this.logger.debug(`技能已卸载: ${data.skillId}`);
      });
      
      this.skillLoader.on('skillEnabled', (data) => {
        this.logger.info(`技能已启用: ${data.skillId}`);
      });
      
      this.skillLoader.on('skillDisabled', (data) => {
        this.logger.info(`技能已禁用: ${data.skillId}`);
      });
    }
    
    // 技能执行器事件
    if (this.skillExecutor) {
      this.skillExecutor.on('executionStarted', (data) => {
        this.logger.debug(`执行开始: ${data.executionId} (技能: ${data.skillId})`);
      });
      
      this.skillExecutor.on('executionCompleted', (data) => {
        this.logger.debug(`执行完成: ${data.executionId} (用时: ${data.executionTime}ms)`);
      });
      
      this.skillExecutor.on('executionFailed', (data) => {
        this.logger.warn(`执行失败: ${data.executionId} (错误: ${data.error})`);
      });
    }
  }
  
  // 获取技能加载器
  getLoader() {
    if (!this.skillLoader) {
      throw new Error('技能加载器未初始化');
    }
    return this.skillLoader;
  }
  
  // 获取技能执行器
  getExecutor() {
    if (!this.skillExecutor) {
      throw new Error('技能执行器未启用');
    }
    return this.skillExecutor;
  }
  
  // 获取技能API路由器
  getAPIRouter() {
    if (!this.skillAPI) {
      throw new Error('技能API未启用');
    }
    return this.skillAPI.getRouter();
  }
  
  // 执行技能（便捷方法）
  async executeSkill(skillId, params = {}) {
    if (!this.skillExecutor) {
      throw new Error('技能执行器未启用');
    }
    
    return this.skillExecutor.run(skillId, params);
  }
  
  // 获取技能列表（便捷方法）
  getSkills(options = {}) {
    return this.skillLoader.getSkills(options);
  }
  
  // 获取技能详情（便捷方法）
  getSkill(skillId) {
    return this.skillLoader.getSkill(skillId);
  }
  
  // 启用技能（便捷方法）
  async enableSkill(skillId) {
    return this.skillLoader.enableSkill(skillId);
  }
  
  // 禁用技能（便捷方法）
  async disableSkill(skillId) {
    return this.skillLoader.disableSkill(skillId);
  }
  
  // 重新加载技能（便捷方法）
  async reloadSkill(skillId) {
    return this.skillLoader.unloadSkill(skillId).then(() => {
      return this.skillLoader.loadSkill(skillId);
    });
  }
  
  // 获取技能帮助（便捷方法）
  async getSkillHelp(skillId) {
    const skillInstance = await this.skillLoader.loadSkill(skillId);
    return skillInstance.help();
  }
  
  // 获取执行状态（便捷方法）
  getExecutionStatus(executionId) {
    return this.skillExecutor.getExecutionStatus(executionId);
  }
  
  // 获取系统状态（便捷方法）
  getStatus() {
    const loaderStats = this.skillLoader.getStatistics();
    const executorStats = this.skillExecutor ? this.skillExecutor.getStats() : null;
    
    return {
      initialized: this.initialized,
      loader: loaderStats,
      executor: executorStats,
      timestamp: new Date().toISOString()
    };
  }
  
  // 获取技能统计（便捷方法）
  getStats() {
    if (!this.skillExecutor) {
      return this.skillLoader.getStatistics();
    }
    return this.skillExecutor.getStats();
  }
  
  // 重新扫描技能（便捷方法）
  async rescan() {
    return this.skillLoader.rescan();
  }
  
  // 获取技能类别（便捷方法）
  getCategories() {
    return this.skillLoader.getSkillsByCategory();
  }
  
  // 搜索技能（便捷方法）
  searchSkills(query) {
    const options = {};
    if (query.q) options.search = query.q;
    if (query.category) options.category = query.category;
    if (query.tag) {
      const tagLower = query.tag.toLowerCase();
      const skills = this.skillLoader.getSkills();
      return skills.filter(skill => 
        skill.tags?.some(t => t.toLowerCase().includes(tagLower))
      );
    }
    return this.skillLoader.getSkills(options);
  }
  
  // 健康检查（便捷方法）
  getHealth() {
    const loaderInitialized = this.skillLoader && this.skillLoader.initialized;
    const executorRunning = this.skillExecutor && this.skillExecutor.isRunning;
    
    return {
      status: loaderInitialized && (!this.options.enableExecutor || executorRunning) ? 'healthy' : 'degraded',
      components: {
        skillLoader: loaderInitialized ? 'healthy' : 'unhealthy',
        skillExecutor: this.options.enableExecutor 
          ? (executorRunning ? 'healthy' : 'unhealthy') 
          : 'not_enabled'
      },
      metrics: {
        totalSkills: this.skillLoader ? this.skillLoader.skills.size : 0,
        activeExecutions: this.skillExecutor ? this.skillExecutor.activeExecutions.size : 0
      }
    };
  }
  
  // 清理资源
  async cleanup() {
    this.logger.info('正在清理技能管理器资源...');
    
    // 停止执行器
    if (this.skillExecutor) {
      this.skillExecutor.stop();
      this.logger.info('技能执行器已停止');
    }
    
    // 卸载所有技能
    if (this.skillLoader) {
      const skillIds = Array.from(this.skillLoader.skillInstances.keys());
      for (const skillId of skillIds) {
        await this.skillLoader.unloadSkill(skillId);
      }
      this.logger.info('所有技能已卸载');
    }
    
    this.initialized = false;
    this.logger.info('技能管理器清理完成');
  }
  
  // 静态方法：快速创建技能管理器
  static async create(options = {}) {
    const manager = new SkillManager(options);
    const result = await manager.initialize();
    
    if (!result.success) {
      throw new Error(`创建技能管理器失败: ${result.error}`);
    }
    
    return manager;
  }
}

module.exports = SkillManager;