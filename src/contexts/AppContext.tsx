import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type {
  AppErrorPayload,
  CaseWorkflowStatus,
  ParsedCase,
  RawScannedCase,
  RawScanResult,
  StatusConfig,
} from '../lib/casebook'
import {
  parseCase,
} from '../lib/casebook'
import type { DirectoryNode, TreeNode } from '../lib/tree'
import type { AppLocale } from '../i18n'
import { setAppLocale } from '../i18n'

type ViewState = 'idle' | 'loading' | 'ready' | 'invalid-project' | 'error'
type DetailContentView = 'rendered' | 'raw'

const ROOT_TREE_PATH = '__tests_root__'

interface AppContextValue {
  // State
  selectedProject: string | null
  scanResult: RawScanResult | null
  scanError: string | null
  viewState: ViewState
  selectedCaseId: string | null
  expandedDirectories: string[]
  statusUpdatePending: CaseWorkflowStatus | null
  statusUpdateError: string | null
  activeTreeStatusFilters: CaseWorkflowStatus[]
  activeTreePriorityFilter: string | 'all'
  detailContentView: DetailContentView
  showParseNotes: boolean
  showSettingsPanel: boolean
  showSummaryMeta: boolean
  showTreeFilterPanel: boolean

  // Refs
  treeFilterButtonRef: React.RefObject<HTMLButtonElement>
  treeFilterPanelRef: React.RefObject<HTMLDivElement>
  parseNotesTriggerRef: React.RefObject<HTMLButtonElement>
  parseNotesTooltipRef: React.RefObject<HTMLDivElement>
  settingsButtonRef: React.RefObject<HTMLButtonElement>
  settingsPanelRef: React.RefObject<HTMLDivElement>
  summaryMoreTriggerRef: React.RefObject<HTMLButtonElement>
  summaryMorePopoverRef: React.RefObject<HTMLDivElement>

  // Styles
  parseNotesTooltipStyle: React.CSSProperties
  settingsPanelStyle: React.CSSProperties
  summaryMorePopoverStyle: React.CSSProperties

  // Computed
  isHomeView: boolean
  parsedCases: ParsedCase[]
  parsedCaseMap: Map<string, ParsedCase>
  selectedCase: ParsedCase | null
  selectedCaseRenderedHtml: string
  testsAlias: string
  treeFilterLabel: string
  caseTree: DirectoryNode | null
  visibleTree: DirectoryNode | null
  visibleTreeChildren: TreeNode[]
  warningSummary: string | null
  selectedLocale: AppLocale
  localeOptions: Array<{ value: AppLocale; labelKey: 'locale.english' | 'locale.chinese' }>
  statusConfig: StatusConfig[]
  priorityConfig: StatusConfig[]

  // Actions
  openProjectDirectory: () => Promise<void>
  scanProject: (projectPath: string) => Promise<void>
  selectCase: (caseId: string) => void
  isDirectoryExpanded: (path: string) => boolean
  toggleDirectory: (path: string) => void
  updateCaseStatus: (nextStatus: CaseWorkflowStatus) => Promise<void>
  statusLabel: (status: CaseWorkflowStatus) => string
  priorityLabel: (priorityId: string) => string
  priorityColor: (priorityId: string) => string
  sourceLabel: (source: ParsedCase['summary']['source']) => string
  translateParseNote: (note: ParsedCase['parseNotes'][number]) => string
  extractErrorMessage: (error: unknown, fallbackKey: string) => string
  buildFixedTopRightPosition: (anchor: HTMLElement, offset: number) => { top: string; right: string }
  updateParseNotesTooltipPosition: () => void
  updateSummaryMorePopoverPosition: () => void
  updateSettingsPanelPosition: () => void
  handleViewportChange: () => void
  isEventInside: (event: PointerEvent, ...elements: Array<HTMLElement | null>) => boolean
  handlePointerDown: (event: PointerEvent) => void
  setShowParseNotes: (value: boolean) => void
  setShowSettingsPanel: (value: boolean) => void
  setShowSummaryMeta: (value: boolean) => void
  setShowTreeFilterPanel: (value: boolean) => void
  setDetailContentView: (value: DetailContentView) => void
  toggleTreeStatusFilter: (status: CaseWorkflowStatus) => void
  resetTreeStatusFilter: () => void
  setActiveTreePriorityFilter: (value: string | 'all') => void
  setSelectedLocale: (value: AppLocale) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()

