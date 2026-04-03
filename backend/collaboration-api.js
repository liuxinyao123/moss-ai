/**
 * DSclaw - 多智能体协作API
 * 
 * RESTful API接口：
 * - 能力矩阵管理
 * - Agent间消息路由
 * - 任务协作
 * - 智能委托
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const AbilityMatrix = require('../core/ability-matrix');
const MessageRouter = require('../core/message-router');
const TaskCollaborator = require('../core/task-collaborator');
const SmartDelegator = require('../core/smart-delegator');

class CollaborationAPI {
    constructor(workspaceRoot, dbPath) {
        this.workspaceRoot = workspaceRoot;
        this.dbPath = dbPath;
        this.router = express.Router();
        
        // 初始化核心组件
        this.abilityMatrix = new AbilityMatrix(dbPath);
        this.messageRouter = new MessageRouter(workspaceRoot);
        this.taskCollaborator = new TaskCollaborator(workspaceRoot);
        this.smartDelegator = new SmartDelegator(
            this.abilityMatrix,
            this.messageRouter,
            this.taskCollaborator
        );
        
        // 注册API路由
        this.registerRoutes();
    }
    
    registerRoutes() {
        // ========== 能力矩阵 API ==========
        
        // 定义Agent能力
        this.router.post('/abilities/:agentId', (req, res) => {
            const { agentId } = req.params;
            const config = req.body;
            
            try {
                const ability = this.abilityMatrix.defineAbility(agentId, config);
                res.json({ success: true, ability });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取Agent能力
        this.router.get('/abilities/:agentId', (req, res) => {
            const { agentId } = req.params;
            
            const ability = this.abilityMatrix.getAbility(agentId);
            
            if (!ability) {
                res.status(404).json({ success: false, error: 'Ability not found' });
            } else {
                res.json({ success: true, ability });
            }
        });
        
        // 获取所有能力
        this.router.get('/abilities', (req, res) => {
            const abilities = this.abilityMatrix.getAllAbilities();
            res.json({ success: true, abilities });
        });
        
        // 查找具备特定技能的Agent
        this.router.get('/abilities/search/skill/:skill', (req, res) => {
            const { skill } = req.params;
            const agents = this.abilityMatrix.findAgentsBySkill(skill);
            res.json({ success: true, agents });
        });
        
        // 查找属于某个领域的Agent
        this.router.get('/abilities/search/domain/:domain', (req, res) => {
            const { domain } = req.params;
            const agents = this.abilityMatrix.findAgentsByDomain(domain);
            res.json({ success: true, agents });
        });
        
        // 查找最佳Agent
        this.router.post('/abilities/best-match', (req, res) => {
            const { skills, domains } = req.body;
            
            const bestMatch = this.abilityMatrix.findBestAgentForTask(
                skills || [],
                domains || []
            );
            
            res.json({ success: true, bestMatch });
        });
        
        // 更新性能指标
        this.router.post('/abilities/:agentId/performance', (req, res) => {
            const { agentId } = req.params;
            const metrics = req.body;
            
            try {
                this.abilityMatrix.updatePerformance(agentId, metrics);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 设置在线状态
        this.router.put('/abilities/:agentId/online', (req, res) => {
            const { agentId } = req.params;
            const { is_online } = req.body;
            
            try {
                this.abilityMatrix.setOnlineStatus(agentId, is_online);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取能力统计
        this.router.get('/abilities/stats', (req, res) => {
            const stats = this.abilityMatrix.getStats();
            res.json({ success: true, stats });
        });
        
        // ========== 消息路由 API ==========
        
        // 发送消息
        this.router.post('/messages/send', async (req, res) => {
            const { from, to, content, options = {} } = req.body;
            
            try {
                const result = await this.messageRouter.sendMessage(from, to, content, options);
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 广播消息
        this.router.post('/messages/broadcast', async (req, res) => {
            const { from, to, content, options = {} } = req.body;
            
            try {
                const result = await this.messageRouter.broadcast(from, to, content, options);
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取消息
        this.router.get('/messages/:messageId', (req, res) => {
            const { messageId } = req.params;
            
            const message = this.messageRouter.getMessage(messageId);
            
            if (!message) {
                res.status(404).json({ success: false, error: 'Message not found' });
            } else {
                res.json({ success: true, message });
            }
        });
        
        // 获取Agent消息历史
        this.router.get('/messages/agent/:agentId', async (req, res) => {
            const { agentId } = req.params;
            const options = {
                from: req.query.from,
                to: req.query.to,
                type: req.query.type,
                status: req.query.status,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0
            };
            
            const messages = await this.messageRouter.getAgentMessageHistory(agentId, options);
            res.json({ success: true, messages });
        });
        
        // 获取所有消息
        this.router.get('/messages', (req, res) => {
            const options = {
                from: req.query.from,
                to: req.query.to,
                type: req.query.type,
                status: req.query.status,
                limit: parseInt(req.query.limit) || 100
            };
            
            const messages = this.messageRouter.getAllMessages(options);
            res.json({ success: true, messages });
        });
        
        // 重试失败的消息
        this.router.post('/messages/retry', async (req, res) => {
            try {
                const results = await this.messageRouter.retryFailedMessages();
                res.json({ success: true, results });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 清理过期消息
        this.router.post('/messages/cleanup', (req, res) => {
            const cleaned = this.messageRouter.cleanupExpiredMessages();
            res.json({ success: true, cleaned });
        });
        
        // 获取消息统计
        this.router.get('/messages/stats', (req, res) => {
            const stats = this.messageRouter.getStats();
            res.json({ success: true, stats });
        });
        
        // ========== 任务协作 API ==========
        
        // 创建协作任务
        this.router.post('/tasks', (req, res) => {
            const config = req.body;
            
            try {
                const task = this.taskCollaborator.createTask(config);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取任务
        this.router.get('/tasks/:taskId', (req, res) => {
            const { taskId } = req.params;
            
            const task = this.taskCollaborator.getTask(taskId);
            
            if (!task) {
                res.status(404).json({ success: false, error: 'Task not found' });
            } else {
                res.json({ success: true, task });
            }
        });
        
        // 获取所有任务
        this.router.get('/tasks', (req, res) => {
            const filter = {
                status: req.query.status,
                initiator: req.query.initiator,
                agent_id: req.query.agent_id
            };
            
            const tasks = this.taskCollaborator.getAllTasks(filter);
            res.json({ success: true, tasks });
        });
        
        // 开始任务
        this.router.post('/tasks/:taskId/start', (req, res) => {
            const { taskId } = req.params;
            
            try {
                const task = this.taskCollaborator.startTask(taskId);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 完成任务
        this.router.post('/tasks/:taskId/complete', (req, res) => {
            const { taskId } = req.params;
            const { result } = req.body;
            
            try {
                const task = this.taskCollaborator.completeTask(taskId, result);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 失败任务
        this.router.post('/tasks/:taskId/fail', (req, res) => {
            const { taskId } = req.params;
            const { error } = req.body;
            
            try {
                const task = this.taskCollaborator.failTask(taskId, error);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 取消任务
        this.router.post('/tasks/:taskId/cancel', (req, res) => {
            const { taskId } = req.params;
            
            try {
                const task = this.taskCollaborator.cancelTask(taskId);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 添加子任务
        this.router.post('/tasks/:taskId/subtasks', (req, res) => {
            const { taskId } = req.params;
            const { agent_id, description, dependencies = [] } = req.body;
            
            try {
                const subtask = this.taskCollaborator.addSubtask(taskId, agent_id, description, dependencies);
                res.json({ success: true, subtask });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 完成子任务
        this.router.post('/tasks/:taskId/subtasks/:subtaskId/complete', (req, res) => {
            const { taskId, subtaskId } = req.params;
            const { result } = req.body;
            
            try {
                const subtask = this.taskCollaborator.completeSubtask(taskId, subtaskId, result);
                res.json({ success: true, subtask });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取可执行的子任务
        this.router.get('/tasks/:taskId/runnable', (req, res) => {
            const { taskId } = req.params;
            
            const subtasks = this.taskCollaborator.getRunnableSubtasks(taskId);
            res.json({ success: true, subtasks });
        });
        
        // 获取Agent的任务列表
        this.router.get('/tasks/agent/:agentId', (req, res) => {
            const { agentId } = req.params;
            
            const tasks = this.taskCollaborator.getAgentTasks(agentId);
            res.json({ success: true, tasks });
        });
        
        // 聚合结果
        this.router.get('/tasks/:taskId/results', (req, res) => {
            const { taskId } = req.params;
            const { aggregation_type = 'all' } = req.query;
            
            const results = this.taskCollaborator.aggregateResults(taskId, aggregation_type);
            res.json({ success: true, results });
        });
        
        // 获取任务统计
        this.router.get('/tasks/stats', (req, res) => {
            const stats = this.taskCollaborator.getStats();
            res.json({ success: true, stats });
        });
        
        // ========== 智能委托 API ==========
        
        // 委托任务
        this.router.post('/delegate', async (req, res) => {
            const { initiator_id, ...taskRequest } = req.body;
            
            try {
                const result = await this.smartDelegator.delegate(initiator_id, taskRequest);
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 处理Agent返回的结果
        this.router.post('/delegate/result', (req, res) => {
            const { agent_id, task_id, subtask_id, result } = req.body;
            
            try {
                const response = this.smartDelegator.handleAgentResult(
                    agent_id,
                    task_id,
                    subtask_id,
                    result
                );
                res.json(response);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // 获取委托历史
        this.router.get('/delegate/history', (req, res) => {
            const { limit = 20 } = req.query;
            
            const history = this.smartDelegator.getDelegationHistory(parseInt(limit));
            res.json({ success: true, history });
        });
        
        // 获取委托统计
        this.router.get('/delegate/stats', (req, res) => {
            const stats = this.smartDelegator.getStats();
            res.json({ success: true, stats });
        });
        
        // ========== 综合统计 API ==========
        
        // 获取系统综合统计
        this.router.get('/stats', (req, res) => {
            const stats = {
                abilities: this.abilityMatrix.getStats(),
                messages: this.messageRouter.getStats(),
                tasks: this.taskCollaborator.getStats(),
                delegation: this.smartDelegator.getStats()
            };
            
            res.json({ success: true, stats });
        });
    }
    
    // 获取Express Router
    getRouter() {
        return this.router;
    }
    
    // 获取核心组件（用于外部访问）
    getComponents() {
        return {
            abilityMatrix: this.abilityMatrix,
            messageRouter: this.messageRouter,
            taskCollaborator: this.taskCollaborator,
            smartDelegator: this.smartDelegator
        };
    }
}

module.exports = CollaborationAPI;
