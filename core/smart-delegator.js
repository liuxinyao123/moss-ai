/**
 * DSclaw - 智能委托器
 * 
 * 根据任务要求和Agent能力，自动选择最佳Agent执行任务
 * 支持任务拆分、负载均衡、故障转移
 */

const path = require('path');

class SmartDelegator {
    constructor(abilityMatrix, messageRouter, taskCollaborator) {
        this.abilityMatrix = abilityMatrix;
        this.messageRouter = messageRouter;
        this.taskCollaborator = taskCollaborator;
        
        // 委托历史
        this.delegationHistory = [];
    }
    
    // 智能委托任务
    async delegate(initiatorId, taskRequest) {
        const {
            description,
            requiredSkills = [],
            requiredDomains = [],
            priority = 'normal',
            timeout = 300000,
            splitTask = false,
            splitStrategy = 'parallel'
        } = taskRequest;
        
        // 1. 查找最合适的Agent
        const bestMatch = this.abilityMatrix.findBestAgentForTask(
            requiredSkills,
            requiredDomains
        );
        
        if (!bestMatch) {
            throw new Error('没有找到合适的Agent来执行此任务');
        }
        
        const { agentId, ability } = bestMatch;
        
        console.log(`🎯 选择Agent ${agentId} 执行任务`);
        console.log(`   匹配分数: ${bestMatch.score.toFixed(2)}`);
        
        // 2. 增加Agent任务计数
        this.abilityMatrix.incrementTaskCount(agentId);
        
        // 3. 创建协作任务
        const task = this.taskCollaborator.createTask({
            name: taskRequest.name || description.substring(0, 50),
            description,
            initiator: initiatorId,
            priority,
            timeout
        });
        
        // 4. 判断是否需要拆分任务
        if (splitTask) {
            return await this.delegateSplitTask(
                initiatorId,
                task.id,
                description,
                requiredSkills,
                requiredDomains,
                splitStrategy
            );
        } else {
            // 单Agent执行
            return await this.delegateToSingleAgent(
                initiatorId,
                task.id,
                agentId,
                description
            );
        }
    }
    
