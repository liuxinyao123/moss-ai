/**
 * Access Tier - 访问层级定义
 * PathGuard四级访问控制
 */

/**
 * 访问层级：
 * 0 - BLOCKED: 完全禁止访问
 * 1 - READONLY: 只读访问
 * 2 - RESTRICTED: 受限写入（只能写允许的目录）
 * 3 - FULL: 完全访问
 */

const AccessTier = {
  BLOCKED: 0,
  READONLY: 1,
  RESTRICTED: 2,
  FULL: 3
};

const TierNames = {
  [AccessTier.BLOCKED]: 'BLOCKED',
  [AccessTier.READONLY]: 'READONLY',
  [AccessTier.RESTRICTED]: 'RESTRICTED',
  [AccessTier.FULL]: 'FULL'
};

module.exports = { AccessTier, TierNames };
