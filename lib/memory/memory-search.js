/**
 * DSclaw - Memory System: Memory Search
 * 
 * Two-phase search strategy:
 *  1. Tag exact matching first (priority)
 *  2. FTS5 full-text search if tag results < 3
 */

class MemorySearch {
    constructor(factStore) {
        this.factStore = factStore;
    }
    
    // Search memory
    async search(query, options = {}) {
        const { tags = [], dateFrom = null, dateTo = null } = options;
        
        // Phase 1: Tag exact matching
        let results = [];
        if (tags.length > 0) {
            results = await this.factStore.searchByTags(tags);
        }
        
        // If we have less than 3 results from tags, add full-text search to supplement
        if (results.length < 3) {
            const ftsResults = await this.factStore.search(query);
            
            // Merge and deduplicate by id
            const existingIds = new Set(results.map(r => r.id));
            for (const r of ftsResults) {
                if (!existingIds.has(r.id)) {
                    results.push(r);
                }
            }
        }
        
        // Date filtering
        if (dateFrom || dateTo) {
            const from = dateFrom || new Date(0);
            const to = dateTo || new Date();
            results = results.filter(r => {
                const created = new Date(r.created_at);
                return created >= from && created <= to;
            });
        }
        
        // Sort by created date descending
        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at);
        
        return results;
    }
    
    // Format search results for prompt
    formatResults(results, maxTokens = 500) {
        if (results.length === 0) return '';
        
        let formatted = '## 检索到的记忆\n\n';
        let totalLength = 0;
        
        for (const r of results) {
            const line = `- ${r.fact}\n`;
            if (totalLength + line.length > maxTokens * 5) break;
            formatted += line;
            totalLength += line.length;
        }
        
        return formatted;
    }
}

module.exports = MemorySearch;
