'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    // Load theme from localStorage on mount
    const saved = (typeof window !== 'undefined' && localStorage.getItem('mimo-theme')) as 'light' | 'dark' | null
    if (saved) {
      useAppStore.getState().setTheme(saved)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('mimo-theme', theme)
  }, [theme])

  return <>{children}</>
}
