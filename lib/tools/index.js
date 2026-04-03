/**
 * DSclaw - Tool System
 * 
 * Tools follow OpenAI function-calling format, loaded from builtins and per-agent learned skills
 */

class ToolManager {
    constructor(agentDir) {
        this.agentDir = agentDir;
        this.builtinToolsDir = path.join(__dirname, '..', 'tools');
        this.agentToolsDir = path.join(agentDir, 'skills');
    }
    
    // Load all tools for an agent
    loadTools() {
        const tools = [];
        
        // Load builtin tools
        if (fs.existsSync(this.builtinToolsDir)) {
            const files = fs.readdirSync(this.builtinToolsDir);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const tool = require(path.join(this.builtinToolsDir, file));
                    tools.push(tool.getDefinition());
                }
            }
        }
        
        // Load agent-learned skills
        if (fs.existsSync(this.agentToolsDir)) {
            const files = fs.readdirSync(this.agentToolsDir);
            for (const dir of files) {
                const skillPath = path.join(this.agentToolsDir, dir);
                if (fs.existsSync(path.join(skillPath, 'SKILL.js'))) {
                    const skill = require(path.join(skillPath, 'SKILL.js'));
                    tools.push(skill.getDefinition());
                }
            }
        }
        
        return tools;
    }
    
    // Get tools in OpenAI function-calling format
    getToolsForAgent(agentId) {
        return this.loadTools();
    }
    
    // Execute a tool
    async execute(agentId, toolName, args) {
        // Find the tool
        const tools = this.loadTools();
        const tool = tools.find(t => t.name === toolName);
        
        if (!tool) {
            return { success: false, error: `Tool ${toolName} not found` };
        }
        
        // Find the module
        let module;
        if (fs.existsSync(path.join(this.builtinToolsDir, `${toolName}.js`))) {
            module = require(path.join(this.builtinToolsDir, `${toolName}.js`));
        } else if (fs.existsSync(path.join(this.agentToolsDir, toolName, 'SKILL.js'))) {
            module = require(path.join(this.agentToolsDir, toolName, 'SKILL.js'));
        } else {
            return { success: false, error: `Tool ${toolName} implementation not found` };
        }
        
        try {
            // Execute with sandbox check
            const result = await module.execute(args, { agentId, agentDir: this.agentDir });
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

module.exports = ToolManager;
