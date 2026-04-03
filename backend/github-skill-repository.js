/**
 * GitHub技能仓库
 * 从GitHub搜索和安装技能
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class GitHubSkillRepository {
  constructor(basePath, options = {}) {
    this.basePath = basePath;
    this.options = {
      githubApiUrl: 'https://api.github.com',
      timeout: 30000,
      maxRetries: 3,
      defaultOwner: 'dsclaw',
      defaultRepo: 'skills',
      ...options
    };
    
    this.communityPath = path.join(basePath, 'community', 'github');
    this.logger = console;
  }
  
  // 搜索GitHub技能
  async searchSkills(query, options = {}) {
    try {
      const {
        owner = this.options.defaultOwner,
        repo = this.options.defaultRepo,
        language = 'javascript',
        sort = 'updated',
        order = 'desc',
        perPage = 10
      } = options;
      
      // 构建搜索查询
      let searchQuery = `language:${language}`;
      
      if (query) {
        searchQuery += ` ${query}`;
      }
      
      // 调用GitHub搜索API
      const searchUrl = `${this.options.githubApiUrl}/search/repositories`;
      const params = {
        q: searchQuery,
        sort,
        order,
        per_page: perPage
      };
      
      this.logger.debug(`搜索GitHub技能: ${searchQuery}`);
      
      const response = await this.makeRequest(searchUrl, params);
      
      if (response.status !== 200) {
        throw new Error(`GitHub搜索失败: ${response.statusText}`);
      }
      
      // 格式化结果
      const skills = response.data.items.map(item => this.formatGitHubRepo(item));
      
      return {
        success: true,
        query: searchQuery,
        total: response.data.total_count,
        returned: skills.length,
        skills
      };
    } catch (error) {
      this.logger.error('搜索GitHub技能失败:', error);
      return {
        success: false,
        error: error.message,
        fallback: await this.getMockSearchResults(query)
      };
    }
  }
  
  // 格式化GitHub仓库信息
  formatGitHubRepo(repo) {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '无描述',
      owner: {
        login: repo.owner.login,
        avatar: repo.owner.avatar_url
      },
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      topics: repo.topics || [],
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      isSkill: this.isSkillRepo(repo),
      skillInfo: this.extractSkillInfo(repo)
    };
  }
  
  // 判断是否为技能仓库
  isSkillRepo(repo) {
    const keywords = ['skill', 'dsclaw', 'moss-ai', 'agent', 'plugin', 'extension'];
    const nameLower = repo.name.toLowerCase();
    const descLower = (repo.description || '').toLowerCase();
    
    return keywords.some(keyword => 
      nameLower.includes(keyword) || descLower.includes(keyword)
    ) || repo.topics?.includes('moss-skill');
  }
  
  // 提取技能信息
  extractSkillInfo(repo) {
    // 尝试从仓库描述中提取技能信息
    const description = repo.description || '';
    const skillInfo = {
      version: '1.0.0',
      category: 'community',
      compatibility: 'any'
    };
    
    // 尝试从描述中提取版本号
    const versionMatch = description.match(/v(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      skillInfo.version = versionMatch[1];
    }
    
    return skillInfo;
  }
  
  // 从GitHub安装技能
  async installSkill(repoInfo, options = {}) {
    try {
      const {
        targetPath = this.communityPath,
        installDependencies = true,
        force = false
      } = options;
      
      // 获取仓库信息
      const repo = await this.getRepoInfo(repoInfo);
      
      if (!repo) {
        throw new Error('仓库不存在或无法访问');
      }
      
      // 检查是否是技能仓库
      const skillId = this.generateSkillId(repo);
      const installPath = path.join(targetPath, skillId);
      
      // 检查是否已安装
      if (!force) {
        const exists = await this.skillExists(installPath);
        if (exists) {
          return {
            success: false,
            error: '技能已安装',
            message: '使用 --force 选项强制重新安装',
            installedPath
          };
        }
      }
      
      this.logger.info(`正在安装技能: ${repo.full_name}`);
      
      // 克隆仓库
      await this.cloneRepository(repo.clone_url, installPath, force);
      
      // 验证技能配置
      const skillConfig = await this.validateSkillConfig(installPath);
      if (!skillConfig) {
        await fs.rm(installPath, { recursive: true, force: true });
        throw new Error('技能配置验证失败，不是有效的技能');
      }
      
      // 安装依赖
      let dependenciesInstalled = false;
      let installedPackages = [];
      
      if (installDependencies && skillConfig.dependencies) {
        const depResult = await this.installSkillDependencies(installPath, skillConfig.dependencies);
        dependenciesInstalled = depResult.success;
        installedPackages = depResult.packages || [];
      }
      
      this.logger.info(`技能安装成功: ${skillConfig.name}`);
      
      return {
        success: true,
        message: `技能 ${skillConfig.name} 安装成功`,
        skill: {
          id: skillConfig.id,
          name: skillConfig.name,
          version: skillConfig.version,
          description: skillConfig.description,
          path: installPath,
          installedAt: new Date().toISOString(),
          source: repo.full_name,
          dependenciesInstalled,
          installedPackages
        }
      };
    } catch (error) {
      this.logger.error('安装技能失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取仓库信息
  async getRepoInfo(repoInfo) {
    try {
      let owner, repoName;
      
      if (typeof repoInfo === 'string') {
        // 解析 "owner/repo" 格式
        const parts = repoInfo.split('/');
        if (parts.length !== 2) {
          throw new Error('仓库格式错误，应为 "owner/repo"');
        }
        owner = parts[0];
        repoName = parts[1];
      } else if (repoInfo.fullName) {
        // 从格式化后的仓库信息中获取
        const parts = repoInfo.fullName.split('/');
        owner = parts[0];
        repoName = parts[1];
      } else {
        throw new Error('无效的仓库信息');
      }
      
      const url = `${this.options.githubApiUrl}/repos/${owner}/${repoName}`;
      const response = await this.makeRequest(url);
      
      if (response.status !== 200) {
        return null;
      }
      
      return response.data;
    } catch (error) {
      this.logger.error('获取仓库信息失败:', error);
      return null;
    }
  }
  
  // 生成技能ID
  generateSkillId(repo) {
    const name = repo.name.toLowerCase().replace(/\s+/g, '-');
    return `${name}-v1.0.0`;
  }
  
  // 克隆仓库
  async cloneRepository(cloneUrl, targetPath, force = false) {
    try {
      // 如果目标路径存在且强制安装，先删除
      if (force) {
        try {
          await fs.access(targetPath);
          await fs.rm(targetPath, { recursive: true, force: true });
          this.logger.debug(`已删除现有安装: ${targetPath}`);
        } catch {
          // 目录不存在，继续
        }
      }
      
      // 使用git克隆
      const command = `git clone --depth 1 ${cloneUrl} ${targetPath}`;
      
      this.logger.debug(`执行命令: ${command}`);
      
      execSync(command, {
        timeout: 60000,
        stdio: 'pipe' // 静默执行
      });
      
      this.logger.info(`仓库克隆成功: ${targetPath}`);
    } catch (error) {
      this.logger.error('克隆仓库失败:', error);
      throw new Error(`克隆仓库失败: ${error.message}`);
    }
  }
  
  // 验证技能配置
  async validateSkillConfig(skillPath) {
    try {
      const configPath = path.join(skillPath, 'skill.json');
      const entryPath = path.join(skillPath, 'skill.js');
      
      // 检查配置文件
      await fs.access(configPath);
      
      // 检查入口文件
      await fs.access(entryPath);
      
      // 读取并验证配置
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // 验证必需字段
      if (!config.name || !config.version || !config.description) {
        throw new Error('技能配置缺少必需字段');
      }
      
      return config;
    } catch (error) {
      this.logger.error('验证技能配置失败:', error);
      return null;
    }
  }
  
  // 安装技能依赖
  async installSkillDependencies(skillPath, dependencies) {
    if (!dependencies || dependencies.length === 0) {
      return {
        success: true,
        message: '无需安装依赖',
        packages: []
      };
    }
    
    try {
      this.logger.info(`正在安装依赖: ${dependencies.join(', ')}`);
      
      const packageJsonPath = path.join(skillPath, 'package.json');
      
      // 创建package.json（如果不存在）
      let packageJson = {};
      try {
        await fs.access(packageJsonPath);
        const packageContent = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(packageContent);
      } catch {
        // 创建新的package.json
        packageJson = {
          name: 'moss-skill-dependencies',
          version: '1.0.0',
          private: true
        };
      }
      
      // 添加依赖
      packageJson.dependencies = packageJson.dependencies || {};
      dependencies.forEach(dep => {
        packageJson.dependencies[dep] = 'latest';
      });
      
      // 写入package.json
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
      
      // 使用npm安装依赖
      const command = `cd ${skillPath} && npm install --production --no-save`;
      
      execSync(command, {
        timeout: 120000,
        stdio: 'pipe'
      });
      
      this.logger.info(`依赖安装成功: ${dependencies.join(', ')}`);
      
      return {
        success: true,
        message: '依赖安装成功',
        packages: dependencies
      };
    } catch (error) {
      this.logger.error('安装依赖失败:', error);
      return {
        success: false,
        error: error.message,
        packages: dependencies
      };
    }
  }
  
  // 检查技能更新
  async checkSkillUpdate(skillId) {
    try {
      // 查找技能路径
      const skillPath = await this.findSkillPath(skillId);
      if (!skillPath) {
        return {
          success: false,
          error: '技能未安装'
        };
      }
      
      // 获取技能源仓库信息
      const gitConfigPath = path.join(skillPath, '.git', 'config');
      try {
        await fs.access(gitConfigPath);
      } catch {
        return {
          success: false,
          error: '技能不是从Git仓库安装的'
        };
      }
      
      // 获取远程URL
      const gitConfig = await fs.readFile(gitConfigPath, 'utf8');
      const urlMatch = gitConfig.match(/url\s*=\s*(.+)/);
      if (!urlMatch) {
        return {
          success: false,
          error: '无法获取Git仓库URL'
        };
      }
      
      let remoteUrl = urlMatch[1].trim();
      
      // 移除.git后缀
      remoteUrl = remoteUrl.replace(/\.git$/, '');
      
      // 解析GitHub仓库
      const repoMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/(.+)/);
      if (!repoMatch) {
        return {
          success: false,
          error: '不是GitHub仓库'
        };
      }
      
      const owner = repoMatch[1];
      const repoName = repoMatch[2];
      
      // 获取远程仓库信息
      const repoInfo = await this.getRepoInfo(`${owner}/${repoName}`);
      if (!repoInfo) {
        return {
          success: false,
          error: '无法获取仓库信息'
        };
      }
      
      // 获取本地版本
      const configPath = path.join(skillPath, 'skill.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      const localVersion = config.version;
      
      // 比较更新时间
      const localInstallTime = config.metadata?.installed_at || '1970-01-01';
      const remoteUpdateTime = repoInfo.updated_at;
      
      const hasUpdate = new Date(remoteUpdateTime) > new Date(localInstallTime);
      
      return {
        success: true,
        hasUpdate,
        currentVersion: localVersion,
        remoteVersion: repoInfo.updated_at,
        localInstallTime,
        remoteUpdateTime,
        message: hasUpdate 
          ? '有可用的更新' 
          : '已是最新版本'
      };
    } catch (error) {
      this.logger.error('检查技能更新失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 更新技能
  async updateSkill(skillId) {
    try {
      // 查找技能路径
      const skillPath = await this.findSkillPath(skillId);
      if (!skillPath) {
        return {
          success: false,
          error: '技能未安装'
        };
      }
      
      this.logger.info(`正在更新技能: ${skillId}`);
      
      // 执行git pull
      const command = `cd ${skillPath} && git pull origin main`;
      
      execSync(command, {
        timeout: 60000,
        stdio: 'pipe'
      });
      
      // 重新安装依赖
      const configPath = path.join(skillPath, 'skill.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      if (config.dependencies) {
        await this.installSkillDependencies(skillPath, config.dependencies);
      }
      
      this.logger.info(`技能更新成功: ${skillId}`);
      
      return {
        success: true,
        message: '技能更新成功',
        skillId,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('更新技能失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 卸载技能
  async uninstallSkill(skillId) {
    try {
      // 查找技能路径
      const skillPath = await this.findSkillPath(skillId);
      if (!skillPath) {
        return {
          success: false,
          error: '技能未安装'
        };
      }
      
      // 删除技能目录
      await fs.rm(skillPath, { recursive: true, force: true });
      
      this.logger.info(`技能卸载成功: ${skillId}`);
      
      return {
        success: true,
        message: '技能卸载成功',
        skillId
      };
    } catch (error) {
      this.logger.error('卸载技能失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 查找技能路径
  async findSkillPath(skillId) {
    // 搜索community/github目录
    const searchDirs = [
      path.join(this.basePath, 'community', 'github'),
      path.join(this.basePath, 'community', 'local')
    ];
    
    for (const searchDir of searchDirs) {
      try {
        const entries = await fs.readdir(searchDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(searchDir, entry.name);
            
            try {
              const configPath = path.join(skillPath, 'skill.json');
              const configContent = await fs.readFile(configPath, 'utf8');
              const config = JSON.parse(configContent);
              
              if (config.id === skillId || entry.name === skillId) {
                return skillPath;
              }
            } catch {
              // 跳过无效的技能
            }
          }
        }
      } catch (error) {
        // 目录不存在，跳过
      }
    }
    
    return null;
  }
  
  // 检查技能是否存在
  async skillExists(skillPath) {
    try {
      await fs.access(skillPath);
      const configPath = path.join(skillPath, 'skill.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }
  
  // 获取已安装的GitHub技能
  async getInstalledSkills() {
    try {
      const githubPath = path.join(this.basePath, 'community', 'github');
      const skills = [];
      
      try {
        await fs.access(githubPath);
      } catch {
        return skills;
      }
      
      const entries = await fs.readdir(githubPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(githubPath, entry.name);
          
          try {
            const configPath = path.join(skillPath, 'skill.json');
            const configContent = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configContent);
            
            // 获取Git仓库信息
            let gitInfo = null;
            try {
              const gitDir = path.join(skillPath, '.git');
              await fs.access(gitDir);
              gitInfo = {
                hasGit: true,
                updatedAt: config.metadata?.last_updated || null
              };
            } catch {
              gitInfo = { hasGit: false };
            }
            
            skills.push({
              id: config.id,
              name: config.name,
              version: config.version,
              path: skillPath,
              category: 'github',
              gitInfo
            });
          } catch {
            // 跳过无效的技能
          }
        }
      }
      
      return skills;
    } catch (error) {
      this.logger.error('获取已安装技能失败:', error);
      return [];
    }
  }
  
  // 获取模拟搜索结果（当API调用失败时）
  async getMockSearchResults(query) {
    const mockSkills = [
      {
        id: 1,
        name: 'dsclaw-skill-weather-extended',
        fullName: 'dsclaw/weather-extended',
        description: '扩展天气技能，支持全球城市和详细预报',
        owner: { login: 'dsclaw', avatar: 'https://github.com/dsclaw.png' },
        url: 'https://github.com/dsclaw/weather-extended',
        cloneUrl: 'https://github.com/dsclaw/weather-extended.git',
        stars: 156,
        forks: 23,
        language: 'JavaScript',
        topics: ['dsclaw-skill', 'weather', 'api'],
        isSkill: true,
        skillInfo: { version: '2.0.0', category: 'utility' }
      },
      {
        id: 2,
        name: 'dsclaw-skill-news-reader',
        fullName: 'dsclaw/news-reader',
        description: '新闻阅读技能，支持多种新闻源',
        owner: { login: 'dsclaw', avatar: 'https://github.com/dsclaw.png' },
        url: 'https://github.com/dsclaw/news-reader',
        cloneUrl: 'https://github.com/dsclaw/news-reader.git',
        stars: 89,
        forks: 12,
        language: 'JavaScript',
        topics: ['dsclaw-skill', 'news', 'rss'],
        isSkill: true,
        skillInfo: { version: '1.5.0', category: 'information' }
      },
      {
        id: 3,
        name: 'dsclaw-skill-task-manager',
        fullName: 'dsclaw/task-manager',
        description: '高级任务管理技能，支持项目管理和协作',
        owner: { login: 'dsclaw', avatar: 'https://github.com/dsclaw.png' },
        url: 'https://github.com/dsclaw/task-manager',
        cloneUrl: 'https://github.com/dsclaw/task-manager.git',
        stars: 234,
        forks: 45,
        language: 'JavaScript',
        topics: ['dsclaw-skill', 'tasks', 'productivity'],
        isSkill: true,
        skillInfo: { version: '3.2.1', category: 'productivity' }
      }
    ];
    
    return mockSkills.filter(skill => {
      const q = (query || '').toLowerCase();
      return !q || 
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q);
    });
  }
  
  // 发起HTTP请求（带重试）
  async makeRequest(url, params = {}, retries = 0) {
    try {
      const response = await axios.get(url, {
        params,
        timeout: this.options.timeout,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DSClaw-Skill-Manager'
        }
      });
      
      return response;
    } catch (error) {
      if (retries < this.options.maxRetries) {
        this.logger.debug(`请求失败，重试 ${retries + 1}/${this.options.maxRetries}: ${url}`);
        await this.sleep(1000 * (retries + 1));
        return this.makeRequest(url, params, retries + 1);
      }
      
      throw error;
    }
  }
  
  // 简单的sleep函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GitHubSkillRepository;