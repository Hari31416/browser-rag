import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from '@/components/layout/project-switcher'

interface TopBarProps {
  title: string
  onMenuToggle?: () => void
}

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  return (
    <header className='relative z-40 h-16 border-b border-border/70 bg-card/50 px-4 sm:px-6 flex items-center justify-between shrink-0'>
      <div className='flex items-center gap-3 min-w-0'>
        {onMenuToggle && (
          <Button
            variant='ghost'
            size='icon'
            onClick={onMenuToggle}
            className='md:hidden rounded-md transition-transform hover:scale-105 h-9 w-9 text-muted-foreground'
          >
            <Menu className='h-5 w-5' />
            <span className='sr-only'>Open menu</span>
          </Button>
        )}
        <h1 className='font-heading font-semibold text-base sm:text-xl text-foreground tracking-tight truncate max-w-[120px] sm:max-w-none'>
          {title}
        </h1>
        <span className='hidden sm:block h-4 w-px bg-border/80' aria-hidden />
        <ProjectSwitcher />
      </div>
    </header>
  )
}
