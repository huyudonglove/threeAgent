// src-main/model-config/secret-masking.ts
// 密钥掩码处理（所有传递到渲染进程的密钥必须掩码）

/**
 * 将密钥转换为掩码预览格式
 * 如 "sk-abc123xyz789" → "sk-****789"
 */
export function maskedPreview(secret: string): string {
  if (secret.length <= 8) {
    return '****'
  }
  const prefix = secret.slice(0, 3)
  const suffix = secret.slice(-4)
  return `${prefix}****${suffix}`
}

/**
 * 掩码整个对象中所有 string 值（递归）
 * 用于传递到渲染进程之前的数据清洗
 */
export function maskObject<T extends Record<string, unknown>>(obj: T, secretKeys: string[]): T {
  const result = { ...obj }
  for (const key of secretKeys) {
    if (key in result && typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = maskedPreview(result[key] as string)
    }
  }
  return result
}