  // State
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RawScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>('idle')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<string[]>([])
  const [statusUpdatePending, setStatusUpdatePending] = useState<CaseWorkflowStatus | null>(null)
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null)
  const [activeTreeStatusFilters, setActiveTreeStatusFilters] = useState<CaseWorkflowStatus[]>([])
  const [activeTreePriorityFilter, setActiveTreePriorityFilter] = useState<string | 'all'>('all')
  const [detailContentView, setDetailContentView] = useState<DetailContentView>('rendered')
  const [showParseNotes, setShowParseNotes] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [showSummaryMeta, setShowSummaryMeta] = useState(false)
  const [showTreeFilterPanel, setShowTreeFilterPanel] = useState(false)

  // Refs
  const treeFilterButtonRef = useRef<HTMLButtonElement>(null)
  const treeFilterPanelRef = useRef<HTMLDivElement>(null)
  const parseNotesTriggerRef = useRef<HTMLButtonElement>(null)
  const parseNotesTooltipRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const summaryMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const summaryMorePopoverRef = useRef<HTMLDivElement>(null)

  // Styles
  const [parseNotesTooltipStyle, setParseNotesTooltipStyle] = useState<React.CSSProperties>({})
  const [settingsPanelStyle, setSettingsPanelStyle] = useState<React.CSSProperties>({})
  const [summaryMorePopoverStyle, setSummaryMorePopoverStyle] = useState<React.CSSProperties>({})

  // Computed values
  const isHomeView = useMemo(
    () => selectedProject === null && viewState === 'idle',
    [selectedProject, viewState]
  )

  const currentLocale = i18n.language as AppLocale

  // 状态配置
  const statusConfig = useMemo<StatusConfig[]>(() => {
    return scanResult?.statuses ?? []
  }, [scanResult])

  // 允许的状态 ID 列表
  const allowedStatuses = useMemo(() => statusConfig.map(s => s.id), [statusConfig])

  const priorityConfig = useMemo<StatusConfig[]>(() => {
    return scanResult?.priorities ?? []
  }, [scanResult])

  const allowedPriorities = useMemo(() => priorityConfig.map(p => p.id), [priorityConfig])

  const parsedCases = useMemo<ParsedCase[]>(() => {
    if (!scanResult) return []
    return scanResult.cases.map((rawCase) => parseCase(rawCase, currentLocale, allowedStatuses, allowedPriorities))
  }, [scanResult, currentLocale, allowedStatuses, allowedPriorities])

  const parsedCaseMap = useMemo(() => {
    return new Map(parsedCases.map((testCase) => [testCase.caseId, testCase]))
  }, [parsedCases])

  const selectedCase = useMemo<ParsedCase | null>(() => {
    if (!selectedCaseId) return null
    return parsedCaseMap.get(selectedCaseId) ?? null
  }, [selectedCaseId, parsedCaseMap])

  const testsAlias = useMemo(
    () => scanResult?.testsAlias?.trim() || t('casebook.defaultTestsAlias'),
    [scanResult, t]
  )

  const treeFilterLabel = useMemo(
    () =>
      activeTreeStatusFilters.length === 0
        ? t('tree.filter')
        : t('tree.filterWithStatus', { status: activeTreeStatusFilters.map(s => statusLabel(s)).join(', ') }),
    [activeTreeStatusFilters, t]
  )

  const warningSummary = useMemo(() => {
    const errors = scanResult?.errors ?? []
    if (!errors.length) return null
    return errors.length === 1
      ? t('banner.warningSummaryOne')
      : t('banner.warningSummaryOther', { count: errors.length })
  }, [scanResult, t])

  const localeOptions: Array<{ value: AppLocale; labelKey: 'locale.english' | 'locale.chinese' }> =
    useMemo(
      () => [
        { value: 'en', labelKey: 'locale.english' },
        { value: 'zh-CN', labelKey: 'locale.chinese' },
      ],
      []
    )

  // Tree building
  const caseTree = useMemo<DirectoryNode | null>(() => {
    if (!parsedCases.length) return null
    return buildCaseTree(parsedCases, testsAlias)
  }, [parsedCases, testsAlias])

  const visibleTree = useMemo<DirectoryNode | null>(() => {
    if (!caseTree) return null
    return filterTreeDirectory(caseTree, activeTreeStatusFilters, activeTreePriorityFilter)
  }, [caseTree, activeTreeStatusFilters, activeTreePriorityFilter])

  const visibleTreeChildren = useMemo(() => visibleTree?.children ?? [], [visibleTree])

  // Effects
  useEffect(() => {
    setExpandedDirectories(caseTree ? collectDirectoryPaths(caseTree) : [])
  }, [scanResult?.testsRoot])

  useEffect(() => {
    if (!parsedCases.length) {
      setSelectedCaseId(null)
      return
    }
    if (!selectedCaseId || !parsedCases.some((testCase) => testCase.caseId === selectedCaseId)) {
      setSelectedCaseId(parsedCases[0].caseId)
    }
  }, [parsedCases])

  useEffect(() => {
    setDetailContentView('rendered')
    setShowParseNotes(false)
    setShowSummaryMeta(false)
  }, [selectedCaseId])

  useEffect(() => {
    setShowTreeFilterPanel(false)
  }, [activeTreeStatusFilters])

  useEffect(() => {
    setShowTreeFilterPanel(false)
  }, [activeTreePriorityFilter])

  useEffect(() => {
    if (showParseNotes) {
      updateParseNotesTooltipPosition()
    }
  }, [showParseNotes])

  useEffect(() => {
    if (showSettingsPanel) {
      updateSettingsPanelPosition()
    }
  }, [showSettingsPanel])

  useEffect(() => {
    if (showSummaryMeta) {
      updateSummaryMorePopoverPosition()
    }
  }, [showSummaryMeta])

  useEffect(() => {
    const handleResize = () => handleViewportChange()
    const handleScroll = () => handleViewportChange()

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  // Actions
  const openProjectDirectory = useCallback(async () => {
    setScanError(null)
    setStatusUpdateError(null)
    setShowSettingsPanel(false)

    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      })

      if (selectedPath === null || Array.isArray(selectedPath)) return

      setSelectedProject(selectedPath)
      await scanProject(selectedPath)
    } catch (error) {
      setScanError(extractErrorMessage(error, 'errors.fallback.chooseProjectDirectory'))
    }
  }, [])

  const scanProject = useCallback(async (projectPath: string) => {
    setViewState('loading')
    setScanError(null)
    setStatusUpdateError(null)
    setShowSettingsPanel(false)

    try {
      const result = await invoke<RawScanResult>('scan_casebook', { projectRoot: projectPath })
      setScanResult(result)
      setViewState(result.testsRoot ? 'ready' : 'invalid-project')
    } catch (error) {
      setScanResult(null)
      setViewState('error')
      setScanError(extractErrorMessage(error, 'errors.fallback.scanProject'))
    }
  }, [])

  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId)
    setStatusUpdateError(null)
  }, [])

  const isDirectoryExpanded = useCallback(
    (path: string) => expandedDirectories.includes(path),
    [expandedDirectories]
  )

  const toggleDirectory = useCallback((path: string) => {
    setExpandedDirectories((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    )
  }, [])

  const updateCaseStatus = useCallback(
    async (nextStatus: CaseWorkflowStatus) => {
      if (!selectedProject || !selectedCase) return

      setStatusUpdatePending(nextStatus)
      setStatusUpdateError(null)

      try {
        const updatedCase = await invoke<RawScannedCase>('update_case_status', {
          projectRoot: selectedProject,
          casePath: selectedCase.absolutePath,
          status: nextStatus,
        })

        if (!scanResult) return

        setScanResult({
          ...scanResult,
          cases: scanResult.cases.map((testCase) =>
            testCase.caseId === updatedCase.caseId ? updatedCase : testCase
          ),
        })
      } catch (error) {
        setStatusUpdateError(extractErrorMessage(error, 'errors.fallback.updateCaseStatus'))
      } finally {
        setStatusUpdatePending(null)
      }
    },
    [selectedProject, selectedCase, scanResult]
  )

  function statusLabel(status: CaseWorkflowStatus) {
    const config = statusConfig.find(s => s.id === status)
    if (config?.label) {
      return config.label[currentLocale] || config.label['en'] || status
    }
    return status
  }

  function priorityLabel(priorityId: string): string {
    const config = priorityConfig.find(p => p.id === priorityId)
    if (!config) return priorityId
    return config.label[currentLocale] ?? config.label['en'] ?? priorityId
  }

  function priorityColor(priorityId: string): string {
    const config = priorityConfig.find(p => p.id === priorityId)
    return config?.color ?? '#c4c4c4'
  }

  function sourceLabel(source: ParsedCase['summary']['source']) {
    return t(`source.${source}`)
  }

  function translateParseNote(note: ParsedCase['parseNotes'][number]) {
    return t(note.key, note.params ?? {})
  }

  function translateAppErrorPayload(payload: AppErrorPayload) {
    const key = `errors.${payload.code}`
    if (!i18n.exists(key)) {
      return t('errors.fallback.unknown')
    }
    return t(key, {
      detail: payload.detail ?? '',
      path: payload.path ?? '',
      status: payload.detail ?? '',
    })
  }

  function extractErrorMessage(error: unknown, fallbackKey: string) {
    if (typeof error === 'string' && error.trim()) return error

    if (error && typeof error === 'object' && typeof Reflect.get(error, 'code') === 'string') {
      return translateAppErrorPayload(error as AppErrorPayload)
    }

    if (error instanceof Error && error.message.trim()) return error.message

    if (error && typeof error === 'object') {
      const message = Reflect.get(error, 'message')
      if (typeof message === 'string' && message.trim()) return message
    }

    return t(fallbackKey)
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
    if (!parseNotesTriggerRef.current) return
    setParseNotesTooltipStyle(buildFixedTopRightPosition(parseNotesTriggerRef.current, 8))
  }

  function updateSummaryMorePopoverPosition() {
    if (!summaryMoreTriggerRef.current) return
    setSummaryMorePopoverStyle(buildFixedTopRightPosition(summaryMoreTriggerRef.current, 10))
  }

  function updateSettingsPanelPosition() {
    if (!settingsButtonRef.current) return
    const rect = settingsButtonRef.current.getBoundingClientRect()
    setSettingsPanelStyle({
      left: `${rect.left}px`,
      bottom: `${Math.max(16, window.innerHeight - rect.top + 2)}px`,
    })
  }

  function handleViewportChange() {
    if (showParseNotes) updateParseNotesTooltipPosition()
    if (showSettingsPanel) updateSettingsPanelPosition()
    if (showSummaryMeta) updateSummaryMorePopoverPosition()
  }

  function isEventInside(event: PointerEvent, ...elements: Array<HTMLElement | null>) {
    const target = event.target
    return target instanceof Node && elements.some((element) => element?.contains(target))
  }

  function handlePointerDown(event: PointerEvent) {
    if (
      showParseNotes &&
      !isEventInside(event, parseNotesTriggerRef.current, parseNotesTooltipRef.current)
    ) {
      setShowParseNotes(false)
    }

    if (
      showSettingsPanel &&
      !isEventInside(event, settingsButtonRef.current, settingsPanelRef.current)
    ) {
      setShowSettingsPanel(false)
    }

    if (
      showSummaryMeta &&
      !isEventInside(event, summaryMoreTriggerRef.current, summaryMorePopoverRef.current)
    ) {
      setShowSummaryMeta(false)
    }

    if (
      showTreeFilterPanel &&
      !isEventInside(event, treeFilterButtonRef.current, treeFilterPanelRef.current)
    ) {
      setShowTreeFilterPanel(false)
    }
  }

  const selectedLocale = currentLocale

  function toggleTreeStatusFilter(status: CaseWorkflowStatus) {
    setActiveTreeStatusFilters(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  function resetTreeStatusFilter() {
    setActiveTreeStatusFilters([])
  }

  const handleSetSelectedLocale = useCallback((value: AppLocale) => {
    setAppLocale(value)
  }, [])

  const value: AppContextValue = {
    // State
    selectedProject,
    scanResult,
    scanError,
    viewState,
    selectedCaseId,
    expandedDirectories,
    statusUpdatePending,
    statusUpdateError,
    activeTreeStatusFilters,
    activeTreePriorityFilter,
    detailContentView,
    showParseNotes,
    showSettingsPanel,
    showSummaryMeta,
    showTreeFilterPanel,

    // Refs
    treeFilterButtonRef,
    treeFilterPanelRef,
    parseNotesTriggerRef,
    parseNotesTooltipRef,
    settingsButtonRef,
    settingsPanelRef,
    summaryMoreTriggerRef,
    summaryMorePopoverRef,

    // Styles
    parseNotesTooltipStyle,
    settingsPanelStyle,
    summaryMorePopoverStyle,

    // Computed
    isHomeView,
    parsedCases,
    parsedCaseMap,
    selectedCase,
    selectedCaseRenderedHtml: '', // Will be computed in component
    testsAlias,
    treeFilterLabel,
    caseTree,
    visibleTree,
    visibleTreeChildren,
    warningSummary,
    selectedLocale,
    localeOptions,
    statusConfig,
    priorityConfig,

    // Actions
    openProjectDirectory,
    scanProject,
    selectCase,
    isDirectoryExpanded,
    toggleDirectory,
    updateCaseStatus,
    statusLabel,
    priorityLabel,
    priorityColor,
    sourceLabel,
    translateParseNote,
    extractErrorMessage,
    buildFixedTopRightPosition,
    updateParseNotesTooltipPosition,
    updateSummaryMorePopoverPosition,
    updateSettingsPanelPosition,
    handleViewportChange,
    isEventInside,
    handlePointerDown,
    setShowParseNotes,
    setShowSettingsPanel,
    setShowSummaryMeta,
    setShowTreeFilterPanel,
    setDetailContentView,
    toggleTreeStatusFilter,
    resetTreeStatusFilter,
    setActiveTreePriorityFilter,
    setSelectedLocale: handleSetSelectedLocale,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

// Tree utilities
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
        (node): node is DirectoryNode => node.kind === 'directory' && node.path === currentPath
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
      priority: testCase.priority,
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

function filterTreeNode(node: TreeNode, statusFilters: CaseWorkflowStatus[], priorityFilter: string | 'all'): TreeNode | null {
  if (node.kind === 'case') {
    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(node.status)
    const matchesPriority = priorityFilter === 'all' || node.priority === priorityFilter
    return matchesStatus && matchesPriority ? node : null
  }
  return filterTreeDirectory(node, statusFilters, priorityFilter)
}

function filterTreeDirectory(
  directory: DirectoryNode,
  statusFilters: CaseWorkflowStatus[],
  priorityFilter: string | 'all' = 'all'
): DirectoryNode | null {
  const children = directory.children
    .map((child) => filterTreeNode(child, statusFilters, priorityFilter))
    .filter((child): child is TreeNode => child !== null)

  if (directory.path !== ROOT_TREE_PATH && !children.length) {
    return null
  }

  return {
    ...directory,
    children,
  }
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
