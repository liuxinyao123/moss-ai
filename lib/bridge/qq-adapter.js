/**
 * DSclaw - Bridge: QQ Adapter
 * 
 * Receive message from QQ bot v2 API
 */

class QQAdapter {
    constructor(config, hub) {
        this.config = config;
        this.hub = hub;
        this.appId = config.appId;
        this.token = config.token;
    }
    
    // Handle message from websocket
    async handleMessage(payload) {
        if (payload.post_type !== 'message') return;
        
        const { user_id, group_id, message } = payload;
        const agent = this.hub.getActiveAgent();
        
        if (!agent) {
            this.sendText(group_id || user_id, '请先选择一个 Agent');
            return;
        }
        
        // Extract plain text
        let text = '';
        for (const seg of message) {
            if (seg.type === 'text') {
                text += seg.data.text;
            }
        }
        
        if (!text.trim()) return;
        
        try {
            const response = await agent.engine.processMessage(text);
            this.sendText(group_id || user_id, response);
        } catch (e) {
            this.sendText(group_id || user_id, `错误: ${e.message}`);
        }
    }
    
    // Send text via CQHTTP API
    async sendText(targetId, text) {
        return fetch(`http://${this.config.host}/send_msg`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: targetId,
                message: text
            })
        });
    }
}

module.exports = QQAdapter;
