// src-main/validation/index.ts
// 校验层统一入口
// 提供 ValidationLayer 类，聚合六层校验

export type { ValidationIssue, ValidationSeverity, ValidationSource, ValidationResult, ValidationResultType } from './types'
export { makeValidationResult, makeIssue, deriveResultType } from './types'

// StructureValidation
export {
  validateWorkspaceManifest,
  validateConversationRuntime,
  validateTaskRuntime,
  validateArtifactIndexEntry,
  validateDomainWorkflowDefinition,
  validateBackflowRecord,
  validateChangeRequest,
} from './structure'

// StateValidation
export {
  validateWorkspaceTransition,
  validateConversationTransition,
  validateTaskTransition,
  validateNodeTransition,
  validateArtifactTransition,
  validateTaskNodeStateConsistency,
} from './state-transition'

// ReferenceValidation
export {
  validateWorkspaceReference,
  validateConversationReference,
  validateTaskReference,
  validateArtifactReferences,
  validateWorkflowDefinition,
  validateArtifactReference,
} from './reference'

// ConflictValidation
export {
  validatePluginConfig,
  validateWorkflowConflict,
  validateRoleConflict,
  validateArtifactTypeConflict,
} from './conflict-validation'

// SafetyValidation
export {
  validatePermissionForOperation,
  validatePluginSafety,
  validateHighRiskAction,
  validateDisableImpact,
} from './safety-validation'

// RecoveryValidation
export {
  validateWorkspaceRecovery,
  validateConversationRecovery,
  validateTaskRecovery,
  validateArtifactIndexConsistency,
  validateRuntimeTraceConsistency,
} from './recovery-validation'
