/**
 * Hub Scheduler - 调度器
 * 独立于活动会话处理后台任务、cron定时任务
 */

const cron = require('node-cron');
const EventEmitter = require('events');

class Scheduler {
  constructor() {
    this.tasks = new Map();
    this.initialized = false;
  }

  /**
   * 启动调度器
   */
  start() {
    this.initialized = true;
    console.log('[Scheduler] Scheduler started');
  }

  /**
   * 计划cron任务
   * @param {string} expression cron表达式
   * @param {Function} callback 回调函数
   * @param {string} taskName 任务名称
   */
  schedule(expression, callback, taskName) {
    const task = cron.schedule(expression, callback, {
      scheduled: true,
      recoverMissedExecutions: true
    });
    
    const id = taskName || `task_${Date.now()}`;
    this.tasks.set(id, { task, expression, callback, name: taskName });
    console.log(`[Scheduler] Scheduled task: ${id} (${expression})`);
    return id;
  }

  /**
   * 调度定时任务（一次性）
   */
  scheduleOnce(delayMs, callback, taskName) {
    const id = setTimeout(() => {
      callback();
      this.tasks.delete(id);
    }, delayMs);
    
    const taskId = taskName || `once_${Date.now()}`;
    this.tasks.set(taskId, { id, type: 'timeout', delayMs, callback });
    return taskId;
  }

  /**
   * 心跳任务（固定间隔）
   */
  heartbeat(intervalMs, callback, taskName) {
    const id = setInterval(callback, intervalMs);
    const taskId = taskName || `heartbeat_${Date.now()}`;
    this.tasks.set(taskId, { id, type: 'interval', intervalMs, callback });
    console.log(`[Scheduler] Started heartbeat: ${taskId} (${intervalMs}ms)`);
    return taskId;
  }

  /**
   * 取消任务
   */
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.task && typeof task.destroy === 'function') {
      task.task.destroy();
    } else if (task.type === 'timeout') {
      clearTimeout(task.id);
    } else if (task.type === 'interval') {
      clearInterval(task.id);
    }

    this.tasks.delete(taskId);
    console.log(`[Scheduler] Canceled task: ${taskId}`);
    return true;
  }

  /**
   * 列出所有任务
   */
  listTasks() {
    return Array.from(this.tasks.entries()).map(([id, task]) => ({
      id,
      name: task.name,
      type: task.type || 'cron',
      expression: task.expression
    }));
  }

  /**
   * 停止所有任务
   */
  stop() {
    for (const [id, task] of this.tasks) {
      if (task.task && typeof task.destroy === 'function') {
        task.task.destroy();
      } else if (task.type === 'timeout') {
        clearTimeout(task.id);
      } else if (task.type === 'interval') {
        clearInterval(task.id);
      }
    }
    this.tasks.clear();
    this.initialized = false;
    console.log('[Scheduler] All tasks stopped');
  }
}

module.exports = { Scheduler };
