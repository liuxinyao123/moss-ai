/**
 * DSclaw 记忆系统
 * 包含语义搜索、标签系统、关联分析和摘要生成
 */

const sqlite3 = require('sqlite3').verbose();
const natural = require('natural');
const fs = require('fs');
const path = require('path');

class MemorySystem {
    constructor(dbPath, workspaceRoot) {
        this.dbPath = dbPath;
        this.workspaceRoot = workspaceRoot;
        this.tokenizer = new natural.WordTokenizer();
        this.tfidf = new natural.TfIdf();
        this.classifier = new natural.BayesClassifier();
        
        // 初始化记忆索引
        this.memoryIndex = new Map();
        this.tagIndex = new Map();
        this.corpus = {
            docCount: 0,
            docFreq: new Map() // term -> document frequency
        };
        this.initMemorySystem();
    }
    
    // 初始化记忆系统
    initMemorySystem() {
        // 确保目录存在
        const memoryDir = path.join(this.workspaceRoot, 'memory-index');
        fs.mkdirSync(memoryDir, { recursive: true });
        
        // 加载记忆索引
        this.loadMemoryIndex();
        
        // 加载分类器
        this.loadClassifier();
        
        console.log('🐬 记忆系统已初始化');
    }
    
    // 加载记忆索引
    loadMemoryIndex() {
        const indexFile = path.join(this.workspaceRoot, 'memory-index', 'memory-index.json');
        
        if (fs.existsSync(indexFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
                this.memoryIndex = new Map(data.index);
                this.tagIndex = new Map(data.tagIndex);
                if (data.corpus && typeof data.corpus.docCount === 'number' && Array.isArray(data.corpus.docFreq)) {
                    this.corpus.docCount = data.corpus.docCount;
                    this.corpus.docFreq = new Map(data.corpus.docFreq);
                } else {
                    this.rebuildCorpusStats();
                }
                console.log(`📊 记忆索引加载完成: ${this.memoryIndex.size} 条记忆`);
            } catch (error) {
                console.error('加载记忆索引失败:', error);
            }
        }
    }
    
    // 保存记忆索引
    saveMemoryIndex() {
        const indexDir = path.join(this.workspaceRoot, 'memory-index');
        const indexFile = path.join(indexDir, 'memory-index.json');
        
        try {
            const data = {
                index: Array.from(this.memoryIndex.entries()),
                tagIndex: Array.from(this.tagIndex.entries()),
                corpus: {
                    docCount: this.corpus.docCount,
                    docFreq: Array.from(this.corpus.docFreq.entries())
                },
                updatedAt: new Date().toISOString()
            };
            
            fs.writeFileSync(indexFile, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error('保存记忆索引失败:', error);
        }
    }
    
    // 添加记忆到索引
    indexMemory(memory) {
        const { id, agentId, content, metadata = {} } = memory;
        
        const terms = this.tokenize(content);
        this.updateCorpusStats(terms);

        // 为内容生成语义向量（稀疏向量：term -> weight）
        const vector = this.generateSemanticVector(content);
        
        // 提取关键词
        const keywords = this.extractKeywords(content);
        
        // 自动打标签
        const tags = this.autoTagContent(content);
        
        // 添加到索引
        this.memoryIndex.set(id, {
            id,
            agentId,
            content,
            vector,
            terms,
            keywords,
            tags,
            metadata,
            indexedAt: new Date().toISOString(),
            relevance: 0
        });
        
        // 更新标签索引
        tags.forEach(tag => {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, []);
            }
            this.tagIndex.get(tag).push(id);
        });
        
        // 添加到分类器
        const category = this.classifyContent(content);
        this.classifier.addDocument(content, category);
        
        // 保存索引
        this.saveMemoryIndex();
        
