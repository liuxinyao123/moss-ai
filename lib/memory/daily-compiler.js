/**
 * DSclaw - 每日记忆编译器
 * 定时编译：今日记忆、近七日记忆、长期记忆
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

class DailyCompiler {
    constructor(agentDir, memoryManager) {
        this.agentDir = agentDir;
        this.memoryManager = memoryManager;
        this.memoryDir = path.join(agentDir, 'memory');
        this.compiledDir = path.join(this.memoryDir, 'compiled');
        
        this.ensureDirectories();
        this.scheduleCompilation();
    }
    
    ensureDirectories() {
        if (!fs.existsSync(this.compiledDir)) {
            fs.mkdirSync(this.compiledDir, { recursive: true });
        }
    }
    
    // 安排每日编译任务
    scheduleCompilation() {
        // 每日凌晨3点编译
        cron.schedule('0 3 * * *', () => {
            console.log('🔄 开始每日记忆编译...');
            this.compileDaily();
            this.compileWeekly();
            this.compileLongTerm();
        });
        
        // 每小时检查一次增量更新
        cron.schedule('0 * * * *', () => {
            this.compileIncremental();
        });
    }
    
    // 编译今日记忆
    async compileDaily() {
        const today = new Date().toISOString().split('T')[0];
        const dailyFile = path.join(this.compiledDir, `daily-${today}.md`);
        
        // 获取今日会话摘要
        const sessions = await this.memoryManager.searchSessions('', [], {
            from: today + ' 00:00:00',
            to: today + ' 23:59:59'
        });
        
        let content = `# 📅 今日记忆汇总 (${today})\n\n`;
        content += `## 会话统计\n`;
        content += `- 总会话数: ${sessions.length}\n`;
        content += `- 总消息数: ${sessions.reduce((sum, s) => sum + (s.message_count || 0), 0)}\n\n`;
        
        if (sessions.length > 0) {
            content += `## 会话详情\n\n`;
            sessions.forEach((session, index) => {
                content += `### ${session.title} (${session.message_count}条消息)\n`;
                content += `${session.summary || '无摘要'}\n\n`;
            });
        } else {
            content += `今日无会话记录。\n`;
        }
        
        fs.writeFileSync(dailyFile, content, 'utf-8');
        console.log(`✅ 今日记忆编译完成: ${dailyFile}`);
        
        return content;
    }
    
    // 编译近七日记忆
    async compileWeekly() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        const weeklyFile = path.join(this.compiledDir, 'weekly-latest.md');
        
        const sessions = await this.memoryManager.searchSessions('', [], {
            from: startDate.toISOString(),
            to: endDate.toISOString()
        });
        
        let content = `# 📊 近七日记忆汇总\n\n`;
        content += `## 统计概览\n`;
        content += `- 时间范围: ${startDate.toISOString().split('T')[0]} 至 ${endDate.toISOString().split('T')[0]}\n`;
        content += `- 总会话数: ${sessions.length}\n`;
        content += `- 总消息数: ${sessions.reduce((sum, s) => sum + (s.message_count || 0), 0)}\n\n`;
        
        // 按日统计
        const dailyStats = {};
        sessions.forEach(session => {
            const date = session.end_time ? session.end_time.split('T')[0] : '未知日期';
            dailyStats[date] = (dailyStats[date] || 0) + 1;
        });
        
        content += `## 每日会话分布\n`;
        Object.keys(dailyStats).sort().forEach(date => {
            content += `- ${date}: ${dailyStats[date]}个会话\n`;
        });
        
        // 按标签统计
        const tagStats = {};
        sessions.forEach(session => {
            const tags = session.tags ? session.tags.split(',').map(t => t.trim()) : [];
            tags.forEach(tag => {
                tagStats[tag] = (tagStats[tag] || 0) + 1;
            });
        });
        
        if (Object.keys(tagStats).length > 0) {
            content += `\n## 热门话题标签\n`;
            Object.entries(tagStats)
                .sort(([,a], [,b]) => b - a)
                .forEach(([tag, count]) => {
                    content += `- **${tag}**: ${count}次提及\n`;
                });
        }
        
        fs.writeFileSync(weeklyFile, content, 'utf-8');
        console.log(`✅ 近七日记忆编译完成: ${weeklyFile}`);
        
        return content;
    }
    
    // 编译长期记忆
    async compileLongTerm() {
        const longTermFile = path.join(this.compiledDir, 'long-term-summary.md');
        
        // 获取所有关键事实
        const facts = await this.memoryManager.deepMemory.listFacts({ limit: 100 });
        
        let content = `# 🐬 长期记忆库汇总\n\n`;
        content += `## 核心事实库\n`;
        content += `- 总事实数: ${facts.length}\n\n`;
        
        if (facts.length > 0) {
            content += `## 事实分类统计\n`;
            
            // 按类型分类
            const typeStats = {};
            const confidenceStats = { high: 0, medium: 0, low: 0 };
            
            facts.forEach(fact => {
                const type = fact.type || '其他';
                typeStats[type] = (typeStats[type] || 0) + 1;
                
                const confidence = fact.confidence || 'medium';
                if (confidence >= 0.8) confidenceStats.high++;
                else if (confidence >= 0.5) confidenceStats.medium++;
                else confidenceStats.low++;
            });
            
            content += `### 按类型统计\n`;
            Object.entries(typeStats).forEach(([type, count]) => {
                content += `- **${type}**: ${count}条\n`;
            });
            
            content += `\n### 按置信度统计\n`;
            content += `- 高置信度 (>80%): ${confidenceStats.high}条\n`;
            content += `- 中置信度 (50-80%): ${confidenceStats.medium}条\n`;
            content += `- 低置信度 (<50%): ${confidenceStats.low}条\n`;
            
            // 提取高频标签
            content += `\n## 高频标签\n`;
            const tagFrequency = {};
            facts.forEach(fact => {
                (fact.tags || []).forEach(tag => {
                    tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
                });
            });
            
            Object.entries(tagFrequency)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 20)
                .forEach(([tag, count]) => {
                    content += `- **${tag}**: ${count}次\n`;
                });
        } else {
            content += `暂无长期记忆数据。\n`;
        }
        
        fs.writeFileSync(longFile, content, 'utf-8');
        console.log(`✅ 长期记忆编译完成: ${longTermFile}`);
        
        return content;
    }
    
    // 增量编译（最近1小时）

    async compileIncremental() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const sessions = await this.memoryManager.searchSessions('', [], {
            from: oneHourAgo.toISOString(),
            to: new Date().toISOString()
        });
        
        if (sessions.length > 0) {
            console.log(`📝 检测到${sessions.length}个新会话，增量编译中...`);
            
            // 更新今日记忆
            const today = new Date().toISOString().split('T')[0];
            const dailyFile = path.join(this.compiledDir, `daily-${today}.md`);
            
            if (fs.existsSync(dailyFile)) {
                const existing = fs.readFileSync(dailyFile, 'utf-8');
                // 这里应该更智能地合并，暂时简单添加
                fs.appendFileSync(dailyFile, `\n\n## 新增会话\n`);
                sessions.forEach(session => {
                    fs.appendFileSync(dailyFile, `- ${session.title} (${session.message_count}条消息)\n`);
                });
            }
        }
    }
}
module.exports = DailyCompiler;
