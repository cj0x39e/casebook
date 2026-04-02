<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CaseWorkflowStatus } from '../lib/casebook'
import type { CaseFileNode, TreeNode } from '../lib/tree'

const props = defineProps<{
  node: TreeNode
  level: number
  isLastChild: boolean
  selectedCaseId: string | null
  expandedDirectories: string[]
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [caseId: string]
}>()

const { t } = useI18n()

const isDirectory = computed(() => props.node.kind === 'directory')
const isExpanded = computed(() =>
  props.node.kind === 'directory' ? props.expandedDirectories.includes(props.node.path) : false,
)
const directoryChildren = computed(() =>
  props.node.kind === 'directory' ? props.node.children : [],
)

function statusLabel(status: CaseWorkflowStatus) {
  return t(`status.${status}`)
}

function handleDirectoryToggle() {
  if (props.node.kind === 'directory') {
    emit('toggle', props.node.path)
  }
}

function handleCaseSelect(node: CaseFileNode) {
  emit('select', node.caseId)
}
</script>

<template>
  <li
    class="tree-view__node"
    :data-kind="node.kind"
    :data-level="level"
    :data-last-child="String(isLastChild)"
    role="treeitem"
    :aria-expanded="isDirectory ? isExpanded : undefined"
  >
    <div class="tree-view__shell" :data-root="String(level === 0)">
      <span
        v-if="level > 0"
        class="tree-view__scaffold"
        :data-last-child="String(isLastChild)"
        aria-hidden="true"
      >
        <span class="tree-view__scaffold-line" />
        <span class="tree-view__elbow" />
      </span>

      <button
        v-if="node.kind === 'directory'"
        class="tree-view__row tree-view__row--directory"
        type="button"
        :title="node.path"
        @click="handleDirectoryToggle"
      >
        <span class="tree-view__arrow" :data-expanded="isExpanded" aria-hidden="true" />
        <span class="tree-view__label">{{ node.name }}</span>
      </button>

      <button
        v-else
        class="tree-view__row tree-view__row--case"
        type="button"
        :data-selected="String(node.caseId === selectedCaseId)"
        :title="`${node.name}\n${node.path}`"
        @click="handleCaseSelect(node)"
      >
        <span class="tree-view__dot" :data-status="node.status" aria-hidden="true" />
        <span class="tree-view__label">{{ node.name }}</span>
        <span class="tree-view__sr">{{ statusLabel(node.status) }}</span>
      </button>
    </div>

    <div
      v-if="node.kind === 'directory' && isExpanded && directoryChildren.length"
      class="tree-view__subtree"
    >
      <ul class="tree-view__group" role="group">
        <CaseTreeNode
          v-for="(child, index) in directoryChildren"
          :key="child.id"
          :node="child"
          :level="level + 1"
          :is-last-child="index === directoryChildren.length - 1"
          :selected-case-id="selectedCaseId"
          :expanded-directories="expandedDirectories"
          @toggle="emit('toggle', $event)"
          @select="emit('select', $event)"
        />
      </ul>
    </div>
  </li>
</template>
