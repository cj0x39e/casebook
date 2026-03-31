<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from 'vue-i18n'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import {
  caseWorkflowStatuses,
  parseCase,
  type AppErrorPayload,
  type ParseNote,
  type CaseWorkflowStatus,
  type ParsedCase,
  type RawScannedCase,
  type RawScanResult,
} from './lib/casebook'
import { setAppLocale, type AppLocale } from './i18n'

type ViewState = 'idle' | 'loading' | 'ready' | 'invalid-project' | 'error'
type DetailContentView = 'rendered' | 'raw'
type TreeNode = DirectoryNode | CaseFileNode

interface DirectoryNode {
  kind: 'directory'
  id: string
  path: string
  name: string
  depth: number
  children: TreeNode[]
}

interface CaseFileNode {
  kind: 'case'
  id: string
  path: string
  name: string
  depth: number
  caseId: string
  status: CaseWorkflowStatus
}

const ROOT_TREE_PATH = '__tests_root__'

const selectedProject = ref<string | null>(null)
const scanResult = ref<RawScanResult | null>(null)
const scanError = ref<string | null>(null)
const viewState = ref<ViewState>('idle')
const selectedCaseId = ref<string | null>(null)
const expandedDirectories = ref<string[]>([])
const statusUpdatePending = ref<CaseWorkflowStatus | null>(null)
const statusUpdateError = ref<string | null>(null)
const activeTreeStatusFilter = ref<CaseWorkflowStatus | 'all'>('all')
const detailContentView = ref<DetailContentView>('rendered')
const showParseNotes = ref(false)
const showSettingsPanel = ref(false)
const showSummaryMeta = ref(false)
const showTreeFilterPanel = ref(false)
const treeFilterButtonRef = ref<HTMLElement | null>(null)
const treeFilterPanelRef = ref<HTMLElement | null>(null)
const parseNotesTriggerRef = ref<HTMLElement | null>(null)
const parseNotesTooltipRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)
const summaryMoreTriggerRef = ref<HTMLElement | null>(null)
const summaryMorePopoverRef = ref<HTMLElement | null>(null)
const parseNotesTooltipStyle = ref<Record<string, string>>({})
const settingsPanelStyle = ref<Record<string, string>>({})
const summaryMorePopoverStyle = ref<Record<string, string>>({})
const { t, locale, te } = useI18n()
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
})
const localeOptions: Array<{ value: AppLocale; labelKey: 'locale.english' | 'locale.chinese' }> = [
  { value: 'en', labelKey: 'locale.english' },
  { value: 'zh-CN', labelKey: 'locale.chinese' },
]

const isHomeView = computed(() => selectedProject.value === null && viewState.value === 'idle')

const parsedCases = computed<ParsedCase[]>(() => {
  if (!scanResult.value) {
    return []
  }

  return scanResult.value.cases.map((rawCase) => parseCase(rawCase, locale.value as AppLocale))
})

const parsedCaseMap = computed(() => {
  return new Map(parsedCases.value.map((testCase) => [testCase.caseId, testCase]))
})

const selectedCase = computed<ParsedCase | null>(() => {
  if (!selectedCaseId.value) {
    return null
  }

  return parsedCaseMap.value.get(selectedCaseId.value) ?? null
})

const selectedCaseRenderedHtml = computed(() => {
  if (!selectedCase.value) {
    return ''
  }

  return DOMPurify.sanitize(markdownRenderer.render(selectedCase.value.renderBody))
})

const testsAlias = computed(
  () => scanResult.value?.testsAlias?.trim() || t('casebook.defaultTestsAlias'),
)

const treeFilterLabel = computed(() =>
  activeTreeStatusFilter.value === 'all'
    ? t('tree.filter')
    : t('tree.filterWithStatus', { status: statusLabel(activeTreeStatusFilter.value) }),
)

const caseTree = computed<DirectoryNode | null>(() => {
  if (!parsedCases.value.length) {
    return null
  }

  return buildCaseTree(parsedCases.value, testsAlias.value)
})

const visibleTreeNodes = computed(() => {
  if (!caseTree.value) {
    return []
  }

  return flattenTree(
    caseTree.value,
    new Set(expandedDirectories.value),
    activeTreeStatusFilter.value,
  )
})

const warningSummary = computed(() => {
  const errors = scanResult.value?.errors ?? []
  if (!errors.length) {
    return null
  }

  return errors.length === 1
    ? t('banner.warningSummaryOne')
    : t('banner.warningSummaryOther', { count: errors.length })
})

