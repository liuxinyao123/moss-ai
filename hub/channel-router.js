/**
 * DSclaw - Hub: Channel Router
 * 
 * Routes incoming messages from different platforms/bridges to the correct agent
 */

class ChannelHub {
    constructor(agentManager, engine) {
        this.agentManager = agentManager;
        this.engine = engine;
        this.routers = {
            channel: new (require('./../lib/bridge')).ChannelRouter(),
            dm: new (require('./../lib/bridge')).DMRouter()
        };
    }
    
    // Route incoming message from a bridge
    async route(platform, payload) {
        let agentId;
        
        if (platform === 'channel') {
            agentId = this.routers.channel.getActiveAgent(payload.chat.id);
        } else if (platform === 'dm') {
            agentId = this.routers.dm.getAgentForUser(payload.sender.id);
        }
        
        if (!agentId) {
            // No active agent selected
            return { error: 'No active agent selected' };
        }
        
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return { error: 'Agent not found' };
        }
        
        // Process the message with the agent's engine
        const message = payload.message.text;
        try {
            const result = await this.engine.processMessage(agent, message);
            return { success: true, response: result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    // Set active agent for a channel
    setActiveAgent(platform, targetId, agentId) {
        if (platform === 'channel') {
            this.routers.channel.setActiveAgent(targetId, agentId);
        } else if (platform === 'dm') {
            this.routers.dm.setAgentForUser(targetId, agentId);
        }
    }
}

module.exports = ChannelHub;
