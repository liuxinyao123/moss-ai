/**
 * DSclaw - Identity System
 * 
 * Each Agent has its own folder with these files:
 * - identity.md ⟹ Role/character/persona setting
 * - ishiki.md ⟹ Consciousness/values/behavior principles (inner voice style)
 * - pinned.md ⟹ Pinned permanent memory (user or agent written)
 * - yuan.md ⟹ "yuanfen" / special relationship notes with user
 * - config.yaml ⟹ Agent configuration (models, feature flags)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

class IdentityManager {
    constructor(agentDir) {
        this.agentDir = agentDir;
    }
    
    // Read all identity files
    readAll() {
        const read = name => {
            const filePath = path.join(this.agentDir, name);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
            return '';
        };
        
        return {
            identity: read('identity.md'),
            ishiki: read('ishiki.md'),
            pinned: read('pinned.md'),
            yuan: read('yuan.md'),
            config: this.readConfig()
        };
    }
    
    // Read and parse config
    readConfig() {
        const filePath = path.join(this.agentDir, 'config.yaml');
        const defaultConfig = {
            model: {
                chat: 'default',
                utility: 'default',
                utility_large: 'default'
            },
            skills: {
                allow_github_fetch: false
            },
            sandbox: {
                enabled: true
            }
        };
        
        if (!fs.existsSync(filePath)) {
            return defaultConfig;
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = yaml.parse(content);
            return { ...defaultConfig, ...parsed };
        } catch (e) {
            console.error('Error parsing config.yaml', e);
            return defaultConfig;
        }
    }
    
    // Assemble full identity prompt
    assemblePrompt() {
        const { identity, ishiki, pinned, yuan } = this.readAll();
        
        let prompt = '';
        
        if (identity.trim()) {
            prompt += `## 角色设定\n\n${identity}\n\n`;
        }
        
        if (ishiki.trim()) {
            prompt += `## 行为准则\n\n${ishiki}\n\n`;
        }
        
        if (pinned.trim()) {
            prompt += `## 永久置顶记忆\n\n${pinned}\n\n`;
        }
        
        if (yuan.trim()) {
            prompt += `## 缘分记录\n\n${yuan}\n\n`;
        }
        
        return prompt.trim();
    }
    
    // Update pinned memory
    updatePinned(content) {
        const filePath = path.join(this.agentDir, 'pinned.md');
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    
    // Append to yuan file
    appendYuan(content) {
        const filePath = path.join(this.agentDir, 'yuan.md');
        const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
        const updated = existing + (existing ? '\n\n' : '') + content;
        fs.writeFileSync(filePath, updated, 'utf-8');
    }
}

module.exports = IdentityManager;
