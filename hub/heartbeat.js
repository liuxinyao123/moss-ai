/**
 * Hub Heartbeat - 心跳处理器
 * 定期检查任务、文件变化，自主运行
 */

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

class Heartbeat {
  constructor(eventBus, agentManager, scheduler) {
    this.eventBus = eventBus;
    this.agentManager = agentManager;
    this.scheduler = scheduler;
    this.watchers = new Map();
    this.interval = 60 * 1000; // 默认1分钟心跳
    this.heartbeatId = null;
  }

  /**
   * 启动心跳
   */
  start(intervalMs = null) {
    if (intervalMs) {
      this.interval = intervalMs;
    }

    // 启动定时心跳
    this.heartbeatId = this.scheduler.heartbeat(this.interval, () => {
      this.beat();
    }, 'main-heartbeat');

    console.log(`[Heartbeat] Started heartbeat (${this.interval}ms)`);
  }

  /**
   * 单次心跳
   */
  beat() {
    // 发布心跳事件
    this.eventBus.emit('heartbeat:beat', {
      timestamp: Date.now()
    });

    // 检查所有Agent的desk文件变化
    this.checkAgentDesks();
  }

  /**
   * 监控Agent的desk目录变化
   */
  watchAgentDesk(agentId, deskPath) {
    if (this.watchers.has(agentId)) {
      this.watchers.get(agentId).close();
    }

    if (!fs.existsSync(deskPath)) {
      fs.mkdirSync(deskPath, { recursive: true });
    }

    // 初始化chokidar监控
    const watcher = chokidar.watch(deskPath, {
      ignored: /(^|[\/\\])\../, // 忽略点文件
      persistent: true
    });

    // 绑定事件
    watcher
      .on('add', (filePath) => {
        const relativePath = path.relative(deskPath, filePath);
        this.eventBus.emit('desk:add', {
          agentId,
          filePath,
          relativePath
        });
      })
      .on('change', (filePath) => {
        const relativePath = path.relative(deskPath, filePath);
        this.eventBus.emit('desk:change', {
          agentId,
          filePath,
          relativePath
        });
      })
      .on('unlink', (filePath) => {
        const relativePath = path.relative(deskPath, filePath);
        this.eventBus.emit('desk:delete', {
          agentId,
          filePath,
          relativePath
        });
      });

    this.watchers.set(agentId, watcher);
    console.log(`[Heartbeat] Started watching desk for agent: ${agentId}`);
  }

  /**
   * 停止监控Agent desk
   */
  unwatchAgentDesk(agentId) {
    if (this.watchers.has(agentId)) {
      this.watchers.get(agentId).close();
      this.watchers.delete(agentId);
      console.log(`[Heartbeat] Stopped watching desk for agent: ${agentId}`);
    }
  }

  /**
   * 检查所有Agent的desk
   */
  checkAgentDesks() {
    const agents = this.agentManager.listAgents();
    for (const agent of agents) {
      // 如果还没监控，开始监控
      if (!this.watchers.has(agent.id)) {
        const deskPath = this.agentManager.getAgentDeskPath(agent.id);
        if (deskPath) {
          this.watchAgentDesk(agent.id, deskPath);
        }
      }
    }
  }

  /**
   * 停止心跳
   */
  stop() {
    if (this.heartbeatId) {
      this.scheduler.cancel(this.heartbeatId);
      this.heartbeatId = null;
    }

    // 关闭所有监控器
    for (const [agentId, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    console.log('[Heartbeat] Stopped');
  }
}

module.exports = { Heartbeat };
