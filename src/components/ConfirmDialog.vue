<script setup lang="ts">
// ConfirmDialog.vue - 确认/取消对话框组件

defineProps<{
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:visible': [value: boolean]
}>()

function onConfirm() {
  emit('confirm')
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
    <div v-if="visible" class="cd-mask" @click.self="onMaskClick">
      <div class="cd-card" role="dialog" :aria-label="title">
        <div class="cd-header">
          <strong class="cd-title">{{ title }}</strong>
        </div>
        <p class="cd-message">{{ message }}</p>
        <div class="cd-actions">
          <button
            class="cd-btn cd-btn-cancel"
            type="button"
            @click="onCancel"
          >
            {{ cancelText ?? '取消' }}
          </button>
          <button
            class="cd-btn"
            :class="danger ? 'cd-btn-danger' : 'cd-btn-confirm'"
            type="button"
            @click="onConfirm"
          >
            {{ confirmText ?? '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  backdrop-filter: blur(2px);
}

.cd-card {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px 24px;
  min-width: 340px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cd-header {
  display: flex;
  align-items: center;
}

.cd-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111;
}

.cd-message {
  font-size: 0.9rem;
  color: #555;
  line-height: 1.6;
  margin: 0;
}

.cd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.cd-btn {
  padding: 8px 20px;
  border-radius: 7px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity 0.15s;
}

.cd-btn:hover {
  opacity: 0.85;
}

.cd-btn-cancel {
  background: #f4f4f5;
  color: #444;
  border-color: #e4e4e7;
}

.cd-btn-confirm {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.cd-btn-danger {
  background: #d32f2f;
  color: #fff;
  border-color: #d32f2f;
}
</style>
