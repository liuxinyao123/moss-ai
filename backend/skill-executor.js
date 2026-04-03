/**
 * 技能执行器
 * 负责技能的执行、调度和资源管理
 */

const EventEmitter = require('events');
const os = require('os');

class SkillExecutor extends EventEmitter {
  constructor(skillLoader, options = {}) {
    super();
    this.skillLoader = skillLoader;
    this.options = {
      timeout: 30000, // 默认30秒超时
      maxConcurrent: 5, // 最大并发数
      memoryLimit: 256, // 内存限制(MB)
      cpuLimit: 50, // CPU限制(百分比)
      enableSandbox: true, // 启用沙箱
      ...options
    };
    
    this.executions = new Map(); // executionId -> executionInfo
    this.queue = []; // 等待执行的队列
    this.activeExecutions = new Set(); // 正在执行的技能
    this.executionIdCounter = 1;
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0
    };
    
    this.logger = console;
    this.isRunning = false;
    
    // 启动执行器
    this.start();
  }
  
  // 启动执行器
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processQueue();
    
    this.logger.info('技能执行器已启动');
    this.emit('started');
  }
  
  // 停止执行器
  stop() {
    this.isRunning = false;
    
    // 取消所有超时执行
    for (const execution of this.executions.values()) {
      if (execution.timeoutId) {
        clearTimeout(execution.timeoutId);
      }
    }
    
    this.logger.info('技能执行器已停止');
    this.emit('stopped');
  }
  
  // 处理执行队列
  async processQueue() {
    while (this.isRunning) {
      // 检查是否有空闲槽位
      if (this.activeExecutions.size >= this.options.maxConcurrent) {
        await this.sleep(100);
        continue;
      }
      
      // 获取队列中的下一个执行
      const nextExecution = this.queue.shift();
      if (!nextExecution) {
        await this.sleep(100);
        continue;
      }
      
      // 执行技能
      this.executeSkill(nextExecution);
    }
  }
  
  // 执行技能
  async executeSkill(executionInfo) {
    const { executionId, skillId, params, resolve, reject } = executionInfo;
    
    // 标记为正在执行
    this.activeExecutions.add(executionId);
    
    const startTime = Date.now();
    let timeoutId = null;
    
    try {
      // 设置超时
      timeoutId = setTimeout(() => {
        this.handleExecutionTimeout(executionId);
      }, this.options.timeout);
      
      executionInfo.timeoutId = timeoutId;
      executionInfo.startTime = startTime;
      executionInfo.status = 'running';
      
      this.emit('executionStarted', { executionId, skillId, startTime });
      
      // 执行技能
      const result = await this.skillLoader.executeSkill(skillId, params);
      
      // 计算执行时间
      const executionTime = Date.now() - startTime;
      
      // 清理超时
      if (timeoutId) clearTimeout(timeoutId);
      
      // 更新执行信息
      executionInfo.status = 'completed';
      executionInfo.endTime = Date.now();
      executionInfo.executionTime = executionTime;
      executionInfo.result = result;
      
      // 更新统计
      this.updateStats(true, executionTime);
      
      // 触发完成事件
      this.emit('executionCompleted', {
        executionId,
        skillId,
        result,
        executionTime
      });
      
      // 从活跃执行中移除
      this.activeExecutions.delete(executionId);
      
      // 解析Promise
      resolve({
        executionId,
        skillId,
        result,
        executionTime,
        status: 'success'
      });
      
    } catch (error) {
      // 计算执行时间
      const executionTime = Date.now() - startTime;
      
      // 清理超时
      if (timeoutId) clearTimeout(timeoutId);
      
      // 更新执行信息
      executionInfo.status = 'failed';
      executionInfo.endTime = Date.now();
      executionInfo.executionTime = executionTime;
      executionInfo.error = error.message;
      
      // 更新统计
      this.updateStats(false, executionTime);
      
      // 触发失败事件
      this.emit('executionFailed', {
        executionId,
        skillId,
        error: error.message,
        executionTime
      });
      
      // 从活跃执行中移除
      this.activeExecutions.delete(executionId);
      
      // 拒绝Promise
      reject({
        executionId,
        skillId,
        error: error.message,
        executionTime,
        status: 'error'
      });
    } finally {
      // 清理执行记录（保留一段时间用于调试）
      setTimeout(() => {
        this.executions.delete(executionId);
      }, 5 * 60 * 1000); // 5分钟后清理
    }
  }
  
  // 处理执行超时
  handleExecutionTimeout(executionId) {
    const executionInfo = this.executions.get(executionId);
    if (!executionInfo || executionInfo.status !== 'running') {
      return;
    }
    
    // 标记为超时
    executionInfo.status = 'timeout';
    executionInfo.endTime = Date.now();
    executionInfo.executionTime = this.options.timeout;
    executionInfo.error = '执行超时';
    
    // 从活跃执行中移除
    this.activeExecutions.delete(executionId);
    
    // 更新统计
    this.updateStats(false, this.options.timeout);
    
    // 触发超时事件
    this.emit('executionTimeout', {
      executionId,
      skillId: executionInfo.skillId,
      executionTime: this.options.timeout
    });
    
    // 拒绝Promise
    if (executionInfo.reject) {
      executionInfo.reject({
        executionId,
        skillId: executionInfo.skillId,
        error: '执行超时',
        executionTime: this.options.timeout,
        status: 'timeout'
      });
    }
  }
  
  // 执行技能（公共接口）
  async run(skillId, params = {}) {
    return new Promise((resolve, reject) => {
      const executionId = `exec_${Date.now()}_${this.executionIdCounter++}`;
      
      const executionInfo = {
        executionId,
        skillId,
        params,
        resolve,
        reject,
        status: 'queued',
        queuedAt: Date.now()
      };
      
      // 存储执行信息
      this.executions.set(executionId, executionInfo);
      
      // 添加到队列
      this.queue.push(executionInfo);
      
      this.emit('executionQueued', { executionId, skillId, queuedAt: Date.now() });
      
      // 返回执行ID，允许跟踪执行状态
      return executionId;
    });
  }
  
  // 获取执行状态
  getExecutionStatus(executionId) {
    const executionInfo = this.executions.get(executionId);
    if (!executionInfo) {
      return {
        found: false,
        message: '执行记录不存在或已过期'
      };
    }
    
    const status = {
      executionId,
      skillId: executionInfo.skillId,
      status: executionInfo.status,
      queuedAt: executionInfo.queuedAt,
      startTime: executionInfo.startTime,
      endTime: executionInfo.endTime,
      executionTime: executionInfo.executionTime
    };
    
    if (executionInfo.error) {
      status.error = executionInfo.error;
    }
    
    if (executionInfo.result) {
      status.result = executionInfo.result;
    }
    
    return status;
  }
  
  // 取消执行
  cancelExecution(executionId) {
    const executionInfo = this.executions.get(executionId);
    if (!executionInfo) {
      return {
        success: false,
        message: '执行记录不存在'
      };
    }
    
    // 如果还在队列中，从队列移除
    if (executionInfo.status === 'queued') {
      const index = this.queue.findIndex(e => e.executionId === executionId);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
      
      executionInfo.status = 'cancelled';
      executionInfo.endTime = Date.now();
      executionInfo.executionTime = Date.now() - executionInfo.queuedAt;
      executionInfo.error = '执行被取消';
      
      this.emit('executionCancelled', { executionId });
      
      if (executionInfo.reject) {
        executionInfo.reject({
          executionId,
          skillId: executionInfo.skillId,
          error: '执行被取消',
          executionTime: executionInfo.executionTime,
          status: 'cancelled'
        });
      }
      
      return {
        success: true,
        message: '执行已取消'
      };
    }
    
    // 如果正在执行，无法取消
    if (executionInfo.status === 'running') {
      return {
        success: false,
        message: '执行正在进行中，无法取消'
      };
    }
    
    // 如果已完成，返回当前状态
    return {
      success: false,
      message: `执行已${executionInfo.status}，无法取消`,
      status: executionInfo.status
    };
  }
  
  // 更新统计信息
  updateStats(success, executionTime) {
    this.stats.totalExecutions++;
    this.stats.totalExecutionTime += executionTime;
    this.stats.averageExecutionTime = 
      this.stats.totalExecutionTime / this.stats.totalExecutions;
    
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    
    this.emit('statsUpdated', { ...this.stats });
  }
  
  // 获取执行器统计
  getStats() {
    const queueStats = {
      queueSize: this.queue.length,
      activeExecutions: this.activeExecutions.size,
      maxConcurrent: this.options.maxConcurrent,
      systemLoad: this.getSystemLoad()
    };
    
    return {
      ...this.stats,
      ...queueStats,
      successRate: this.stats.totalExecutions > 0 
        ? (this.stats.successfulExecutions / this.stats.totalExecutions * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  // 获取系统负载
  getSystemLoad() {
    const loadAvg = os.loadavg();
    const cpus = os.cpus().length;
    
    return {
      load1: loadAvg[0],
      load5: loadAvg[1],
      load15: loadAvg[2],
      cpuCount: cpus,
      normalizedLoad1: loadAvg[0] / cpus,
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      memoryUsage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
    };
  }
  
  // 获取活跃执行列表
  getActiveExecutions() {
    return Array.from(this.activeExecutions).map(executionId => {
      const info = this.executions.get(executionId);
      return info ? {
        executionId,
        skillId: info.skillId,
        startTime: info.startTime,
        executionTime: Date.now() - info.startTime
      } : null;
    }).filter(Boolean);
  }
  
  // 获取队列状态
  getQueueStatus() {
    return {
      queue: this.queue.map(e => ({
        executionId: e.executionId,
        skillId: e.skillId,
        queuedAt: e.queuedAt,
        waitTime: Date.now() - e.queuedAt
      })),
      active: this.getActiveExecutions(),
      stats: this.getStats()
    };
  }
  
  // 清理旧执行记录
  cleanupOldExecutions(maxAge = 30 * 60 * 1000) { // 默认30分钟
    const now = Date.now();
    let cleaned = 0;
    
    for (const [executionId, executionInfo] of this.executions.entries()) {
      if (executionInfo.endTime && (now - executionInfo.endTime) > maxAge) {
        this.executions.delete(executionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.info(`清理了 ${cleaned} 个旧执行记录`);
    }
    
    return { cleaned };
  }
  
  // 设置执行器选项
  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.logger.info('执行器选项已更新:', this.options);
    this.emit('optionsUpdated', this.options);
  }
  
  // 简单的sleep函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SkillExecutor;