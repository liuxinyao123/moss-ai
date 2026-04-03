/**
 * DSclaw - Agent Manager
 * 
 * 支持多个独立 Agent，每个 Agent 是一个独立文件夹：
 * - agents/
 *   ├── my-agent/
 *   │   ├── identity.md     角色设定
 *   │   ├── ishiki.md      意识/价值观
 *   │   ├── pinned.md      永久置顶记忆
 *   │   ├── yuan.md        缘分记录
 *   │   ├── config.yaml    配置
 *   │   ├── skills/        自学技能
 *   │   ├── memory/       记忆文件 (today.md, week.md, longterm.md, facts.md)
 *   │   └── desk/         书桌工作区
 */

const fs = require('fs');
const path = require('path');

class AgentManager {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot || path.join(require('os').homedir(), '.openclaw', 'moss-ai', 'agents');
        this.agentsDir = this.workspaceRoot;
        
        // Ensure directory exists
        if (!fs.existsSync(this.agentsDir)) {
            fs.mkdirSync(this.agentsDir, { recursive: true });
        }
    }
    
    // List all agents
    listAgents() {
        try {
            const items = fs.readdirSync(this.agentsDir);
            return items.filter(item => {
                const stat = fs.statSync(path.join(this.agentsDir, item));
                return stat.isDirectory();
            });
        } catch (e) {
            return [];
        }
    }
    
    // Get agent info
    getAgent(agentId) {
        const agentDir = path.join(this.agentsDir, agentId);
        if (!fs.existsSync(agentDir)) {
            return null;
        }
        
        // Read all personalized files
        const readFile = (name) => {
            const filePath = path.join(agentDir, name);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
            return '';
        };
        
        // Read config.yaml if exists
        let config = {};
        const configYaml = readFile('config.yaml');
        if (configYaml) {
            try {
                // Simple yaml parse
                config = JSON.parse(JSON.stringify(require('yaml').parse(configYaml)));
            } catch(e) {}
        }
        
        return {
            id: agentId,
            dir: agentDir,
            identity: readFile('identity.md'),
            ishiki: readFile('ishiki.md'),
            pinned: readFile('pinned.md'),
            yuan: readFile('yuan.md'),
            config,
            exists: true
        };
    }
    
    // Create new agent
    createAgent(agentId, config = {}) {
        const agentDir = path.join(this.agentsDir, agentId);
        if (fs.existsSync(agentDir)) {
            throw new Error(`Agent ${agentId} already exists`);
        }
        
        fs.mkdirSync(agentDir, { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'skills'), { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'desk'), { recursive: true });
        
        // Write default files
        const defaultIdentity = `# ${agentId}

**角色**: 个人AI助手
**风格**: 专业、简洁、高效
`;
        fs.writeFileSync(path.join(agentDir, 'identity.md'), defaultIdentity);
        
        const defaultIshiki = `# 意识

## 核心价值观
- 用户至上，帮助用户提升效率
- 诚实可信，不知道就说不知道
- 持续学习，不断改进
- 保护隐私，不泄露敏感信息
`;
        fs.writeFileSync(path.join(agentDir, 'ishiki.md'), defaultIshiki);
        
        fs.writeFileSync(path.join(agentDir, 'pinned.md'), '# 永久置顶记忆\n\n');
        fs.writeFileSync(path.join(agentDir, 'yuan.md'), '# 缘分记录\n\n');
        
        // Write default config
        const defaultConfig = {
            model: {
                chat: 'default',
                utility: 'default', 
                utility_large: 'default'
            },
            skills: {
                allow_github_fetch: false
            },
            sandbox: {
                enabled: true
            }
        };
        
        const yaml = require('yaml');
        fs.writeFileSync(path.join(agentDir, 'config.yaml'), yaml.stringify({...defaultConfig, ...config}));
        
        return this.getAgent(agentId);
    }
    
    // Get assembled system prompt for an agent
    assembleSystemPrompt(agentId) {
        const agent = this.getAgent(agentId);
        if (!agent) return null;
        
        let prompt = '';
        
        // 1. Identity
        if (agent.identity.trim()) {
            prompt += agent.identity + '\n\n';
        }
        
        // 2. Consciousness / Values
        if (agent.ishiki.trim()) {
            prompt += '## 行为准则\n\n' + agent.ishiki + '\n\n';
        }
        
        // 3. Pinned memory
        if (agent.pinned.trim()) {
            prompt += '## 永久记忆\n\n' + agent.pinned + '\n\n';
        }
        
        // 4. Compiled memory from memory system
        const memoryPath = path.join(agent.dir, 'memory', 'memory.md');
        if (fs.existsSync(memoryPath)) {
            const compiledMemory = fs.readFileSync(memoryPath, 'utf-8');
            if (compiledMemory.trim()) {
                prompt += '## 长期记忆\n\n' + compiledMemory + '\n\n';
            }
        }
        
        // 5. Yuan / Special relationships
        if (agent.yuan.trim()) {
            prompt += '## 缘分\n\n' + agent.yuan + '\n\n';
        }
        
        return prompt.trim();
    }
}

module.exports = AgentManager;
