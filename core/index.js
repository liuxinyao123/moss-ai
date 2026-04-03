/**
 * DSclaw - Core Module Entry
 * 
 * Five Managers:
 * 1. AgentManager - Agent lifecycle and assembly
 * 2. Engine - Prompt assembly and execution
 * 3. MemoryManager - Memory compilation and retrieval
 * 4. ToolManager - Tool registration and execution
 * 5. Scheduler - Cron/timing task scheduling
 * 
 * New Multi-Agent Collaboration Modules:
 * 1. AbilityMatrix - 能力矩阵系统
 * 2. MessageRouter - 智能体间消息路由
 * 3. TaskCollaborator - 任务协作引擎
 * 4. SmartDelegator - 智能委托器
 * 5. MultiAgentManager - 多智能体管理
 */

const AgentManager = require('./agent-manager');
const Engine = require('./engine');
const MultiAgentManager = require('./multi-agent');
const AbilityMatrix = require('./ability-matrix');
const MessageRouter = require('./message-router');
const TaskCollaborator = require('./task-collaborator');
const SmartDelegator = require('./smart-delegator');

module.exports = {
    AgentManager,
    Engine,
    MultiAgentManager,
    AbilityMatrix,
    MessageRouter,
    TaskCollaborator,
    SmartDelegator
};
