import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
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

export function initI18n() {
  i18n.use(initReactI18next).init({
    lng: loadLocale(),
    fallbackLng: defaultLocale,
    resources: {
      en: { translation: messages.en },
      'zh-CN': { translation: messages['zh-CN'] },
    },
    interpolation: {
      escapeValue: false,
    },
  })
}

export function setAppLocale(locale: AppLocale) {
  i18n.changeLanguage(locale)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(localeStorageKey, locale)
  }
}

export { i18n }
