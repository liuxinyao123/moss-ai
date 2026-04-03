/**
 * 技能API接口
 * 提供技能管理的RESTful API
 */

const express = require('express');
const router = express.Router();

class SkillAPI {
  constructor(skillLoader, skillExecutor, skillRepositoryAPI) {
    this.skillLoader = skillLoader;
    this.skillExecutor = skillExecutor;
    this.skillRepositoryAPI = skillRepositoryAPI;
    this.router = router;
    this.setupRoutes();
  }
  
  // 设置路由
  setupRoutes() {
    // 技能管理API
    this.router.get('/skills', this.getSkills.bind(this));
    this.router.get('/skills/:skillId', this.getSkill.bind(this));
    this.router.post('/skills/:skillId/enable', this.enableSkill.bind(this));
    this.router.post('/skills/:skillId/disable', this.disableSkill.bind(this));
    this.router.post('/skills/:skillId/execute', this.executeSkill.bind(this));
    this.router.delete('/skills/:skillId', this.deleteSkill.bind(this));
    this.router.get('/skills/:skillId/status', this.getSkillStatus.bind(this));
    this.router.post('/skills/:skillId/reload', this.reloadSkill.bind(this));
    this.router.get('/skills/:skillId/help', this.getSkillHelp.bind(this));
    
    // 技能执行API
    this.router.get('/executions/:executionId', this.getExecutionStatus.bind(this));
    this.router.delete('/executions/:executionId', this.cancelExecution.bind(this));
    this.router.get('/executions', this.getExecutions.bind(this));
    
    // 技能仓库API
    this.router.get('/registry', this.getRegistry.bind(this));
    this.router.get('/registry/search', this.searchSkills.bind(this));
    this.router.get('/registry/categories', this.getCategories.bind(this));
    this.router.post('/registry/rescan', this.rescanRegistry.bind(this));
    
    // 系统状态API
    this.router.get('/status', this.getStatus.bind(this));
    this.router.get('/stats', this.getStats.bind(this));
    this.router.get('/health', this.getHealth.bind(this));
    
    // 技能发现和安装
    this.router.get('/discover', this.discoverSkills.bind(this));
    this.router.post('/install', this.installSkill.bind(this));
    this.router.post('/update/:skillId', this.updateSkill.bind(this));
    
    // 技能仓库API（如果启用）
    if (this.skillRepositoryAPI) {
      this.router.use('/', this.skillRepositoryAPI.getRouter());
    }
    
    // 错误处理中间件
    this.router.use(this.errorHandler.bind(this));
  }
  
