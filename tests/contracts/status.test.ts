// tests/contracts/status.test.ts
import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  WORKSPACE_TRANSITIONS,
  CONVERSATION_TRANSITIONS,
  TASK_TRANSITIONS,
  NODE_TRANSITIONS,
  ARTIFACT_TRANSITIONS,
} from '../../src-main/contracts/status'

describe('isValidTransition', () => {
  it('returns true for valid workspace transitions', () => {
    expect(isValidTransition(WORKSPACE_TRANSITIONS, 'initializing', 'active')).toBe(true)
    expect(isValidTransition(WORKSPACE_TRANSITIONS, 'active', 'idle')).toBe(true)
    expect(isValidTransition(WORKSPACE_TRANSITIONS, 'idle', 'active')).toBe(true)
  })

  it('returns false for invalid workspace transitions', () => {
    expect(isValidTransition(WORKSPACE_TRANSITIONS, 'initializing', 'done' as any)).toBe(false)
    expect(isValidTransition(WORKSPACE_TRANSITIONS, 'active', 'initializing')).toBe(false)
  })

  it('returns true for valid conversation transitions', () => {
    expect(isValidTransition(CONVERSATION_TRANSITIONS, 'active', 'paused')).toBe(true)
    expect(isValidTransition(CONVERSATION_TRANSITIONS, 'paused', 'active')).toBe(true)
    expect(isValidTransition(CONVERSATION_TRANSITIONS, 'active', 'closed')).toBe(true)
  })

  it('returns false for invalid conversation transitions', () => {
    expect(isValidTransition(CONVERSATION_TRANSITIONS, 'closed', 'active')).toBe(false)
  })

  it('returns true for valid task transitions', () => {
    expect(isValidTransition(TASK_TRANSITIONS, 'running', 'blocked')).toBe(true)
    expect(isValidTransition(TASK_TRANSITIONS, 'blocked', 'running')).toBe(true)
    expect(isValidTransition(TASK_TRANSITIONS, 'running', 'done')).toBe(true)
    expect(isValidTransition(TASK_TRANSITIONS, 'queued', 'running')).toBe(true)
  })

  it('returns false for invalid task transitions', () => {
    expect(isValidTransition(TASK_TRANSITIONS, 'done', 'running')).toBe(false)
    expect(isValidTransition(TASK_TRANSITIONS, 'cancelled', 'running')).toBe(false)
  })

  it('returns true for valid node transitions', () => {
    expect(isValidTransition(NODE_TRANSITIONS, 'running', 'done')).toBe(true)
    expect(isValidTransition(NODE_TRANSITIONS, 'running', 'blocked')).toBe(true)
    expect(isValidTransition(NODE_TRANSITIONS, 'blocked', 'running')).toBe(true)
    expect(isValidTransition(NODE_TRANSITIONS, 'queued', 'running')).toBe(true)
  })

  it('returns false for invalid node transitions', () => {
    expect(isValidTransition(NODE_TRANSITIONS, 'done', 'running')).toBe(false)
  })

  it('returns true for valid artifact transitions', () => {
    expect(isValidTransition(ARTIFACT_TRANSITIONS, 'draft', 'ready')).toBe(true)
    expect(isValidTransition(ARTIFACT_TRANSITIONS, 'ready', 'updated')).toBe(true)
    expect(isValidTransition(ARTIFACT_TRANSITIONS, 'updated', 'ready')).toBe(true)
  })

  it('returns false for invalid artifact transitions', () => {
    expect(isValidTransition(ARTIFACT_TRANSITIONS, 'archived', 'ready')).toBe(false)
    expect(isValidTransition(ARTIFACT_TRANSITIONS, 'draft', 'done' as any)).toBe(false)
  })
})
