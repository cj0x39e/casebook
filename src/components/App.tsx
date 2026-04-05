import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { useApp } from '../contexts/AppContext'
import { CaseTreeNode } from './CaseTreeNode'
import { caseWorkflowStatuses } from '../lib/casebook'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import type { AppLocale } from '../i18n'
import appIcon from '../../src-tauri/icons/128x128.png'
import goIcon from '../assets/go.svg'
import passWordmark from '../assets/PASS.svg'

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
})

export function App() {
  const { t } = useTranslation()
  const {
    isHomeView,
    warningSummary,
    viewState,
    openProjectDirectory,
    scanError,
    testsAlias,
    visibleTreeChildren,
    treeFilterLabel,
    showTreeFilterPanel,
    setShowTreeFilterPanel,
    treeFilterButtonRef,
    treeFilterPanelRef,
    activeTreeStatusFilter,
    setActiveTreeStatusFilter,
    selectedCaseId,
    expandedDirectories,
    toggleDirectory,
    selectCase,
    settingsButtonRef,
    setShowSettingsPanel,
    showSettingsPanel,
    selectedCase,
    detailContentView,
    setDetailContentView,
    statusUpdatePending,
    statusUpdateError,
    updateCaseStatus,
    statusLabel,
    summaryMoreTriggerRef,
    showSummaryMeta,
    setShowSummaryMeta,
    parseNotesTriggerRef,
    showParseNotes,
    setShowParseNotes,
    selectedProject,
    scanProject,
    selectedLocale,
    setSelectedLocale,
    localeOptions,
    sourceLabel,
    translateParseNote,
    parseNotesTooltipStyle,
    settingsPanelStyle,
    summaryMorePopoverStyle,
    parseNotesTooltipRef,
    settingsPanelRef,
    summaryMorePopoverRef,
  } = useApp()

  const selectedCaseRenderedHtml = useMemo(() => {
    if (!selectedCase) return ''
    return DOMPurify.sanitize(markdownRenderer.render(selectedCase.renderBody))
  }, [selectedCase])

  const hasParseNotes = selectedCase && selectedCase.parseNotes.length > 0

  return (
    <div className="shell" data-screen={isHomeView ? 'home' : 'inner'}>
      {isHomeView ? (
        <main className="home">
          <p className="home__greeting">{t('home.greeting')}</p>

          <section className="home-card" aria-label={t('brand.casebook')}>
            <header className="home-card__launch">
              <button className="home-launch-button" type="button" onClick={openProjectDirectory}>
                <span>{t('home.openProjectDirectory')}</span>
                <span className="home-launch-button__icon" aria-hidden="true">
                  <img src={goIcon} alt="" />
                </span>
              </button>
            </header>

            <div className="home-card__hero" aria-hidden="true">
              <img className="home-card__script" src={passWordmark} alt="" />
            </div>

            <footer className="home-card__footer">
              <img className="home-brand-mark" src={appIcon} alt="" aria-hidden="true" />
              <p className="home-brand-name">{t('brand.casebook')}</p>
              <p className="home-brand-version">{t('home.version')}</p>
            </footer>
          </section>

          {scanError && <p className="home__error">{scanError}</p>}
        </main>
      ) : (
        <>
          {warningSummary && <p className="inline-banner">{warningSummary}</p>}

          {viewState === 'ready' ? (
            <main className="workspace">
              <aside className="tree-panel">
                <div className="tree-panel__header">
                  <div className="tree-panel__header-main">
                    <p className="panel__label">{t('tree.library')}</p>
                    <h2>{testsAlias}</h2>
                  </div>
                  <div className="tree-filter">
                    <button
                      ref={treeFilterButtonRef}
                      className="tree-filter__button"
                      type="button"
                      aria-expanded={showTreeFilterPanel}
                      onClick={() => setShowTreeFilterPanel(!showTreeFilterPanel)}
                    >
                      {treeFilterLabel}
                    </button>

                    {showTreeFilterPanel && (
                      <div ref={treeFilterPanelRef} className="tree-filter__panel">
                        <button
                          className="tree-filter__option"
                          type="button"
                          data-active={activeTreeStatusFilter === 'all'}
                          onClick={() => setActiveTreeStatusFilter('all')}
                        >
                          {t('tree.all')}
                        </button>
                        {caseWorkflowStatuses.map((workflowStatus) => (
                          <button
                            key={workflowStatus}
                            className="tree-filter__option"
                            type="button"
                            data-active={activeTreeStatusFilter === workflowStatus}
                            onClick={() => setActiveTreeStatusFilter(workflowStatus)}
                          >
                            {statusLabel(workflowStatus)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="tree-panel__body">
                  {visibleTreeChildren.length > 0 ? (
                    <ul className="case-tree" role="tree">
                      {visibleTreeChildren.map((node, index) => (
                        <CaseTreeNode
                          key={node.id}
                          node={node}
                          level={0}
                          isLastChild={index === visibleTreeChildren.length - 1}
                          selectedCaseId={selectedCaseId}
                          expandedDirectories={expandedDirectories}
                          onToggle={toggleDirectory}
                          onSelect={selectCase}
                        />
                      ))}
                    </ul>
                  ) : (
                    <div className="placeholder">
                      <p>
                        {activeTreeStatusFilter === 'all'
                          ? t('tree.noCases')
                          : t('tree.noCasesForFilter')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="tree-panel__footer">
                  <button
                    ref={settingsButtonRef}
                    className="tree-panel__settings-button"
                    type="button"
                    aria-expanded={showSettingsPanel}
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                  >
                    <span className="tree-panel__settings-icon">⌘</span>
                    <span>{t('tree.settings')}</span>
                  </button>
                </div>
              </aside>

              <section className="detail-panel">
                {selectedCase ? (
                  <>
                    <div className="case-summary">
                      <div className="case-summary__header">
                        <div className="case-summary__headline">
                          <h2>{selectedCase.title}</h2>
                          {hasParseNotes && (
                            <button
                              ref={parseNotesTriggerRef}
                              className="parse-notes-trigger"
                              type="button"
                              aria-expanded={showParseNotes}
                              onClick={() => setShowParseNotes(!showParseNotes)}
                            >
                              <span className="parse-notes-trigger__icon">!</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="case-summary__meta">
                        <div className="summary-primary">
                          <span className="summary-token">
                            <span className="summary-token__label">{t('detail.platform')}</span>
                            <span className="summary-token__value">{selectedCase.platform}</span>
                          </span>
                          <span className="summary-token">
                            <span className="summary-token__label">{t('detail.priority')}</span>
                            <span className="summary-token__value">
                              {selectedCase.priority ?? t('detail.none')}
                            </span>
                          </span>

                          <div className="summary-more">
                            <button
                              ref={summaryMoreTriggerRef}
                              className="summary-more__trigger"
                              type="button"
                              aria-label={t('detail.moreAriaLabel')}
                              aria-expanded={showSummaryMeta}
                              onClick={() => setShowSummaryMeta(!showSummaryMeta)}
                            >
                              {t('detail.more')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="detail-view-switch">
                      <button
                        className="detail-view-switch__button"
                        type="button"
                        data-active={detailContentView === 'rendered'}
                        onClick={() => setDetailContentView('rendered')}
                      >
                        {t('detail.renderedView')}
                      </button>
                      <button
                        className="detail-view-switch__button"
                        type="button"
                        data-active={detailContentView === 'raw'}
                        onClick={() => setDetailContentView('raw')}
                      >
                        {t('detail.rawView')}
                      </button>
                    </div>

                    <section className="detail-document">
                      {detailContentView === 'rendered' ? (
                        <div
                          className="markdown-content"
                          dangerouslySetInnerHTML={{ __html: selectedCaseRenderedHtml }}
                        />
                      ) : (
                        <pre className="raw-markdown__content raw-markdown__content--panel">
                          {selectedCase.content}
                        </pre>
                      )}
                    </section>

                    <div className="detail-panel__actions">
                      <div className="status-switch">
                        {caseWorkflowStatuses.map((workflowStatus) => (
                          <button
                            key={workflowStatus}
                            className="status-switch__button"
                            type="button"
                            data-active={workflowStatus === selectedCase.status}
                            disabled={statusUpdatePending !== null}
                            onClick={() => updateCaseStatus(workflowStatus)}
                          >
                            {statusUpdatePending === workflowStatus
                              ? t('detail.saving')
                              : statusLabel(workflowStatus)}
                          </button>
                        ))}
                      </div>

                      {statusUpdateError && <p className="inline-error">{statusUpdateError}</p>}
                    </div>
                  </>
                ) : (
                  <div className="placeholder">
                    <p>{t('detail.selectCase')}</p>
                  </div>
                )}
              </section>
            </main>
          ) : (
            <main className="inner-state">
              <div className="inner-state__body">
                <p className="panel__label">
                  {viewState === 'loading'
                    ? t('state.scanning')
                    : viewState === 'invalid-project'
                      ? t('state.unavailable')
                      : t('state.error')}
                </p>
                <h2>
                  {viewState === 'loading'
                    ? t('state.readingSelectedProject')
                    : viewState === 'invalid-project'
                      ? t('state.notCasebookProject')
                      : t('state.cannotReadProject')}
                </h2>
                <p>
                  {viewState === 'loading'
                    ? t('state.scanningDescription')
                    : scanError || t('state.cannotPrepareProject')}
                </p>
              </div>
            </main>
          )}
        </>
      )}

      {/* Portals */}
      {hasParseNotes &&
        showParseNotes &&
        createPortal(
          <div
            ref={parseNotesTooltipRef}
            className="parse-notes-tooltip"
            style={parseNotesTooltipStyle}
            role="tooltip"
          >
            <p className="parse-notes-tooltip__title">{t('detail.parseNotes')}</p>
            <ul className="parse-notes-tooltip__list">
              {selectedCase.parseNotes.map((note, idx) => (
                <li key={`${note.key}:${idx}`}>{translateParseNote(note)}</li>
              ))}
            </ul>
          </div>,
          document.body
        )}

      {showSummaryMeta &&
        selectedCase &&
        createPortal(
          <div
            ref={summaryMorePopoverRef}
            className="summary-more__popover"
            style={summaryMorePopoverStyle}
            role="dialog"
          >
            <div className="summary-more__grid">
              <div className="summary-more__item">
                <span className="summary-more__label">{t('detail.id')}</span>
                <span className="summary-more__value summary-more__value--mono">{selectedCase.id}</span>
              </div>
              <div className="summary-more__item">
                <span className="summary-more__label">{t('detail.created')}</span>
                <span className="summary-more__value">{selectedCase.createdAtLabel}</span>
              </div>
              <div className="summary-more__item">
                <span className="summary-more__label">{t('detail.updated')}</span>
                <span className="summary-more__value">{selectedCase.updatedAtLabel}</span>
              </div>
              <div className="summary-more__item">
                <span className="summary-more__label">{t('detail.source')}</span>
                <span className="summary-more__value">{sourceLabel(selectedCase.summary.source)}</span>
              </div>
            </div>

            <div className="summary-more__path">
              <span className="summary-more__label">{t('detail.path')}</span>
              <span className="summary-more__value">{selectedCase.summary.pathLabel}</span>
            </div>
          </div>,
          document.body
        )}

      {showSettingsPanel &&
        createPortal(
          <div ref={settingsPanelRef} className="settings-panel" style={settingsPanelStyle}>
            <section className="settings-panel__section">
              <p className="panel__label">{t('settings.project')}</p>
              <p className="settings-panel__path">{selectedProject}</p>
              <div className="settings-panel__actions">
                <button className="secondary-button" type="button" onClick={openProjectDirectory}>
                  {t('settings.changeDirectory')}
                </button>
                {selectedProject && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => scanProject(selectedProject)}
                  >
                    {t('settings.rescan')}
                  </button>
                )}
              </div>
            </section>

            <section className="settings-panel__section">
              <p className="panel__label">{t('settings.casebook')}</p>
              <label className="summary-more__label" htmlFor="locale-select">
                {t('locale.label')}
              </label>
              <select
                id="locale-select"
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value as AppLocale)}
                className="tree-filter__button"
              >
                {localeOptions.map((localeOption) => (
                  <option key={localeOption.value} value={localeOption.value}>
                    {t(localeOption.labelKey)}
                  </option>
                ))}
              </select>
              <p className="settings-panel__placeholder">{t('settings.placeholder')}</p>
            </section>
          </div>,
          document.body
        )}
    </div>
  )
}
