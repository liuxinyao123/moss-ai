/**
 * DSclaw - 协作WebSocket服务器
 * 
 * 实时推送协作事件：
 * - 消息投递状态
 * - 任务进度更新
 * - Agent在线状态
 * - 能力变化
 */

const WebSocket = require('ws');

class CollaborationWebSocket {
    constructor(server, collaborationAPI) {
        // 使用 noServer 模式：由主 HTTP server 的 upgrade 事件统一路由
        this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
        this.clients = new Map(); // clientId -> { ws, subscriptions }
        this.collaborationAPI = collaborationAPI;
        
        this.setupWebSocket();
        this.setupEventListeners();
    }

    handleUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
        });
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            
            console.log(`📡 协作WebSocket客户端连接: ${clientId}`);
            
            // 初始化客户端
            this.clients.set(clientId, {
                ws,
                subscriptions: new Set(),
                agentId: null,
                connectedAt: new Date()
            });
            
            // 发送欢迎消息
            this.sendToClient(clientId, {
                type: 'connected',
                clientId,
                timestamp: new Date().toISOString()
            });
            
            // 处理消息
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleClientMessage(clientId, message);
                } catch (error) {
                    console.error(`消息解析失败: ${error.message}`);
                }
            });
            
            // 处理断开
            ws.on('close', () => {
                this.handleClientDisconnect(clientId);
            });
            
            // 处理错误
            ws.on('error', (error) => {
                console.error(`WebSocket错误: ${error.message}`);
            });
        });
    }
    
    // 设置事件监听器
    setupEventListeners() {
        // 监听消息发送
        this.collaborationAPI.messageRouter.registerHandler('__websocket__', (message) => {
            this.broadcastEvent({
                type: 'message_sent',
                message,
                timestamp: new Date().toISOString()
            });
        });
    }
    
    // 处理客户端消息
    handleClientMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        switch (message.type) {
            case 'subscribe':
                // 订阅事件
                this.subscribeToEvents(clientId, message.events);
                break;
            
            case 'unsubscribe':
                // 取消订阅
                this.unsubscribeFromEvents(clientId, message.events);
                break;
            
            case 'register_agent':
                // 注册Agent
                client.agentId = message.agentId;
                this.broadcastAgentStatus(message.agentId, true);
                break;
            
            case 'get_status':
                // 获取状态
                this.sendToClient(clientId, {
                    type: 'status',
                    clientId,
                    agentId: client.agentId,
                    subscriptions: Array.from(client.subscriptions),
                    connectedAt: client.connectedAt
                });
                break;
            
            case 'ping':
                // 心跳
                this.sendToClient(clientId, { type: 'pong' });
                break;
            
            default:
                console.warn(`未知消息类型: ${message.type}`);
        }
    }
    
    // 订阅事件
    subscribeToEvents(clientId, events) {
        const client = { ...this.clients.get(clientId) };
        if (!client) return;
        
        events.forEach(event => {
            client.subscriptions.add(event);
        });
        
        this.clients.set(clientId, client);
        
        this.sendToClient(clientId, {
            type: 'subscribed',
            events,
            timestamp: new Date().toISOString()
        });
    }
    
    // 取消订阅
    unsubscribeFromEvents(clientId, events) {
        const client = { ...this.clients.get(clientId) };
        if (!client) return;
        
        events.forEach(event => {
            client.subscriptions.delete(event);
        });
        
        this.clients.set(clientId, client);
        
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            events,
            timestamp: new Date().toISOString()
        });
    }
    
    // 处理客户端断开
    handleClientDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        console.log(`📡 协作WebSocket客户端断开: ${clientId}`);
        
        // 广播Agent离线
        if (client.agentId) {
            this.broadcastAgentStatus(client.agentId, false);
        }
        
        this.clients.delete(clientId);
    }
    
    // 发送消息到客户端
    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        client.ws.send(JSON.stringify(data));
    }
    
    // 广播事件
    broadcastEvent(event) {
        const eventData = JSON.stringify(event);
        
        this.clients.forEach((client, clientId) => {
            if (client.ws.readyState !== WebSocket.OPEN) {
                return;
            }
            
            // 检查订阅
            if (client.subscriptions.has('*') || client.subscriptions.has(event.type)) {
                client.ws.send(eventData);
            }
        });
    }
    
    // 广播Agent状态
    broadcastAgentStatus(agentId, isOnline) {
        this.broadcastEvent({
            type: 'agent_status',
            agentId,
            is_online: isOnline,
            timestamp: new Date().toISOString()
        });
    }
    
    // 广布消息状态
    broadcastMessageStatus(messageId, status) {
        this.broadcastEvent({
            type: 'message_status',
            messageId,
            status,
            timestamp: new Date().toISOString()
        });
    }
    
    // 广布任务进度
    broadcastTaskProgress(taskId, progress) {
        this.broadcastEvent({
            type: 'task_progress',
            taskId,
            progress,
            timestamp: new Date().toISOString()
        });
    }
    
    // 广布子任务状态
    broadcastSubtaskStatus(taskId, subtaskId, status) {
        this.broadcastEvent({
            type: 'subtask_status',
            taskId,
            subtaskId,
            status,
            timestamp: new Date().toISOString()
        });
    }
    
    // 广布能力变化
    broadcastAbilityChange(agentId, ability) {
        this.broadcastEvent({
            type: 'ability_changed',
            agentId,
            ability,
            timestamp: new Date().toISOString()
        });
    }
    
    // 广布委托事件
    broadcastDelegationEvent(eventType, data) {
        this.broadcastEvent({
            type: 'delegation_event',
            eventType,
            data,
            timestamp: new Date().toISOString()
        });
    }
    
    // 获取在线客户端数
    getOnlineClientCount() {
        return this.clients.size;
    }
    
    // 获取在线Agent列表
    getOnlineAgents() {
        const onlineAgents = new Set();
        
        this.clients.forEach(client => {
            if (client.agentId) {
                onlineAgents.add(client.agentId);
            }
        });
        
        return Array.from(onlineAgents);
    }
    
    // 发送消息到指定Agent的所有客户端
    sendToAgent(agentId, data) {
        this.clients.forEach((client, clientId) => {
            if (client.agentId === agentId) {
                this.sendToClient(clientId, data);
            }
        });
    }
    
    // 生成客户端ID
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // 获取统计信息
    getStats() {
        const onlineAgents = this.getOnlineAgents();
        
        return {
            connected_clients: this.clients.size,
            online_agents: onlineAgents.length,
            agent_list: onlineAgents
        };
    }
}

module.exports = CollaborationWebSocket;
