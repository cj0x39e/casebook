<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  caseWorkflowStatuses,
  parseCase,
  type CaseWorkflowStatus,
  type ParsedCase,
  type ParseStatus,
  type RawScannedCase,
  type RawScanResult,
} from './lib/casebook'

type ViewState = 'idle' | 'loading' | 'ready' | 'invalid-project' | 'error'
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
  parseStatus: ParseStatus
  workflowStatus: CaseWorkflowStatus
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

const parsedCases = computed<ParsedCase[]>(() => {
  if (!scanResult.value) {
    return []
  }

  return scanResult.value.cases.map(parseCase)
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

const testsAlias = computed(() => scanResult.value?.testsAlias?.trim() || 'Tests')

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

  return flattenTree(caseTree.value, new Set(expandedDirectories.value))
})

const caseStats = computed(() => {
  return parsedCases.value.reduce(
    (stats, testCase) => {
      stats.total += 1
      stats[testCase.parseStatus] += 1
      return stats
    },
    { total: 0, valid: 0, partial: 0, invalid: 0 },
  )
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

    if (!selectedCaseId.value || !cases.some((testCase) => testCase.caseId === selectedCaseId.value)) {
      selectedCaseId.value = cases[0].caseId
    }
  },
  { immediate: true },
)

async function openProjectDirectory() {
  scanError.value = null
  statusUpdateError.value = null

  try {
    const selectedPath = await open({
      directory: true,
      multiple: false,
    })

    if (selectedPath === null || Array.isArray(selectedPath)) {
      return
    }

    const projectPath = selectedPath
    selectedProject.value = projectPath
    await scanProject(projectPath)
  } catch (error) {
    viewState.value = 'error'
    scanError.value =
      error instanceof Error ? error.message : 'Unable to choose a project directory'
  }
}

async function scanProject(projectPath: string) {
  viewState.value = 'loading'
  scanError.value = null
  statusUpdateError.value = null

  try {
    const result = await invoke<RawScanResult>('scan_casebook', { projectRoot: projectPath })
    scanResult.value = result
    viewState.value = result.testsRoot ? 'ready' : 'invalid-project'
  } catch (error) {
    scanResult.value = null
    viewState.value = 'error'
    scanError.value =
      error instanceof Error ? error.message : 'Unable to scan the selected project'
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
    statusUpdateError.value =
      error instanceof Error ? error.message : 'Unable to update case status'
  } finally {
    statusUpdatePending.value = null
  }
}

