import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type AppLocale = 'en' | 'zh-CN'

export const localeStorageKey = 'casebook.locale'
export const defaultLocale: AppLocale = 'en'
export const supportedLocales: AppLocale[] = ['en', 'zh-CN']

function isSupportedLocale(value: unknown): value is AppLocale {
  return value === 'en' || value === 'zh-CN'
}

export function loadLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return defaultLocale
  }

  const storedLocale = window.localStorage.getItem(localeStorageKey)
  if (isSupportedLocale(storedLocale)) {
    return storedLocale
  }

  return defaultLocale
}

export const i18n = createI18n({
  legacy: false,
  locale: loadLocale(),
  fallbackLocale: defaultLocale,
  messages,
})

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(localeStorageKey, locale)
  }
}
