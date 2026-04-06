import { parse as parseYaml } from 'yaml'
import { defaultLocale, type AppLocale } from '../i18n'

export type UpdatedAtSource = 'git' | 'filesystem'
export type ParseStatus = 'valid' | 'partial' | 'invalid'

// 状态配置类型
export interface StatusConfig {
  id: string
  label: Record<string, string>
  color: string
}

// 动态状态类型，不再硬编码
export type CaseWorkflowStatus = string

export interface ScanError {
  path: string
  code: string
  detail: string | null
}

export interface AppErrorPayload {
  code: string
  detail: string | null
  path: string | null
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
  statuses: StatusConfig[]
  cases: RawScannedCase[]
  errors: ScanError[]
}

export interface ParsedCaseSummary {
  source: UpdatedAtSource
  pathLabel: string
}

export interface ParseNote {
  key: string
  params?: Record<string, string>
}

export interface ParsedCase extends RawScannedCase {
  id: string
  title: string
  platform: string
  priority: string | null
  createdAtLabel: string
  status: CaseWorkflowStatus
  parseStatus: ParseStatus
  parseNotes: ParseNote[]
  updatedAtLabel: string
  summary: ParsedCaseSummary
  renderBody: string
  rawBody: string
}

interface FrontmatterParseResult {
  data: Record<string, unknown>
  body: string
  errors: ParseNote[]
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
      errors: [{ key: 'parseNotes.invalidFrontmatterBlock' }],
    }
  }

  const frontmatter = normalized.slice(4, closingIndex)
  const body = normalized.slice(closingIndex + 5).trim()
  const errors: ParseNote[] = []
  let data: Record<string, unknown> = {}

  try {
    const parsed = parseYaml(frontmatter)
    if (parsed !== null && typeof parsed !== 'object') {
      errors.push({ key: 'parseNotes.frontmatterMustBeObject' })
    } else {
      data = (parsed ?? {}) as Record<string, unknown>
    }
  } catch (error) {
    errors.push({
      key: 'parseNotes.unableToParseYaml',
      params: {
        detail: error instanceof Error ? error.message : 'Unknown YAML parsing error',
      },
    })
  }

  return { data, body, errors }
}

function isValidStatus(value: string, allowedStatuses: string[]): boolean {
  return allowedStatuses.includes(value.trim())
}

function normalizeCaseWorkflowStatus(value: unknown, allowedStatuses: string[]): CaseWorkflowStatus | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (isValidStatus(normalized, allowedStatuses)) {
    return normalized
  }

  // 支持中文旧状态映射
  const legacyStatusMap: Record<string, string> = {
    待处理: 'todo',
    已通过: 'pass',
    已阻塞: 'blocked',
  }

  const mapped = legacyStatusMap[normalized]
  if (mapped && isValidStatus(mapped, allowedStatuses)) {
    return mapped
  }

  return null
}

export function formatUpdatedAt(updatedAt: number | null, locale: AppLocale = defaultLocale) {
  if (!updatedAt) {
    return locale === 'zh-CN' ? '不可用' : 'Unavailable'
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(updatedAt))
}

export function parseCase(
  rawCase: RawScannedCase,
  locale: AppLocale = defaultLocale,
  allowedStatuses: string[] = [],
): ParsedCase {
  const fallbackTitle = filenameFromPath(rawCase.relativePath)
  const fallbackPlatform = platformFromPath(rawCase.relativePath)
  const frontmatter = splitFrontmatter(rawCase.content)
  const data = frontmatter.data
  const parseNotes = [...frontmatter.errors]

  for (const key of ['title', 'platform']) {
    if (!isNonEmptyString(data[key])) {
      parseNotes.push({
        key: 'parseNotes.missingFrontmatterField',
        params: { field: key },
      })
    }
  }
  const parseStatus: ParseStatus = frontmatter.errors.length
    ? 'invalid'
    : parseNotes.length
      ? 'partial'
      : 'valid'
  const renderBody = normalizeLineBreaks(frontmatter.body || rawCase.content)

  // 如果 allowedStatuses 为空，使用原始状态值；否则使用第一个状态作为默认值
  const defaultStatus = allowedStatuses.length > 0 ? allowedStatuses[0] : (typeof data.status === 'string' ? data.status : 'todo')

  return {
    ...rawCase,
    id: rawCase.relativePath,
    title: isNonEmptyString(data.title) ? data.title.trim() : fallbackTitle,
    platform: isNonEmptyString(data.platform) ? data.platform.trim() : fallbackPlatform,
    priority: isNonEmptyString(data.priority) ? data.priority.trim() : null,
    createdAtLabel: formatUpdatedAt(rawCase.createdAt, locale),
    status: normalizeCaseWorkflowStatus(data.status, allowedStatuses) ?? defaultStatus,
    parseStatus,
    parseNotes,
    updatedAtLabel: formatUpdatedAt(rawCase.updatedAt, locale),
    summary: {
      source: rawCase.updatedAtSource,
      pathLabel: rawCase.relativePath,
    },
    renderBody,
    rawBody: frontmatter.body,
  }
}