function detailLabelForPath(path: string) {
  if (path === ROOT_TREE_PATH) {
    return scanResult.value?.testsRoot ?? 'casebook/tests'
  }

  return path
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
      parseStatus: testCase.parseStatus,
      workflowStatus: testCase.status,
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

function flattenTree(directory: DirectoryNode, expanded: Set<string>): TreeNode[] {
  const nodes: TreeNode[] = [directory]

  if (!expanded.has(directory.path)) {
    return nodes
  }

  for (const child of directory.children) {
    nodes.push(child)
    if (child.kind === 'directory') {
      nodes.push(...flattenTreeChildren(child, expanded))
    }
  }

  return nodes
}

function flattenTreeChildren(directory: DirectoryNode, expanded: Set<string>): TreeNode[] {
  const nodes: TreeNode[] = []

  if (!expanded.has(directory.path)) {
    return nodes
  }

  for (const child of directory.children) {
    nodes.push(child)
    if (child.kind === 'directory') {
      nodes.push(...flattenTreeChildren(child, expanded))
    }
  }

  return nodes
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
  <div class="shell">
    <header class="hero">
      <div class="hero__copy">
        <p class="eyebrow">Markdown-native QA workspace</p>
        <h1>Casebook</h1>
        <p class="hero__summary">
          Open any project, inspect its case tree, and drive case state transitions directly from
          Markdown frontmatter.
        </p>
      </div>

      <div class="hero__actions">
        <button class="primary-button" type="button" @click="openProjectDirectory">
          Open Project Directory
        </button>
        <p class="helper-text">
          Left panel follows <code>casebook/tests</code>. Right panel keeps metadata, body, and
          status actions in one place.
        </p>
      </div>
    </header>

    <main class="workspace">
      <section class="panel panel--status">
        <div>
          <p class="panel__label">Current Project</p>
          <p class="panel__value">{{ selectedProject ?? 'No project selected yet' }}</p>
        </div>

        <div class="status-cluster">
          <span class="status-pill" :data-state="viewState">
            {{
              viewState === 'idle'
                ? 'Waiting'
                : viewState === 'loading'
                  ? 'Scanning'
                  : viewState === 'ready'
                    ? 'Loaded'
                    : viewState === 'invalid-project'
                      ? 'Missing casebook/tests'
                      : 'Error'
            }}
          </span>
          <button
            v-if="selectedProject"
            class="secondary-button"
            type="button"
            @click="scanProject(selectedProject)"
          >
            Rescan
          </button>
        </div>
      </section>

      <section v-if="viewState === 'idle'" class="panel empty-state">
        <p class="empty-state__eyebrow">Start here</p>
        <h2>Select a repository or app workspace</h2>
        <p>
          Casebook looks for <code>casebook/tests</code> and optionally reads
          <code>casebook/config.yml</code> to label the tree root.
        </p>
      </section>

      <section v-else-if="viewState === 'loading'" class="panel empty-state">
        <p class="empty-state__eyebrow">Scanning</p>
        <h2>Reading tree structure and case metadata</h2>
        <p>Loading Markdown files, config aliases, and current timestamps from the selected project.</p>
      </section>

      <section v-else-if="viewState === 'invalid-project'" class="panel empty-state">
        <p class="empty-state__eyebrow">Not initialized</p>
        <h2>This directory is not a Casebook project yet</h2>
        <p>
          Expected to find <code>casebook/tests</code> under the selected directory. The desktop app
          stays read-only until a valid tests tree exists.
        </p>
      </section>

      <section v-else-if="viewState === 'error'" class="panel empty-state empty-state--error">
        <p class="empty-state__eyebrow">Scan failed</p>
        <h2>Casebook could not read this project</h2>
        <p>{{ scanError }}</p>
      </section>

      <template v-else>
        <section class="stats-grid">
          <article class="panel stat-card">
            <p class="panel__label">Total Cases</p>
            <p class="stat-card__value">{{ caseStats.total }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Valid</p>
            <p class="stat-card__value">{{ caseStats.valid }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Partial</p>
            <p class="stat-card__value">{{ caseStats.partial }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Invalid</p>
            <p class="stat-card__value">{{ caseStats.invalid }}</p>
          </article>
        </section>

        <section v-if="scanResult?.errors.length" class="panel warnings">
          <div class="warnings__header">
            <div>
              <p class="panel__label">Scan Warnings</p>
              <h2>{{ scanResult.errors.length }} issues found while loading the project</h2>
            </div>
          </div>
          <ul class="warnings__list">
            <li v-for="warning in scanResult.errors" :key="`${warning.path}:${warning.message}`">
              <strong>{{ warning.path }}</strong>
              <span>{{ warning.message }}</span>
            </li>
          </ul>
        </section>

        <section class="workbench">
          <aside class="panel tree-panel">
            <div class="tree-panel__header">
              <div>
                <p class="panel__label">Case Tree</p>
                <h2>{{ testsAlias }}</h2>
              </div>
              <p class="tree-panel__summary">{{ parsedCases.length }} cases</p>
            </div>

            <div v-if="visibleTreeNodes.length" class="tree-list">
              <button
                v-for="node in visibleTreeNodes"
                :key="node.id"
                class="tree-row"
                type="button"
                :data-kind="node.kind"
                :data-selected="node.kind === 'case' && node.caseId === selectedCaseId"
                :style="{ paddingInlineStart: `${18 + node.depth * 18}px` }"
                @click="node.kind === 'directory' ? toggleDirectory(node.path) : selectCase(node.caseId)"
              >
                <span class="tree-row__caret" :data-open="node.kind === 'directory' && isDirectoryExpanded(node.path)">
                  {{ node.kind === 'directory' ? (isDirectoryExpanded(node.path) ? '▾' : '▸') : '•' }}
                </span>

                <span class="tree-row__content">
                  <span class="tree-row__title">{{ node.name }}</span>
                  <span class="tree-row__subtitle">{{ detailLabelForPath(node.path) }}</span>
                </span>

                <span v-if="node.kind === 'case'" class="tree-row__badges">
                  <span class="workflow-pill" :data-status="node.workflowStatus">
                    {{ node.workflowStatus }}
                  </span>
                  <span class="parse-pill" :data-status="node.parseStatus">
                    {{ node.parseStatus }}
                  </span>
                </span>
              </button>
            </div>

            <div v-else class="empty-table">
              <p>No Markdown cases were found under <code>casebook/tests</code>.</p>
            </div>
          </aside>

          <section class="panel detail-panel">
            <template v-if="selectedCase">
              <div class="detail-panel__header">
                <div>
                  <p class="panel__label">Case Detail</p>
                  <h2>{{ selectedCase.title }}</h2>
                  <p class="detail-panel__path">{{ selectedCase.relativePath }}</p>
                </div>

                <div class="detail-panel__badges">
                  <span class="workflow-pill" :data-status="selectedCase.status">
                    {{ selectedCase.status }}
                  </span>
                  <span class="parse-pill" :data-status="selectedCase.parseStatus">
                    {{ selectedCase.parseStatus }}
                  </span>
                </div>
              </div>

              <section class="detail-section">
                <div class="detail-grid">
                  <article class="detail-item">
                    <p class="panel__label">Case ID</p>
                    <p>{{ selectedCase.id }}</p>
                  </article>
                  <article class="detail-item">
                    <p class="panel__label">Platform</p>
                    <p>{{ selectedCase.platform }}</p>
                  </article>
                  <article class="detail-item">
                    <p class="panel__label">Priority</p>
                    <p>{{ selectedCase.priority ?? 'No priority' }}</p>
                  </article>
                  <article class="detail-item">
                    <p class="panel__label">Created At</p>
                    <p>{{ selectedCase.createdAt ?? 'Not provided' }}</p>
                  </article>
                  <article class="detail-item">
                    <p class="panel__label">Updated At</p>
                    <p>{{ selectedCase.updatedAtLabel }}</p>
                  </article>
                  <article class="detail-item">
                    <p class="panel__label">Timestamp Source</p>
                    <p>
                      {{
                        selectedCase.updatedAtSource === 'filesystem'
                          ? 'File timestamp fallback'
                          : 'Git timestamp'
                      }}
                    </p>
                  </article>
                </div>
              </section>

              <section class="detail-section">
                <div class="detail-section__header">
                  <div>
                    <p class="panel__label">Status Actions</p>
                    <h3>Write current state back to frontmatter</h3>
                  </div>
                </div>

                <div class="status-actions">
                  <button
                    v-for="workflowStatus in caseWorkflowStatuses"
                    :key="workflowStatus"
                    class="status-action"
                    type="button"
                    :data-active="workflowStatus === selectedCase.status"
                    :data-status="workflowStatus"
                    :disabled="statusUpdatePending !== null"
                    @click="updateCaseStatus(workflowStatus)"
                  >
                    {{
                      statusUpdatePending === workflowStatus ? 'Saving…' : workflowStatus
                    }}
                  </button>
                </div>

                <p v-if="statusUpdateError" class="inline-error">{{ statusUpdateError }}</p>
              </section>

              <section v-if="selectedCase.parseNotes.length" class="detail-section">
                <div class="detail-section__header">
                  <div>
                    <p class="panel__label">Parse Notes</p>
                    <h3>Current parse warnings</h3>
                  </div>
                </div>
                <ul class="case-card__notes">
                  <li v-for="note in selectedCase.parseNotes" :key="note">{{ note }}</li>
                </ul>
              </section>

              <section class="detail-section">
                <div class="detail-section__header">
                  <div>
                    <p class="panel__label">Markdown</p>
                    <h3>Body content</h3>
                  </div>
                </div>
                <pre class="case-body">{{ selectedCase.body || 'No body content.' }}</pre>
              </section>
            </template>

            <div v-else class="empty-state detail-empty-state">
              <p class="empty-state__eyebrow">No case selected</p>
              <h2>Choose a case from the tree</h2>
              <p>
                The right side shows metadata, parse notes, Markdown body, and status actions for
                the currently selected case.
              </p>
            </div>
          </section>
        </section>
      </template>
    </main>
  </div>
</template>