        return { id, tags, keywords, category };
    }
    
    tokenize(text) {
        const raw = String(text || '').toLowerCase();
        const baseTokens = this.tokenizer
            .tokenize(raw)
            .map(t => t.trim())
            .filter(t => t.length > 0);

        // WordTokenizer 对中文支持较弱；当检测到中文且分词过少时，回退到中文 2-gram
        const hasCJK = /[\u4e00-\u9fff]/.test(raw);
        if (!hasCJK || baseTokens.length > 1) {
            return baseTokens;
        }

        const cjkSegments = raw.match(/[\u4e00-\u9fff]+/g) || [];
        const cjkTokens = [];

        for (const seg of cjkSegments) {
            if (seg.length <= 2) {
                cjkTokens.push(seg);
                continue;
            }
            for (let i = 0; i < seg.length - 1; i++) {
                cjkTokens.push(seg.slice(i, i + 2));
            }
        }

        return [...baseTokens, ...cjkTokens].filter(t => t.length > 0);
    }

    rebuildCorpusStats() {
        this.corpus.docCount = this.memoryIndex.size;
        this.corpus.docFreq = new Map();

        for (const memory of this.memoryIndex.values()) {
            const terms = Array.isArray(memory.terms) ? memory.terms : [];
            const unique = new Set(terms);
            for (const term of unique) {
                this.corpus.docFreq.set(term, (this.corpus.docFreq.get(term) || 0) + 1);
            }
        }
    }

    updateCorpusStats(terms) {
        this.corpus.docCount += 1;
        const unique = new Set(terms);
        for (const term of unique) {
            this.corpus.docFreq.set(term, (this.corpus.docFreq.get(term) || 0) + 1);
        }
    }

    // 生成语义向量（TF-IDF 稀疏向量）
    generateSemanticVector(text) {
        const tokens = this.tokenize(text);
        if (tokens.length === 0) return {};

        const termFreq = new Map();
        for (const t of tokens) {
            termFreq.set(t, (termFreq.get(t) || 0) + 1);
        }

        const docCount = Math.max(1, this.corpus.docCount);
        const vector = {};

        for (const [term, tfRaw] of termFreq.entries()) {
            const tf = tfRaw / tokens.length;
            const df = this.corpus.docFreq.get(term) || 0;
            const idf = Math.log((docCount + 1) / (df + 1)) + 1;
            const weight = tf * idf;
            if (weight > 0) vector[term] = weight;
        }

        return vector;
    }
    
    // 提取关键词
    extractKeywords(text, maxKeywords = 10) {
        const tokens = this.tokenizer.tokenize(text.toLowerCase());
        
        // 过滤停用词
        const stopwords = ['的', '了', '在', '是', '我', '有', '和', '就', 
                          '不', '人', '都', '一', '一个', '上', '也', '很',
                          '到', '说', '要', '去', '你', '会', '着', '没有',
                          '看', '好', '自己', '这', '那', '他', '她', '它'];
        
        const filteredTokens = tokens.filter(token => 
            !stopwords.includes(token) && 
            token.length > 1 &&
            !/^\d+$/.test(token)
        );
        
        // 计算词频

        const termFreq = {};
        filteredTokens.forEach(token => {
            termFreq[token] = (termFreq[token] || 0) + 1;
        });
        
        // 排序并返回高频词

        const sortedKeywords = Object.entries(termFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);
        
        return sortedKeywords;
    }
    
    // 自动打标签
    autoTagContent(content) {
        const tags = [];
        const text = content.toLowerCase();
        
        // 根据内容自动打标签

        const tagRules = [
            { pattern: /代码|编程|算法|变量|函数/, tags: ['编程'] },
            { pattern: /学习|知识|教育|教程/, tags: ['学习'] },
            { pattern: /任务|计划|日程|时间/, tags: ['任务管理'] },
            { pattern: /ai|人工智能|模型|神经网络/, tags: ['AI'] },
            { pattern: /数据|分析|统计|图表/, tags: ['数据分析'] },
            { pattern: /会议|讨论|沟通|交流/, tags: ['沟通'] },
            { pattern: /文件|文档|资料/, tags: ['文档'] },
            { pattern: /问题|解决|方法/, tags: ['问题解决'] },
            { pattern: /想法|创意|思考/, tags: ['创意'] },
            { pattern: /提醒|通知|重要/, tags: ['重要'] }
        ];
        
        tagRules.forEach(rule => {
            if (rule.pattern.test(text)) {
                tags.push(...rule.tags);
            }
        });
        
        // 去重

        return [...new Set(tags)];
    }
    
    // 内容分类
    classifyContent(content) {
        // 基于内容的分类规则（简化）
        const text = content.toLowerCase();
        
        if (/代码|程序|函数|类|方法/.test(text)) return '编程';
        if (/会议|讨论|沟通|聊天/.test(text)) return '沟通';
        if (/学习|知识|教程|教育/.test(text)) return '学习';
        if (/任务|计划|日程/.test(text)) return '任务管理';
        if (/文件|文档|资料/.test(text)) return '文档';
        if (/问题|解决|bug/.test(text)) return '问题解决';
        
        return '其他';
    }
    
    // 训练分类器
    async trainClassifier() {
        return new Promise((resolve, reject) => {
            this.classifier.train();
            console.log('🤖 分类器训练完成');
            resolve();
        });
    }
    
    // 语义搜索
    semanticSearch(query, options = {}) {
        const { agentId, tags, limit = 20, threshold = 0.3 } = options;
        
        // 生成查询向量
        const queryVector = this.generateSemanticVector(query);
        
        const results = [];
        
        // 遍历记忆索引
        for (const [id, memory] of this.memoryIndex.entries()) {
            // 过滤
            if (agentId && memory.agentId !== agentId) continue;
            if (tags && !tags.some(tag => memory.tags.includes(tag))) continue;
            
            // 计算相似度（余弦相似度）
            const similarity = this.calculateSimilarity(queryVector, memory.vector);
            
            if (similarity >= threshold) {
                results.push({
                    id: memory.id,
                    agentId: memory.agentId,
                    content: memory.content.length > 200 
                        ? memory.content.substring(0, 200) + '...' 
                        : memory.content,
                    tags: memory.tags,
                    keywords: memory.keywords,
                    similarity: similarity.toFixed(4),
                    relevance: memory.relevance,
                    metadata: memory.metadata,
                    indexedAt: memory.indexedAt
                });
            }
        }
        
        // 按相似度排序
        results.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));
        
        // 返回限制数量的结果
        return results.slice(0, limit);
    }
    
    // 计算相似度（余弦相似度简化版）
    calculateSimilarity(vec1, vec2) {
        if (!vec1 || !vec2) return 0;

        // 兼容旧索引（数组向量）
        if (Array.isArray(vec1) && Array.isArray(vec2)) {
            if (vec1.length === 0 || vec2.length === 0) return 0;

            let dotProduct = 0;
            for (let i = 0; i < Math.min(vec1.length, vec2.length); i++) {
                dotProduct += vec1[i] * vec2[i];
            }

            const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
            const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

            if (magnitude1 === 0 || magnitude2 === 0) return 0;
            return dotProduct / (magnitude1 * magnitude2);
        }

        if (Array.isArray(vec1) || Array.isArray(vec2)) {
            // 新旧向量格式混用时，直接返回 0，避免误判
            return 0;
        }

        const keys1 = Object.keys(vec1);
        const keys2 = Object.keys(vec2);
        if (keys1.length === 0 || keys2.length === 0) return 0;

        // 点积：遍历更短的 key 集合
        let dot = 0;
        let mag1 = 0;
        let mag2 = 0;

        for (const k of keys1) {
            const v = vec1[k];
            mag1 += v * v;
        }
        for (const k of keys2) {
            const v = vec2[k];
            mag2 += v * v;
        }

        const [shortKeys, other] = keys1.length <= keys2.length ? [keys1, vec2] : [keys2, vec1];
        const shortVec = keys1.length <= keys2.length ? vec1 : vec2;

        for (const k of shortKeys) {
            const v1 = shortVec[k];
            const v2 = other[k];
            if (v2 !== undefined) dot += v1 * v2;
        }

        if (mag1 === 0 || mag2 === 0) return 0;
        return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }
    
    // 基于标签搜索
    searchByTags(tags, options = {}) {
        const { agentId, limit = 20 } = options;
        
        const matchedMemories = new Set();
        
        // 从标签索引中查找

        tags.forEach(tag => {
            const memoryIds = this.tagIndex.get(tag) || [];
            memoryIds.forEach(id => {
                if (!agentId) {
                    matchedMemories.add(id);
                } else {
                    const memory = this.memoryIndex.get(id);
                    if (memory && memory.agentId === agentId) {
                        matchedMemories.add(id);
                    }
                }
            });
        });
        
        // 获取记忆详情

        const results = Array.from(matchedMemories)
            .map(id => {
                const memory = this.memoryIndex.get(id);
                if (!memory) return null;
                
                return {
                    id: memory.id,
                    agentId: memory.agentId,
                    content: memory.content.length > 200 
                        ? memory.content.substring(0, 200) + '...' 
                        : memory.content,
                    tags: memory.tags,
                    keywords: memory.keywords,
                    relevance: memory.relevance,
                    metadata: memory.metadata,
                    indexedAt: memory.indexedAt

                };
            })
            .filter(memory => memory !== null);
        
        // 按相关性排序

        results.sort((a, b) => b.relevance - a.relevance);
        
        return results.slice(0, limit);
    }
    
    // 生成记忆摘要
    generateMemorySummary(agentId, period = 'daily') {
        const agentMemories = Array.from(this.memoryIndex.values())
            .filter(memory => memory.agentId === agentId);
        
        if (agentMemories.length === 0) {
            return {
                agentId,
                period,
                summary: '暂无记忆',
                keyMemories: [],
                tags: [],
                keywords: []
            };
        }
        
        // 收集所有关键词和标签

        const allKeywords = [];
        const allTags = [];
        
        agentMemories.forEach(memory => {
            allKeywords.push(...memory.keywords);
            allTags.push(...memory.tags);
        });
        
        // 统计高频词

        const keywordFrequency = {};
        allKeywords.forEach(keyword => {
            keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
        });
        
        const tagFrequency = {};
        allTags.forEach(tag => {
            tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        });
        
        // 排序高频词

        const topKeywords = Object.entries(keywordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword]) => keyword);
        
        const topTags = Object.entries(tagFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag]) => tag);
        
        // 提取重要记忆

        const keyMemories = agentMemories
            .filter(memory => 
                memory.tags.includes('重要') || 
                memory.tags.includes('学习') ||
                memory.tags.includes('创意')
            )
            .map(memory => ({
                id: memory.id,
                excerpt: memory.content.length > 100 
                    ? memory.content.substring(0, 100) + '...' 
                    : memory.content,
                tags: memory.tags,
                indexedAt: memory.indexedAt
            }))
            .slice(0, 10);
        
        return {
            agentId,
            period,
            totalMemories: agentMemories.length,
            summary: `${agentId} 的 ${period} 记忆总结`,
            keyMemories,
            topKeywords,
            topTags,
            generatedAt: new Date().toISOString()
        };
    }
    
    // 发现记忆关联
    findMemoryAssociations(memoryId) {
        const memory = this.memoryIndex.get(memoryId);
        if (!memory) return [];
        
        const associations = [];
        
        // 基于关键词的关联

        const keywordAssociations = this.findAssociationsByKeywords(
            memory.keywords, 
            memoryId
        );
        
        // 基于标签的关联

        const tagAssociations = this.findAssociationsByTags(
            memory.tags, 
            memoryId
        );
        
        // 合并关联

        const allAssociations = [...keywordAssociations, ...tagAssociations];
        
        // 去重并排序

        const uniqueAssociations = Array.from(
            new Map(
                allAssociations.map(assoc => [assoc.id, assoc])
            ).values()
        );
        
        uniqueAssociations.sort((a, b) => b.strength - a.strength);
        
        return uniqueAssociations;
    }
    
    // 基于关键词查找关联
    findAssociationsByKeywords(keywords, excludeId) {
        const associations = [];
        
        for (const [id, otherMemory] of this.memoryIndex.entries()) {
            if (id === excludeId) continue;
            
            // 计算关键词重叠度

            const commonKeywords = keywords.filter(kw => 
                otherMemory.keywords.includes(kw)
            );
            
            if (commonKeywords.length > 0) {
                associations.push({
                    id: otherMemory.id,
                    strength: commonKeywords.length / Math.max(keywords.length, otherMemory.keywords.length),
                    reason: `共享关键词: ${commonKeywords.join(', ')}`,
                    memory: {
                        content: otherMemory.content.length > 150 
                            ? otherMemory.content.substring(0, 150) + '...' 
                            : otherMemory.content,
                        tags: otherMemory.tags
                    }
                });
            }
        }
        
        return associations;
    }
    
    // 基于标签查找关联
    findAssociationsByTags(tags, excludeId) {
        const associations = [];
        
        for (const [id, otherMemory] of this.memoryIndex.entries()) {
            if (id === excludeId) continue;
            
            // 计算标签重叠度

            const commonTags = tags.filter(tag => 
                otherMemory.tags.includes(tag)

            );
            
            if (commonTags.length > 0) {
                associations.push({
                    id: otherMemory.id,
                    strength: commonTags.length / Math.max(tags.length, otherMemory.tags.length),
                    reason: `共享标签: ${commonTags.join(', ')}`,
                    memory: {
                        content: otherMemory.content.length > 150 
                            ? otherMemory.content.substring(0, 150) + '...' 
                            : otherMemory.content,
                        tags: otherMemory.tags
                    }
                });
            }
        }
        
        return associations;
    }
    
    // 更新记忆相关性
    updateMemoryRelevance(memoryId, relevance) {
        const memory = this.memoryIndex.get(memoryId);
        if (memory) {
            memory.relevance = relevance;
            memory.relevanceUpdatedAt = new Date().toISOString();
            
            // 保存索引

            this.saveMemoryIndex();
            
            return true;
        }
        return false;
    }
    
    // 清除记忆索引
    clearMemoryIndex() {
        this.memoryIndex.clear();
        this.tagIndex.clear();
        this.saveMemoryIndex();
        console.log('🧹 记忆索引已清除');
    }
    
    // 获取系统状态
    getStatus() {
        return {
            totalMemories: this.memoryIndex.size,
            totalTags: this.tagIndex.size,
            indexedAt: fs.existsSync(
                path.join(this.workspaceRoot, 'memory-index', 'memory-index.json')
            ) ? fs.statSync(
                path.join(this.workspaceRoot, 'memory-index', 'memory-index.json')
            ).mtime.toISOString() : null,
            classifiers: {
                bayes: true,
                tfidf: true
            }
        };
    }
    
    // 加载分类器
    loadClassifier() {
        const classifierFile = path.join(
            this.workspaceRoot, 
            'memory-index', 
            'classifier.json'
        );
        
        if (fs.existsSync(classifierFile)) {
            try {
                this.classifier = natural.BayesClassifier.restore(
                    JSON.parse(fs.readFileSync(classifierFile, 'utf-8'))
                );
                console.log('🤖 分类器加载完成');
            } catch (error) {
                console.error('加载分类器失败:', error);
            }
        }
    }
    
    // 保存分类器
    saveClassifier() {
        const classifierFile = path.join(
            this.workspaceRoot, 
            'memory-index', 
            'classifier.json'
        );
        
        try {
            const classifierData = JSON.stringify(this.classifier);
            fs.writeFileSync(classifierFile, classifierData, 'utf-8');
            console.log('🤖 分类器已保存');
        } catch (error) {
            console.error('保存分类器失败:', error);
        }
    }
}

module.exports = MemorySystem;