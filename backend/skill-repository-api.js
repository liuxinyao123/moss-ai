/**
 * 技能仓库API
 * 提供技能发现、安装、更新和卸载的API接口
 */

const express = require('express');
const GitHubSkillRepository = require('./github-skill-repository');

class SkillRepositoryAPI {
  constructor(skillLoader, options = {}) {
    this.skillLoader = skillLoader;
    this.options = {
      basePath: options.basePath || '',
      ...options
    };
    
    this.router = express.Router();
    this.githubRepository = null;
    
    this.setupRoutes();
  }
  
  // 设置路由
  setupRoutes() {
    // GitHub技能仓库
    this.router.get('/repository/github/search', this.searchGitHubSkills.bind(this));
    this.router.post('/repository/github/install', this.installGitHubSkill.bind(this));
    this.router.get('/repository/github/installed', this.getInstalledGitHubSkills.bind(this));
    this.router.get('/repository/github/check/:skillId', this.checkGitHubSkillUpdate.bind(this));
    this.router.post('/repository/github/update/:skillId', this.updateGitHubSkill.bind(this));
    this.router.delete('/repository/github/uninstall/:skillId', this.uninstallGitHubSkill.bind(this));
    
    // 技能发现
    this.router.get('/discover', this.discoverSkills.bind(this));
    this.router.get('/discover/categories', this.getDiscoverCategories.bind(this));
    this.router.get('/discover/trending', this.getTrendingSkills.bind(this));
    
    // 技能安装
    this.router.post('/install', this.installSkill.bind(this));
    this.router.get('/install/validate', this.validateSkillSource.bind(this));
    
    // 技能更新
    this.router.get('/updates', this.getAvailableUpdates.bind(this));
    this.router.post('/update/:skillId', this.updateSkill.bind(this));
    this.router.post('/update/all', this.updateAllSkills.bind(this));
    
    // 技能卸载
    this.router.delete('/uninstall/:skillId', this.uninstallSkill.bind(this));
    
    // 技能仓库管理
    this.router.get('/sources', this.getSkillSources.bind(this));
    this.router.post('/sources/add', this.addSkillSource.bind(this));
    this.router.delete('/sources/remove/:sourceId', this.removeSkillSource.bind(this));
    
    // 错误处理
    this.router.use(this.errorHandler.bind(this));
  }
  
