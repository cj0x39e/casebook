import { useEffect, useState } from 'react'

const VERSION_FALLBACK = 'unknown'

async function readAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()

    return version || VERSION_FALLBACK
  } catch {
    return VERSION_FALLBACK
  }
}

export function useAppVersion() {
  const [appVersion, setAppVersion] = useState(VERSION_FALLBACK)

  useEffect(() => {
    let cancelled = false

    void readAppVersion().then((version) => {
      if (!cancelled) {
        setAppVersion(version)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return appVersion
}
