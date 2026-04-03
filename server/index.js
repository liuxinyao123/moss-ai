/**
 * DSClaw — 可选 v2 引擎入口（npm run start:engine）
 *
 * 与 ClawX 主路线无关时仍可用于实验：Core 编排 + Hub 后台任务 + 子集 HTTP/WebSocket。
 * 桌面端与 OpenClaw 全量 API 以 backend/server.js（npm start）为准，勿与本进程同端口并行。
 */

const { Engine } = require('../core/engine');
const { Hub } = require('../hub/Hub');
const { Sandbox } = require('../lib/sandbox/Sandbox');
const { PersonalityManager } = require('../lib/identity/PersonalityManager');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

class DsclawServer {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.host = options.host || 'localhost';
    this.engine = null;
    this.hub = null;
    this.sandbox = null;
    this.personalityManager = null;
    this.app = express();
    this.server = null;
    this.wss = null;
    this.initialized = false;
  }

  /**
   * 初始化所有模块
   */
  async initialize() {
    console.log('🚀 Initializing DSClaw engine server...');

    // 初始化沙箱
    this.sandbox = new Sandbox();
    console.log(`✅ Sandbox initialized, OS sandbox available: ${this.sandbox.isOsSandboxAvailable()}`);

    // 初始化人格管理器
    this.personalityManager = new PersonalityManager();
    this.personalityManager.initialize();
    console.log(`✅ PersonalityManager initialized, ${this.personalityManager.listTemplates().length} templates loaded`);

    // 初始化核心引擎
    this.engine = new Engine();
    await this.engine.initialize();
    const api = this.engine.getApi();
    console.log('✅ Core Engine initialized');

    // 初始化Hub（后台任务）
    this.hub = new Hub(api);
    await this.hub.initialize();
    console.log('✅ Hub started, background tasks running');

    // 设置Express
    this.setupExpress();
    
    this.initialized = true;
    console.log(`🎉 DSClaw engine initialization complete`);
  }

  /**
   * 设置Express中间件和路由
   */
  setupExpress() {
    this.app.use(express.json({ limit: '100mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    const fs = require('fs');
    const os = require('os');
    const HOME_DIR = os.homedir();
    const buildSkillExpertPersona = (skillInfo = {}) => {
      const skillName = String(skillInfo.name || '该技能');
      const skillDesc = String(skillInfo.description || '').trim();
      const version = String(skillInfo.version || '').trim();

      const manifest = skillInfo.manifest || {};
      const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
      const params = Array.isArray(manifest.parameters) ? manifest.parameters : [];
      const requiredParams = params
        .filter(p => p && p.required)
        .map(p => String(p.name || ''))
        .filter(Boolean);

      const optionalParams = params
        .filter(p => p && !p.required)
        .map(p => String(p.name || ''))
        .filter(Boolean);

      const capabilitiesLine = capabilities.length
        ? `你擅长的能力：${capabilities.join('、')}`
        : '你可以在需要时发挥该技能的领域能力。';

      const requiredParamsLine = requiredParams.length
        ? `当信息不足以执行时，先向用户确认这些“必填参数”：${requiredParams.join('、')}`
        : '当信息不足以给出结果时，先向用户提出澄清问题。';

      const optionalParamsLine = optionalParams.length
        ? `当用户愿意补充更多细节时，可以使用这些“可选参数”：${optionalParams.slice(0, 10).join('、')}${optionalParams.length > 10 ? '（省略）' : ''}`
        : '';

      const meta = [version ? `（版本：${version}）` : ''].filter(Boolean).join('');
      const descPart = skillDesc ? `\n\n你的目标：${skillDesc}` : '';

      return `你是「${skillName}」领域专家${meta}${descPart}\n\n${capabilitiesLine}\n${requiredParamsLine}${optionalParamsLine ? '\n' + optionalParamsLine : ''}\n\n你的回答必须遵循以下步骤：\n1. 先复述用户需求/目标（用 1-2 句话，不要长篇）\n2. 判断是否需要该技能的能力来解决；若需要则按能力给出“结构化答案”\n3. 若缺少必填参数，优先向用户提问：只列参数名 + 每个参数一句说明（不要推测用户的值）\n4. 给出最终建议/方案，并在最后用 1-3 条要点总结\n\n输出格式（严格保持）：\n- 结论：\n- 依据/步骤：\n- 如需用户补充：\n- 下一步建议：`;
    };

    const replacePersonaSectionInIdentity = (identityText = '', personaText = '') => {
      const text = String(identityText || '');
      const persona = String(personaText || '').trim();
      if (!persona) return text;

      // 删除所有“## 人设 ... 下一个 ## ... 或文件末尾”块，再在第一个位置插入一份
      const reAll = /^## 人设[\s\S]*?(?=^## |\Z)/gm;
      const matches = [...text.matchAll(reAll)];
      if (matches.length === 0) {
        const suffix = `\n\n## 人设\n${persona}\n`;
        return text.trimEnd() + suffix;
      }

      const first = matches[0];
      const prefix = text.slice(0, first.index);
      const afterFirst = text.slice(first.index + first[0].length);
      const afterFirstClean = afterFirst.replace(reAll, '').trimStart();

      return `${prefix.trimEnd()}\n\n## 人设\n${persona}\n\n${afterFirstClean}`.trimEnd();
    };

    // API路由
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        initialized: this.initialized,
        timestamp: Date.now(),
        version: '2.0.0'
      });
    });

    // 健康检查页面
    this.app.get('/health', (req, res) => {
      res.sendFile(path.join(__dirname, '../../health.html'));
    });

    // 核心API
    this.app.get('/api/agents', (req, res) => {
      const api = this.engine.getApi();
      res.json({ agents: api.agents.listAgents() });
    });

    // Debug probe: verify server/index.js code is loaded
    console.log('[DEBUG] server/index.js routes mounted');
    this.app.get('/__debug_skill_to_expert', (_req, res) => {
      res.json({ ok: true, route: 'debug-probe' });
    });

    this.app.get('/api/skills', (req, res) => {
      const api = this.engine.getApi();
      res.json({ skills: api.skills.listSkills() });
    });

    // 由 skill 生成专家人设（A 方案：persona/identity 注入）
    this.app.post('/api/agents/:agentId/skill-to-expert', async (req, res) => {
      try {
        const { agentId } = req.params;
        const { skillId } = req.body || {};

        if (!skillId) {
          res.status(400).json({ success: false, error: '需要 skillId' });
          return;
        }

        const api = this.engine.getApi();
        const skillInfo = api.skills.getSkill(skillId);
        if (!skillInfo) {
          res.status(404).json({ success: false, error: '技能不存在' });
          return;
        }

        const personaText = buildSkillExpertPersona(skillInfo);

        const agentManager = api.agents;
        const agentConfig = agentManager.getAgent(agentId);
        if (!agentConfig) {
          res.status(404).json({ success: false, error: 'Agent 不存在' });
          return;
        }

        // 1) 更新 config.json（给 UI 展示 persona 字段用）
        agentConfig.persona = personaText;
        if (!agentConfig.description || agentConfig.description === 'assistant') {
          agentConfig.description = personaText.slice(0, 100);
        }
        agentConfig.updated_at = new Date().toISOString();
        agentManager.saveAgent(agentConfig);

        // 2) 更新 identity.md（给系统提示词拼装用）
        const agentDir = path.join(agentManager.agentsDir, agentId);
        const identityPath = path.join(agentDir, 'identity.md');
        if (fs.existsSync(identityPath)) {
          const oldIdentity = fs.readFileSync(identityPath, 'utf-8');
          const nextIdentity = replacePersonaSectionInIdentity(oldIdentity, personaText);
          fs.writeFileSync(identityPath, nextIdentity, 'utf-8');
        }

        res.json({ success: true, updated: true, persona: personaText });
      } catch (e) {
        res.status(500).json({ success: false, error: e?.message || 'skill-to-expert 失败' });
      }
    });

    this.app.get('/api/personality/templates', (req, res) => {
      res.json({ templates: this.personalityManager.listTemplates() });
    });

    this.app.get('/api/sandbox/rules', (req, res) => {
      res.json({ rules: this.sandbox.getRules() });
    });

    // ========== Desk API ==========
    // 列出Desk文件
    this.app.get('/api/desk/:agentId/list', (req, res) => {
      try {
        const { agentId } = req.params;
        const { path: subpath } = req.query;
        
        const api = this.engine.getApi();
        const agent = api.agents.getAgent(agentId);
        if (!agent) {
          return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const deskPath = api.agents.getAgentDeskPath(agentId);
        const fullPath = subpath ? path.join(deskPath, subpath) : deskPath;
        
        const fs = require('fs');
        const { readdirSync, statSync } = fs;
        
        const items = readdirSync(fullPath);
        const files = items.map(name => {
          const itemPath = path.join(fullPath, name);
          const stat = statSync(itemPath);
          const ext = path.extname(name).toLowerCase();
          const mimeTypes = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.json': 'application/json',
            '.js': 'text/javascript',
            '.html': 'text/html',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
          };
          
          return {
            name,
            isDirectory: stat.isDirectory(),
            size: stat.size,
            lastModified: stat.mtimeMs,
            type: mimeTypes[ext] || 'application/octet-stream'
          };
        });
        
        res.json({ success: true, agentId, path: subpath || '', files });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 下载文件
    this.app.get('/api/desk/:agentId/download', (req, res) => {
      try {
        const { agentId } = req.params;
        const { path: subpath } = req.query;
        
        const api = this.engine.getApi();
        const agent = api.agents.getAgent(agentId);
        if (!agent) {
          return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const deskPath = api.agents.getAgentDeskPath(agentId);
        const fullPath = subpath ? path.join(deskPath, subpath) : null;
        
        if (!fullPath || !this.sandbox.canRead(fullPath)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        const fs = require('fs');
        if (!fs.existsSync(fullPath)) {
          return res.status(404).json({ success: false, error: 'File not found' });
        }
        
        res.sendFile(fullPath);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 上传文件
    const multer = require('multer');
    const upload = multer({ storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const { agentId } = req.params;
        const { path: subpath } = req.query;
        const api = this.engine.getApi();
        const agent = api.agents.getAgent(agentId);
        const deskPath = api.agents.getAgentDeskPath(agentId);
        const fullPath = subpath ? path.join(deskPath, subpath) : deskPath;
        const fs = require('fs');
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
        cb(null, fullPath);
      },
      filename: (req, file, cb) => {
        // 保留原始文件名
        cb(null, file.originalname.replace(/\s+/g, '-'));
      }
    }) });

    this.app.post('/api/desk/:agentId/upload', upload.array('files'), (req, res) => {
      try {
        const { agentId } = req.params;
        const api = this.engine.getApi();
        const agent = api.agents.getAgent(agentId);
        if (!agent) {
          return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const uploaded = req.files ? req.files.length : 0;
        res.json({ success: true, agentId, uploaded });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 错误处理
    this.app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: err.message });
    });
  }

  /**
   * 设置WebSocket
   */
  setupWebSocket(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws) => {
      console.log('[WS] New connection');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(ws, message);
        } catch (e) {
          ws.send(JSON.stringify({
            error: 'Invalid JSON',
            message: e.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('[WS] Connection closed');
      });

      // 发送欢迎
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to DSClaw engine',
        version: '2.0.0'
      }));
    });

    console.log('[WS] WebSocket server started');
  }

  /**
   * 处理WebSocket消息
   */
  handleWebSocketMessage(ws, message) {
    // 这里处理各个类型的消息
    // 转发到对应的处理器
    const eventBus = this.hub.getEventBus();
    eventBus.emit('ws:message', { ws, message });
  }

  /**
   * 广播给所有连接
   */
  broadcast(message) {
    if (!this.wss) return;
    
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * 启动服务
   */
  start() {
    this.server = http.createServer(this.app);
    this.setupWebSocket(this.server);

    this.server.listen(this.port, this.host, () => {
      console.log(`🚀 DSClaw engine server at http://${this.host}:${this.port}`);
      console.log(`📊 Health check: http://${this.host}:${this.port}/health`);
    });
  }

  /**
   * 停止服务
   */
  async stop() {
    console.log('🛑 Stopping DSClaw engine server...');
    
    if (this.wss) {
      this.wss.close();
    }

    if (this.hub) {
      await this.hub.shutdown();
    }

    if (this.engine) {
      await this.engine.shutdown();
    }

    if (this.server) {
      this.server.close();
    }

    this.initialized = false;
    console.log('✅ Server stopped');
  }

  /**
   * 获取API
   */
  getApi() {
    return {
      engine: this.engine,
      hub: this.hub,
      sandbox: this.sandbox,
      personalityManager: this.personalityManager,
      server: this.server
    };
  }
}

// 如果直接运行则启动
if (require.main === module) {
  const server = new DsclawServer();
  server.initialize().then(() => {
    server.start();
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT');
    await server.stop();
    process.exit(0);
  });
}

module.exports = { DsclawServer };
