import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from '@/components/layout/project-switcher'

interface TopBarProps {
  title: string
}

export function TopBar({ title }: TopBarProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header className='relative z-40 h-16 border-b border-border bg-card/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0'>
      <div className='flex items-center gap-4'>
        <h1 className='font-semibold text-lg text-foreground capitalize'>{title}</h1>
        <ProjectSwitcher />
      </div>

      <div className='flex items-center gap-4'>
        {/* Theme Toggle Button */}
        <Button
          variant='ghost'
          size='icon'
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className='rounded-lg transition-transform hover:scale-105'
        >
          {theme === 'dark' ? (
            <Sun className='h-[1.2rem] w-[1.2rem] transition-all' />
          ) : (
            <Moon className='h-[1.2rem] w-[1.2rem] transition-all' />
          )}
          <span className='sr-only'>Toggle theme</span>
        </Button>
      </div>
    </header>
  )
}
