/**
 * DSclaw - Memory System Entry
 * 
 * Three-layer memory architecture matching openhanako:
 * 
 *  1. Session Summary Layer - sqlite stores conversation summaries with important facts
 *  2. Memory Compilation Layer - daily compilation into ranked summaries (today/week/longterm/facts)
 *  3. Deep Memory Layer - extract atomic facts into FactStore with full-text search + tag search
 */

const SessionSummary = require('./session-summary');
const MemoryCompiler = require('./compile');
const FactStore = require('./fact-store');
const DeepMemoryProcessor = require('./deep-memory');
const MemorySearch = require('./memory-search');
const PIIGuard = require('./pii-guard');

class MemoryManager {
    constructor(agentDir) {
        this.agentDir = agentDir;
        this.sessionSummary = new SessionSummary(agentDir);
        this.memoryCompiler = new MemoryCompiler(agentDir);
        this.factStore = new FactStore(agentDir);
        this.deepMemory = new DeepMemoryProcessor(agentDir, this.factStore, new PIIGuard());
        this.search = new MemorySearch(this.factStore);
        this.piiGuard = new PIIGuard();
    }
    
    // Get the final compiled memory.md for system prompt injection
    getCompiledMemory(agentDir) {
        const fs = require('fs');
        const path = require('path');
        const memoryPath = path.join(this.agentDir, 'memory', 'memory.md');
        
        if (!fs.existsSync(memoryPath)) {
            return '';
        }
        
        return fs.readFileSync(memoryPath, 'utf-8');
    }
}

module.exports = MemoryManager;
