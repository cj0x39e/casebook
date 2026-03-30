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

const isHomeView = computed(() => selectedProject.value === null && viewState.value === 'idle')

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

const warningSummary = computed(() => {
  const errors = scanResult.value?.errors ?? []
  if (!errors.length) {
    return null
  }

  return `${errors.length} warning${errors.length > 1 ? 's' : ''}`
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

    selectedProject.value = selectedPath
    await scanProject(selectedPath)
  } catch (error) {
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

function resetToHome() {
  selectedProject.value = null
  scanResult.value = null
  scanError.value = null
  statusUpdateError.value = null
  selectedCaseId.value = null
  viewState.value = 'idle'
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
  <div class="shell" :data-screen="isHomeView ? 'home' : 'inner'">
    <template v-if="isHomeView">
      <main class="home">
        <div class="home__eyebrow">Casebook</div>
        <h1 class="home__title">
          Quiet space
          <br />
          for test cases
        </h1>
        <p class="home__summary">
          Open a local project and read its Markdown-native cases without leaving the codebase.
        </p>
        <div class="home__actions">
          <button class="primary-button" type="button" @click="openProjectDirectory">
            Open Project Directory
          </button>
          <p class="home__caption">Looks for <code>casebook/tests</code> and an optional alias in <code>casebook/config.yml</code>.</p>
        </div>
        <p v-if="scanError" class="home__error">{{ scanError }}</p>
      </main>
    </template>

    <template v-else>
      <header class="toolbar">
        <div class="toolbar__primary">
          <button class="toolbar__brand" type="button" @click="resetToHome">Casebook</button>
          <div class="toolbar__project">
            <p class="toolbar__label">Project</p>
            <p class="toolbar__path">{{ selectedProject }}</p>
          </div>
        </div>

        <div class="toolbar__actions">
          <span class="status-pill" :data-state="viewState">
            {{
              viewState === 'loading'
                ? 'Scanning'
                : viewState === 'ready'
                  ? 'Loaded'
                  : viewState === 'invalid-project'
                    ? 'Missing casebook/tests'
                    : 'Error'
            }}
          </span>
          <button class="secondary-button" type="button" @click="openProjectDirectory">
            Change Directory
          </button>
          <button
            v-if="selectedProject"
            class="secondary-button"
            type="button"
            @click="scanProject(selectedProject)"
          >
            Rescan
          </button>
        </div>
      </header>

      <p v-if="warningSummary" class="inline-banner">
        {{ warningSummary }} while reading the project.
      </p>

      <main v-if="viewState === 'ready'" class="workspace">
        <aside class="tree-panel">
          <div class="tree-panel__header">
            <div>
              <p class="panel__label">Library</p>
              <h2>{{ testsAlias }}</h2>
            </div>
          </div>

          <div v-if="visibleTreeNodes.length" class="tree-list">
            <button
              v-for="node in visibleTreeNodes"
              :key="node.id"
              class="tree-row"
              type="button"
              :data-kind="node.kind"
              :data-selected="node.kind === 'case' && node.caseId === selectedCaseId"
              :style="{ paddingInlineStart: `${16 + node.depth * 16}px` }"
              @click="node.kind === 'directory' ? toggleDirectory(node.path) : selectCase(node.caseId)"
            >
              <span class="tree-row__caret">
                {{ node.kind === 'directory' ? (isDirectoryExpanded(node.path) ? '−' : '+') : '·' }}
              </span>

              <span class="tree-row__content">
                <span class="tree-row__title">{{ node.name }}</span>
                <span v-if="node.kind === 'case'" class="tree-row__subtitle">{{ node.workflowStatus }}</span>
                <span v-else class="tree-row__subtitle">{{ detailLabelForPath(node.path) }}</span>
              </span>

              <span v-if="node.kind === 'case'" class="tree-row__meta" :data-status="node.parseStatus"></span>
            </button>
          </div>

          <div v-else class="placeholder">
            <p>No Markdown cases found.</p>
          </div>
        </aside>

        <section class="detail-panel">
          <template v-if="selectedCase">
            <div class="detail-panel__header">
              <div>
                <p class="panel__label">Case</p>
                <h2>{{ selectedCase.title }}</h2>
              </div>
              <div class="detail-panel__badges">
                <span class="workflow-pill" :data-status="selectedCase.status">{{ selectedCase.status }}</span>
                <span class="parse-pill" :data-status="selectedCase.parseStatus">{{ selectedCase.parseStatus }}</span>
              </div>
            </div>

            <dl class="meta-grid">
              <div class="meta-item">
                <dt>ID</dt>
                <dd>{{ selectedCase.id }}</dd>
              </div>
              <div class="meta-item">
                <dt>Platform</dt>
                <dd>{{ selectedCase.platform }}</dd>
              </div>
              <div class="meta-item">
                <dt>Priority</dt>
                <dd>{{ selectedCase.priority ?? 'None' }}</dd>
              </div>
              <div class="meta-item">
                <dt>Updated</dt>
                <dd>{{ selectedCase.updatedAtLabel }}</dd>
              </div>
              <div class="meta-item">
                <dt>Source</dt>
                <dd>{{ selectedCase.updatedAtSource === 'filesystem' ? 'Filesystem' : 'Git' }}</dd>
              </div>
              <div class="meta-item">
                <dt>Path</dt>
                <dd>{{ selectedCase.relativePath }}</dd>
              </div>
            </dl>

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
                {{ statusUpdatePending === workflowStatus ? 'Saving' : workflowStatus }}
              </button>
            </div>

            <p v-if="statusUpdateError" class="inline-error">{{ statusUpdateError }}</p>

            <ul v-if="selectedCase.parseNotes.length" class="notes-list">
              <li v-for="note in selectedCase.parseNotes" :key="note">{{ note }}</li>
            </ul>

            <pre class="case-body">{{ selectedCase.body || 'No body content.' }}</pre>
          </template>

          <div v-else class="placeholder">
            <p>Select a case from the tree.</p>
          </div>
        </section>
      </main>

      <main v-else class="inner-state">
        <div class="inner-state__body">
          <p class="panel__label">
            {{ viewState === 'loading' ? 'Scanning' : viewState === 'invalid-project' ? 'Unavailable' : 'Error' }}
          </p>
          <h2>
            {{
              viewState === 'loading'
                ? 'Reading cases from the selected project'
                : viewState === 'invalid-project'
                  ? 'This directory is not a Casebook project'
                  : 'Casebook could not read this project'
            }}
          </h2>
          <p>
            {{
              viewState === 'loading'
                ? 'Scanning Markdown files and preparing the case tree.'
                : scanError || 'Expected to find casebook/tests under the selected directory.'
            }}
          </p>
        </div>
      </main>
    </template>
  </div>
</template>
