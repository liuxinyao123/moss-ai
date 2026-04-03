/**
 * DSclaw - 任务协作引擎
 * 
 * 管理跨智能体的任务链追踪、任务状态同步、任务结果聚合
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class TaskCollaborator {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.tasksDir = path.join(workspaceRoot, 'collaboration-tasks');
        this.tasks = new Map(); // taskId -> task
        
        fs.mkdirSync(this.tasksDir, { recursive: true });
        this.loadTasks();
    }
    
    // 加载所有任务
    loadTasks() {
        if (!fs.existsSync(this.tasksDir)) return;
        
        const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.json'));
        
        for (const file of files) {
            const taskId = file.replace('.json', '');
            const taskData = JSON.parse(fs.readFileSync(
                path.join(this.tasksDir, file),
                'utf-8'
            ));
            this.tasks.set(taskId, taskData);
        }
    }
    
    // 创建协作任务
    createTask(config) {
        const taskId = uuidv4();
        
        const task = {
            id: taskId,
            name: config.name || '未命名任务',
            description: config.description || '',
            
            // 任务发起者
            initiator: config.initiator || null,
            
            // 任务状态
            status: 'pending', // pending, running, completed, failed, cancelled
            
            // 子任务（任务链）
            subtasks: [],
            
            // 任务依赖
            dependencies: config.dependencies || [],
            
            // 任务优先级
            priority: config.priority || 'normal',
            
            // 超时设置（毫秒）
            timeout: config.timeout || 300000, // 默认5分钟
            
            // 创建时间
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            
            // 任务进度
            progress: {
                total: 0,
                completed: 0,
                percentage: 0
            },
            
            // 任务结果
            results: [],
            
            // 错误信息
            errors: [],
            
            // 元数据
            metadata: config.metadata || {}
        };
        
        this.tasks.set(taskId, task);
        this.saveTask(taskId);
        
        return task;
    }
    
    // 添加子任务
    addSubtask(parentTaskId, agentId, description, dependencies = []) {
        const task = this.tasks.get(parentTaskId);
        if (!task) {
            throw new Error(`任务 ${parentTaskId} 不存在`);
        }
        
        const subtaskId = uuidv4();
        
        const subtask = {
            id: subtaskId,
            parent_id: parentTaskId,
            agent_id: agentId,
            description,
            status: 'pending',
            dependencies,
            result: null,
            error: null,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null
        };
        
        task.subtasks.push(subtask);
        task.progress.total = task.subtasks.length;
        
        this.saveTask(parentTaskId);
        
        return subtask;
    }
    
    // 开始任务
    startTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`任务 ${taskId} 不存在`);
        }
        
        if (task.status !== 'pending') {
            throw new Error(`任务状态错误: ${task.status}`);
        }
        
        task.status = 'running';
        task.started_at = new Date().toISOString();
        
        // 设置超时
        if (task.timeout) {
            setTimeout(() => {
                const currentTask = this.tasks.get(taskId);
                if (currentTask && currentTask.status === 'running') {
                    this.failTask(taskId, '任务超时');
                }
            }, task.timeout);
        }
        
        this.saveTask(taskId);
        
        return task;
    }
    
    // 开始子任务
    startSubtask(parentTaskId, subtaskId) {
        const task = this.tasks.get(parentTaskId);
        if (!task) {
            throw new Error(`任务 ${parentTaskId} 不存在`);
        }
        
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (!subtask) {
            throw new Error(`子任务 ${subtaskId} 不存在`);
        }
        
        if (subtask.status !== 'pending') {
            throw new Error(`子任务状态错误: ${subtask.status}`);
        }
        
        subtask.status = 'running';
        subtask.started_at = new Date().toISOString();
        
        this.saveTask(parentTaskId);
        
        return subtask;
    }
    
    // 完成子任务
    completeSubtask(parentTaskId, subtaskId, result) {
        const task = this.tasks.get(parentTaskId);
        if (!task) {
            throw new Error(`任务 ${parentTaskId} 不存在`);
        }
        
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (!subtask) {
            throw new Error(`子任务 ${subtaskId} 不存在`);
        }
        
        subtask.status = 'completed';
        subtask.result = result;
        subtask.completed_at = new Date().toISOString();
        
        // 更新进度
        task.progress.completed = task.subtasks.filter(st => st.status === 'completed').length;
        task.progress.percentage = (task.progress.completed / task.progress.total) * 100;
        
        // 收集结果
        task.results.push({
            subtask_id: subtaskId,
            agent_id: subtask.agent_id,
            result: result,
            completed_at: subtask.completed_at
        });
        
        this.saveTask(parentTaskId);
        
        // 检查是否所有子任务都完成
        if (task.progress.completed === task.progress.total) {
            this.completeTask(parentTaskId);
        }
        
        return subtask;
    }
    
    // 子任务失败
    failSubtask(parentTaskId, subtaskId, error) {
        const task = this.tasks.get(parentTaskId);
        if (!task) {
            throw new Error(`任务 ${parentTaskId} 不存在`);
        }
        
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (!subtask) {
            throw new Error(`子任务 ${subtaskId} 不存在`);
        }
        
        subtask.status = 'failed';
        subtask.error = error;
        subtask.completed_at = new Date().toISOString();
        
        // 记录错误
        task.errors.push({
            subtask_id: subtaskId,
            agent_id: subtask.agent_id,
            error: error,
            timestamp: new Date().toISOString()
        });
        
        this.saveTask(parentTaskId);
        
        return subtask;
    }
    
    // 完成任务
    completeTask(taskId, finalResult = null) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`任务 ${taskId} 不存在`);
        }
        
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        task.progress.percentage = 100;
        
        if (finalResult) {
            task.final_result = finalResult;
        }
        
        this.saveTask(taskId);
        
        return task;
    }
    
    // 任务失败
    failTask(taskId, error) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`任务 ${taskId} 不存在`);
        }
        
        task.status = 'failed';
        task.completed_at = new Date().toISOString();
        task.errors.push({
            error: error,
            timestamp: new Date().toISOString()
        });
        
        this.saveTask(taskId);
        
        return task;
    }
    
    // 取消任务
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`任务 ${taskId} 不存在`);
        }
        
        task.status = 'cancelled';
        task.completed_at = new Date().toISOString();
        
        // 取消所有运行中的子任务
        task.subtasks.forEach(subtask => {
            if (subtask.status === 'running') {
                subtask.status = 'cancelled';
                subtask.completed_at = new Date().toISOString();
            }
        });
        
        this.saveTask(taskId);
        
        return task;
    }
    
    // 获取任务
    getTask(taskId) {
        return this.tasks.get(taskId) || null;
    }
    
    // 获取所有任务
    getAllTasks(filter = {}) {
        let tasks = Array.from(this.tasks.values());
        
        if (filter.status) {
            tasks = tasks.filter(t => t.status === filter.status);
        }
        
        if (filter.initiator) {
            tasks = tasks.filter(t => t.initiator === filter.initiator);
        }
        
        if (filter.agent_id) {
            tasks = tasks.filter(t => 
                t.subtasks.some(st => st.agent_id === filter.agent_id)
            );
        }
        
        // 按创建时间倒序
        tasks.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        return tasks;
    }
    
    // 获取可执行的子任务（依赖已满足）
    getRunnableSubtasks(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return [];
        
        const runnable = [];
        
        for (const subtask of task.subtasks) {
            // 只处理pending状态的子任务
            if (subtask.status !== 'pending') continue;
            
            // 检查依赖是否都已完成
            const dependencies = subtask.dependencies;
            const allDependenciesComplete = dependencies.every(depId => {
                const depSubtask = task.subtasks.find(st => st.id === depId);
                return depSubtask && depSubtask.status === 'completed';
            });
            
            if (allDependenciesComplete) {
                runnable.push(subtask);
            }
        }
        
        return runnable;
    }
    
    // 获取Agent的任务列表
    getAgentTasks(agentId) {
        const tasks = [];
        
        this.tasks.forEach(task => {
            const agentSubtasks = task.subtasks.filter(st => st.agent_id === agentId);
            if (agentSubtasks.length > 0) {
                tasks.push({
                    task_id: task.id,
                    task_name: task.name,
                    status: task.status,
                    subtasks: agentSubtasks
                });
            }
        });
        
        return tasks;
    }
    
    // 获取等待中的依赖任务
    getWaitingSubtasks(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return [];
        
        const waiting = [];
        
        for (const subtask of task.subtasks) {
            if (subtask.status !== 'pending') continue;
            
            const incompleteDependencies = subtask.dependencies.filter(depId => {
                const depSubtask = task.subtasks.find(st => st.id === depId);
                return !depSubtask || depSubtask.status !== 'completed';
            });
            
            if (incompleteDependencies.length > 0) {
                waiting.push({
                    subtask,
                    waiting_for: incompleteDependencies
                });
            }
        }
        
        return waiting;
    }
    
    // 聚合结果（根据配置）
    aggregateResults(taskId, aggregationType = 'all') {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        switch (aggregationType) {
            case 'all':
                return task.results;
            
            case 'latest':
                return task.results[task.results.length - 1];
            
            case 'merged':
                // 合并所有结果
                return task.results.reduce((merged, r) => {
                    return { ...merged, ...r.result };
                }, {});
            
            case 'array':
                return task.results.map(r => r.result);
            
            default:
                return task.results;
        }
    }
    
    // 保存任务
    saveTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return;
        
        const taskFile = path.join(this.tasksDir, `${taskId}.json`);
        fs.writeFileSync(taskFile, JSON.stringify(task, null, 2), 'utf-8');
    }
    
    // 删除任务
    deleteTask(taskId) {
        const taskFile = path.join(this.tasksDir, `${taskId}.json`);
        
        if (fs.existsSync(taskFile)) {
            fs.unlinkSync(taskFile);
        }
        
        this.tasks.delete(taskId);
    }
    
    // 获取统计信息
    getStats() {
        const tasks = Array.from(this.tasks.values());
        
        const statusCount = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0
        };
        
        let totalSubtasks = 0;
        
        tasks.forEach(task => {
            statusCount[task.status]++;
            totalSubtasks += task.subtasks.length;
        });
        
        return {
            total_tasks: tasks.length,
            status_breakdown: statusCount,
            total_subtasks: totalSubtasks,
            active_tasks: statusCount.pending + statusCount.running
        };
    }
}

module.exports = TaskCollaborator;
