<template>
  <!-- 收益登记对话框（M3 台账入口）：施肥打药 / 产量预估 / 智能荐种三处原各写一份，
       差异仅在标题、摘要行、金额标签与默认值，全部 props 化。 -->
  <!-- visible 是 prop（只读），用显式 :model-value + @update 关闭，父级仍用 v-model:visible -->
  <el-dialog :model-value="visible" :title="title" width="480px" @update:model-value="close">
    <p class="rec-crop" v-html="summary"></p>
    <el-form label-position="top">
      <el-form-item :label="amountLabel">
        <el-input-number
          v-model="amount"
          :min="0.01"
          :max="max"
          :precision="2"
          :step="step"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="basisLabel">
        <el-input v-model="basis" type="textarea" :rows="rows" maxlength="200" show-word-limit />
      </el-form-item>
    </el-form>
    <p class="rec-note" v-html="note"></p>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">登记</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  /** 对话框显示（v-model:visible） */
  visible: boolean;
  title: string;
  /** 摘要行，如「冬小麦 · 拔节期」；支持简单 HTML（<b> 强调） */
  summary: string;
  /** 金额表单项标签，如「节本金额（元）」 */
  amountLabel: string;
  /** 免责 / 口径说明；支持简单 HTML */
  note: string;
  basisLabel?: string;
  /** 每次打开时的默认金额 */
  defaultAmount?: number;
  /** 每次打开时的默认估算依据 */
  defaultBasis?: string;
  max?: number;
  step?: number;
  rows?: number;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'submit', amount: number, basis: string): void;
}>();

const amount = ref(props.defaultAmount ?? 200);
const basis = ref(props.defaultBasis ?? '');

// 每次打开都用父级最新预填值重置，避免上一次填写残留
watch(
  () => props.visible,
  (v) => {
    if (v) {
      amount.value = props.defaultAmount ?? 200;
      basis.value = props.defaultBasis ?? '';
    }
  }
);

const close = () => emit('update:visible', false);

const submit = () => emit('submit', amount.value, basis.value.trim());
</script>

<style scoped>
.rec-crop {
  font-size: var(--fs-sm);
  color: var(--text-regular);
  margin: 0 0 12px;
}

.rec-note {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin: 8px 0 0;
  line-height: 1.7;
}
</style>
