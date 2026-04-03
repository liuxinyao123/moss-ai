/**
 * DSclaw - Hub Entry
 * 
 * The hub handles:
 *  - Heartbeat periodic checking for desk file changes
 *  - Cron scheduled task scheduling 
 *  - Channel message routing from external bridges
 */

const AgentManager = require('../core/agent-manager');
const Engine = require('../core/engine');
const ChannelHub = require('./channel-router');
const HeartbeatMonitor = require('./heartbeat');
const CronScheduler = require('./cron-scheduler');
const ActivityStore = require('./activity-store');

class Hub {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.agentManager = new AgentManager(path.join(workspaceRoot, 'agents'));
        this.channelHub = new ChannelHub(this.agentManager);
        this.activityStore = new ActivityStore(path.join(workspaceRoot, 'activity', 'activity.json'));
        this.cronScheduler = new CronScheduler(this);
    }
    
    // Start all background services
    start() {
        // Start heartbeat for each agent
        const agents = this.agentManager.listAgents();
        for (const agentId of agents) {
            const agent = this.agentManager.getAgent(agentId);
            const heartbeat = new HeartbeatMonitor(this, agentId);
            heartbeat.start();
            console.log(`[hub] Started heartbeat for ${agentId}`);
        }
        
        // Load and start cron jobs
        const cronFile = path.join(this.workspaceRoot, 'cron-jobs.json');
        const { jobs } = this.cronScheduler.loadFromFile(cronFile);
        for (const job of jobs) {
            this.cronScheduler.schedule(job.cronExpr, job.agentId, () => {
                // Run the scheduled job
                console.log(`[cron] Running ${job.name} for ${job.agentId}`);
            });
        }
        
        console.log('[hub] All background services started');
    }
}

module.exports = Hub;
