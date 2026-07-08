import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from '@/components/layout/project-switcher'

interface TopBarProps {
  title: string
  onMenuToggle?: () => void
}

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  return (
    <header className='relative z-40 h-16 border-b border-border bg-card/40 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0'>
      <div className='flex items-center gap-3'>
        {onMenuToggle && (
          <Button
            variant='ghost'
            size='icon'
            onClick={onMenuToggle}
            className='md:hidden rounded-lg transition-transform hover:scale-105 h-9 w-9 text-muted-foreground'
          >
            <Menu className='h-5 w-5' />
            <span className='sr-only'>Open menu</span>
          </Button>
        )}
        <h1 className='font-semibold text-sm sm:text-lg text-foreground capitalize truncate max-w-[120px] sm:max-w-none'>{title}</h1>
        <ProjectSwitcher />
      </div>
    </header>
  )
}
