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
  body: string
}

const requiredSections = ['前置条件', '步骤', '预期结果']

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

function findSections(content: string) {
  return [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim())
}

function parseFrontmatter(content: string) {
  if (!content.startsWith('---')) {
    return { data: {}, content }
  }

  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid frontmatter block')
  }

  const [, frontmatter, body] = match
  const parsed = parseYaml(frontmatter)

  if (parsed !== null && typeof parsed !== 'object') {
    throw new Error('Frontmatter must be a YAML object')
  }

  return {
    data: (parsed ?? {}) as Record<string, unknown>,
    content: body,
  }
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

  try {
    const parsed = parseFrontmatter(rawCase.content)
    const data = parsed.data
    const sections = findSections(parsed.content)
    const parseNotes: string[] = []

    for (const key of ['id', 'title', 'platform', 'created_at']) {
      if (!isNonEmptyString(data[key])) {
        parseNotes.push(`Missing frontmatter field: ${key}`)
      }
    }

    for (const section of requiredSections) {
      if (!sections.includes(section)) {
        parseNotes.push(`Missing section: ${section}`)
      }
    }

    return {
      ...rawCase,
      id: isNonEmptyString(data.id) ? data.id.trim() : rawCase.caseId,
      title: isNonEmptyString(data.title) ? data.title.trim() : fallbackTitle,
      platform: isNonEmptyString(data.platform)
        ? data.platform.trim()
        : fallbackPlatform,
      priority: isNonEmptyString(data.priority) ? data.priority.trim() : null,
      createdAt: isNonEmptyString(data.created_at) ? data.created_at.trim() : null,
      status: isCaseWorkflowStatus(data.status)
        ? (data.status.trim() as CaseWorkflowStatus)
        : '待处理',
      parseStatus: parseNotes.length === 0 ? 'valid' : 'partial',
      parseNotes,
      updatedAtLabel: formatUpdatedAt(rawCase.updatedAt),
      body: parsed.content.trim(),
    }
  } catch (error) {
    return {
      ...rawCase,
      id: rawCase.caseId,
      title: fallbackTitle,
      platform: fallbackPlatform,
      priority: null,
      createdAt: null,
      status: '待处理',
      parseStatus: 'invalid',
      parseNotes: [
        error instanceof Error ? error.message : 'Unable to parse Markdown file',
      ],
      updatedAtLabel: formatUpdatedAt(rawCase.updatedAt),
      body: rawCase.content.trim(),
    }
  }
}
