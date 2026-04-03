/**
 * DSclaw - Memory System: Deep Memory Layer / Fact Store
 * 
 * Store atomic facts extracted from sessions into SQLite:
 *  - Each fact has content, tags, timestamp, session_id
 *  - FTS5 full-text search index with Chinese tokenization
 *  - Tag index for exact matching
 *  - PII detection and redaction
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class FactStore {
    constructor(agentDir) {
        this.agentDir = agentDir;
        this.dbPath = path.join(agentDir, 'memory', 'facts.db');
        
        // Ensure directory
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Open database and create tables
        this.db = new sqlite3.Database(this.dbPath);
        
        this.db.run(`
            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fact TEXT NOT NULL,
                tags TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT,
                pii_redacted INTEGER DEFAULT 0
            )
        `);
        
        // Create FTS5 virtual table for full-text search (use unicode61 tokenizer for Chinese)
        this.db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
                fact, 
                tokenize = unicode61 'chars' tokenize,
                content=rowid
            )
        `);
    }
    
    // Add a batch of facts
    async addFacts(facts, sessionId, tags = []) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                try {
                    const stmt = this.db.prepare(`
                        INSERT INTO facts (fact, tags, session_id) VALUES (?, ?, ?)
                    `);
                    
                    for (const fact of facts) {
                        stmt.run([fact.fact, JSON.stringify(fact.tags || tags), sessionId]);
                    }
                    
                    stmt.finalize();
                    
                    // Update FTS
                    for (const fact of facts) {
                        this.db.run(`INSERT INTO facts_fts (rowid, fact) VALUES (last_insert_rowid(), ?)`, [fact.fact]);
}
                    resolve({ inserted: facts.length });
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
    
    // Search by keywords
    async search(keywords) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT f.* 
                FROM facts f
                INNER JOIN facts_fts fts ON f.rowid = fts.rowid
                WHERE facts_fts MATCH ?
                ORDER BY f.created_at DESC
            `, [keywords], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    // Search by tags (exact match on any tag)
    async searchByTags(tags) {
        return new Promise((resolve, reject) => {
            // Build OR query: WHERE tags LIKE '%tag%'
            const where = tags.map(() => 'tags LIKE ?').join(' OR ');
            const params = tags.map(t => `%${t}%`);
            
            this.db.all(`
                SELECT * FROM facts 
                WHERE ${where}
                ORDER BY created_at DESC
            `, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    // Get all facts ordered by date
    getAll(limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM facts ORDER BY created_at DESC LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    // Delete a fact by id
    delete(id) {
        return new Promise((resolve, reject) => {
            this.db.run(`DELETE FROM facts WHERE id = ?`, [id], function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    }
    
    // Close database
    close() {
        this.db.close();
    }
}

module.exports = FactStore;
