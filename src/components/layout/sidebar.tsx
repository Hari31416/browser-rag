import { Link } from '@tanstack/react-router'
import { FileText, Settings, ChevronLeft, ChevronRight, History, Menu, Sun, Moon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/logo'
import { useTheme } from '@/components/theme-provider'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ isCollapsed, onToggle, isMobileOpen = false, onMobileClose }: SidebarProps) {
  const { theme, setTheme } = useTheme()
  const links = [
    { to: '/', label: 'Start Chat', icon: Plus },
    { to: '/history', label: 'History', icon: History },
    { to: '/documents', label: 'Documents', icon: FileText },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          "border-r border-border bg-sidebar flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-50 w-64 md:relative md:z-auto md:translate-x-0",
          isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-52"
        )}
      >
        <div
          className={cn(
            "h-16 border-b border-border flex items-center transition-all duration-300 ease-in-out px-4",
            isCollapsed ? "md:px-2 md:justify-center" : "md:px-5 md:justify-between md:gap-2",
            "justify-between"
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden shrink-0">
            <Logo size={26} className="text-primary" />
            {(!isCollapsed || isMobileOpen) && (
              <span className="font-heading text-lg font-semibold text-primary tracking-tight truncate">
                Browser RAG
              </span>
            )}
          </div>
          {isMobileOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileClose}
              className="h-8 w-8 rounded-md md:hidden text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className={cn("flex-1 py-5 space-y-0.5 transition-all duration-300", (isCollapsed && !isMobileOpen) ? "px-2" : "px-3")}>
          {links.map((link) => {
            const Icon = link.icon
            const showLabel = !isCollapsed || isMobileOpen
            if (link.to === '/') {
              return (
                <Link
                  key={link.to}
                  to="/"
                  search={{ clear: Date.now().toString() }}
                  title={(isCollapsed && !isMobileOpen) ? link.label : undefined}
                  activeProps={{
                    className: cn(
                      'text-primary font-medium',
                      showLabel && 'nav-ink-active bg-primary/6'
                    ),
                  }}
                  inactiveProps={{
                    className: 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  }}
                  className={cn(
                    "flex items-center rounded-md transition-all duration-200",
                    (isCollapsed && !isMobileOpen)
                      ? "justify-center h-10 w-10 mx-auto"
                      : "gap-3 px-3 py-2.5 text-sm"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {showLabel && <span className="truncate">{link.label}</span>}
                </Link>
              )
            }
            return (
              <Link
                key={link.to}
                to={link.to}
                title={(isCollapsed && !isMobileOpen) ? link.label : undefined}
                activeProps={{
                  className: cn(
                    'text-primary font-medium',
                    showLabel && 'nav-ink-active bg-primary/6'
                  ),
                }}
                inactiveProps={{
                  className: 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                }}
                className={cn(
                  "flex items-center rounded-md transition-all duration-200",
                  (isCollapsed && !isMobileOpen)
                    ? "justify-center h-10 w-10 mx-auto"
                    : "gap-3 px-3 py-2.5 text-sm"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {showLabel && <span className="truncate">{link.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div
          className={cn(
            "p-3 border-t border-border flex items-center transition-all duration-300 gap-2 shrink-0",
            (isCollapsed && !isMobileOpen) ? "flex-col justify-center" : "flex-row justify-between"
          )}
        >
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className='h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent'
          >
            {theme === 'dark' ? (
              <Sun className='h-4 w-4' />
            ) : (
              <Moon className='h-4 w-4' />
            )}
            <span className='sr-only'>Toggle theme</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent hidden md:flex"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>
    </>
  )
}
