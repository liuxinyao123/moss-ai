/**
 * DSclaw - Bridge: Direct Message Router
 * 
 * Route direct messages (DM / private chat) to the correct agent
 */

class DMRouter {
    constructor() {
        this.userAgent = new Map(); // user id → agent id
    }
    
    setAgentForUser(userId, agentId) {
        this.userAgent.set(userId, agentId);
    }
    
    getAgentForUser(userId) {
        return this.userAgent.get(userId);
    }
}

module.exports = DMRouter;
