/**
 * DSclaw 记忆系统 API
 * 提供记忆索引、搜索、关联等 API 接口
 */

const express = require('express');
const MemorySystem = require('./memory-system');

class MemoryAPI {
    constructor(dbPath, workspaceRoot) {
        this.router = express.Router();
        this.memorySystem = new MemorySystem(dbPath, workspaceRoot);
        
        this.setupRoutes();
    }
    
    setupRoutes() {
        // 添加记忆到索引

        this.router.post('/index', async (req, res) => {
            try {
                const { id, agentId, content, metadata } = req.body;
                
                if (!id || !agentId || !content) {
                    return res.status(400).json({
                        success: false,
                        error: '缺少必要参数: id, agentId, content'
                    });
                }
                
                const result = this.memorySystem.indexMemory({
                    id,
                    agentId,
                    content,
                    metadata
                });
                
                res.json({
                    success: true,
                    result
                });
                
            } catch (error) {
                console.error('索引记忆失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 语义搜索
        this.router.get('/search', (req, res) => {
            try {
                const { query, agentId, tags, limit, threshold } = req.query;
                
                if (!query) {
                    return res.status(400).json({
                        success: false,
                        error: '缺少查询参数'
                    });
                }
                
                const options = {};
                if (agentId) options.agentId = agentId;
                if (tags) options.tags = tags.split(',');
                if (limit) options.limit = parseInt(limit);
                if (threshold) options.threshold = parseFloat(threshold);
                
                const results = this.memorySystem.semanticSearch(
                    query, 
                    options
                );
                
                res.json({
                    success: true,
                    query,
                    totalResults: results.length,
                    results
                });
                
            } catch (error) {
                console.error('搜索失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 基于标签搜索
        this.router.get('/search/tags', (req, res) => {
            try {
                const { tags, agentId, limit } = req.query;
                
                if (!tags) {
                    return res.status(400).json({
                        success: false,
                        error: '缺少标签参数'
                    });
                }
                
                const options = {};
                if (agentId) options.agentId = agentId;
                if (limit) options.limit = parseInt(limit);
                
                const results = this.memorySystem.searchByTags(
                    tags.split(','),
                    options
                );
                
                res.json({
                    success: true,
                    tags: tags.split(','),
                    totalResults: results.length,
                    results
                });
                
            } catch (error) {
                console.error('标签搜索失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 生成记忆摘要
        this.router.get('/summary/:agentId', (req, res) => {
            try {
                const { agentId } = req.params;
                const { period = 'daily' } = req.query;
                
                const summary = this.memorySystem.generateMemorySummary(
                    agentId,
                    period
                );
                
                res.json({
                    success: true,
                    summary
                });
                
            } catch (error) {
                console.error('生成摘要失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 查找记忆关联
        this.router.get('/associations/:memoryId', (req, res) => {
            try {
                const { memoryId } = req.params;
                const { minStrength = 0.1 } = req.query;
                
                const associations = this.memorySystem.findMemoryAssociations(
                    memoryId
                );
                
                // 过滤最小强度的关联
                const filteredAssociations = associations.filter(
                    assoc => assoc.strength >= parseFloat(minStrength)
                );
                
                res.json({
                    success: true,
                    memoryId,
                    totalAssociations: filteredAssociations.length,
                    associations: filteredAssociations
                });
                
            } catch (error) {
                console.error('查找关联失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 获取记忆详情
        this.router.get('/detail/:memoryId', async (req, res) => {
            try {
                const { memoryId } = req.params;
                
                const memory = this.memorySystem.memoryIndex.get(memoryId);
                
                if (!memory) {
                    return res.status(404).json({
                        success: false,
                        error: '记忆未找到'
                    });
                }
                
                res.json({
                    success: true,
                    memory: {
                        id: memory.id,
                        agentId: memory.agentId,
                        content: memory.content,
                        tags: memory.tags,
                        keywords: memory.keywords,
                        similarity: memory.similarity,
                        relevance: memory.relevance,
                        metadata: memory.metadata,
                        indexedAt: memory.indexedAt
                    }
                });
                
            } catch (error) {
                console.error('获取记忆详情失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 更新记忆相关性
        this.router.put('/relevance/:memoryId', async (req, res) => {
            try {
                const { memoryId } = req.params;
                const { relevance } = req.body;
                
                if (relevance === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: '缺少 relevance 参数'
                    });
                }
                
                const success = await this.memorySystem.updateMemoryRelevance(
                    memoryId,
                    parseFloat(relevance)
                );
                
                if (!success) {
                    return res.status(404).json({
                        success: false,
                        error: '记忆未找到'
                    });
                }
                
                res.json({
                    success: true,
                    message: '相关性已更新',
                    memoryId,
                    relevance
                });
                
            } catch (error) {
                console.error('更新相关性失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 获取热门标签
        this.router.get('/tags/popular', async (req, res) => {
            try {
                const { limit = 20 } = req.query;
                
                const tagCounts = {};
                
                // 统计标签使用频率

                for (const memory of this.memorySystem.memoryIndex.values()) {
                    memory.tags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                }
                
                // 排序并返回热门标签

                const popularTags = Object.entries(tagCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, parseInt(limit))
                    .map(([tag, count]) => ({
                        tag,
                        count,
                        usage: `${((count / this.memorySystem.memoryIndex.size) * 100).toFixed(1)}%`
                    }));
                
                res.json({
                    success: true,
                    totalTags: Object.keys(tagCounts).length,
                    totalMemories: this.memorySystem.memoryIndex.size,
                    popularTags
                });
                
            } catch (error) {
                console.error('获取热门标签失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 获取热门关键词
        this.router.get('/keywords/popular', async (req, res) => {
            try {
                const { limit = 30 } = req.query;
                
                const keywordCounts = {};
                
                // 统计关键词使用频率

                for (const memory of this.memorySystem.memoryIndex.values()) {
                    memory.keywords.forEach(keyword => {
                        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
                    });
                }
                
                // 排序并返回热门关键词

                const popularKeywords = Object.entries(keywordCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, parseInt(limit))
                    .map(([keyword, count]) => ({
                        keyword,
                        count,
                        usage: `${((count / this.memorySystem.memoryIndex.size) * 100).toFixed(1)}%`
                    }));
                
                res.json({
                    success: true,
                    totalKeywords: Object.keys(keywordCounts).length,
                    totalMemories: this.memorySystem.memoryIndex.size,
                    popularKeywords
                });
                
            } catch (error) {
                console.error('获取热门关键词失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 获取系统状态
        this.router.get('/status', async (req, res) => {
            try {
                const status = await this.memorySystem.getStatus();
                
                res.json({
                    success: true,
                    status
                });
                
            } catch (error) {
                console.error('获取状态失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 清除索引
        this.router.delete('/clear', async (req, res) => {
            try {
                await this.memorySystem.clearMemoryIndex();
                
                res.json({
                    success: true,
                    message: '记忆索引已清除'
                });
                
            } catch (error) {
                console.error('清除索引失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // 训练分类器
        this.router.post('/train', async (req, res) => {
            try {
                await this.memorySystem.trainClassifier();
                await this.memorySystem.saveClassifier();
                
                res.json({
                    success: true,
                    message: '分类器训练完成'
                });
                
            } catch (error) {
                console.error('训练分类器失败:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    
    getRouter() {
        return this.router;
    }
}

module.exports = MemoryAPI;