import { useState, useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/':
        return 'Dashboard'
      case '/search':
        return 'Search & Chat'
      case '/history':
        return 'History'
      case '/projects':
        return 'Projects'
      case '/documents':
        return 'Document Management'
      case '/settings':
        return 'Settings'
      case '/diagnostics':
        return 'System Diagnostics'
      default:
        return 'Local RAG'
    }
  }

  useEffect(() => {
    document.title = `${getPageTitle(location.pathname)} | Browser RAG`
  }, [location.pathname])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar isCollapsed={isCollapsed} onToggle={toggleSidebar} />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <TopBar title={getPageTitle(location.pathname)} />
        <main className={cn(
          'flex-1 min-h-0 bg-background/50',
          location.pathname === '/search'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto p-6'
        )}>
          {location.pathname === '/search' ? (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              {children}
            </div>
          ) : (
            <div className="mx-auto max-w-7xl h-full flex flex-col">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
