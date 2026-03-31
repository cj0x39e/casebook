import { parse as parseYaml } from 'yaml'

export type UpdatedAtSource = 'git' | 'filesystem'
export type ParseStatus = 'valid' | 'partial' | 'invalid'
export const caseWorkflowStatuses = ['待处理', '进行中', '已通过', '已阻塞'] as const
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
  createdAt: string | null
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

  for (const key of ['id', 'title', 'platform', 'created_at']) {
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
    id: isNonEmptyString(data.id) ? data.id.trim() : rawCase.caseId,
    title: isNonEmptyString(data.title) ? data.title.trim() : fallbackTitle,
    platform: isNonEmptyString(data.platform) ? data.platform.trim() : fallbackPlatform,
    priority: isNonEmptyString(data.priority) ? data.priority.trim() : null,
    createdAt: isNonEmptyString(data.created_at) ? data.created_at.trim() : null,
    status: isCaseWorkflowStatus(data.status)
      ? (data.status.trim() as CaseWorkflowStatus)
      : '待处理',
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
