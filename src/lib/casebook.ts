import { parse as parseYaml } from 'yaml'

export type UpdatedAtSource = 'git' | 'filesystem'
export type ParseStatus = 'valid' | 'partial' | 'invalid'
export const caseWorkflowStatuses = ['todo', 'in_progress', 'pass', 'blocked'] as const
export type CaseWorkflowStatus = (typeof caseWorkflowStatuses)[number]

export interface ScanError {
  path: string
  message: string
}

export interface RawScannedCase {
  caseId: string
  relativePath: string
  absolutePath: string
  content: string
  createdAt: number | null
  updatedAt: number | null
  updatedAtSource: UpdatedAtSource
}

export interface RawScanResult {
  projectRoot: string
  casebookRoot: string | null
  testsRoot: string | null
  testsAlias: string | null
  cases: RawScannedCase[]
  errors: ScanError[]
}

export interface ParsedCaseSummary {
  sourceLabel: string
  pathLabel: string
}

export interface ParsedCase extends RawScannedCase {
  id: string
  title: string
  platform: string
  priority: string | null
  createdAtLabel: string
  status: CaseWorkflowStatus
  parseStatus: ParseStatus
  parseNotes: string[]
  updatedAtLabel: string
  summary: ParsedCaseSummary
  renderBody: string
  rawBody: string
}

interface FrontmatterParseResult {
  data: Record<string, unknown>
  body: string
  errors: string[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function filenameFromPath(relativePath: string) {
  const lastSegment = relativePath.split('/').pop() ?? relativePath
  return lastSegment.replace(/\.md$/i, '')
}

function platformFromPath(relativePath: string) {
  return relativePath.split('/')[0] ?? 'unknown'
}

function normalizeLineBreaks(content: string) {
  return content.replace(/\r\n/g, '\n').trim()
}

function splitFrontmatter(content: string): FrontmatterParseResult {
  const normalized = content.replace(/\r\n/g, '\n')

  if (!normalized.startsWith('---\n')) {
    return {
      data: {},
      body: normalized.trim(),
      errors: [],
    }
  }

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return {
      data: {},
      body: normalized.trim(),
      errors: ['Invalid frontmatter block'],
    }
  }

  const frontmatter = normalized.slice(4, closingIndex)
  const body = normalized.slice(closingIndex + 5).trim()
  const errors: string[] = []
  let data: Record<string, unknown> = {}

  try {
    const parsed = parseYaml(frontmatter)
    if (parsed !== null && typeof parsed !== 'object') {
      errors.push('Frontmatter must be a YAML object')
    } else {
      data = (parsed ?? {}) as Record<string, unknown>
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unable to parse frontmatter YAML')
  }

  return { data, body, errors }
}

function isCaseWorkflowStatus(value: unknown): value is CaseWorkflowStatus {
  return (
    typeof value === 'string' &&
    caseWorkflowStatuses.includes(value.trim() as CaseWorkflowStatus)
  )
}

function normalizeCaseWorkflowStatus(value: unknown): CaseWorkflowStatus | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (isCaseWorkflowStatus(normalized)) {
    return normalized
  }

  const legacyStatusMap: Record<string, CaseWorkflowStatus> = {
    待处理: 'todo',
    进行中: 'in_progress',
    已通过: 'pass',
    已阻塞: 'blocked',
  }

  return legacyStatusMap[normalized] ?? null
}

export function formatUpdatedAt(updatedAt: number | null) {
  if (!updatedAt) {
    return 'Unavailable'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(updatedAt))
}

export function parseCase(rawCase: RawScannedCase): ParsedCase {
  const fallbackTitle = filenameFromPath(rawCase.relativePath)
  const fallbackPlatform = platformFromPath(rawCase.relativePath)
  const frontmatter = splitFrontmatter(rawCase.content)
  const data = frontmatter.data
  const parseNotes = [...frontmatter.errors]

  for (const key of ['title', 'platform']) {
    if (!isNonEmptyString(data[key])) {
      parseNotes.push(`Missing frontmatter field: ${key}`)
    }
  }
  const parseStatus: ParseStatus = frontmatter.errors.length
    ? 'invalid'
    : parseNotes.length
      ? 'partial'
      : 'valid'
  const renderBody = normalizeLineBreaks(frontmatter.body || rawCase.content)

  return {
    ...rawCase,
    id: rawCase.relativePath,
    title: isNonEmptyString(data.title) ? data.title.trim() : fallbackTitle,
    platform: isNonEmptyString(data.platform) ? data.platform.trim() : fallbackPlatform,
    priority: isNonEmptyString(data.priority) ? data.priority.trim() : null,
    createdAtLabel: formatUpdatedAt(rawCase.createdAt),
    status: normalizeCaseWorkflowStatus(data.status) ?? 'todo',
    parseStatus,
    parseNotes,
    updatedAtLabel: formatUpdatedAt(rawCase.updatedAt),
    summary: {
      sourceLabel: rawCase.updatedAtSource === 'filesystem' ? 'Filesystem' : 'Git',
      pathLabel: rawCase.relativePath,
    },
    renderBody,
    rawBody: frontmatter.body,
  }
}
