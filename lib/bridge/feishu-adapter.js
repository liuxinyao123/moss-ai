/**
 * DSclaw - Bridge: Feishu Adapter
 * 
 * Receive message from Feishu webhook, route to agent, send response back
 */

class FeishuAdapter {
    constructor(config, hub) {
        this.config = config;
        this.hub = hub;
        this.appId = config.appId;
        this.appSecret = config.appSecret;
    }
    
    // Handle webhook challenge
    handleChallenge(challenge) {
        return { challenge };
    }
    
    // Handle message
    async handleMessage(event) {
        const { sender, message, chat } = event;
        if (!message.content) return;
        
        // Get active agent
        const agent = this.hub.getActiveAgent();
        if (!agent) {
            this.sendText(chat.chat_id, '请先选择一个 Agent');
            return;
        }
        
        try {
            const response = await agent.engine.processMessage(message.content);
            this.sendText(chat.chat_id, response);
        } catch (e) {
            this.sendText(chat.chat_id, `错误: ${e.message}`);
        }
    }
    
    // Get access token
    async getAccessToken() {
        const res = await fetch(`https://open.feishu.cn/open-apis/authen/v1/oidc/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app_id: this.appId,
                app_secret: this.appSecret
            })
        });
        const data = await res.json();
        return data.tenant_access_token;
    }
    
    // Send text message
    async sendText(chatId, text) {
        const token = await this.getAccessToken();
        return fetch(`https://open.feishu.cn/open-apis/im/v1/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receive_id: chatId,
                content: JSON.stringify([{
                    "tag": "text",
                    "text": text
                }])
            })
        });
    }
}

module.exports = FeishuAdapter;
