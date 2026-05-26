// src-main/model-lab/model-output-validator.ts
// 模型输出解析与轻量契约校验

import type { ModelLabValidationResult } from './model-lab-contracts'

export interface ModelOutputValidation {
  parsedJson?: unknown
  validation: ModelLabValidationResult
}

export class ModelOutputValidator {
  validate(rawOutput: string, outputContract?: unknown, shouldParseJson = true): ModelOutputValidation {
    if (!shouldParseJson) {
      return {
        validation: {
          jsonParseOk: false,
          jsonObjectOk: false,
          schemaOk: true,
          missingFields: [],
          extraFields: [],
          typeMismatches: [],
          parseError: null,
        },
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawOutput)
    } catch (e) {
      return {
        validation: {
          jsonParseOk: false,
          jsonObjectOk: false,
          schemaOk: false,
          missingFields: [],
          extraFields: [],
          typeMismatches: [],
          parseError: e instanceof Error ? e.message : String(e),
        },
      }
    }

    const jsonObjectOk = isPlainObject(parsed)
    const validation: ModelLabValidationResult = {
      jsonParseOk: true,
      jsonObjectOk,
      schemaOk: jsonObjectOk,
      missingFields: [],
      extraFields: [],
      typeMismatches: [],
      parseError: null,
    }

    if (jsonObjectOk && isPlainObject(outputContract)) {
      if (isSchemaLike(outputContract)) {
        this.compareSchema(parsed, outputContract, '', validation)
      } else {
        this.compareObject(parsed as Record<string, unknown>, outputContract, '', validation)
      }
      validation.schemaOk = validation.missingFields.length === 0 && validation.typeMismatches.length === 0
    }

    return {
      parsedJson: parsed,
      validation,
    }
  }

  private compareObject(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
    basePath: string,
    validation: ModelLabValidationResult,
  ): void {
    for (const [key, expectedValue] of Object.entries(expected)) {
      const path = basePath ? `${basePath}.${key}` : key
      if (!(key in actual)) {
        validation.missingFields.push(path)
        continue
      }

      this.compareValue(actual[key], expectedValue, path, validation)
    }

    for (const key of Object.keys(actual)) {
      if (!(key in expected)) {
        validation.extraFields.push(basePath ? `${basePath}.${key}` : key)
      }
    }
  }

  private compareValue(
    actual: unknown,
    expected: unknown,
    path: string,
    validation: ModelLabValidationResult,
  ): void {
    const expectedType = describeContractType(expected)
    const actualType = describeValueType(actual)

    if (expectedType === 'any') return

    if (expectedType === 'array') {
      if (!Array.isArray(actual)) {
        validation.typeMismatches.push({ path, expected: 'array', actual: actualType })
        return
      }
      const expectedArray = expected as unknown[]
      if (expectedArray.length > 0 && actual.length > 0) {
        this.compareValue(actual[0], expectedArray[0], `${path}[0]`, validation)
      }
      return
    }

    if (expectedType === 'object') {
      if (!isPlainObject(actual)) {
        validation.typeMismatches.push({ path, expected: 'object', actual: actualType })
        return
      }
      this.compareObject(actual as Record<string, unknown>, expected as Record<string, unknown>, path, validation)
      return
    }

    if (expectedType !== actualType) {
      validation.typeMismatches.push({ path, expected: expectedType, actual: actualType })
    }
  }

  private compareSchema(
    actual: unknown,
    schema: Record<string, unknown>,
    path: string,
    validation: ModelLabValidationResult,
  ): void {
    const expectedType = schemaType(schema)
    const actualType = describeValueType(actual)

    if (expectedType === 'any') return

    if (expectedType === 'object') {
      if (!isPlainObject(actual)) {
        validation.typeMismatches.push({ path: path || '$', expected: 'object', actual: actualType })
        return
      }

      const properties = isPlainObject(schema.properties) ? schema.properties : {}
      const required = Array.isArray(schema.required)
        ? schema.required.filter((field): field is string => typeof field === 'string')
        : Object.keys(properties)

      for (const key of required) {
        if (!(key in actual)) {
          validation.missingFields.push(path ? `${path}.${key}` : key)
        }
      }

      for (const [key, childSchema] of Object.entries(properties)) {
        if (key in actual && isPlainObject(childSchema)) {
          this.compareSchema(actual[key], childSchema, path ? `${path}.${key}` : key, validation)
        }
      }

      for (const key of Object.keys(actual)) {
        if (!(key in properties)) {
          validation.extraFields.push(path ? `${path}.${key}` : key)
        }
      }
      return
    }

    if (expectedType === 'array') {
      if (!Array.isArray(actual)) {
        validation.typeMismatches.push({ path: path || '$', expected: 'array', actual: actualType })
        return
      }
      if (actual.length > 0 && isPlainObject(schema.items)) {
        this.compareSchema(actual[0], schema.items, `${path || '$'}[0]`, validation)
      }
      return
    }

    if (expectedType === 'integer') {
      if (typeof actual !== 'number' || !Number.isInteger(actual)) {
        validation.typeMismatches.push({ path: path || '$', expected: 'integer', actual: actualType })
      }
      return
    }

    if (expectedType !== actualType) {
      validation.typeMismatches.push({ path: path || '$', expected: expectedType, actual: actualType })
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function describeContractType(value: unknown): string {
  if (value === null || value === undefined) return 'any'
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['string', 'number', 'boolean', 'object', 'array', 'any'].includes(normalized)) {
      return normalized
    }
    return 'string'
  }
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

function isSchemaLike(value: Record<string, unknown>): boolean {
  return 'type' in value || 'properties' in value || 'required' in value || 'items' in value
}

function schemaType(schema: Record<string, unknown>): string {
  if (typeof schema.type === 'string') return schema.type.toLowerCase()
  if (isPlainObject(schema.properties)) return 'object'
  if (isPlainObject(schema.items)) return 'array'
  return 'any'
}

function describeValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}
