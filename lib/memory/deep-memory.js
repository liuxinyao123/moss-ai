/**
 * DSclaw - Memory System: Deep Memory Layer
 * 
 * Process dirty sessions (that have updated summary), do LLM snapshot diff,
 * split into atomic facts, write to FactStore with PII checking
 */

const fs = require('fs');
const path = require('path');

class DeepMemoryProcessor {
    constructor(agentDir, factStore, piiGuard) {
        this.agentDir = agentDir;
        this.factStore = factStore;
        this.piiGuard = piiGuard;
    }
    
    // Process a batch of dirty sessions that have summary updates
    async processDirtySessions(sessions, openaiApi) {
        let processed = 0;
        let newFacts = [];
        
        for (const session of sessions) {
            if (!session.important_facts || !session.important_facts.trim()) continue;
            
            // Ask LLM to split into atomic facts
            const prompt = `
Below is a conversation summary. Extract all important atomic facts about the user, the work, preferences, and important information. Each fact should be a single concise line.

Summary:
${session.important_facts}

Extract atomic facts (one per line):
`.trim();
            
            try {
                const response = await openaiApi.completion(prompt);
                const content = response.content.trim();
                const facts = content.split('\n')
                    .map(line => line.replace(/^-+\s*/, '').trim())
                    .filter(line => line.length > 0);
                
                // Check PII
                const cleanFacts = facts.filter(fact => {
                    return !this.piiGuard.containsPII(fact);
                });
                
                // Remove any PII
                const redactedFacts = facts.map(fact => {
                    return this.piiGuard.redactPII(fact);
                });
                
                // Add to fact store
                for (const fact of redactedFacts) {
                    await this.factStore.addFacts([{fact}], session.session_id);
                    newFacts.push(fact);
                    processed++;
                }
            } catch (e) {
                console.error('Error processing session', session.session_id, e);
            }
        }
        
        return {
            processed,
            newFacts
        };
    }
    
    // Check if any session needs processing (summary has changed but not deep processed)
    getDirtySessions(sessions) {
        // In openhanako this is tracked with a dirty flag
        // Here we can check if the fact count is less than expected
        return sessions.filter(session => {
            // If session has important facts and we haven't processed it into facts yet
            return session.important_facts && 
                   session.important_facts.length > 0;
        });
    }
}

module.exports = DeepMemoryProcessor;
