/**
 * DSclaw - Memory System: Memory Compilation Layer
 * 
 * Daily scheduled compilation:
 *  1. compileToday() → Compile today's session summaries → ~500 tokens
 *  2. compileWeek() → Compile last 7 days → ~500 tokens  
 *  3. compileLongterm() → Fold weeks into longterm → ~300 tokens
 *  4. compileFacts() → Extract important facts from 30 days → ~200 tokens
 *  5. assemble() → Combine into final memory.md for system prompt
 * 
 * Features:
 *  - MD5 fingerprint caching: skip if content unchanged
 *  - Atomic writes: write to .tmp first then rename → no corruption on crash
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MemoryCompiler {
    constructor(agentDir) {
        this.agentDir = agentDir;
        this.memoryDir = path.join(agentDir, 'memory');
        
        // Ensure directory exists
        if (!fs.existsSync(this.memoryDir)) {
            fs.mkdirSync(this.memoryDir, { recursive: true });
        }
    }
    
    // Calculate MD5 fingerprint of content
    getMD5(content) {
        return crypto.createHash('md5').update(content).digest('hex');
    }
    
    // Atomic write: write to temp then rename
    atomicWrite(filePath, content) {
        const tempPath = filePath + '.tmp';
        fs.writeFileSync(tempPath, content, 'utf-8');
        fs.renameSync(tempPath, filePath);
    }
    
    // Get cached fingerprint if it exists
    getCachedFingerprint(file) {
        const cachePath = path.join(this.memoryDir, file + '.md5');
        if (fs.existsSync(cachePath)) {
            return fs.readFileSync(cachePath, 'utf-8').trim();
        }
        return null;
    }
    
    // Save cached fingerprint
    saveCachedFingerprint(file, fingerprint) {
        const cachePath = path.join(this.memoryDir, file + '.md5');
        fs.writeFileSync(cachePath, fingerprint, 'utf-8');
    }
    
    // Compile today's summaries
    async compileToday(sessionSummary, openaiApi) {
        const prompt = `
Below are today's conversation session summaries. Compress them into a concise 500-word maximum summary that captures all important information, decisions, and outcomes.

${sessionSummary}

Compressed summary (≤ 500 words):
`.trim();
        
        // Call LLM to compress
        // If content unchanged (cached fingerprint matches), skip recompilation
        const currentFingerprint = this.getMD5(sessionSummary);
        const cached = this.getCachedFingerprint('today');
        
        if (cached === currentFingerprint && fs.existsSync(path.join(this.memoryDir, 'today.md'))) {
            // Content unchanged, skip
            return {
                changed: false,
                content: fs.readFileSync(path.join(this.memoryDir, 'today.md'), 'utf-8')
            };
        }
        
        // Need to recompile
        const response = await openaiApi.completion(prompt);
        const content = response.content.trim();
        
        // Atomic write
        this.atomicWrite(path.join(this.memoryDir, 'today.md'), content);
        this.saveCachedFingerprint('today', currentFingerprint);
        
        return {
            changed: true,
            content
        };
    }
    
    // Compile last 7 days (sliding window)
    async compileWeek(todays, openaiApi) {
        const prompt = `
Below are the daily summaries from the past 7 days. Compress them into a concise 500-word maximum summary that captures the weekly theme, important decisions, and ongoing projects.

${todays.join('\n\n')}

Compressed summary (≤ 500 words):
`.trim();
        
        const currentContent = todays.join('\n\n');
        const currentFingerprint = this.getMD5(currentContent);
        const cached = this.getCachedFingerprint('week');
        
        if (cached === currentFingerprint && fs.existsSync(path.join(this.memoryDir, 'week.md'))) {
            return {
                changed: false,
                content: fs.readFileSync(path.join(this.memoryDir, 'week.md'), 'utf-8')
            };
        }
        
        const response = await openaiApi.completion(prompt);
        const content = response.content.trim();
        
        this.atomicWrite(path.join(this.memoryDir, 'week.md'), content);
        this.saveCachedFingerprint('week', currentFingerprint);
        
        return {
            changed: true,
            content
        };
    }
    
    // Compile long-term: fold week into longterm
    async compileLongterm(weekSummary, existingLongterm, openaiApi) {
        const prompt = `
Below is the existing long-term memory summary and this week's summary. Fold the weekly summary into the long-term memory, removing transient events and keeping the important cross-time information. Output ≤ 300 words.

**Existing long-term memory:**
${existingLongterm}

**This week:**
${weekSummary}

Updated long-term memory (≤ 300 words):
`.trim();
        
        const currentContent = existingLongterm + '\n\n' + weekSummary;
        const currentFingerprint = this.getMD5(currentContent);
        const cached = this.getCachedFingerprint('longterm');
        
        if (cached === currentFingerprint && fs.existsSync(path.join(this.memoryDir, 'longterm.md'))) {
            return {
                changed:false,
                content: fs.readFileSync(path.join(this.memoryDir, 'longterm.md'), 'utf-8')
            };
        }
        
        const response = await openaiApi.completion(prompt);
        const content = response.content.trim();
        
        this.atomicWrite(path.join(this.memoryDir, 'longterm.md'), content);
        this.saveCachedFingerprint('longterm', currentFingerprint);
        
        return {
            changed: true,
            content
        };
    }
    
    // Extract important facts from last 30 days, merge into fact store
    async compileFacts(sessions, existingFacts, openaiApi) {
        const prompt = `
Below are session summaries from the past 30 days. Extract all important factual information into a list of atomic facts (one fact per item, keep it concise). Merge with existing facts and remove duplicates. Output maximum 200 words total.

**Existing facts:**
${existingFacts}

**New sessions:**
${sessions.map(s => s.important_facts).filter(x => x.trim()).join('\n\n')}

**Merged facts (one per line, ≤ 200 words total):**
`.trim();
        
        const currentContent = JSON.stringify(sessions);
        const currentFingerprint = this.getMD5(currentContent);
        const cached = this.getCachedFingerprint('facts');
        
        if (cached === currentFingerprint && fs.existsSync(path.join(this.memoryDir, 'facts.md'))) {
            return {
                changed: false,
                content: fs.readFileSync(path.join(this.memoryDir, 'facts.md'), 'utf-8')
            };
        }
        
        const response = await openaiApi.completion(prompt);
        const content = response.content.trim();
        
        this.atomicWrite(path.join(this.memoryDir, 'facts.md'), content);
        this.saveCachedFingerprint('facts', currentFingerprint);
        
        return {
            changed: true,
            content
        };
    }
    
    // Assemble final memory.md from all compiled parts
    assemble() {
        const parts = [];
        
        ['facts.md', 'today.md', 'week.md', 'longterm.md'].forEach(file => {
            const filePath = path.join(this.memoryDir, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8').trim();
                if (content) {
                    const title = {
                        'facts.md': '## 重要事实',
                        'today.md': '## 今日总结',
                        'week.md': '## 本周总结',
                        'longterm.md': '## 长期记忆'
                    }[file];
                    parts.push(`${title}\n\n${content}`);
                }
            }
        });
        
        const final = parts.join('\n\n');
        this.atomicWrite(path.join(this.memoryDir, 'memory.md'), final);
        return final;
    }
}

module.exports = MemoryCompiler;