const selectedLocale = computed<AppLocale>({
  get: () => locale.value as AppLocale,
  set: (value) => setAppLocale(value),
})

watch(
  () => scanResult.value?.testsRoot,
  () => {
    expandedDirectories.value = caseTree.value ? collectDirectoryPaths(caseTree.value) : []
  },
  { immediate: true },
)

watch(
  parsedCases,
  (cases) => {
    if (!cases.length) {
      selectedCaseId.value = null
      return
    }

    if (
      !selectedCaseId.value ||
      !cases.some((testCase) => testCase.caseId === selectedCaseId.value)
    ) {
      selectedCaseId.value = cases[0].caseId
    }
  },
  { immediate: true },
)

watch(selectedCaseId, () => {
  detailContentView.value = 'rendered'
  showParseNotes.value = false
  showSummaryMeta.value = false
})

watch(activeTreeStatusFilter, () => {
  showTreeFilterPanel.value = false
})

watch(showParseNotes, async (visible) => {
  if (!visible) {
    return
  }

  await nextTick()
  updateParseNotesTooltipPosition()
})

watch(showSettingsPanel, async (visible) => {
  if (!visible) {
    return
  }

  await nextTick()
  updateSettingsPanelPosition()
})

watch(showSummaryMeta, async (visible) => {
  if (!visible) {
    return
  }

  await nextTick()
  updateSummaryMorePopoverPosition()
})

