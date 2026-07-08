import { Link } from '@tanstack/react-router'
import { LayoutDashboard, FileText, Search, Settings, Activity, Brain, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/search', label: 'Search & Chat', icon: Search },
    { to: '/documents', label: 'Documents', icon: FileText },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/diagnostics', label: 'Diagnostics', icon: Activity },
  ]

  return (
    <aside
      className={cn(
        "border-r border-border bg-card/60 backdrop-blur-md flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div
        className={cn(
          "h-16 border-b border-border flex items-center transition-all duration-300 ease-in-out",
          isCollapsed ? "px-2 justify-center" : "px-6 justify-between gap-2"
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden shrink-0">
          <Brain className="h-6 w-6 text-primary animate-pulse shrink-0" />
          {!isCollapsed && (
            <span className="font-semibold text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent truncate">
              Browser RAG
            </span>
          )}
        </div>
      </div>

      <nav className={cn("flex-1 py-6 space-y-1 transition-all duration-300", isCollapsed ? "px-2" : "px-4")}>
        {links.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.to}
              to={link.to}
              title={isCollapsed ? link.label : undefined}
              activeProps={{
                className: 'bg-primary/10 text-primary font-medium',
              }}
              inactiveProps={{
                className: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              }}
              className={cn(
                "flex items-center rounded-lg transition-all duration-200",
                isCollapsed
                  ? "justify-center h-10 w-10 mx-auto"
                  : "gap-3 px-3 py-2 text-sm"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{link.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div
        className={cn(
          "p-4 border-t border-border flex items-center transition-all duration-300",
          isCollapsed ? "justify-center" : "justify-end"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}
