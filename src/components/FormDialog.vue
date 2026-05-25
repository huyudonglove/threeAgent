<script setup lang="ts">
// FormDialog.vue - 表单输入对话框组件

export interface FormField {
  key: string
  label: string
  type: 'text' | 'select'
  required?: boolean
  options?: string[]
}

import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  title: string
  fields: FormField[]
  submitText?: string
}>()

const emit = defineEmits<{
  submit: [payload: Record<string, string>]
  cancel: []
  'update:visible': [value: boolean]
}>()

// 维护内部表单状态
const formData = ref<Record<string, string>>({})

// 每次对话框打开时重置表单
watch(() => props.visible, (val) => {
  if (val) {
    const initial: Record<string, string> = {}
    for (const field of props.fields) {
      initial[field.key] = field.type === 'select' && field.options?.length
        ? field.options[0]
        : ''
    }
    formData.value = initial
  }
}, { immediate: true })

function onSubmit() {
  emit('submit', { ...formData.value })
  emit('update:visible', false)
}

function onCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function onMaskClick() {
  onCancel()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fd-mask" @click.self="onMaskClick">
      <div class="fd-card" role="dialog" :aria-label="title">
        <div class="fd-header">
          <strong class="fd-title">{{ title }}</strong>
        </div>

        <form class="fd-form" @submit.prevent="onSubmit">
          <div v-for="field in fields" :key="field.key" class="fd-field">
            <label class="fd-label">
              {{ field.label }}
              <span v-if="field.required" class="fd-required">*</span>
            </label>

            <input
              v-if="field.type === 'text'"
              v-model="formData[field.key]"
              class="fd-input"
              type="text"
              :required="field.required"
            />

            <select
              v-else-if="field.type === 'select'"
              v-model="formData[field.key]"
              class="fd-input"
              :required="field.required"
            >
              <option
                v-for="opt in field.options"
                :key="opt"
                :value="opt"
              >{{ opt }}</option>
            </select>
          </div>

          <div class="fd-actions">
            <button
              class="fd-btn fd-btn-cancel"
              type="button"
              @click="onCancel"
            >
              取消
            </button>
            <button class="fd-btn fd-btn-submit" type="submit">
              {{ submitText ?? '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fd-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  backdrop-filter: blur(2px);
}

.fd-card {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px 24px;
  min-width: 360px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.fd-header {
  display: flex;
  align-items: center;
}

.fd-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111;
}

.fd-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fd-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.fd-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #666;
}

.fd-required {
  color: #d32f2f;
  margin-left: 2px;
}

.fd-input {
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 7px;
  font-size: 0.875rem;
  background: #fafafa;
  outline: none;
  transition: border-color 0.15s;
}

.fd-input:focus {
  border-color: #3b82f6;
  background: #fff;
}

.fd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.fd-btn {
  padding: 8px 20px;
  border-radius: 7px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity 0.15s;
}

.fd-btn:hover {
  opacity: 0.85;
}

.fd-btn-cancel {
  background: #f4f4f5;
  color: #444;
  border-color: #e4e4e7;
}

.fd-btn-submit {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
</style>
