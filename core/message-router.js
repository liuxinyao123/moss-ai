/**
 * DSclaw - 智能体间消息路由系统
 * 
 * 实现点对点的Agent-to-Agent消息传递
 * 支持同步/异步消息、消息队列、消息持久化
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MessageRouter {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.messagesDir = path.join(workspaceRoot, 'agent-messages');
        this.pendingMessages = new Map(); // messageId -> message
        this.messageHandlers = new Map(); // agentId -> handler function
        
        fs.mkdirSync(this.messagesDir, { recursive: true });
    }
    
    // 发送消息到指定Agent
    async sendMessage(fromAgentId, toAgentId, content, options = {}) {
        const messageId = uuidv4();
        const timestamp = new Date().toISOString();
        
        const message = {
            id: messageId,
            from: fromAgentId,
            to: toAgentId,
            content,
            timestamp,
            type: options.type || 'direct',
            priority: options.priority || 'normal',
            replyTo: options.replyTo || null,
            expiresAt: options.expiresAt || null,
            metadata: options.metadata || {}
        };
        
        // 保存消息
        await this.saveMessage(message);
        
        // 如果接收者在线，立即投递
        if (this.messageHandlers.has(toAgentId)) {
            const handler = this.messageHandlers.get(toAgentId);
            
            if (options.async !== false) {
                // 异步投递（默认）
                setImmediate(() => {
                    handler(message).catch(err => {
                        console.error(`❌ 消息投递失败: ${err.message}`);
                        this.updateMessageStatus(messageId, 'failed', err.message);
                    });
                });
                
                return {
                    success: true,
                    messageId,
                    status: 'queued',
                    delivered: false
                };
            } else {
                // 同步投递
                try {
                    await handler(message);
                    this.updateMessageStatus(messageId, 'delivered');
                    
                    return {
                        success: true,
                        messageId,
                        status: 'delivered',
                        delivered: true
                    };
                } catch (error) {
                    this.updateMessageStatus(messageId, 'failed', error.message);
                    throw error;
                }
            }
        } else {
            // 接收者离线，消息已暂存
            this.updateMessageStatus(messageId, 'pending', 'Agent offline');
            
            return {
                success: true,
                messageId,
                status: 'pending',
                delivered: false
            };
        }
    }
    
    // 批量发送消息（广播）
    async broadcast(fromAgentId, toAgentIds, content, options = {}) {
        const results = [];
        
        for (const toAgentId of toAgentIds) {
            try {
                const result = await this.sendMessage(fromAgentId, toAgentId, content, {
                    ...options,
                    type: 'broadcast'
                });
                results.push({ toAgentId, ...result });
            } catch (error) {
                results.push({
                    toAgentId,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return {
            total: toAgentIds.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }
    
    // 注册消息处理器
    registerHandler(agentId, handler) {
        this.messageHandlers.set(agentId, handler);
        
        // 检查是否有该Agent的待处理消息
        this.processPendingMessages(agentId);
    }
    
    // 注销消息处理器
    unregisterHandler(agentId) {
        this.messageHandlers.delete(agentId);
    }
    
    // 处理待处理消息
    async processPendingMessages(agentId) {
        const pendingFile = path.join(this.messagesDir, `${agentId}-pending.json`);
        
        if (!fs.existsSync(pendingFile)) return;
        
        const messages = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
        const handler = this.messageHandlers.get(agentId);
        
        if (!handler) return;
        
        const processed = [];
        
        for (const message of messages) {
            try {
                await handler(message);
                this.updateMessageStatus(message.id, 'delivered');
                processed.push(message.id);
            } catch (error) {
                this.updateMessageStatus(message.id, 'failed', error.message);
            }
        }
        
        // 从待处理列表中移除已处理的
        if (processed.length > 0) {
            const remaining = messages.filter(m => !processed.includes(m.id));
            fs.writeFileSync(pendingFile, JSON.stringify(remaining, null, 2), 'utf-8');
        }
    }
    
    // 保存消息
    async saveMessage(message) {
        const messageFile = path.join(this.messagesDir, `${message.id}.json`);
        fs.writeFileSync(messageFile, JSON.stringify(message, null, 2), 'utf-8');
        
        // 更新接收者的待处理列表
        if (message.status === 'pending') {
            const pendingFile = path.join(this.messagesDir, `${message.to}-pending.json`);
            let pending = [];
            
            if (fs.existsSync(pendingFile)) {
                pending = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
            }
            
            pending.push(message);
            fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2), 'utf-8');
        }
    }
    
    // 更新消息状态
    updateMessageStatus(messageId, status, errorMessage = null) {
        const messageFile = path.join(this.messagesDir, `${messageId}.json`);
        
        if (!fs.existsSync(messageFile)) return;
        
        const message = JSON.parse(fs.readFileSync(messageFile, 'utf-8'));
        message.status = status;
        message.updatedAt = new Date().toISOString();
        
        if (errorMessage) {
            message.error = errorMessage;
        }
        
        fs.writeFileSync(messageFile, JSON.stringify(message, null, 2), 'utf-8');
    }
    
    // 获取消息
    getMessage(messageId) {
        const messageFile = path.join(this.messagesDir, `${messageId}.json`);
        
        if (!fs.existsSync(messageFile)) return null;
        
        return JSON.parse(fs.readFileSync(messageFile, 'utf-8'));
    }
    
    // 获取Agent的消息历史
    async getAgentMessageHistory(agentId, options = {}) {
        const {
            from,
            to,
            type,
            status,
            limit = 50,
            offset = 0
        } = options;
        
        const historyFile = path.join(this.messagesDir, `${agentId}-history.json`);
        let messages = [];
        
        if (fs.existsSync(historyFile)) {
            messages = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        }
        
        // 过滤
        if (from) messages = messages.filter(m => m.from === from);
        if (to) messages = messages.filter(m => m.to === to);
        if (type) messages = messages.filter(m => m.type === type);
        if (status) messages = messages.filter(m => m.status === status);
        
        // 分页
        return messages.slice(offset, offset + limit);
    }
    
    // 获取所有消息
    getAllMessages(options = {}) {
        const {
            from,
            to,
            type,
            status,
            limit = 100
        } = options;
        
        const files = fs.readdirSync(this.messagesDir).filter(f => 
            f.endsWith('.json') && !f.includes('-pending') && !f.includes('-history')
        );
        
        let messages = [];
        
        for (const file of files) {
            const message = JSON.parse(fs.readFileSync(
                path.join(this.messagesDir, file),
                'utf-8'
            ));
            messages.push(message);
        }
        
        // 过滤
        if (from) messages = messages.filter(m => m.from === from);
        if (to) messages = messages.filter(m => m.to === to);
        if (type) messages = messages.filter(m => m.type === type);
        if (status) messages = messages.filter(m => m.status === status);
        
        // 按时间排序
        messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return messages.slice(0, limit);
    }
    
    // 获取未送达消息
    getUndeliveredMessages() {
        const allMessages = this.getAllMessages();
        return allMessages.filter(m => m.status === 'pending' || m.status === 'failed');
    }
    
    // 重试失败的消息
    async retryFailedMessages() {
        const failedMessages = this.getAllMessages({ status: 'failed' });
        const results = [];
        
        for (const message of failedMessages) {
            try {
                const result = await this.sendMessage(
                    message.from,
                    message.to,
                    message.content,
                    { async: true }
                );
                results.push({
                    messageId: message.id,
                    success: result.success
                });
            } catch (error) {
                results.push({
                    messageId: message.id,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    // 清理过期消息
    cleanupExpiredMessages() {
        const files = fs.readdirSync(this.messagesDir).filter(f => 
            f.endsWith('.json') && !f.includes('-pending') && !f.includes('-history')
        );
        
        const now = new Date();
        let cleaned = 0;
        
        for (const file of files) {
            const message = JSON.parse(fs.readFileSync(
                path.join(this.messagesDir, file),
                'utf-8'
            ));
            
            if (message.expiresAt && new Date(message.expiresAt) < now) {
                fs.unlinkSync(path.join(this.messagesDir, file));
                cleaned++;
            }
        }
        
        return cleaned;
    }
    
    // 获取统计信息
    getStats() {
        const allMessages = this.getAllMessages();
        
        const statusCount = {};
        allMessages.forEach(m => {
            statusCount[m.status] = (statusCount[m.status] || 0) + 1;
        });
        
        return {
            total_messages: allMessages.length,
            online_handlers: this.messageHandlers.size,
            status_breakdown: statusCount,
            undelivered_count: this.getUndeliveredMessages().length
        };
    }
}

module.exports = MessageRouter;
