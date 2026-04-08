import type { CaseWorkflowStatus } from '../lib/casebook'
import type { CaseFileNode, TreeNode } from '../lib/tree'
import folderIcon from '../assets/folder.svg'
import fileIcon from '../assets/file.svg'
import { useApp } from '../contexts/AppContext'

interface CaseTreeNodeProps {
  node: TreeNode
  level: number
  isLastChild: boolean
  selectedCaseId: string | null
  expandedDirectories: string[]
  onToggle: (path: string) => void
  onSelect: (caseId: string) => void
}

export function CaseTreeNode({
  node,
  level,
  isLastChild,
  selectedCaseId,
  expandedDirectories,
  onToggle,
  onSelect,
}: CaseTreeNodeProps) {
  const { statusConfig, statusLabel } = useApp()

  const isDirectory = node.kind === 'directory'
  const isExpanded = isDirectory ? expandedDirectories.includes(node.path) : false
  const directoryChildren = isDirectory ? node.children : []

  // 获取状态颜色
  const getStatusColor = (status: CaseWorkflowStatus): string | undefined => {
    return statusConfig.find(s => s.id === status)?.color
  }

  function handleDirectoryToggle() {
    if (node.kind === 'directory') {
      onToggle(node.path)
    }
  }

  function handleCaseSelect(node: CaseFileNode) {
    onSelect(node.caseId)
  }

  return (
    <li
      className="tree-view__node"
      data-kind={node.kind}
      data-level={level}
      data-last-child={String(isLastChild)}
      role="treeitem"
      aria-expanded={isDirectory ? isExpanded : undefined}
    >
      <div className="tree-view__shell" data-root={String(level === 0)}>
        {level > 0 && (
          <span className="tree-view__scaffold" data-last-child={String(isLastChild)} aria-hidden="true">
            <span className="tree-view__scaffold-line" />
            <span className="tree-view__elbow" />
          </span>
        )}

        {isDirectory ? (
          <button
            className="tree-view__row tree-view__row--directory"
            type="button"
            title={node.path}
            onClick={handleDirectoryToggle}
          >
            <span className="tree-view__arrow" data-expanded={isExpanded} aria-hidden="true">
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className="tree-view__icon" aria-hidden="true">
              <img src={folderIcon} alt="" />
            </span>
            <span className="tree-view__label">{node.name}</span>
          </button>
        ) : (
          <button
            className="tree-view__row tree-view__row--case"
            type="button"
            data-selected={String((node as CaseFileNode).caseId === selectedCaseId)}
            data-status={(node as CaseFileNode).status}
            style={{ ['--status-color' as string]: getStatusColor((node as CaseFileNode).status) }}
            title={`${node.name}\n${node.path}`}
            onClick={() => handleCaseSelect(node as CaseFileNode)}
          >
            <span className="tree-view__arrow tree-view__arrow--spacer" aria-hidden="true" />
            <span className="tree-view__label">{node.name}</span>
            {(node as CaseFileNode).priority && (
              <span className="tree-view__priority-tag">{(node as CaseFileNode).priority}</span>
            )}
            <span className="tree-view__sr">{statusLabel((node as CaseFileNode).status)}</span>
          </button>
        )}
      </div>

      {isDirectory && isExpanded && directoryChildren.length > 0 && (
        <div className="tree-view__subtree">
          <ul className="tree-view__group" role="group">
            {directoryChildren.map((child, index) => (
              <CaseTreeNode
                key={child.id}
                node={child}
                level={level + 1}
                isLastChild={index === directoryChildren.length - 1}
                selectedCaseId={selectedCaseId}
                expandedDirectories={expandedDirectories}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
