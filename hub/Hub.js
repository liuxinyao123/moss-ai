/**
 * MOSS-AI Hub
 * 
 * 独立处理后台任务：心跳、cron、频道路由、Agent消息
 * 与活动聊天会话分离，即使UI不激活也能自主工作
 */

const { Scheduler } = require('./Scheduler');
const { EventBus } = require('./EventBus');
const { ChannelRouter } = require('./ChannelRouter');
const { Heartbeat } = require('./Heartbeat');

class Hub {
  constructor(engineApi) {
    this.engine = engineApi;
    this.eventBus = new EventBus();
    this.scheduler = new Scheduler();
    this.channelRouter = null;
    this.heartbeat = null;
    this.initialized = false;
  }

  /**
   * 初始化Hub
   */
  async initialize() {
    // 频道路由器
    this.channelRouter = new ChannelRouter(
      this.eventBus,
      this.engine.channels
    );

    // 心跳处理器
    this.heartbeat = new Heartbeat(
      this.eventBus,
      this.engine.agents,
      this.scheduler
    );

    // 让全局可以访问eventBus（用于一些回调通知）
    global.eventBus = this.eventBus;

    // 启动调度器
    this.scheduler.start();

    // 启动心跳（默认每分钟）
    this.heartbeat.start(60 * 1000);

    this.initialized = true;
    console.log('[Hub] Hub initialized, background tasks running');
  }

  /**
   * 获取EventBus
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * 获取Scheduler
   */
  getScheduler() {
    return this.scheduler;
  }

  /**
   * 获取ChannelRouter
   */
  getChannelRouter() {
    return this.channelRouter;
  }

  /**
   * 获取Heartbeat
   */
  getHeartbeat() {
    return this.heartbeat;
  }

  /**
   * 计划cron任务
   */
  schedule(expression, callback, taskName) {
    return this.scheduler.schedule(expression, callback, taskName);
  }

  /**
   * 发布事件
   */
  emit(eventName, data) {
    return this.eventBus.emit(eventName, data);
  }

  /**
   * 订阅事件
   */
  on(eventName, handler) {
    return this.eventBus.on(eventName, handler);
  }

  /**
   * 路由外部消息
   */
  routeExternalMessage(...args) {
    return this.channelRouter.routeExternalMessage(...args);
  }

  /**
   * 关闭Hub
   */
  async shutdown() {
    this.heartbeat.stop();
    this.scheduler.stop();
    this.eventBus.removeAllListeners();
    this.initialized = false;
    console.log('[Hub] Hub shutdown');
  }
}

module.exports = { Hub };
