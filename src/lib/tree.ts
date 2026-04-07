import type { CaseWorkflowStatus } from './casebook'

export type TreeNode = DirectoryNode | CaseFileNode

export interface DirectoryNode {
  kind: 'directory'
  id: string
  path: string
  name: string
  depth: number
  children: TreeNode[]
}

export interface CaseFileNode {
  kind: 'case'
  id: string
  path: string
  name: string
  depth: number
  caseId: string
  status: CaseWorkflowStatus
  priority: string | null
}