    // 委托给单个Agent
    async delegateToSingleAgent(initiatorId, taskId, agentId, description) {
        const task = this.taskCollaborator.getTask(taskId);
        
        // 添加子任务
        const subtask = this.taskCollaborator.addSubtask(
            taskId,
            agentId,
            description
        );
        
        // 启动任务
        this.taskCollaborator.startTask(taskId);
        this.taskCollaborator.startSubtask(taskId, subtask.id);
        
        // 发送消息给Agent
        try {
            const startTime = Date.now();
            
            await this.messageRouter.sendMessage(
                initiatorId,
                agentId,
                this.formatTaskMessage(task, subtask),
                {
                    type: 'delegation',
                    async: true,
                    metadata: {
                        task_id: taskId,
                        subtask_id: subtask.id
                    }
                }
            );
            
            // 记录委托历史
            this.recordDelegation({
                type: 'single',
                initiatorId,
                targetAgentId: agentId,
                taskId,
                subtaskId: subtask.id,
                description,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: true,
                taskId,
                subtaskId: subtask.id,
                agentId,
                status: 'running'
            };
            
        } catch (error) {
            // 任务失败
            this.taskCollaborator.failSubtask(taskId, subtask.id, error.message);
            this.abilityMatrix.decrementTaskCount(agentId);
            
            // 记录失败
            this.abilityMatrix.updatePerformance(agentId, {
                success: false,
                response_time: Date.now() - startTime
            });
            
            throw error;
        }
    }
    
    // 拆分任务并委托给多个Agent
    async delegateSplitTask(
        initiatorId,
        taskId,
        description,
        requiredSkills,
        requiredDomains,
        strategy
    ) {
        const task = this.taskCollaborator.getTask(taskId);
        
        // 查找所有合适的Agent
        const agents = [];
        
        if (requiredDomains.length > 0) {
            // 按领域查找
            for (const domain of requiredDomains) {
                const domainAgents = this.abilityMatrix.findAgentsByDomain(domain);
                agents.push(...domainAgents);
            }
        } else if (requiredSkills.length > 0) {
            // 按技能查找
            for (const skill of requiredSkills) {
                const skillAgents = this.abilityMatrix.findAgentsBySkill(skill);
                agents.push(...skillAgents);
            }
        }
        
        // 去重
        const uniqueAgents = new Map();
        agents.forEach(a => {
            if (!uniqueAgents.has(a.agentId)) {
                uniqueAgents.set(a.agentId, a);
            }
        });
        
        const selectedAgents = Array.from(uniqueAgents.values());
        
        if (selectedAgents.length === 0) {
            throw new Error('没有找到合适的Agent执行拆分任务');
        }
        
        // 根据策略拆分任务
        const subtaskDescriptions = this.splitTaskDescription(
            description,
            selectedAgents.length,
            strategy
        );
        
        // 创建子任务
        const subtasks = [];
        
        for (let i = 0; i < selectedAgents.length; i++) {
            const agent = selectedAgents[i];
            const subtaskDesc = subtaskDescriptions[i];
            
            const subtask = this.taskCollaborator.addSubtask(
                taskId,
                agent.agentId,
                subtaskDesc
            );
            
            subtasks.push(subtask);
            
            // 增加任务计数
            this.abilityMatrix.incrementTaskCount(agent.agentId);
        }
        
        // 启动任务
        this.taskCollaborator.startTask(taskId);
        
        // 执行子任务
        if (strategy === 'parallel') {
            // 并行执行
            const promises = subtasks.map(subtask => this.executeSubtask(
                initiatorId,
                taskId,
                subtask
            ));
            
            await Promise.all(promises);
        } else {
            // 串行执行
            for (const subtask of subtasks) {
                await this.executeSubtask(initiatorId, taskId, subtask);
            }
        }
        
        return {
            success: true,
            taskId,
            subtaskCount: subtasks.length,
            status: 'running'
        };
    }
    
    // 执行子任务
    async executeSubtask(initiatorId, taskId, subtask) {
        const task = this.taskCollaborator.getTask(taskId);
        
        this.taskCollaborator.startSubtask(taskId, subtask.id);
        
        const startTime = Date.now();
        
        try {
            await this.messageRouter.sendMessage(
                initiatorId,
                subtask.agent_id,
                this.formatTaskMessage(task, subtask),
                {
                    type: 'delegation',
                    async: true,
                    metadata: {
                        task_id: taskId,
                        subtask_id: subtask.id
                    }
                }
            );
            
            // 记录成功
            this.abilityMatrix.updatePerformance(subtask.agent_id, {
                success: true,
                response_time: Date.now() - startTime
            });
            
        } catch (error) {
            // 子任务失败
            this.taskCollaborator.failSubtask(taskId, subtask.id, error.message);
            
            // 记录失败
            this.abilityMatrix.updatePerformance(subtask.agent_id, {
                success: false,
                response_time: Date.now() - startTime
            });
            
            // 尝试故障转移
            await this.failover(initiatorId, taskId, subtask, error);
        }
    }
    
    // 故障转移
    async failover(initiatorId, taskId, failedSubtask, error) {
        const task = this.taskCollaborator.getTask(taskId);
        
        // 查找备用Agent
        const ability = this.abilityMatrix.getAbility(failedSubtask.agent_id);
        
        if (!ability) return;
        
        // 查找相同技能的其他Agent
        const backupAgents = ability.skills
            .map(skill => this.abilityMatrix.findAgentsBySkill(skill))
            .flat()
            .filter(a => a.agentId !== failedSubtask.agent_id);
        
        // 去重
        const uniqueBackups = new Map();
        backupAgents.forEach(a => {
            if (!uniqueBackups.has(a.agentId)) {
                uniqueBackups.set(a.agentId, a);
            }
        });
        
        const backups = Array.from(uniqueBackups.values());
        
        if (backups.length > 0) {
            // 选择第一个备用Agent
            const backup = backups[0];
            
            console.log(`🔄 故障转移: ${failedSubtask.agent_id} -> ${backup.agentId}`);
            
            // 创建新的子任务
            const newSubtask = this.taskCollaborator.addSubtask(
                taskId,
                backup.agentId,
                failedSubtask.description + ' (重试)'
            );
            
            // 执行
            await this.executeSubtask(initiatorId, taskId, newSubtask);
        } else {
            console.warn(`⚠️ 无法找到备用Agent，子任务 ${failedSubtask.id} 失败`);
        }
    }
    
    // 拆分任务描述
    splitTaskDescription(description, count, strategy) {
        // 简单实现：将描述分成几部分
        const parts = description.split(/[。！？.!?]/);
        const chunks = [];
        
        const chunkSize = Math.ceil(parts.length / count);
        
        for (let i = 0; i < count; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, parts.length);
            chunks.push(parts.slice(start, end).join('。'));
        }
        
        return chunks;
    }
    
    // 格式化任务消息
    formatTaskMessage(task, subtask) {
        return `## 📋 委托任务\n\n**任务名称**: ${task.name}\n**任务描述**: ${task.description}\n\n**你的任务**: ${subtask.description}\n\n**优先级**: ${task.priority}\n**子任务ID**: ${subtask.id}\n\n请处理此任务，完成后返回结果。`;
    }
    
    // 处理Agent返回的结果
    handleAgentResult(agentId, taskId, subtaskId, result) {
        try {
            this.taskCollaborator.completeSubtask(taskId, subtaskId, result);
            
            // 减少任务计数
            this.abilityMatrix.decrementTaskCount(agentId);
            
            return { success: true };
        } catch (error) {
            console.error(`处理结果失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // 记录委托历史
    recordDelegation(delegation) {
        this.delegationHistory.push(delegation);
        
        // 只保留最近100条
        if (this.delegationHistory.length > 100) {
            this.delegationHistory = this.delegationHistory.slice(-100);
        }
    }
    
    // 获取委托历史
    getDelegationHistory(limit = 20) {
        return this.delegationHistory.slice(-limit);
    }
    
    // 获取统计信息
    getStats() {
        const history = this.getDelegationHistory(100);
        
        const typeCount = {};
        const agentUsage = {};
        
        history.forEach(h => {
            typeCount[h.type] = (typeCount[h.type] || 0) + 1;
            agentUsage[h.targetAgentId] = (agentUsage[h.targetAgentId] || 0) + 1;
        });
        
        return {
            total_delegations: history.length,
            type_breakdown: typeCount,
            most_used_agents: Object.entries(agentUsage)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
        };
    }
}

module.exports = SmartDelegator;
