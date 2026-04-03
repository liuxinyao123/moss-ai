/**
 * Skill Manager - 技能管理器
 * 技能发现、加载、执行、隔离管理
 * 支持 Kasm Workspaces 容器化执行
 */

const fs = require('fs');
const path = require('path');
const { KasmSkillAdapter } = require('../lib/kasm');

class SkillManager {
  constructor(engine) {
    this.engine = engine;
    this.skills = new Map();
    this.skillRoot = path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai',
      'skills'
    );
    this.skillDirs = [
      'builtin',      // 内置技能
      'system',       // 系统技能
      'community/local', // 本地社区技能
      'community/github'  // GitHub下载技能
    ];
    // Kasm 适配器
    this.kasmAdapter = null;
    this.kasmConfig = engine.config?.kasm || {};
  }

  async initialize() {
    // 确保技能目录存在
    for (const dir of this.skillDirs) {
      const fullPath = path.join(this.skillRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    // 初始化 Kasm 适配器（如果配置了）
    if (this.kasmConfig.enabled && this.kasmConfig.apiUrl) {
      try {
        this.kasmAdapter = new KasmSkillAdapter(this.kasmConfig);
        const available = await this.kasmAdapter.initialize();
        if (available) {
          console.log('[SkillManager] Kasm adapter initialized successfully');
        } else {
          console.warn('[SkillManager] Kasm configured but not available');
          this.kasmAdapter = null;
        }
      } catch (error) {
        console.warn('[SkillManager] Failed to initialize Kasm:', error.message);
        this.kasmAdapter = null;
      }
    }

    // 加载注册表
    const registryPath = path.join(this.skillRoot, 'registry.json');
    let registry = {};
    if (fs.existsSync(registryPath)) {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }

    // 扫描并加载所有技能
    await this.scanAllSkills();

    console.log(`[SkillManager] Loaded ${this.skills.size} skills${this.kasmAdapter ? ' (with Kasm enabled)' : ''}`);
  }

  /**
   * 扫描所有技能目录
   */
  async scanAllSkills() {
    for (const dir of this.skillDirs) {
      const fullPath = path.join(this.skillRoot, dir);
      await this.scanDirectory(fullPath);
    }
  }

  /**
   * 扫描单个目录
   */
  async scanDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const manifestPath = path.join(itemPath, 'skill.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const skill = this.loadSkill(itemPath, manifest);
            if (skill) {
              this.skills.set(manifest.id, skill);
            }
          } catch (e) {
            console.warn(`[SkillManager] Failed to load skill ${item}:`, e.message);
          }
        }
      }
    }
  }

  /**
   * 加载单个技能
   */
  loadSkill(skillPath, manifest) {
    // 检查禁用标记
    if (manifest.disabled) {
      console.log(`[SkillManager] Skipping disabled skill: ${manifest.id}`);
      return null;
    }

    const mainFile = manifest.main || 'index.js';
    const mainPath = path.join(skillPath, mainFile);

    if (!fs.existsSync(mainPath)) {
      console.warn(`[SkillManager] Main file not found for ${manifest.id}: ${mainFile}`);
      return null;
    }

    try {
      const module = require(mainPath);
      return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        permissions: manifest.permissions || [],
        path: skillPath,
        module: module,
        manifest,
        loadedAt: Date.now()
      };
    } catch (e) {
      console.error(`[SkillManager] Error loading ${manifest.id}:`, e.message);
      return null;
    }
  }

  /**
   * 获取技能
   */
  getSkill(skillId) {
    return this.skills.get(skillId);
  }

  /**
   * 检查技能是否有权限
   */
  checkPermission(skillId, permission) {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    return skill.permissions.includes(permission) || skill.permissions.includes('*');
  }

  /**
   * 列出所有已加载技能
   */
  listSkills() {
    return Array.from(this.skills.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      version: s.version,
      author: s.author,
      permissions: s.permissions
    }));
  }

  /**
   * 执行技能
   */
  async execute(skillId, context, params) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // 检查技能是否需要 Kasm
    const requiresKasm = skill.manifest?.kasm?.requiresKasm || 
                        skill.module?.kasm?.requiresKasm;
    
    // 如果需要 Kasm 但 Kasm 不可用，直接报错
    if (requiresKasm && !this.hasKasm()) {
      throw new Error(`Skill ${skillId} requires Kasm Workspaces, but Kasm is not available`);
    }

    // 增强上下文，加入 kasmAdapter
    const enhancedContext = {
      ...context,
      skillAdapter: this.kasmAdapter,
      kasmAdapter: this.kasmAdapter
    };

    // 权限检查在PathGuard沙箱层进行
    if (typeof skill.module.execute === 'function') {
      return await skill.module.execute(params, enhancedContext);
    } else if (typeof skill.module.default === 'function') {
      return await skill.module.default(enhancedContext, params);
    } else {
      throw new Error(`Skill ${skillId} has no execute function`);
    }
  }

  /**
   * 检查是否有可用的 Kasm
   */
  hasKasm() {
    return this.kasmAdapter && this.kasmAdapter.isEnabled();
  }

  /**
   * 获取 Kasm 适配器
   */
  getKasmAdapter() {
    return this.kasmAdapter;
  }

  /**
   * 配置 Kasm
   */
  configureKasm(config) {
    this.kasmConfig = config;
  }

  /**
   * 卸载技能
   */
  unloadSkill(skillId) {
    this.skills.delete(skillId);
    console.log(`[SkillManager] Unloaded skill: ${skillId}`);
  }

  /**
   * 重新加载技能
   */
  reloadSkill(skillId) {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.unloadSkill(skillId);
    // 清除模块缓存重新加载
    delete require.cache[require.resolve(path.join(skill.path, skill.manifest.main || 'index.js'))];
    
    const manifestPath = path.join(skill.path, 'skill.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const reloaded = this.loadSkill(skill.path, manifest);
    if (reloaded) {
      this.skills.set(skillId, reloaded);
    }
    return reloaded;
  }

  /**
   * 安装技能从GitHub
   */
  async installFromGitHub(repoUrl, targetDir = 'community/github') {
    // 这里可以实现git clone 安装逻辑
    // 由外部hub处理，这里注册
    console.log(`[SkillManager] Installing from ${repoUrl} to ${targetDir}`);
  }

  async shutdown() {
    // 清理所有 Kasm 工作区
    if (this.kasmAdapter) {
      try {
        const workspaces = this.kasmAdapter.getWorkspaceManager().listWorkspaces();
        for (const ws of workspaces) {
          await this.kasmAdapter.cleanupEnvironment(ws.agentId);
        }
        console.log('[SkillManager] Cleaned up all Kasm workspaces');
      } catch (error) {
        console.warn('[SkillManager] Error cleaning up Kasm workspaces:', error.message);
      }
    }
    
    // 清理所有技能模块
    this.skills.clear();
  }
}

module.exports = { SkillManager };
