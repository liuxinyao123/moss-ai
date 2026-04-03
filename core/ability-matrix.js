/**
 * DSclaw - 能力矩阵系统
 * 
 * 定义和管理每个智能体的能力，包括：
 * - 技能能力
 * - 知识领域
 * - 工具权限
 * - 性能指标
 * 
 * 现在整合到SQLite，统一存储在agents表中
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class AbilityMatrix {
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    
    // 定义Agent能力
    async defineAbility(agentId, config) {
        const db = new sqlite3.Database(this.dbPath);
        
        const defaultAbility = {
            // 技能能力
            skills: [],
            
            // 知识领域
            domains: [],
            
            // 工具权限
            tools: [],
            
            // 模型能力
            model: {
                context_length: 128000,
                supports_tools: true,
                supports_vision: false,
                supports_audio: false
            },
            
            // 性能指标
            performance: {
                avg_response_time: 0,
                success_rate: 1.0,
                total_tasks: 0,
                completed_tasks: 0
            },
            
            // 可用性
            availability: {
                is_online: true,
                max_concurrent_tasks: 5,
                current_tasks: 0
            },
            
            // 元数据
            metadata: {
                updated_at: new Date().toISOString()
            }
        };
        
        const mergedAbility = { ...defaultAbility, ...config };
        
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE agents 
                SET skills = ?, domains = ?, availability = ?, performance = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                JSON.stringify(mergedAbility.skills || []),
                JSON.stringify(mergedAbility.domains || []),
                JSON.stringify(mergedAbility.availability),
                JSON.stringify(mergedAbility.performance),
                agentId
            ], function(err) {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: this.changes > 0,
                        ability: mergedAbility
                    });
                }
            });
        });
    }
    
    // 获取Agent能力
    async getAbility(agentId) {
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM agents WHERE id = ?', [agentId], (err, row) => {
                db.close();
                
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    resolve({
                        ...JSON.parse(row.config || '{}'),
                        skills: JSON.parse(row.skills || '[]'),
                        domains: JSON.parse(row.domains || '[]'),
                        availability: JSON.parse(row.availability || '{"is_online":true,"max_concurrent_tasks":5,"current_tasks":0}'),
                        performance: JSON.parse(row.performance || '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}')
                    });
                }
            });
        });
    }
    
    // 获取所有能力
    async getAllAbilities() {
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM agents ORDER BY created_at DESC', [], (err, rows) => {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    const result = {};
                    rows.forEach(row => {
                        result[row.id] = {
                            ...JSON.parse(row.config || '{}'),
                            skills: JSON.parse(row.skills || '[]'),
                            domains: JSON.parse(row.domains || '[]'),
                            availability: JSON.parse(row.availability || '{"is_online":true,"max_concurrent_tasks":5,"current_tasks":0}'),
                            performance: JSON.parse(row.performance || '{"avg_response_time":0,"success_rate":1.0,"total_tasks":0,"completed_tasks":0}')
                        };
                    });
                    resolve(result);
                }
            });
        });
    }
    
    // 检查Agent是否具备某项技能
    async hasSkill(agentId, skill) {
        const ability = await this.getAbility(agentId);
        if (!ability) return false;
        return ability.skills.includes(skill);
    }
    
    // 检查Agent是否属于某个领域
    async inDomain(agentId, domain) {
        const ability = await this.getAbility(agentId);
        if (!ability) return false;
        return ability.domains.includes(domain);
    }
    
    // 查找具备特定技能的Agent
    async findAgentsBySkill(skill) {
        const allAbilities = await this.getAllAbilities();
        const results = [];
        
        for (const [agentId, ability] of Object.entries(allAbilities)) {
            if (ability.skills.includes(skill) && ability.availability.is_online) {
                results.push({
                    agentId,
                    ability
                });
            }
        }
        
        return results;
    }
    
    // 查找属于某个领域的Agent
    async findAgentsByDomain(domain) {
        const allAbilities = await this.getAllAbilities();
        const results = [];
        
        for (const [agentId, ability] of Object.entries(allAbilities)) {
            if (ability.domains.includes(domain) && ability.availability.is_online) {
                results.push({
                    agentId,
                    ability
                });
            }
        }
        
        return results;
    }
    
    // 查找最适合处理任务的Agent（基于技能匹配度）
    async findBestAgentForTask(requiredSkills = [], requiredDomains = []) {
        const allAbilities = await this.getAllAbilities();
        let bestMatch = null;
        let bestScore = 0;
        
        for (const [agentId, ability] of Object.entries(allAbilities)) {
            // 检查可用性
            if (!ability.availability.is_online) continue;
            
            // 检查并发限制
            if (ability.availability.current_tasks >= ability.availability.max_concurrent_tasks) continue;
            
            // 计算匹配分数
            let score = 0;
            
            // 技能匹配（每个匹配的技能+10分）
            const skillMatches = ability.skills.filter(s => requiredSkills.includes(s)).length;
            score += skillMatches * 10;
            
            // 领域匹配（每个匹配的领域+20分）
            const domainMatches = ability.domains.filter(d => requiredDomains.includes(d)).length;
            score += domainMatches * 20;
            
            // 性能因子（成功率+响应时间）
            score += ability.performance.success_rate * 30;
            score -= ability.performance.avg_response_time / 1000; // 响应时间越短越好
            
            // 更新最佳匹配
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { agentId, ability, score };
            }
        }
        
        return bestMatch;
    }
    
    // 更新性能指标
    async updatePerformance(agentId, metrics) {
        const current = await this.getAbility(agentId);
        if (!current) return { success: false, error: 'Agent not found' };
        
        const performance = { ...current.performance };
        
        if (metrics.response_time !== undefined) {
            const n = performance.total_tasks;
            performance.avg_response_time = (performance.avg_response_time * n + metrics.response_time) / (n + 1);
        }
        
        if (metrics.success !== undefined) {
            performance.total_tasks++;
            if (metrics.success) {
                performance.completed_tasks++;
            }
            performance.success_rate = performance.completed_tasks / performance.total_tasks;
        }
        
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE agents 
                SET performance = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(performance), agentId], function(err) {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        performance
                    });
                }
            });
        });
    }
    
    // 更新任务计数
    async incrementTaskCount(agentId) {
        const current = await this.getAbility(agentId);
        if (!current) return { success: false };
        
        const availability = { ...current.availability };
        availability.current_tasks++;
        
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE agents 
                SET availability = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(availability), agentId], function(err) {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            });
        });
    }
    
    async decrementTaskCount(agentId) {
        const current = await this.getAbility(agentId);
        if (!current) return { success: false };
        
        const availability = { ...current.availability };
        if (availability.current_tasks > 0) {
            availability.current_tasks--;
        }
        
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE agents 
                SET availability = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(availability), agentId], function(err) {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            });
        });
    }
    
    // 设置在线状态
    async setOnlineStatus(agentId, isOnline) {
        const current = await this.getAbility(agentId);
        if (!current) return { success: false };
        
        const availability = { ...current.availability };
        availability.is_online = isOnline;
        
        const db = new sqlite3.Database(this.dbPath);
        
        return new Promise((resolve, reject) => {
            db.run(`
                UPDATE agents 
                SET availability = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [JSON.stringify(availability), agentId], function(err) {
                db.close();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            });
        });
    }
    
    // 获取能力统计
    async getStats() {
        const allAbilities = await this.getAllAbilities();
        
        let totalAgents = 0;
        let onlineAgents = 0;
        let totalSkills = 0;
        let totalDomains = 0;
        
        for (const [agentId, ability] of Object.entries(allAbilities)) {
            totalAgents++;
            if (ability.availability.is_online) {
                onlineAgents++;
            }
            totalSkills += ability.skills.length;
            totalDomains += ability.domains.length;
        }
        
        return {
            total_agents: totalAgents,
            online_agents: onlineAgents,
            offline_agents: totalAgents - onlineAgents,
            total_skills: totalSkills,
            total_domains: totalDomains,
            avg_skills_per_agent: totalAgents > 0 ? (totalSkills / totalAgents).toFixed(2) : 0,
            avg_domains_per_agent: totalAgents > 0 ? (totalDomains / totalAgents).toFixed(2) : 0
        };
    }
}

module.exports = AbilityMatrix;
