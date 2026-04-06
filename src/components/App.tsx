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
    parsedCases,
    visibleTreeChildren,
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

  const statusSummary = useMemo(() => {
    const counts = {
      todo: 0,
      blocked: 0,
      pass: 0,
    }

    for (const testCase of parsedCases) {
      if (testCase.status === 'todo') counts.todo += 1
      if (testCase.status === 'blocked') counts.blocked += 1
      if (testCase.status === 'pass') counts.pass += 1
    }

    const total = parsedCases.length
    const percent = (count: number) => (total ? Math.round((count / total) * 100) : 0)

    return {
      total,
      counts,
      percents: {
        todo: percent(counts.todo),
        blocked: percent(counts.blocked),
        pass: percent(counts.pass),
      },
    }
  }, [parsedCases])

  const filterLabel = activeTreeStatusFilter === 'all' ? 'ALL' : statusLabel(activeTreeStatusFilter)

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
            <main className="workspace workspace--dashboard">
             <div className="sidebar__top">
               <div className="sidebar__stats">
                 {(['pass', 'blocked', 'todo'] as const).map((status) => (
                   <button
                     key={status}
                     className="sidebar__stat"
                     type="button"
                     data-status={status}
                     data-active={activeTreeStatusFilter === status}
                     onClick={() => setActiveTreeStatusFilter(status)}
                   >
                     <span className="sidebar__stat-count">{statusSummary.counts[status]}</span>
                     <span className="sidebar__stat-meta">
                       <span className="sidebar__stat-swatch" />
                       <span className="sidebar__stat-percent">
                         {statusSummary.percents[status]}%
                       </span>
                     </span>
                   </button>
                 ))}

                 <button
                   className="sidebar__filter-button"
                   type="button"
                   data-active={activeTreeStatusFilter === 'all'}
                   onClick={() => setActiveTreeStatusFilter('all')}
                 >
                   ALL
                 </button>
               </div>
             </div>

             <div className="detail-header">
               {selectedCase && (
                 <>
                   <div className="detail-header__title-row">
                     <span className="detail-header__status" data-status={selectedCase.status} />
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
                   <div className="detail-header__meta-row">
                     <span className="detail-header__priority">
                       <span className="detail-header__priority-text">{selectedCase.priority ?? 'P0'}</span>
                       <span className="detail-header__priority-dots">
                         {Array.from({ length: Math.max(0, 3 - parseInt((selectedCase.priority ?? 'P0').replace(/\D/g, '') || '0', 10)) }, (_, i) => (
                           <span key={i} className="detail-header__priority-dot" />
                         ))}
                       </span>
                     </span>
                     <span className="detail-header__meta">
                       {t('detail.updated')}: {selectedCase.updatedAtLabel}
                     </span>
                     <span className="detail-header__meta">
                       {t('detail.created')}: {selectedCase.createdAtLabel}
                     </span>
                     <button
                       ref={summaryMoreTriggerRef}
                       className="detail-header__more"
                       type="button"
                       aria-label={t('detail.moreAriaLabel')}
                       aria-expanded={showSummaryMeta}
                       onClick={() => setShowSummaryMeta(!showSummaryMeta)}
                     >
                       <span />
                       <span />
                       <span />
                     </button>
                   </div>
                 </>
               )}
             </div>

             <aside className="sidebar__body">
               <div className="tree-panel tree-panel--card">
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
               </div>

               </aside>

               <section className="detail-panel detail-panel--dashboard">
                 {selectedCase ? (
                   <>
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
                   </>
                 ) : (
                   <div className="placeholder">
                     <p>{t('detail.selectCase')}</p>
                   </div>
                 )}
               </section>

               <div className="sidebar__footer">
                 <button
                   ref={settingsButtonRef}
                   className="sidebar__settings-button"
                   type="button"
                   aria-expanded={showSettingsPanel}
                   onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                 >
                   <span className="sidebar__settings-icon">⚙</span>
                 </button>
                 <span className="sidebar__version">
                   {t('brand.casebook')} {t('home.version')}
                 </span>
               </div>

               <div className="detail-panel__actions">
                 <div className="status-dots">
                   {(['todo', 'blocked', 'pass'] as const).map((workflowStatus) => (
                       <button
                         key={workflowStatus}
                         className="status-dot"
                         type="button"
                         data-status={workflowStatus}
                         data-active={selectedCase ? String(workflowStatus === selectedCase.status) : 'false'}
                         aria-label={statusLabel(workflowStatus)}
                         onClick={() => updateCaseStatus(workflowStatus)}
                       />
                     ))}
                 </div>
                 {statusUpdateError && <p className="inline-error">{statusUpdateError}</p>}
               </div>
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
              <label className="settings-panel__label" htmlFor="locale-select">
                {t('locale.label')}
              </label>
              <select
                id="locale-select"
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value as AppLocale)}
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
