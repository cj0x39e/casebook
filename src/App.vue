<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ParsedCase, RawScanResult } from './lib/casebook'
import { parseCase } from './lib/casebook'

type ViewState = 'idle' | 'loading' | 'ready' | 'invalid-project' | 'error'

const selectedProject = ref<string | null>(null)
const scanResult = ref<RawScanResult | null>(null)
const scanError = ref<string | null>(null)
const viewState = ref<ViewState>('idle')

const parsedCases = computed<ParsedCase[]>(() => {
  if (!scanResult.value) {
    return []
  }

  return scanResult.value.cases.map(parseCase)
})

const caseStats = computed(() => {
  return parsedCases.value.reduce(
    (stats, testCase) => {
      stats.total += 1
      stats[testCase.parseStatus] += 1
      return stats
    },
    { total: 0, valid: 0, partial: 0, invalid: 0 },
  )
})

async function openProjectDirectory() {
  scanError.value = null

  try {
    const projectPath = await invoke<string | null>('select_project_directory')
    if (!projectPath) {
      return
    }

    selectedProject.value = projectPath
    await scanProject(projectPath)
  } catch (error) {
    viewState.value = 'error'
    scanError.value =
      error instanceof Error ? error.message : 'Unable to choose a project directory'
  }
}

async function scanProject(projectPath: string) {
  viewState.value = 'loading'
  scanError.value = null

  try {
    const result = await invoke<RawScanResult>('scan_casebook', { projectRoot: projectPath })
    scanResult.value = result
    viewState.value = result.testsRoot ? 'ready' : 'invalid-project'
  } catch (error) {
    scanResult.value = null
    viewState.value = 'error'
    scanError.value =
      error instanceof Error ? error.message : 'Unable to scan the selected project'
  }
}
</script>

<template>
  <div class="shell">
    <header class="hero">
      <div class="hero__copy">
        <p class="eyebrow">Markdown-native QA workspace</p>
        <h1>Casebook</h1>
        <p class="hero__summary">
          Open any project, detect its <code>casebook/tests</code> folder, and inspect every test
          case as a Git-aware asset.
        </p>
      </div>

      <div class="hero__actions">
        <button class="primary-button" type="button" @click="openProjectDirectory">
          Open Project Directory
        </button>
        <p class="helper-text">
          Supports nested <code>api/</code>, <code>web/</code>, and <code>app/</code> test suites.
        </p>
      </div>
    </header>

    <main class="workspace">
      <section class="panel panel--status">
        <div>
          <p class="panel__label">Current Project</p>
          <p class="panel__value">{{ selectedProject ?? 'No project selected yet' }}</p>
        </div>

        <div class="status-cluster">
          <span class="status-pill" :data-state="viewState">
            {{
              viewState === 'idle'
                ? 'Waiting'
                : viewState === 'loading'
                  ? 'Scanning'
                  : viewState === 'ready'
                    ? 'Loaded'
                    : viewState === 'invalid-project'
                      ? 'Missing casebook/tests'
                      : 'Error'
            }}
          </span>
          <button
            v-if="selectedProject"
            class="secondary-button"
            type="button"
            @click="scanProject(selectedProject)"
          >
            Rescan
          </button>
        </div>
      </section>

      <section v-if="viewState === 'idle'" class="panel empty-state">
        <p class="empty-state__eyebrow">Start here</p>
        <h2>Select a repository or app workspace</h2>
        <p>
          Casebook looks for <code>casebook/tests</code>. The directory itself stays with the
          project, so test cases can be reviewed and versioned like code.
        </p>
      </section>

      <section v-else-if="viewState === 'loading'" class="panel empty-state">
        <p class="empty-state__eyebrow">Scanning</p>
        <h2>Reading case files and Git timestamps</h2>
        <p>Loading Markdown files under <code>casebook/tests</code> and resolving update times.</p>
      </section>

      <section v-else-if="viewState === 'invalid-project'" class="panel empty-state">
        <p class="empty-state__eyebrow">Not initialized</p>
        <h2>This directory is not a Casebook project yet</h2>
        <p>
          Expected to find <code>casebook/tests</code> under the selected directory. The MVP stays
          read-only and does not create the structure automatically.
        </p>
      </section>

      <section v-else-if="viewState === 'error'" class="panel empty-state empty-state--error">
        <p class="empty-state__eyebrow">Scan failed</p>
        <h2>Casebook could not read this project</h2>
        <p>{{ scanError }}</p>
      </section>

      <template v-else>
        <section class="stats-grid">
          <article class="panel stat-card">
            <p class="panel__label">Total Cases</p>
            <p class="stat-card__value">{{ caseStats.total }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Valid</p>
            <p class="stat-card__value">{{ caseStats.valid }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Partial</p>
            <p class="stat-card__value">{{ caseStats.partial }}</p>
          </article>
          <article class="panel stat-card">
            <p class="panel__label">Invalid</p>
            <p class="stat-card__value">{{ caseStats.invalid }}</p>
          </article>
        </section>

        <section v-if="scanResult?.errors.length" class="panel warnings">
          <div class="warnings__header">
            <p class="panel__label">Scan Warnings</p>
            <span>{{ scanResult.errors.length }}</span>
          </div>
          <ul class="warnings__list">
            <li v-for="warning in scanResult.errors" :key="`${warning.path}:${warning.message}`">
              <strong>{{ warning.path }}</strong>
              <span>{{ warning.message }}</span>
            </li>
          </ul>
        </section>

        <section class="panel cases-panel">
          <div class="cases-panel__header">
            <div>
              <p class="panel__label">Test Cases</p>
              <h2>{{ parsedCases.length }} Markdown files under casebook/tests</h2>
            </div>
          </div>

          <div v-if="parsedCases.length" class="case-list">
            <article
              v-for="testCase in parsedCases"
              :key="testCase.caseId"
              class="case-card"
              :data-status="testCase.parseStatus"
            >
              <div class="case-card__header">
                <div>
                  <p class="case-card__title">{{ testCase.title }}</p>
                  <p class="case-card__path">{{ testCase.relativePath }}</p>
                </div>
                <span class="parse-pill" :data-status="testCase.parseStatus">
                  {{ testCase.parseStatus }}
                </span>
              </div>

              <div class="case-card__meta">
                <span>{{ testCase.platform }}</span>
                <span>{{ testCase.priority ?? 'No priority' }}</span>
                <span>{{ testCase.updatedAtLabel }}</span>
                <span v-if="testCase.updatedAtSource === 'filesystem'">File timestamp fallback</span>
                <span v-else>Git timestamp</span>
              </div>

              <ul v-if="testCase.parseNotes.length" class="case-card__notes">
                <li v-for="note in testCase.parseNotes" :key="note">{{ note }}</li>
              </ul>
            </article>
          </div>

          <div v-else class="empty-table">
            <p>No Markdown cases were found under <code>casebook/tests</code>.</p>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
