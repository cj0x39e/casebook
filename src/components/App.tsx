import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { useApp } from '../contexts/AppContext'
import { CaseTreeNode } from './CaseTreeNode'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import type { AppLocale } from '../i18n'
import appIcon from '../../src-tauri/icons/128x128.png'
import goIcon from '../assets/go.svg'
import passWordmark from '../assets/PASS.svg'
import settingIcon from '../assets/setting.svg'
import { useAppVersion } from '../lib/appVersion'

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
})

export function App() {
  const { t } = useTranslation()
  const appVersion = useAppVersion()
  const {
    isHomeView,
    warningSummary,
    viewState,
    openProjectDirectory,
    scanError,
    parsedCases,
    visibleTreeChildren,
    activeTreeStatusFilters,
    activeTreePriorityFilter,
    toggleTreeStatusFilter,
    resetTreeStatusFilter,
    setActiveTreePriorityFilter,
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
    statusUpdateError,
    updateCaseStatus,
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
    statusConfig,
    priorityConfig,
    priorityLabel,
    priorityColor,
  } = useApp()

  const selectedCaseRenderedHtml = useMemo(() => {
    if (!selectedCase) return ''
    return DOMPurify.sanitize(markdownRenderer.render(selectedCase.renderBody))
  }, [selectedCase])

  const hasParseNotes = selectedCase && selectedCase.parseNotes.length > 0

  const statusSummary = useMemo(() => {
    // 动态构建 counts 和 percents 对象
    const counts: Record<string, number> = {}
    const percents: Record<string, number> = {}

    // 初始化所有状态为 0
    for (const config of statusConfig) {
      counts[config.id] = 0
    }

    // 统计
    for (const testCase of parsedCases) {
      if (counts[testCase.status] !== undefined) {
        counts[testCase.status] += 1
      }
    }

    const total = parsedCases.length
    const percent = (count: number) => (total ? Math.round((count / total) * 100) : 0)

    // 计算百分比
    for (const config of statusConfig) {
      percents[config.id] = percent(counts[config.id])
    }

    return {
      total,
      counts,
      percents,
    }
  }, [parsedCases, statusConfig])

  const prioritySummary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const config of priorityConfig) {
      counts[config.id] = 0
    }
    for (const testCase of parsedCases) {
      if (testCase.priority && counts[testCase.priority] !== undefined) {
        counts[testCase.priority] += 1
      }
    }
    return { counts }
  }, [parsedCases, priorityConfig])

  // 获取状态颜色
  const getStatusColor = (statusId: string): string | undefined => {
    return statusConfig.find(s => s.id === statusId)?.color
  }

  return (
    <div className="shell" data-screen={isHomeView ? 'home' : 'inner'}>
      <div className="titlebar-drag-region" data-tauri-drag-region />
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
              <p className="home-brand-version">{appVersion}</p>
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
                  {statusConfig.map((config) => (
                    <button
                      key={config.id}
                      className="sidebar__stat"
                      type="button"
                      data-status={config.id}
                      data-active={activeTreeStatusFilters.includes(config.id)}
                      onClick={() => toggleTreeStatusFilter(config.id)}
                    >
                      <span className="sidebar__stat-count">{statusSummary.counts[config.id] ?? 0}</span>
                      <span className="sidebar__stat-meta">
                        <span className="sidebar__stat-swatch" style={{ backgroundColor: config.color }} />
                        <span className="sidebar__stat-percent">
                          {statusSummary.percents[config.id] ?? 0}%
                        </span>
                      </span>
                    </button>
                  ))}

                  <button
                    className="sidebar__filter-button"
                    type="button"
                    data-active={activeTreeStatusFilters.length === 0}
                    onClick={() => resetTreeStatusFilter()}
                  >
                    ALL
                  </button>
                </div>
               <div className="sidebar__priorities">
                  {priorityConfig.map((config) => (
                    <button
                      key={config.id}
                      className="sidebar__priority-dot-filter"
                      type="button"
                      title={`${priorityLabel(config.id)} (${prioritySummary.counts[config.id] ?? 0})`}
                      data-active={activeTreePriorityFilter === config.id}
                      onClick={() => setActiveTreePriorityFilter(activeTreePriorityFilter === config.id ? 'all' : config.id)}
                      style={{ backgroundColor: activeTreePriorityFilter === config.id ? config.color : undefined, borderColor: config.color }}
                    />
                  ))}
                </div>
               </div>

               <div className="detail-header">
               {selectedCase && (
                 <>
                   <div className="detail-header__title-row">
                     <span
                       className="detail-header__status"
                       style={{ backgroundColor: getStatusColor(selectedCase.status) }}
                     />
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
                       <span className="detail-header__priority-text">{selectedCase.priority ? priorityLabel(selectedCase.priority) : priorityConfig[0]?.id ?? 'P0'}</span>
                       <span className="detail-header__priority-dots">
                         {(() => {
                           const total = priorityConfig.length
                           const currentIndex = priorityConfig.findIndex(p => p.id === selectedCase.priority)
                           const litCount = currentIndex >= 0 ? total - currentIndex : 0
                           const color = selectedCase.priority ? priorityColor(selectedCase.priority) : undefined
                           return Array.from({ length: total }, (_, i) => (
                             <span
                               key={i}
                               className={`detail-header__priority-dot${i < litCount ? ' detail-header__priority-dot--lit' : ''}`}
                               style={i < litCount ? { background: color } : undefined}
                             />
                           ))
                         })()}
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
                         {activeTreeStatusFilters.length === 0 && activeTreePriorityFilter === 'all'
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
                   <img src={settingIcon} alt="" className="sidebar__settings-icon" />
                 </button>
                 <span className="sidebar__version">
                   {t('brand.casebook')} {appVersion}
                 </span>
               </div>

               <div className="detail-panel__actions">
                 <div className="status-dots">
                   {statusConfig.map((config) => (
                       <button
                         key={config.id}
                         className="status-dot"
                         type="button"
                         data-status={config.id}
                         style={{ backgroundColor: config.color }}
                         data-active={selectedCase ? String(config.id === selectedCase.status) : 'false'}
                         aria-label={config.label[selectedLocale] || config.label['en'] || config.id}
                         onClick={() => updateCaseStatus(config.id)}
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

            </section>
          </div>,
          document.body
        )}
    </div>
  )
}
