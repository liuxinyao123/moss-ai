/**
 * DSclaw - Hub: Cron Task Scheduler
 * 
 * Stores cron jobs in JSON, parses cron expressions, schedules them.
 * Runs across all agents, each agent has its own jobs.
 */

const cron = require('node-cron');

class CronScheduler {
    constructor(hub) {
        this.hub = hub;
        this.tasks = new Map(); // jobId → { task, agentId, scheduled }
        this.running = new Map();
    }
    
    // Load jobs from JSON
    loadFromFile(filePath) {
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return { jobs: [] };
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data;
    }
    
    // Schedule a job
    schedule(cronExpr, agentId, handler) {
        const jobId = `${agentId}-${Date.now()}`;
        const task = cron.schedule(cronExpr, async () => {
            console.log(`[cron] Running scheduled job for agent ${agentId}`);
            try {
                await handler();
                console.log(`[cron] Job completed for agent ${agentId}`);
            } catch (e) {
                console.error(`[cron] Job failed for agent ${agentId}:`, e);
            }
        });
        
        this.tasks.set(jobId, { cronExpr, agentId, task });
        this.running.set(jobId, task);
        
        return jobId;
    }
    
    // Cancel a job
    cancel(jobId) {
        const running = this.running.get(jobId);
        if (running) {
            running.destroy();
            this.running.delete(jobId);
            this.tasks.delete(jobId);
        }
    }
    
    // Cancel all jobs for an agent
    cancelAllForAgent(agentId) {
        for (const [jobId, task] of this.tasks) {
            if (task.agentId === agentId) {
                this.cancel(jobId);
            }
        }
    }
    
    // Save all jobs to JSON
    save(filePath) {
        const fs = require('fs');
        const jobs = Array.from(this.tasks.entries()).map(([id, job]) => ({
            id,
            cronExpr: job.cronExpr,
            agentId: job.agentId
        }));
        fs.writeFileSync(filePath, JSON.stringify({ jobs }, null, 2), 'utf-8');
    }
}

module.exports = CronScheduler;
