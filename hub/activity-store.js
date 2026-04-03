/**
 * DSclaw - Hub: Activity Store
 * 
 * Records all heartbeat/cron activity for viewing in frontend
 */

const fs = require('fs');
const path = require('path');

class ActivityStore {
    constructor(storePath) {
        this.storePath = storePath;
        this.activities = this.load();
    }
    
    load() {
        if (!fs.existsSync(this.storePath)) {
            return [];
        }
        try {
            return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
        } catch (e) {
            console.error('Error loading activity store', e);
            return [];
        }
    }
    
    save() {
        const dir = path.dirname(this.storePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.storePath, JSON.stringify(this.activities, null, 2), 'utf-8');
    }
    
    recordActivity(agentId, data) {
        this.activities.unshift({
            id: `${agentId}-${Date.now()}`,
            agentId,
            timestamp: new Date().toISOString(),
            ...data
        });
        
        // Keep only last 100 activities
        if (this.activities.length > 100) {
            this.activities = this.activities.slice(0, 100);
        }
        
        this.save();
    }
    
    listRecent(limit = 50) {
        return this.activities.slice(0, limit);
    }
    
    clear() {
        this.activities = [];
        this.save();
    }
}

module.exports = ActivityStore;
