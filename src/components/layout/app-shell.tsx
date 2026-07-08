import { useLocation } from '@tanstack/react-router'
import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/top-bar'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/':
        return 'Dashboard'
      case '/search':
        return 'Search & Chat'
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <TopBar title={getPageTitle(location.pathname)} />
        <main className="flex-1 overflow-y-auto bg-background/50 p-6">
          <div className="mx-auto max-w-7xl h-full flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