onMounted(() => {
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  document.addEventListener('pointerdown', handlePointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
  document.removeEventListener('pointerdown', handlePointerDown)
})

async function openProjectDirectory() {
  scanError.value = null
  statusUpdateError.value = null
  showSettingsPanel.value = false

  try {
    const selectedPath = await open({
      directory: true,
      multiple: false,
    })

    if (selectedPath === null || Array.isArray(selectedPath)) {
      return
    }

    selectedProject.value = selectedPath
    await scanProject(selectedPath)
  } catch (error) {
    scanError.value = extractErrorMessage(error, 'errors.fallback.chooseProjectDirectory')
  }
}

async function scanProject(projectPath: string) {
  viewState.value = 'loading'
  scanError.value = null
  statusUpdateError.value = null
  showSettingsPanel.value = false

  try {
    const result = await invoke<RawScanResult>('scan_casebook', { projectRoot: projectPath })
    scanResult.value = result
    viewState.value = result.testsRoot ? 'ready' : 'invalid-project'
  } catch (error) {
    scanResult.value = null
    viewState.value = 'error'
    scanError.value = extractErrorMessage(error, 'errors.fallback.scanProject')
  }
}

function selectCase(caseId: string) {
  selectedCaseId.value = caseId
  statusUpdateError.value = null
}

function isDirectoryExpanded(path: string) {
  return expandedDirectories.value.includes(path)
}

function toggleDirectory(path: string) {
  if (isDirectoryExpanded(path)) {
    expandedDirectories.value = expandedDirectories.value.filter((item) => item !== path)
    return
  }

  expandedDirectories.value = [...expandedDirectories.value, path]
}

async function updateCaseStatus(nextStatus: CaseWorkflowStatus) {
  if (!selectedProject.value || !selectedCase.value) {
    return
  }

  statusUpdatePending.value = nextStatus
  statusUpdateError.value = null

  try {
    const updatedCase = await invoke<RawScannedCase>('update_case_status', {
      projectRoot: selectedProject.value,
      casePath: selectedCase.value.absolutePath,
      status: nextStatus,
    })

    if (!scanResult.value) {
      return
    }

    scanResult.value = {
      ...scanResult.value,
      cases: scanResult.value.cases.map((testCase) =>
        testCase.caseId === updatedCase.caseId ? updatedCase : testCase,
      ),
    }
  } catch (error) {
    statusUpdateError.value = extractErrorMessage(error, 'errors.fallback.updateCaseStatus')
  } finally {
    statusUpdatePending.value = null
  }
}

function translateAppErrorPayload(payload: AppErrorPayload) {
  const key = `errors.${payload.code}`
  if (!te(key)) {
    return t('errors.fallback.unknown')
  }

  return t(key, {
    detail: payload.detail ?? '',
    path: payload.path ?? '',
    status: payload.detail ?? '',
  })
}

function extractErrorMessage(error: unknown, fallbackKey: string) {
  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (
    error &&
    typeof error === 'object' &&
    typeof Reflect.get(error, 'code') === 'string'
  ) {
    return translateAppErrorPayload(error as AppErrorPayload)
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return t(fallbackKey)
}

function statusLabel(status: CaseWorkflowStatus) {
  return t(`status.${status}`)
}

function sourceLabel(source: ParsedCase['summary']['source']) {
  return t(`source.${source}`)
}

function translateParseNote(note: ParseNote) {
  return t(note.key, note.params ?? {})
}

function treeRowIndent(node: TreeNode) {
  return node.kind === 'directory' ? 10 : 22
}

function treeNodeTooltip(node: TreeNode) {
  if (node.kind === 'directory') {
    if (node.path === ROOT_TREE_PATH) {
      return scanResult.value?.testsRoot ?? 'casebook/tests'
    }

    return node.path
  }

  return `${node.name}\n${node.path}`
}

function buildFixedTopRightPosition(anchor: HTMLElement, offset: number) {
  const rect = anchor.getBoundingClientRect()
  const margin = 28

  return {
    top: `${rect.bottom + offset}px`,
    right: `${Math.max(margin, window.innerWidth - rect.right)}px`,
  }
}

function updateParseNotesTooltipPosition() {
  if (!parseNotesTriggerRef.value) {
    return
  }

  parseNotesTooltipStyle.value = buildFixedTopRightPosition(parseNotesTriggerRef.value, 8)
}

function updateSummaryMorePopoverPosition() {
  if (!summaryMoreTriggerRef.value) {
    return
  }

  summaryMorePopoverStyle.value = buildFixedTopRightPosition(summaryMoreTriggerRef.value, 10)
}

function updateSettingsPanelPosition() {
  if (!settingsButtonRef.value) {
    return
  }

  const rect = settingsButtonRef.value.getBoundingClientRect()
  const margin = 28

  settingsPanelStyle.value = {
    left: `${Math.max(margin, rect.left)}px`,
    bottom: `${Math.max(16, window.innerHeight - rect.top + 10)}px`,
  }
}

function handleViewportChange() {
  if (showParseNotes.value) {
    updateParseNotesTooltipPosition()
  }

  if (showSettingsPanel.value) {
    updateSettingsPanelPosition()
  }

  if (showSummaryMeta.value) {
    updateSummaryMorePopoverPosition()
  }
}

function isEventInside(event: PointerEvent, ...elements: Array<HTMLElement | null>) {
  const target = event.target
  return target instanceof Node && elements.some((element) => element?.contains(target))
}

function handlePointerDown(event: PointerEvent) {
  if (
    showParseNotes.value &&
    !isEventInside(event, parseNotesTriggerRef.value, parseNotesTooltipRef.value)
  ) {
    showParseNotes.value = false
  }

  if (
    showSettingsPanel.value &&
    !isEventInside(event, settingsButtonRef.value, settingsPanelRef.value)
  ) {
    showSettingsPanel.value = false
  }

  if (
    showSummaryMeta.value &&
    !isEventInside(event, summaryMoreTriggerRef.value, summaryMorePopoverRef.value)
  ) {
    showSummaryMeta.value = false
  }

  if (
    showTreeFilterPanel.value &&
    !isEventInside(event, treeFilterButtonRef.value, treeFilterPanelRef.value)
  ) {
    showTreeFilterPanel.value = false
  }
}

function buildCaseTree(cases: ParsedCase[], rootLabel: string): DirectoryNode {
  const root: DirectoryNode = {
    kind: 'directory',
    id: ROOT_TREE_PATH,
    path: ROOT_TREE_PATH,
    name: rootLabel,
    depth: 0,
    children: [],
  }

  for (const testCase of cases) {
    const segments = testCase.relativePath.split('/')
    const directorySegments = segments.slice(0, -1)
    let currentDirectory = root
    let currentPath = ''

    for (const segment of directorySegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      let nextDirectory = currentDirectory.children.find(
        (node): node is DirectoryNode => node.kind === 'directory' && node.path === currentPath,
      )

      if (!nextDirectory) {
        nextDirectory = {
          kind: 'directory',
          id: `dir:${currentPath}`,
          path: currentPath,
          name: segment,
          depth: currentDirectory.depth + 1,
          children: [],
        }
        currentDirectory.children.push(nextDirectory)
      }

      currentDirectory = nextDirectory
    }

    currentDirectory.children.push({
      kind: 'case',
      id: `case:${testCase.caseId}`,
      path: testCase.relativePath,
      name: testCase.title,
      depth: currentDirectory.depth + 1,
      caseId: testCase.caseId,
      status: testCase.status,
    })
  }

  sortTree(root)
  return root
}

function sortTree(directory: DirectoryNode) {
  directory.children.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }

    return left.path.localeCompare(right.path, 'zh-Hans-CN')
  })

  for (const child of directory.children) {
    if (child.kind === 'directory') {
      sortTree(child)
    }
  }
}

