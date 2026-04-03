/**
 * DSclaw WebSocket 服务器
 * 实现实时通信、在线状态、消息推送
 */

const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

class WebSocketServer {
    constructor(httpServer, dbPath) {
        // 使用 noServer 模式：由主 HTTP server 的 upgrade 事件统一路由，避免多个 wss 互相写同一 socket
        this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
        this.dbPath = dbPath;
        this.clients = new Map(); // clientId -> { ws, agentId, channels }
        this.onlineAgents = new Map(); // agentId -> { lastSeen, clientId }
        
        this.setupWebSocket();
        console.log('📡 WebSocket 服务器已启动');
    }

    handleUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
        });
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, request) => {
            const clientId = uuidv4();
            console.log(`🟢 客户端连接: ${clientId}`);
            
            this.clients.set(clientId, {
                ws,
                agentId: null,
                channels: new Set(),
                clientId
            });
            
            // 发送欢迎消息
            ws.send(JSON.stringify({
                type: 'welcome',
                clientId,
                timestamp: Date.now(),
                message: '连接到 DSclaw 实时服务器'
            }));
            
            // 处理消息
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(clientId, message);
                } catch (error) {
                    console.error('消息解析错误:', error);
                }
            });
            
            // 断开连接
            ws.on('close', () => {
                console.log(`🔴 客户端断开: ${clientId}`);
                const client = this.clients.get(clientId);
                if (client && client.agentId) {
                    this.handleAgentOffline(client.agentId, clientId);
                }
                this.clients.delete(clientId);
            });
            
            ws.on('error', (error) => {
                console.error(`WebSocket 错误 (${clientId}):`, error);
            });
        });
    }
    
    handleMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        switch (message.type) {
            case 'auth':
                this.handleAuth(clientId, message);
                break;
                
            case 'subscribe_channel':
                this.handleSubscribeChannel(clientId, message);
                break;
                
            case 'unsubscribe_channel':
                this.handleUnsubscribeChannel(clientId, message);
                break;
                
            case 'channel_message':
                this.handleChannelMessage(clientId, message);
                break;
                
            case 'ping':
                this.handlePing(clientId, message);
                break;
                
            default:
                console.log(`未知消息类型: ${message.type}`);
        }
    }
    
    // 认证
    async handleAuth(clientId, message) {
        const { agentId, token } = message;
        const client = this.clients.get(clientId);
        
        if (!agentId) {
            this.sendError(clientId, '缺少 agentId');
            return;
        }
        
        // 验证智能体存在（简化验证）
        const db = new sqlite3.Database(this.dbPath);
        db.get('SELECT id FROM agents WHERE id = ?', [agentId], (err, row) => {
            if (err || !row) {
                this.sendError(clientId, '智能体不存在');
                db.close();
                return;
            }
            
            // 更新客户端信息
            client.agentId = agentId;
            
            // 处理在线状态
            this.handleAgentOnline(agentId, clientId);
            
            // 发送认证成功
            client.ws.send(JSON.stringify({
                type: 'auth_success',
                agentId,
                clientId,
                timestamp: Date.now()
            }));
            
            // 发送在线智能体列表
            this.sendOnlineAgents(clientId);
            
            // 发送订阅的频道消息
            this.sendSubscribedChannels(clientId);
            
            db.close();
        });
    }
    
    // 智能体上线
    handleAgentOnline(agentId, clientId) {
        this.onlineAgents.set(agentId, {
            clientId,
            lastSeen: Date.now(),
            online: true
        });
        
        // 广播在线状态更新
        this.broadcast({
            type: 'agent_online',
            agentId,
            timestamp: Date.now()
        }, [agentId]); // 排除自己
    }
    
    // 智能体下线
    handleAgentOffline(agentId, clientId) {
        this.onlineAgents.delete(agentId);
        
        // 广播离线状态更新
        this.broadcast({
            type: 'agent_offline',
            agentId,
            timestamp: Date.now()
        }, [agentId]);
    }
    
    // 订阅频道
    handleSubscribeChannel(clientId, message) {
        const { channelId } = message;
        const client = this.clients.get(clientId);
        
        if (!client || !client.agentId) {
            this.sendError(clientId, '请先认证');
            return;
        }
        
        // 验证频道存在
        const db = new sqlite3.Database(this.dbPath);
        db.get('SELECT id FROM channels WHERE id = ?', [channelId], (err, row) => {
            if (err || !row) {
                this.sendError(clientId, '频道不存在');
                db.close();
                return;
            }
            
            // 添加到订阅列表
            client.channels.add(channelId);
            
            // 发送订阅成功
            client.ws.send(JSON.stringify({
                type: 'subscribe_success',
                channelId,
                timestamp: Date.now()
            }));
            
            // 广播新的订阅者
            this.broadcastToChannel(channelId, {
                type: 'new_subscriber',
                channelId,
                agentId: client.agentId,
                timestamp: Date.now()
            }, client.agentId);
            
            // 发送最近的消息
            this.sendChannelHistory(clientId, channelId);
            
            db.close();
        });
    }
    
    // 取消订阅
    handleUnsubscribeChannel(clientId, message) {
        const { channelId } = message;
        const client = this.clients.get(clientId);
        
        if (!client) return;
        
        client.channels.delete(channelId);
        
        client.ws.send(JSON.stringify({
            type: 'unsubscribe_success',
            channelId,
            timestamp: Date.now()
        }));
        
        // 广播取消订阅
        this.broadcastToChannel(channelId, {
            type: 'unsubscribed',
            channelId,
            agentId: client.agentId,
            timestamp: Date.now()
        }, client.agentId);
    }
    
    // 处理频道消息
    async handleChannelMessage(clientId, message) {
        const { channelId, content } = message;
        const client = this.clients.get(clientId);
        
        if (!client || !client.agentId) {
            this.sendError(clientId, '请先认证');
            return;
        }
        
        if (!client.channels.has(channelId)) {
            this.sendError(clientId, '未订阅该频道');
            return;
        }
        
        const messageId = uuidv4();
        const timestamp = Date.now();
        
        // 保存到数据库
        const db = new sqlite3.Database(this.dbPath);
        db.run(`
            INSERT INTO channel_messages (id, channel_id, sender_agent_id, content, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `, [messageId, channelId, client.agentId, content], (err) => {
            if (err) {
                console.error('保存消息失败:', err);
                this.sendError(clientId, '保存消息失败');
                return;
            }
            
            // 构建消息对象
            const messageObj = {
                type: 'channel_message',
                id: messageId,
                channelId,
                senderAgentId: client.agentId,
                content,
                timestamp,
                createdAt: new Date(timestamp).toISOString()
            };
            
            // 广播到频道
            this.broadcastToChannel(channelId, messageObj, client.agentId);
            
            // 发送确认
            client.ws.send(JSON.stringify({
                type: 'message_sent',
                messageId,
                channelId,
                timestamp
            }));
            
            db.close();
        });
    }
    
    // 心跳
    handlePing(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        client.ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
        }));
        
        // 更新在线状态
        if (client.agentId) {
            const agent = this.onlineAgents.get(client.agentId);
            if (agent) {
                agent.lastSeen = Date.now();
            }
        }
    }
    
    // 发送错误
    sendError(clientId, error) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        client.ws.send(JSON.stringify({
            type: 'error',
            error,
            timestamp: Date.now()
        }));
    }
    
    // 发送在线智能体列表
    sendOnlineAgents(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const onlineAgents = Array.from(this.onlineAgents.entries()).map(([agentId, info]) => ({
            agentId,
            lastSeen: info.lastSeen,
            online: true
        }));
        
        client.ws.send(JSON.stringify({
            type: 'online_agents',
            agents: onlineAgents,
            timestamp: Date.now()
        }));
    }
    
    // 发送订阅的频道
    sendSubscribedChannels(clientId) {
        const client = this.clients.get(clientId);
        if (!client || !client.agentId) return;
        
        const db = new sqlite3.Database(this.dbPath);
        const query = `
            SELECT c.id, c.name, c.description
            FROM channels c
            JOIN channel_subscriptions cs ON c.id = cs.channel_id
            WHERE cs.agent_id = ?
        `;
        
        db.all(query, [client.agentId], (err, channels) => {
            if (!err && channels) {
                client.ws.send(JSON.stringify({
                    type: 'subscribed_channels',
                    channels,
                    timestamp: Date.now()
                }));
                
                // 自动订阅这些频道
                channels.forEach(channel => {
                    client.channels.add(channel.id);
                });
            }
            db.close();
        });
    }
    
    // 发送频道历史消息
    sendChannelHistory(clientId, channelId, limit = 50) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const db = new sqlite3.Database(this.dbPath);
        const query = `
            SELECT cm.*, a.name as sender_name
            FROM channel_messages cm
            JOIN agents a ON cm.sender_agent_id = a.id
            WHERE cm.channel_id = ?
            ORDER BY cm.created_at DESC
            LIMIT ?
        `;
        
        db.all(query, [channelId, limit], (err, messages) => {
            if (!err && messages) {
                client.ws.send(JSON.stringify({
                    type: 'channel_history',
                    channelId,
                    messages: messages.reverse(), // 按时间顺序
                    timestamp: Date.now()
                }));
            }
            db.close();
        });
    }
    
    // 广播到所有客户端
    broadcast(message, excludeAgentIds = []) {
        this.clients.forEach(client => {
            if (client.agentId && excludeAgentIds.includes(client.agentId)) {
                return;
            }
            
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    // 广播到特定频道
    broadcastToChannel(channelId, message, excludeAgentId = null) {
        this.clients.forEach(client => {
            if (!client.agentId || !client.channels.has(channelId)) {
                return;
            }
            
            if (excludeAgentId && client.agentId === excludeAgentId) {
                return;
            }
            
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    // 获取在线状态
    getOnlineStatus() {
        return {
            totalClients: this.clients.size,
            onlineAgents: this.onlineAgents.size,
            clients: Array.from(this.clients.values()).map(c => ({
                clientId: c.clientId,
                agentId: c.agentId,
                channels: Array.from(c.channels),
                readyState: c.ws.readyState
            }))
        };
    }
}

module.exports = WebSocketServer;