  // 搜索GitHub技能
  async searchGitHubSkills(req, res) {
    try {
      const {
        q,
        language = 'javascript',
        sort = 'updated',
        order = 'desc',
        limit = 10
      } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          error: '请提供搜索关键词 (q 参数)'
        });
      }
      
      // 初始化GitHub仓库（如果尚未初始化）
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      // 搜索技能
      const result = await this.githubRepository.searchSkills(q, {
        language,
        sort,
        order,
        perPage: limit
      });
      
      if (!result.success && result.fallback) {
        // 使用模拟结果
        return res.json({
          success: true,
          source: 'mock',
          message: 'GitHub API调用失败，返回模拟结果',
          data: result.fallback,
          total: result.fallback.length,
          returned: result.fallback.length
        });
      }
      
      res.json({
        success: result.success,
        data: result.skills,
        total: result.total,
        returned: result.returned,
        query: result.query
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 安装GitHub技能
  async installGitHubSkill(req, res) {
    try {
      const {
        repo,
        force = 'false',
        installDependencies = 'true'
      } = req.body;
      
      if (!repo) {
        return res.status(400).json({
          success: false,
          error: '请提供仓库信息 (repo 参数，格式: owner/repo)'
        });
      }
      
      // 初始化GitHub仓库
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      // 安装技能
      const result = await this.githubRepository.installSkill(repo, {
        force: force === 'true',
        installDependencies: installDependencies === 'true'
      });
      
      if (result.success) {
        // 重新扫描技能目录
        await this.skillLoader.rescan();
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取已安装的GitHub技能
  async getInstalledGitHubSkills(req, res) {
    try {
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      const skills = await this.githubRepository.getInstalledSkills();
      
      res.json({
        success: true,
        data: skills,
        total: skills.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 检查GitHub技能更新
  async checkGitHubSkillUpdate(req, res) {
    try {
      const { skillId } = req.params;
      
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      const result = await this.githubRepository.checkSkillUpdate(skillId);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 更新GitHub技能
  async updateGitHubSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      const result = await this.githubRepository.updateSkill(skillId);
      
      if (result.success) {
        // 重新扫描技能目录
        await this.skillLoader.rescan();
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 卸载GitHub技能
  async uninstallGitHubSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(repository.basePath);
      }
      
      const result = await this.githubRepository.uninstallSkill(skillId);
      
      if (result.success) {
        // 重新扫描技能目录
        await this.skillLoader.rescan();
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
               success: false,
        error: error.message
      });
    }
  }
  
  // 发现技能
  async discoverSkills(req, res) {
    try {
      const {
        q,
        category,
        tag,
        sort = 'relevance',
        limit = 20
      } = req.query;
      
      // 获取所有技能
      const allSkills = this.skillLoader.getSkills();
      
      // 过滤技能
      let skills = allSkills;
      
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
      
      // 限制数量
      const total = skills.length;
      const paginatedSkills = skills.slice(0, limit);
      
      res.json({
        success: true,
        data: paginatedSkills.map(skill => this.formatSkill(skill)),
        pagination: {
          total,
          limit: parseInt(limit),
          hasMore: total > limit
        },
        filters: { q, category, tag, sort }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取发现类别
  async getDiscoverCategories(req, res) {
    try {
      const categories = this.skillLoader.getSkillsSkillsByCategory();
      
      const categoryList = Object.entries(categories).map(([category, info]) => ({
        name: category,
        total: info.total,
        enabled: info.enabled,
        skills: info.skills.map(skillId => {
          const skill = this.skillLoader.skills.get(skillId);
          return skill ? {
            id: skill.id,
            name: skill.name,
            description: skill.description
          } : null;
        }).filter(Boolean)
      }));
      
      res.json({
        success: true,
        data: categoryList,
        totalCategories: categoryList.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取热门技能
  async getTrendingSkills(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      const skills = this.skillLoader.getSkills();
      
      // 按使用次数和最近使用时间排序
      const trendingSkills = skills
        .filter(skill => skill.usage_count > 0 || skill.last_used)
        .sort((a, b) => {
          // 综合评分：使用次数权重 + 最近使用时间权重
          const scoreA = (a.usage_count || 0) * 100 + 
            (a.last_used ? new Date(a.last_used).getTime() : 0) / 1000000;
          const scoreB = (b.usage_count || 0) * 100 + 
            (b.last_used ? new Date(b.last_used).getTime() : 0) / 1000000;
          return scoreB - scoreA;
        })
        .slice(0, limit)
        .map(skill => this.formatSkill(skill));
      
      res.json({
        success: true,
        data: trendingSkills,
        total: trendingSkills.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 安装技能（通用）
  async installSkill(req) {
    res.status(501).json({
      success: false,
      error: '通用技能安装功能正在开发中',
      message: '请使用 /repository/github/install 安装GitHub技能'
    });
  }
  
  // 验证技能来源
  async validateSkillSource(req, res) {
    try {
      const { source } = req.query;
      
      if (!source) {
        return res.status(400).json({
          success: false,
          error: '请提供技能来源URL'
        });
      }
      
      // 验证URL格式
      let url;
      try {
        url = new URL(source);
      } catch {
        return res.json({
          valid: false,
          reason: '无效的URL格式'
        });
      }
      
      // 检查是否为GitHub仓库
      if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        if (pathParts.length >= 2) {
          const owner = pathParts[0];
          const repo = pathParts[1];
          
          return res.json({
            valid: true,
            type: 'github',
            owner,
            repo,
            message: `有效的GitHub仓库: ${owner}/${repo}`
          });
        }
      }
      
      res.json({
        valid: false,
        reason: '不支持的技能来源',
        message: '目前只支持GitHub仓库'
      });
    } catch (error) {
      res.status(500).json({
        valid: false,
        error: error.message
      });
    }
  }
  
  // 获取可用更新
  async getAvailableUpdates(req, res) {
    try {
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      // 获取已安装的GitHub技能
      const installedSkills = await this.githubRepository.getInstalledSkills();
      
      // 检查每个技能的更新
      const updates = [];
      
      for (const skill of installedSkills) {
        try {
          const updateInfo = await this.githubRepository.checkSkillUpdate(skill.id);
          
          if (updateInfo.success && updateInfo.hasUpdate) {
            updates.push({
              ...updateInfo,
              skillName: skill.name,
              skillPath: skill.path
            });
          }
        } catch (error) {
          // 跳过检查失败的技能
        }
      }
      
      res.json({
        success: true,
        data: updates,
        totalUpdates: updates.length,
        totalChecked: installedSkills.length,
        message: updates.length > 0 
          ? `发现 ${updates.length} 个技能有可用更新`
          : '所有技能都是最新版本'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 更新技能
  async updateSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      const result = await this.githubRepository.updateSkill(skillId);
      
      if (result.success) {
        // 重新扫描技能目录
        await this.skillLoader.rescan();
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 更新所有技能
  async updateAllSkills(req, res) {
    try {
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      // 获取已安装的GitHub技能
      const installedSkills = await this.githubRepository.getInstalledSkills();
      
      const results = [];
      
      for (const skill of installedSkills) {
        try {
          const result = await this.githubRepository.updateSkill(skill.id);
          results.push({
            skillId: skill.id,
            skillName: skill.name,
            ...result
          });
        } catch (error) {
          results.push({
            skillId: skill.id,
            skillName: skill.name,
            success: false,
            error: error.message
          });
        }
      }
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      // 重新扫描技能目录
      await this.skillLoader.rescan();
      
      res.json({
        success: true,
        message: `更新完成: ${successful} 成功, ${failed} 失败`,
        data: results,
        summary: {
          total: results.length,
          successful,
          failed
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 卸载技能
  async uninstallSkill(req, res) {
    try {
      const { skillId } = req.params;
      
      if (!this.githubRepository) {
        this.githubRepository = new GitHubSkillRepository(this.skillLoader.basePath);
      }
      
      const result = await this.githubRepository.uninstallSkill(skillId);
      
      if (result.success) {
        // 重新扫描技能目录
        await this.skillLoader.rescan();
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // 获取技能源
  async getSkillSources(req, res) {
    res.json({
      success: true,
      data: [
        {
          id: 'github',
          name: 'GitHub',
          description: '从GitHub仓库安装技能',
          type: 'remote',
          enabled: true,
          features: [
            'search',
            'install',
            'update',
            'uninstall'
          ]
        },
        {
          id: 'local',
          name: '本地文件',
          description: '从本地文件系统安装技能',
          type: 'local',
          enabled: false,
          features: ['install']
        },
        {
          id: 'npm',
          name: 'NPM包',
          description: '从NPM安装技能包',
          type: 'remote',
          enabled: false,
          features: ['search', 'install', 'update']
        }
      ],
      total: 3
    });
  }
  
  // 添加技能源
  async addSkillSource(req, res) {
    res.status(501).json({
      success: false,
      error: '添加技能源功能正在开发中'
    });
  }
  
  // 移除技能源
  async removeSkillSource(req, res) {
    res.status(501).json({
      success: false,
      error: '移除技能源功能正在开发中'
    });
  }
  
  // 错误处理
  errorHandler(err, req, res, next) {
    console.error('技能仓库API错误:', err);
    
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
      }
    };
  }
  
  // 获取路由器
  getRouter() {
    return this.router;
  }
}

module.exports = SkillRepositoryAPI;