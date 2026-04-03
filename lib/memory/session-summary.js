/**
 * DSclaw - 会话摘要层
 * 会话结束后自动生成结构化摘要
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class SessionSummary {
    constructor(agentDir) {
        this.agentDir = agentDir;
        this.dbPath = path.join(agentDir, 'memory', 'sessions.db');
        this.initDatabase();
    }
    
    initDatabase() {
        const db = new sqlite3.Database(this.dbPath);
        db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                start_time DATETIME,
                end_time DATETIME,
                message_count INTEGER,
                summary TEXT,
                tags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS session_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                timestamp DATETIME,
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        `);
        db.close();
    }
    
    // 开始新会话
    startSession(sessionId, title = '新对话') {
        const db = new sqlite3.Database(this.dbPath);
        db.run(
            'INSERT INTO sessions (id, title, start_time, message_count) VALUES (?, ?, ?, 0)',
            [sessionId, title, new Date().toISOString()],
            (err) => {
                if (err) console.error('Session start error:', err);
            }
        );
        db.close();
    }
    
    // 添加消息到会话
    addMessage(sessionId, role, content) {
        const db = new sqlite3.Database(this.dbPath);
        db.run(
            'INSERT INTO session_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)',
            [sessionId, role, content, new Date().toISOString()],
            (err) => {
                if (err) console.error('Message add error:', err);
            }
        );
        
        // 更新消息计数
        db.run(
            'UPDATE sessions SET message_count = message_count + 1 WHERE id = ?',
            [sessionId]
        );
        db.close();
    }
    
    // 结束会话并生成摘要
    async endSession(sessionId) {
        const db = new sqlite3.Database(this.dbPath);
        
        // 获取会话消息
        const messages = await new Promise((resolve, reject) => {
            db.all(
                'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY timestamp',
                [sessionId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        // 生成摘要
        const summary = await this.generateSummary(messages);
        
        // 更新会话记录
        db.run(
            'UPDATE sessions SET end_time = ?, summary = ? WHERE id = ?',
            [new Date().toISOString(), summary, sessionId],
            (err) => {
                if (err) console.error('Session end error:', err);
            }
        );
        
        db.close();
        return summary;
    }
    
    // AI生成摘要
    async generateSummary(messages) {
        // 这里应该调用AI生成摘要，暂时使用简单规则
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        
        return `## 会话摘要
- **消息总数**: ${messages.length} 条
- **用户消息**: ${userMessages.length} 条
- **AI回复**: ${assistantMessages.length} 条
- **主要话题**: ${this.extractTopics(messages)}
- **关键讨论点**: ${this.extractKeyPoints(messages)}`;
    }
    
    extractTopics(messages) {
        // 简单提取话题
        const topics = new Set();
        messages.slice(0, 5).forEach(m => {
            const text = m.content.toLowerCase();
            if (text.includes('代码') || text.includes('python') || text.includes('javascript')) {
                topics.add('编程');
            }
            if (text.includes('任务') || text.includes('待办') || text.includes('todo')) {
                topics.add('任务管理');
            }
            if (text.includes('文件') || text.includes('文档') || text.includes('编辑')) {
                topics.add('文件处理');
            }
        });
        return Array.from(topics).join('、') || '综合讨论';
    }
    
    extractKeyPoints(messages) {
        // 提取关键点
        const keyPoints = [];
        messages.forEach((m, i) => {
            if (m.role === 'user' && m.content.length > 20) {
                keyPoints.push(`问题${keyPoints.length + 1}: ${m.content.substring(0, 50)}...`);
            }
        });
        return keyPoints.length > 0 ? keyPoints.join('; ') : '无特定关键点';
    }
    
    // 获取会话列表
    listSessions(limit = 50) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            db.all(
                'SELECT * FROM sessions ORDER BY end_time DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
            db.close();
        });
    }
    
    // 搜索会话
    searchSessions(query, tags = []) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath);
            let sql = 'SELECT * FROM sessions WHERE summary LIKE ? OR title LIKE ?';
            const params = [`%${query}%`, `%${query}%`];
            
            if (tags.length > 0) {
                sql += ' AND tags LIKE ?';
                params.push(`%${tags.join(',')}%`);
            }
            
            sql += ' ORDER BY end_time DESC LIMIT 50';
            
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
            db.close();
        });
    }
}

module.exports = SessionSummary;