function flattenTree(
  directory: DirectoryNode,
  expanded: Set<string>,
  statusFilter: CaseWorkflowStatus | 'all',
): TreeNode[] {
  const nodes: TreeNode[] = []

  for (const child of directory.children) {
    if (child.kind === 'directory') {
      if (directoryHasMatchingCases(child, statusFilter)) {
        nodes.push(child)
        if (expanded.has(child.path)) {
          nodes.push(...flattenTreeChildren(child, expanded, statusFilter))
        }
      }
      continue
    }

    if (statusFilter === 'all' || child.status === statusFilter) {
      nodes.push(child)
    }
  }

  return nodes
}

function flattenTreeChildren(
  directory: DirectoryNode,
  expanded: Set<string>,
  statusFilter: CaseWorkflowStatus | 'all',
): TreeNode[] {
  const nodes: TreeNode[] = []

  if (!expanded.has(directory.path)) {
    return nodes
  }

  for (const child of directory.children) {
    if (child.kind === 'directory') {
      if (directoryHasMatchingCases(child, statusFilter)) {
        nodes.push(child)
        if (expanded.has(child.path)) {
          nodes.push(...flattenTreeChildren(child, expanded, statusFilter))
        }
      }
      continue
    }

    if (statusFilter === 'all' || child.status === statusFilter) {
      nodes.push(child)
    }
  }

  return nodes
}

function directoryHasMatchingCases(
  directory: DirectoryNode,
  statusFilter: CaseWorkflowStatus | 'all',
): boolean {
  for (const child of directory.children) {
    if (child.kind === 'directory') {
      if (directoryHasMatchingCases(child, statusFilter)) {
        return true
      }
      continue
    }

    if (statusFilter === 'all' || child.status === statusFilter) {
      return true
    }
  }

  return false
}

function collectDirectoryPaths(directory: DirectoryNode): string[] {
  const paths = [directory.path]

  for (const child of directory.children) {
    if (child.kind === 'directory') {
      paths.push(...collectDirectoryPaths(child))
    }
  }

  return paths
}
</script>

