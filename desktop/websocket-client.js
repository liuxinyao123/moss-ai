/**
 * DSclaw WebSocket 客户端
 * 实时通信、在线状态、消息推送
 */

class WebSocketClient {
    constructor(backendUrl = 'http://localhost:3001') {
        this.backendUrl = backendUrl;
        this.ws = null;
        this.clientId = null;
        this.agentId = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        
        this.messageHandlers = new Map();
        this.onlineAgents = new Map();
        this.subscribedChannels = new Set();
        
        this.setupEventHandlers();
    }
    
    // 连接到服务器
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('📡 WebSocket 已连接');
            return;
        }
        
        const wsUrl = this.backendUrl.replace('http', 'ws') + '/ws';
        console.log(`📡 连接到 WebSocket: ${wsUrl}`);
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocket();
        } catch (error) {
            console.error('WebSocket 连接失败:', error);
            this.scheduleReconnect();
        }
    }
    
    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // 触发连接事件
            this.triggerEvent('connected', {});
            
            // 如果已有认证信息，重新认证
            if (this.agentId) {
                this.sendAuth(this.agentId);
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('消息解析错误:', error, event.data);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log(`🔴 WebSocket 断开连接: ${event.code} ${event.reason}`);
            this.isConnected = false;
            
            // 触发断开事件
            this.triggerEvent('disconnected', { code: event.code, reason: event.reason });
            
            // 尝试重连
            this.scheduleReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            this.triggerEvent('error', { error });
        };
    }
    
    // 处理消息
    handleMessage(message) {
        console.log('📨 收到消息:', message.type, message);
        
        switch (message.type) {
            case 'welcome':
                this.clientId = message.clientId;
                console.log(`🆔 客户端ID: ${this.clientId}`);
                break;
                
            case 'auth_success':
                this.agentId = message.agentId;
                console.log(`✅ 认证成功: ${this.agentId}`);
                this.triggerEvent('auth_success', message);
                break;
                
            case 'online_agents':
                this.updateOnlineAgents(message.agents);
                this.triggerEvent('online_agents', message);
                break;
                
            case 'agent_online':
                this.handleAgentOnline(message.agentId);
                this.triggerEvent('agent_online', message);
                break;
                
            case 'agent_offline':
                this.handleAgentOffline(message.agentId);
                this.triggerEvent('agent_offline', message);
                break;
                
            case 'subscribed_channels':
                message.channels.forEach(channel => {
                    this.subscribedChannels.add(channel.id);
                });
                this.triggerEvent('subscribed_channels', message);
                break;
                
            case 'subscribe_success':
                this.subscribedChannels.add(message.channelId);
                this.triggerEvent('subscribe_success', message);
                break;
                
            case 'unsubscribe_success':
                this.subscribedChannels.delete(message.channelId);
                this.triggerEvent('unsubscribe_success', message);
                break;
                
            case 'channel_message':
                this.triggerEvent('channel_message', message);
                break;
                
            case 'new_subscriber':
                this.triggerEvent('new_subscriber', message);
                break;
                
            case 'unsubscribed':
                this.triggerEvent('unsubscribed', message);
                break;
                
            case 'channel_history':
                this.triggerEvent('channel_history', message);
                break;
                
            case 'message_sent':
                this.triggerEvent('message_sent', message);
                break;
                
            case 'error':
                console.error('服务器错误:', message.error);
                this.triggerEvent('error', message);
                break;
                
            case 'pong':
                // 心跳响应
                break;
                
            default:
                console.log('未知消息类型:', message.type);
        }
        
        // 触发特定类型的处理器
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => handler(message));
        }
    }
    
    // 发送认证
    sendAuth(agentId) {
        if (!this.isConnected) {
            console.error('未连接到服务器');
            return false;
        }
        
        this.send({
            type: 'auth',
            agentId,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    // 订阅频道
    subscribeChannel(channelId) {
        if (!this.isConnected || !this.agentId) {
            console.error('请先连接并认证');
            return false;
        }
        
        this.send({
            type: 'subscribe_channel',
            channelId,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    // 取消订阅
    unsubscribeChannel(channelId) {
        if (!this.isConnected) {
            return false;
        }
        
        this.send({
            type: 'unsubscribe_channel',
            channelId,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    // 发送频道消息
    sendChannelMessage(channelId, content) {
        if (!this.isConnected || !this.agentId) {
            console.error('请先连接并认证');
            return false;
        }
        
        this.send({
            type: 'channel_message',
            channelId,
            content,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    // 发送消息
    send(message) {
        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket 未连接');
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('发送消息失败:', error);
            return false;
        }
    }
    
    // 断开连接
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.triggerEvent('disconnected', {});
    }
    
    // 重连机制
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ 重连失败，已尝试 ${this.reconnectAttempts} 次`);
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        console.log(`⏳ ${this.reconnectAttempts}/${this.maxReconnectAttempts} 尝试重连，等待 ${delay}ms...`);
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
    
    // 心跳
    startHeartbeat(interval = 30000) {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, interval);
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    // 在线状态管理
    updateOnlineAgents(agents) {
        this.onlineAgents.clear();
        agents.forEach(agent => {
            this.onlineAgents.set(agent.agentId, agent);
        });
    }
    
    handleAgentOnline(agentId) {
        this.onlineAgents.set(agentId, {
            agentId,
            lastSeen: Date.now(),
            online: true
        });
    }
    
    handleAgentOffline(agentId) {
        this.onlineAgents.delete(agentId);
    }
    
    getOnlineAgents() {
        return Array.from(this.onlineAgents.values());
    }
    
    isAgentOnline(agentId) {
        return this.onlineAgents.has(agentId);
    }
    
    // 事件处理
    setupEventHandlers() {
        // 默认事件处理器
        this.on('connected', () => {
            console.log('🎉 WebSocket 连接成功');
        });
        
        this.on('disconnected', () => {
            console.log('🔴 WebSocket 断开连接');
        });
        
        this.on('channel_message', (message) => {
            console.log(`📨 频道消息 [${message.channelId}]: ${message.content}`);
        });
        
        this.on('agent_online', (message) => {
            console.log(`🟢 智能体上线: ${message.agentId}`);
        });
        
        this.on('agent_offline', (message) => {
            console.log(`🔴 智能体下线: ${message.agentId}`);
        });
    }
    
    // 事件监听
    on(eventType, handler) {
        if (!this.messageHandlers.has(eventType)) {
            this.messageHandlers.set(eventType, new Set());
        }
        this.messageHandlers.get(eventType).add(handler);
    }
    
    off(eventType, handler) {
        const handlers = this.messageHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    
    triggerEvent(eventType, data) {
        const handlers = this.messageHandlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }
    
    // 状态查询
    getStatus() {
        return {
            isConnected: this.isConnected,
            clientId: this.clientId,
            agentId: this.agentId,
            onlineAgents: this.getOnlineAgents(),
            subscribedChannels: Array.from(this.subscribedChannels),
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.WebSocketClient = WebSocketClient;
}

// 在浏览器渲染进程里不存在 CommonJS module，避免抛错导致后续脚本状态异常
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
}