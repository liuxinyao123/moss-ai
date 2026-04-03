/**
 * DSclaw - 多智能体管理系统
 * 支持：多Agent运行、互相委托、频道群聊、协作订阅
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class MultiAgentManager extends EventEmitter {
    constructor(workspaceRoot) {
        super();
        this.workspaceRoot = workspaceRoot;
        this.agents = new Map(); // agentId -> { config, engine, memory, etc. }
        this.channels = new Map(); // channelId -> { subscribers: Set<agentId>, history: [] }
        
        this.loadAgents();
    }
    
    // 加载所有Agent配置
    loadAgents() {
        const agentsDir = path.join(this.workspaceRoot, 'agents');
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
            return;
        }
        
        const agentDirs = fs.readdirSync(agentsDir);
        
        agentDirs.forEach(agentDirName => {
            const agentPath = path.join(agentsDir, agentDirName);
            if (fs.statSync(agentPath).isDirectory()) {
                this.loadAgent(agentDirName);
            }
        });
    }
    
    // 加载单个Agent
    async loadAgent(agentId) {
        const agentDir = path.join(this.workspaceRoot, 'agents', agentId);
        const configPath = path.join(agentDir, 'config.json');
        
        if (!fs.existsSync(configPath)) {
            console.warn(`⚠️ Agent ${agentId} 缺少配置文件`);
            return;
        }
        
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            
            // 创建Agent实例
            const agent = {
                id: agentId,
                dir: agentDir,
                config: config,
                engine: null,
                memory: null,
                tools: null,
                status: 'loading'
            };
            
            // 初始化组件
            const { Engine } = require('./engine');
            const { MemoryManager } = require('../lib/memory');
            const { ToolManager } = require('../lib/tools');
            
            agent.memory = new MemoryManager(agentDir);
            agent.tools = new ToolManager(agentDir);
            agent.engine = new Engine(agent.memory, agent.tools);
            
            agent.status = 'ready';
            this.agents.set(agentId, agent);
            
            console.log(`✅ Agent ${agentId} 加载完成`);
            this.emit('agentLoaded', agentId);
            
        } catch (error) {
            console.error(`❌ Agent ${agentId} 加载失败:`, error);
        }
    }
    
    // 创建新Agent
    async createAgent(agentId, config = {}) {
        if (this.agents.has(agentId)) {
            throw new Error(`Agent ${agentId} 已存在`);
        }
        
        const agentDir = path.join(this.workspaceRoot, 'agents', agentId);
        
        // 创建Agent目录结构
        fs.mkdirSync(agentDir, { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'desk'), { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'memory'), { recursive: true });
        fs.mkdirSync(path.join(agentDir, 'tools'), { recursive: true });
        
        // 默认配置
        const defaultConfig = {
            name: agentId,
            model: "deepseek-v3.2",
            personality: "assistant",
            capabilities: ["chat", "file_read", "web_search"],
            channels: [],
            created_at: new Date().toISOString()
        };
        
        const finalConfig = { ...defaultConfig, ...config };
        
        // 保存配置
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify(finalConfig, null, 2),
            'utf-8'
        );
        
        // 创建身份文件
        fs.writeFileSync(
            path.join(agentDir, 'identity.md'),
            `# ${finalConfig.name}\n\n身份: ${finalConfig.personality}\n模型: ${finalConfig.model}\n创建时间: ${finalConfig.created_at}`,
            'utf-8'
        );
        
        // 加载Agent
        await this.loadAgent(agentId);
        
        return this.agents.get(agentId);
    }
    
    // 获取Agent列表
    listAgents() {
        return Array.from(this.agents.values()).map(agent => ({
            id: agent.id,
            name: agent.config.name,
            model: agent.config.model,
            personality: agent.config.personality,
            status: agent.status,
            capabilities: agent.config.capabilities
        }));
    }
    
    // 获取Agent
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    
    // 委托任务到其他Agent
    async delegateTask(fromAgentId, toAgentId, task, context = {}) {
        const fromAgent = this.getAgent(fromAgentId);
        const toAgent = this.getAgent(toAgentId);
        
        if (!fromAgent || !toAgent) {
            throw new Error('Agent 不存在');
        }
        
        if (toAgent.status !== 'ready') {
            throw new Error(`Agent ${toAgentId} 状态不可用: ${toAgent.status}`);
        }
        
        console.log(`🔄 ${fromAgentId} -> ${toAgentId}: ${task.substring(0, 50)}...`);
        
        // 构建委托消息
        const message = `## 任务委托\n\n**委托者**: ${fromAgent.config.name}\n**任务**: ${task}\n\n**上下文**:\n${JSON.stringify(context, null, 2)}\n\n请处理此任务。`;
        
        // 发送到目标Agent
        try {
            const response = await toAgent.engine.process(message, {
            delegate: true,
            fromAgent: fromAgentId
        });
        
        console.log(`✅ ${toAgentId} 完成任务: ${response.substring(0, 30)}...`);
        
        // 记录委托历史
        this.recordDelegation(fromAgentId, toAgentId, task, response);
        
        return response;
        } catch (error) {
            console.error(`❌ 委托失败: ${error.message}`);
            throw error;
        }
    }
    
    // 记录委托历史
    recordDelegation(fromAgentId, toAgentId, task, response) {
        const historyPath = path.join(this.workspaceRoot, 'delegation-history.json');
        let history = [];
        
        if (fs.existsSync(historyPath)) {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        }
        
        history.push({
            id: `delegation-${Date.now()}`,
            fromAgent: fromAgentId,
            toAgent: toAgentId,
            task: task,
            response: response,
            timestamp: new Date().toISOString()
        });
        
        // 只保留最近100条记录
        if (history.length > 100) {
            history = history.slice(-100);
        }
        
        fs.writeFileSync(
            historyPath,
            JSON.stringify(history, null, 2),
            'utf-8'
        );
    }
    
    // 频道管理
    createChannel(channelId, name, description = '') {
        if (this.channels.has(channelId)) {
            throw new Error(`频道 ${channelId} 已存在`);
        }
        
        const channel = {
            id: channelId,
            name,
            description,
            subscribers: new Set(),
            history: [],
            created_at: new Date().toISOString()
        };
        
        this.channels.set(channelId, channel);
        
        // 创建频道文件
        const channelsDir = path.join(this.workspaceRoot, 'channels');
        fs.mkdirSync(channelsDir, { recursive: true });
        
        const channelFile = path.join(channelsDir, `${channelId}.json`);
        fs.writeFileSync(
            channelFile,
            JSON.stringify(channel, null, 2),
            'utf-8'
        );
        
        console.log(`✅ 频道 ${name} 创建完成`);
        
        return channel;
    }
    
    // 订阅频道
    subscribeAgentToChannel(agentId, channelId) {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`频道 ${channelId} 不存在`);
        }
        
        channel.subscribers.add(agentId);
        
        // 更新频道文件
        const channelFile = path.join(this.workspaceRoot, 'channels', `${channelId}.json`);
        if (fs.existsSync(channelFile)) {
            const data = JSON.parse(fs.readFileSync(channelFile, 'utf-8'));
            data.subscribers = Array.from(channel.subscribers);
            fs.writeFileSync(channelFile, JSON.stringify(data, null, 2), 'utf-8');
        }
        
        console.log(`📡 ${agentId} 订阅频道 ${channel.name}`);
    }
    
    // 发送消息到频道
    async sendMessageToChannel(agentId, channelId, message) {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`频道 ${channelId} 不存在`);
        }
        
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} 不存在`);
        }
        
        // 添加到频道历史
        channel.history.push({
            from: agentId,
            message,
            timestamp: new Date().toISOString()
        });
        
        // 只保留最近100条消息
        if (channel.history.length > 100) {
            channel.history = channel.history.slice(-100);
        }
        
        // 通知所有订阅者
        channel.subscribers.forEach(subscriberId => {
            if (subscriberId !== agentId) {
                this.notifySubscriber(subscriberId, channelId, agentId, message);
            }
        });
        
        // 保存频道状态
        const channelFile = path.join(this.workspaceRoot, 'channels', `${channelId}.json`);
        const data = {
            ...channel,
            subscribers: Array.from(channel.subscribers),
            history: channel.history
        };
        fs.writeFileSync(channelFile, JSON.stringify(data, null, 2), 'utf-8');
        
        return { success: true, subscribers: channel.subscribers.size };
    }
    
    // 通知订阅者
    async notifySubscriber(agentId, channelId, fromAgentId, message) {
        const agent = this.getAgent(agentId);
        if (!agent || agent.status !== 'ready') {
            return;
        }
        
        const channel = this.channels.get(channelId);
        const fromAgent = this.getAgent(fromAgentId);
        
        const notification = `## 📡 频道消息\n\n**频道**: ${channel.name}\n**发件人**: ${fromAgent.config.name}\n\n${message}`;
        
        // 这里可以调用Agent的处理逻辑
        console.log(`📢 通知 ${agentId}: ${notification.substring(0, 50)}...`);
        
        // 可以选择性地让Agent自动处理或只是记录
        agent.engine.process(notification, {
            source: 'channel',
            channel: channelId,
            from: fromAgentId
        }).catch(err => {
            console.error(`通知处理失败: ${err.message}`);
        });
    }
    
    // 获取频道列表
    listChannels() {
        return Array.from(this.channels.values()).map(channel => ({
            id: channel.id,
            name: channel.name,
            description: channel.description,
            subscribers: channel.subscribers.size,
            history_count: channel.history.length
        }));
    }
}

module.exports = MultiAgentManager;