<template>
  <div class="shell" :data-screen="isHomeView ? 'home' : 'inner'">
    <template v-if="isHomeView">
      <main class="home">
        <div class="home__eyebrow">{{ t('brand.casebook') }}</div>
        <h1 class="home__title">
          {{ t('home.titleLine1') }}
          <br />
          {{ t('home.titleLine2') }}
        </h1>
        <p class="home__summary">
          {{ t('home.summary') }}
        </p>
        <div class="home__actions">
          <button class="primary-button" type="button" @click="openProjectDirectory">
            {{ t('home.openProjectDirectory') }}
          </button>
          <p class="home__caption">
            {{ t('home.caption') }}
          </p>
        </div>
        <p v-if="scanError" class="home__error">{{ scanError }}</p>
      </main>
    </template>

    <template v-else>
      <p v-if="warningSummary" class="inline-banner">
        {{ warningSummary }}
      </p>

      <main v-if="viewState === 'ready'" class="workspace">
        <aside class="tree-panel">
          <div class="tree-panel__header">
            <div class="tree-panel__header-main">
              <p class="panel__label">{{ t('tree.library') }}</p>
              <h2>{{ testsAlias }}</h2>
            </div>
            <div class="tree-filter">
              <button
                ref="treeFilterButtonRef"
                class="tree-filter__button"
                type="button"
                :aria-expanded="showTreeFilterPanel"
                @click="showTreeFilterPanel = !showTreeFilterPanel"
              >
                {{ treeFilterLabel }}
              </button>

              <div v-if="showTreeFilterPanel" ref="treeFilterPanelRef" class="tree-filter__panel">
                <button
                  class="tree-filter__option"
                  type="button"
                  :data-active="activeTreeStatusFilter === 'all'"
                  @click="activeTreeStatusFilter = 'all'"
                >
                  {{ t('tree.all') }}
                </button>
                <button
                  v-for="workflowStatus in caseWorkflowStatuses"
                  :key="workflowStatus"
                  class="tree-filter__option"
                  type="button"
                  :data-active="activeTreeStatusFilter === workflowStatus"
                  @click="activeTreeStatusFilter = workflowStatus"
                >
                  {{ statusLabel(workflowStatus) }}
                </button>
              </div>
            </div>
          </div>

          <div class="tree-panel__body">
            <div v-if="visibleTreeNodes.length" class="tree-list">
              <button
                v-for="node in visibleTreeNodes"
                :key="node.id"
                class="tree-row"
                type="button"
                :data-kind="node.kind"
                :data-depth="node.depth"
                :data-selected="node.kind === 'case' && node.caseId === selectedCaseId"
                :style="{ paddingInlineStart: `${treeRowIndent(node)}px` }"
                :title="treeNodeTooltip(node)"
                @click="node.kind === 'directory' ? toggleDirectory(node.path) : selectCase(node.caseId)"
              >
                <span class="tree-row__caret">
                  {{ node.kind === 'directory' ? (isDirectoryExpanded(node.path) ? '−' : '+') : '' }}
                </span>

                <span class="tree-row__content">
                  <span class="tree-row__title">
                    <span
                      v-if="node.kind === 'case'"
                      class="tree-row__status-dot"
                      :data-status="node.status"
                      aria-hidden="true"
                    />
                    <span>{{ node.name }}</span>
                  </span>
                </span>
              </button>
            </div>

            <div v-else class="placeholder">
              <p>
                {{
                  activeTreeStatusFilter === 'all'
                    ? t('tree.noCases')
                    : t('tree.noCasesForFilter')
                }}
              </p>
            </div>
          </div>

          <div class="tree-panel__footer">
            <button
              ref="settingsButtonRef"
              class="tree-panel__settings-button"
              type="button"
              :aria-expanded="showSettingsPanel"
              @click="showSettingsPanel = !showSettingsPanel"
            >
              <span class="tree-panel__settings-icon">⌘</span>
              <span>{{ t('tree.settings') }}</span>
            </button>
          </div>
        </aside>

        <section class="detail-panel">
          <template v-if="selectedCase">
            <div class="case-summary">
              <div class="case-summary__header">
                <div class="case-summary__headline">
                  <h2>{{ selectedCase.title }}</h2>
                </div>
              </div>

              <div class="case-summary__meta">
                <div class="summary-primary">
                  <span class="summary-token">
                    <span class="summary-token__label">{{ t('detail.platform') }}</span>
                    <span class="summary-token__value">{{ selectedCase.platform }}</span>
                  </span>
                  <span class="summary-token">
                    <span class="summary-token__label">{{ t('detail.priority') }}</span>
                    <span class="summary-token__value">
                      {{ selectedCase.priority ?? t('detail.none') }}
                    </span>
                  </span>

                  <div class="summary-more">
                    <button
                      ref="summaryMoreTriggerRef"
                      class="summary-more__trigger"
                      type="button"
                      :aria-label="t('detail.moreAriaLabel')"
                      :aria-expanded="showSummaryMeta"
                      @click="showSummaryMeta = !showSummaryMeta"
                    >
                      {{ t('detail.more') }}
                    </button>
                  </div>
                </div>
              </div>

            </div>

            <div class="detail-view-switch">
              <button
                class="detail-view-switch__button"
                type="button"
                :data-active="detailContentView === 'rendered'"
                @click="detailContentView = 'rendered'"
              >
                {{ t('detail.renderedView') }}
              </button>
              <button
                class="detail-view-switch__button"
                type="button"
                :data-active="detailContentView === 'raw'"
                @click="detailContentView = 'raw'"
              >
                {{ t('detail.rawView') }}
              </button>
            </div>

            <section class="detail-document">
              <div
                v-if="detailContentView === 'rendered'"
                class="markdown-content"
                v-html="selectedCaseRenderedHtml"
              />
              <pre v-else class="raw-markdown__content raw-markdown__content--panel">{{
                selectedCase.content
              }}</pre>
            </section>

            <div class="detail-panel__actions">
              <div class="status-switch">
                <button
                  v-for="workflowStatus in caseWorkflowStatuses"
                  :key="workflowStatus"
                  class="status-switch__button"
                  type="button"
                  :data-active="workflowStatus === selectedCase.status"
                  :disabled="statusUpdatePending !== null"
                  @click="updateCaseStatus(workflowStatus)"
                >
                  {{
                    statusUpdatePending === workflowStatus
                      ? t('detail.saving')
                      : statusLabel(workflowStatus)
                  }}
                </button>
              </div>

              <p v-if="statusUpdateError" class="inline-error">{{ statusUpdateError }}</p>
            </div>
          </template>

          <div v-else class="placeholder">
            <p>{{ t('detail.selectCase') }}</p>
          </div>
        </section>
      </main>

      <main v-else class="inner-state">
        <div class="inner-state__body">
          <p class="panel__label">
            {{
              viewState === 'loading'
                ? t('state.scanning')
                : viewState === 'invalid-project'
                  ? t('state.unavailable')
                  : t('state.error')
            }}
          </p>
          <h2>
            {{
              viewState === 'loading'
                ? t('state.readingSelectedProject')
                : viewState === 'invalid-project'
                  ? t('state.notCasebookProject')
                  : t('state.cannotReadProject')
            }}
          </h2>
          <p>
            {{
              viewState === 'loading'
                ? t('state.scanningDescription')
                : scanError || t('state.cannotPrepareProject')
            }}
          </p>
        </div>
      </main>
    </template>
  </div>

  <Teleport to="body">
    <div
      v-if="selectedCase?.parseNotes.length && showParseNotes"
      ref="parseNotesTooltipRef"
      class="parse-notes-tooltip"
      :style="parseNotesTooltipStyle"
      role="tooltip"
    >
      <p class="parse-notes-tooltip__title">{{ t('detail.parseNotes') }}</p>
      <ul class="parse-notes-tooltip__list">
        <li v-for="note in selectedCase.parseNotes" :key="`${note.key}:${JSON.stringify(note.params ?? {})}`">
          {{ translateParseNote(note) }}
        </li>
      </ul>
    </div>

    <div
      v-if="showSummaryMeta && selectedCase"
      ref="summaryMorePopoverRef"
      class="summary-more__popover"
      :style="summaryMorePopoverStyle"
      role="dialog"
    >
      <div class="summary-more__grid">
        <div class="summary-more__item">
          <span class="summary-more__label">{{ t('detail.id') }}</span>
          <span class="summary-more__value summary-more__value--mono">
            {{ selectedCase.id }}
          </span>
        </div>
        <div class="summary-more__item">
          <span class="summary-more__label">{{ t('detail.created') }}</span>
          <span class="summary-more__value">
            {{ selectedCase.createdAtLabel }}
          </span>
        </div>
        <div class="summary-more__item">
          <span class="summary-more__label">{{ t('detail.updated') }}</span>
          <span class="summary-more__value">
            {{ selectedCase.updatedAtLabel }}
          </span>
        </div>
        <div class="summary-more__item">
          <span class="summary-more__label">{{ t('detail.source') }}</span>
          <span class="summary-more__value">
            {{ sourceLabel(selectedCase.summary.source) }}
          </span>
        </div>
      </div>

      <div class="summary-more__path">
        <span class="summary-more__label">{{ t('detail.path') }}</span>
        <span class="summary-more__value">
          {{ selectedCase.summary.pathLabel }}
        </span>
      </div>
    </div>

    <div
      v-if="showSettingsPanel"
      ref="settingsPanelRef"
      class="settings-panel"
      :style="settingsPanelStyle"
    >
      <section class="settings-panel__section">
        <p class="panel__label">{{ t('settings.project') }}</p>
        <p class="settings-panel__path">{{ selectedProject }}</p>
        <div class="settings-panel__actions">
          <button class="secondary-button" type="button" @click="openProjectDirectory">
            {{ t('settings.changeDirectory') }}
          </button>
          <button
            v-if="selectedProject"
            class="secondary-button"
            type="button"
            @click="scanProject(selectedProject)"
          >
            {{ t('settings.rescan') }}
          </button>
        </div>
      </section>

      <section class="settings-panel__section">
        <p class="panel__label">{{ t('settings.casebook') }}</p>
        <label class="summary-more__label" for="locale-select">{{ t('locale.label') }}</label>
        <select id="locale-select" v-model="selectedLocale" class="tree-filter__button">
          <option
            v-for="localeOption in localeOptions"
            :key="localeOption.value"
            :value="localeOption.value"
          >
            {{ t(localeOption.labelKey) }}
          </option>
        </select>
        <p class="settings-panel__placeholder">
          {{ t('settings.placeholder') }}
        </p>
      </section>
    </div>
  </Teleport>
</template>
