/**
 * DSclaw - Bridge: Telegram Adapter
 * 
 * Receive message from Telegram webhook, route to agent, send response back
 */

class TelegramAdapter {
    constructor(config, hub) {
        this.config = config;
        this.hub = hub;
    }
    
    // Handle webhook update
    async handleUpdate(update) {
        // Extract message
        const message = update.message;
        if (!message) return;
        
        const chatId = message.chat.id;
        const text = message.text;
        
        // Route to active agent
        const agent = this.hub.getActiveAgent();
        if (!agent) {
            this.sendText(chatId, '请先选择一个 Agent');
            return;
        }
        
        // Process through engine
        try {
            const response = await agent.engine.processMessage(text);
            this.sendText(chatId, response);
        } catch (e) {
            this.sendText(chatId, `Error: ${e.message}`);
        }
    }
    
    sendText(chatId, text) {
        // Use Telegram bot API to send
        const url = `https://api.telegram.org/bot${this.config.token}/sendMessage`;
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });
    }
}

module.exports = TelegramAdapter;
