import { Link } from '@tanstack/react-router'
import { LayoutDashboard, FileText, Search, Settings, Activity, Brain } from 'lucide-react'

export function Sidebar() {
  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/search', label: 'Search & Chat', icon: Search },
    { to: '/documents', label: 'Documents', icon: FileText },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/diagnostics', label: 'Diagnostics', icon: Activity },
  ]

  return (
    <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col h-screen shrink-0">
      <div className="h-16 px-6 border-b border-border flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary animate-pulse" />
        <span className="font-semibold text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          Browser RAG
        </span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {links.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.to}
              to={link.to}
              activeProps={{
                className: 'bg-primary/10 text-primary font-medium',
              }}
              inactiveProps={{
                className: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200"
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-border bg-accent/20">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Local Engine</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-500">
            Online
          </span>
        </div>
      </div>
    </aside>
  )
}
