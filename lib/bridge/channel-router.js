/**
 * DSclaw - Bridge: Base Channel Router
 * 
 * Route messages from different bridges to the correct agent,
 * send responses back to the correct channel
 */

class ChannelRouter {
    constructor() {
        this.rooms = new Map(); // channel → active agent
    }
    
    // Set active agent for a channel
    setActiveAgent(channelId, agentId) {
        this.rooms.set(channelId, agentId);
    }
    
    // Get active agent for a channel
    getActiveAgent(channelId) {
        return this.rooms.get(channelId);
    }
}

module.exports = ChannelRouter;