  // 获取技能列表
  async getSkills(req, res) {
    try {
      const {
        category,
        enabled,
        search,
        sort = 'name:asc',
        limit = 50,
        offset = 0
      } = req.query;
      
      // 构建查询选项
      const options = {};
      if (category) options.category = category;
      if (enabled !== undefined) options.enabled = enabled === 'true';
      if (search) options.search = search;
      if (sort) options.sort = sort;
      
      // 获取技能列表
      let skills = this.skillLoader.getSkills(options);
      
      // 分页
      const total = skills.length;
      const paginatedSkills = skills.slice(offset, offset + limit);
      
      // 格式化响应
      const formattedSkills = paginatedSkills.map(skill => this.formatSkill(skill));
      
      res.json({
        success: true,
        data: formattedSkills,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < total
        },
        filters: {
          category,
          enabled,
          search,
          sort
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能详情
  async getSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        data: this.formatSkill(skill)
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 启用技能
  async enableSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      await this.skillLoader.enableSkill(skillId);
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        message: `技能 ${skill.name} 已启用`,
        data: this.formatSkill(skill)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 禁用技能
  async disableSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      await this.skillLoader.disableSkill(skillId);
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        message: `技能 ${skill.name} 已禁用`,
        data: this.formatSkill(skill)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 执行技能
  async executeSkill(req, res) {
    try {
      const { skillId } = req.params;
      const params = req.body;
      
      // 验证技能是否存在
      const skill = this.skillLoader.getSkill(skillId);
      
      // 执行技能
      const executionId = await this.skillExecutor.run(skillId, params);
      
      // 获取执行状态
      const executionStatus = this.skillExecutor.getExecutionStatus(executionId);
      
      res.json({
        success: true,
        message: `技能 ${skill.name} 执行已开始`,
        data: {
          executionId,
          skillId,
          skillName: skill.name,
          status: executionStatus.status,
          queuedAt: executionStatus.queuedAt
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 删除技能（软删除，移动到disabled目录）
  async deleteSkill(req, res) {
    try {
      const { skillId } = req.params;
      const { permanent = false } = req.query;
      
      const skill = this.skillLoader.getSkill(skillId);
      
      if (permanent === 'true') {
        // 永久删除（需要实现）
        return res.status(501).json({
          success: false,
          error: '永久删除功能暂未实现'
        });
      } else {
        // 软删除：禁用技能
        await this.skillLoader.disableSkill(skillId);
        
        res.json({
          success: true,
          message: `技能 ${skill.name} 已禁用`,
          data: this.formatSkill(skill)
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能状态
  async getSkillStatus(req, res) {
    try {
      const { skillId } = req.params;
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        data: {
          id: skill.id,
          name: skill.name,
          enabled: skill.enabled,
          last_used: skill.last_used,
          usage_count: skill.usage_count,
          errors: skill.errors?.length || 0,
          instanceStatus: skill.instanceStatus,
          capabilities: skill.capabilities || []
        }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 重新加载技能
  async reloadSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      // 卸载技能（如果已加载）
      await this.skillLoader.unloadSkill(skillId);
      
      // 重新加载技能
      const skillInstance = await this.skillLoader.loadSkill(skillId);
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        message: `技能 ${skill.name} 已重新加载`,
        data: this.formatSkill(skill)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能帮助
  async getSkillHelp(req, res) {
    try {
      const { skillId } = req.params;
      
      // 加载技能实例
      const skillInstance = await this.skillLoader.loadSkill(skillId);
      
      // 获取帮助信息
      const helpInfo = await skillInstance.help();
      
      const skill = this.skillLoader.getSkill(skillId);
      
      res.json({
        success: true,
        data: {
          skill: {
            id: skill.id,
            name: skill.name,
            version: skill.version,
            description: skill.description
          },
          help: helpInfo
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取执行状态
  async getExecutionStatus(req, res) {
    try {
      const { executionId } = req.params;
      
      const status = this.skillExecutor.getExecutionStatus(executionId);
      
      if (!status.found) {
        return res.status(404).json({
          success: false,
          error: status.message
        });
      }
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 取消执行
  async cancelExecution(req, res) {
    try {
      const { executionId } = req.params;
      
      const result = this.skillExecutor.cancelExecution(executionId);
      
      res.json({
        success: result.success,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取执行列表
  async getExecutions(req, res) {
    try {
      const { status, skillId, limit = 20 } = req.query;
      
      // 获取队列状态
      const queueStatus = this.skillExecutor.getQueueStatus();
      
      // 过滤执行
      let executions = [...queueStatus.active, ...queueStatus.queue];
      
      if (status) {
        executions = executions.filter(e => e.status === status);
      }
      
      if (skillId) {
        executions = executions.filter(e => e.skillId === skillId);
      }
      
      // 限制数量
      executions = executions.slice(0, limit);
      
      res.json({
        success: true,
        data: {
          executions,
          stats: queueStatus.stats
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能注册表
  async getRegistry(req, res) {
    try {
      const skills = this.skillLoader.getSkills();
      const stats = this.skillLoader.getStatistics();
      
      res.json({
        success: true,
        data: {
          version: '1.0.0',
          last_updated: new Date().toISOString(),
          total_skills: skills.length,
          stats,
          categories: this.skillLoader.getSkillsByCategory()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 搜索技能
  async searchSkills(req, res) {
    try {
      const { q, category, tag, sort = 'relevance' } = req.query;
      
      if (!q && !category && !tag) {
        return res.status(400).json({
          success: false,
          error: '请提供搜索关键词、类别或标签'
        });
      }
      
      let skills = this.skillLoader.getSkills();
      
      // 搜索过滤
      if (q) {
        const query = q.toLowerCase();
        skills = skills.filter(skill => 
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.tags?.some(tag => tag.toLowerCase().includes(query))
        );
      }
      
      if (category) {
        skills = skills.filter(skill => skill.category === category);
      }
      
      if (tag) {
        const tagLower = tag.toLowerCase();
        skills = skills.filter(skill => 
          skill.tags?.some(t => t.toLowerCase().includes(tagLower))
        );
      }
      
      // 排序
      if (sort === 'name') {
        skills.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sort === 'usage') {
        skills.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
      } else if (sort === 'recent') {
        skills.sort((a, b) => {
          const timeA = a.last_used ? new Date(a.last_used).getTime() : 0;
          const timeB = b.last_used ? new Date(b.last_used).getTime() : 0;
          return timeB - timeA;
        });
      }
      
      res.json({
        success: true,
        data: {
          query: { q, category, tag, sort },
          results: skills.map(skill => this.formatSkill(skill)),
          count: skills.length
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能类别
  async getCategories(req, res) {
    try {
      const categories = this.skillLoader.getSkillsByCategory();
      
      res.json({
        success: true,
        data: {
          categories,
          total_categories: Object.keys(categories).length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 重新扫描注册表
  async rescanRegistry(req, res) {
    try {
      const stats = await this.skillLoader.rescan();
      
      res.json({
        success: true,
        message: '技能注册表已重新扫描',
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取系统状态
  async getStatus(req, res) {
    try {
      const loaderStats = this.skillLoader.getStatistics();
      const executorStats = this.skillExecutor.getStats();
      const queueStatus = this.skillExecutor.getQueueStatus();
      
      res.json({
        success: true,
        data: {
          system: {
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          },
          loader: loaderStats,
          executor: executorStats,
          queue: queueStatus
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取统计信息
  async getStats(req, res) {
    try {
      const stats = this.skillExecutor.getStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 健康检查
  async getHealth(req, res) {
    try {
      const loaderInitialized = this.skillLoader.initialized;
      const executorRunning = this.skillExecutor.isRunning;
      const skillCount = this.skillLoader.skills.size;
      
      const health = {
        status: loaderInitialized && executorRunning ? 'healthy' : 'degraded',
        components: {
          skillLoader: loaderInitialized ? 'healthy' : 'unhealthy',
          skillExecutor: executorRunning ? 'healthy' : 'unhealthy'
        },
        metrics: {
          totalSkills: skillCount,
          activeExecutions: this.skillExecutor.activeExecutions.size,
          queueSize: this.skillExecutor.queue.length
        },
        timestamp: new Date().toISOString()
      };
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: error.message,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
  
  // 发现技能（占位符）
  async discoverSkills(req, res) {
    try {
      // 这里应该实现从GitHub或其他仓库发现技能的功能
      // 目前返回内置技能列表
      
      const builtinSkills = this.skillLoader.getSkills({ category: 'builtin' });
      
      res.json({
        success: true,
        data: {
          builtin: builtinSkills.map(skill => this.formatSkill(skill)),
          message: '技能发现功能正在开发中'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 安装技能（占位符）
  async installSkill(req, res) {
    try {
      const { source, skillId } = req.body;
      
      // 这里应该实现从GitHub或其他源安装技能的功能
      // 目前只是占位符
      
      res.status(501).json({
        success: false,
        error: '技能安装功能正在开发中',
        data: {
          source,
          skillId,
          message: '请等待后续版本更新'
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 更新技能（占位符）
  async updateSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      // 这里应该实现技能更新功能
      // 目前只是占位符
      
      res.status(501).json({
        success: false,
        error: '技能更新功能正在开发中',
        data: {
          skillId,
          message: '请等待后续版本更新'
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 错误处理
  errorHandler(err, req, res, next) {
    console.error('技能API错误:', err);
    
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  
  // 格式化技能信息
  formatSkill(skill) {
    return {
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      category: skill.category,
      enabled: skill.enabled,
      tags: skill.tags || [],
      permissions: skill.permissions,
      triggers: skill.triggers,
      capabilities: skill.capabilities || [],
      metadata: skill.metadata || {},
      usage: {
        last_used: skill.last_used,
        usage_count: skill.usage_count || 0
      },
      errors: skill.errors?.length || 0,
      path: skill.path
    };
  }
  
  // 获取路由器
  getRouter() {
    return this.router;
  }
}

module.exports = SkillAPI;