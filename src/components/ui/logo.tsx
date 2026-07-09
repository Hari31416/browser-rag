import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
}

/** Open folio / ink-blot mark for Browser RAG */
export function Logo({ className, size = 24 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      className={cn('shrink-0', className)}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden
    >
      {/* Open folio spreads */}
      <path
        d='M4.5 5.5c2.2-1.2 4.3-.4 5.5.6v12.2c-1.4-1.1-3.5-1.8-5.5-.8V5.5Z'
        fill='currentColor'
        fillOpacity='0.18'
        stroke='currentColor'
        strokeWidth='1.4'
        strokeLinejoin='round'
      />
      <path
        d='M19.5 5.5c-2.2-1.2-4.3-.4-5.5.6v12.2c1.4-1.1 3.5-1.8 5.5-.8V5.5Z'
        fill='currentColor'
        fillOpacity='0.1'
        stroke='currentColor'
        strokeWidth='1.4'
        strokeLinejoin='round'
      />
      {/* Spine */}
      <path
        d='M12 6.2v11.6'
        stroke='currentColor'
        strokeWidth='1.4'
        strokeLinecap='round'
      />
      {/* Ink blot accent */}
      <circle cx='16.2' cy='10.2' r='1.35' fill='currentColor' fillOpacity='0.55' />
      <circle cx='17.4' cy='11.5' r='0.55' fill='currentColor' fillOpacity='0.35' />
    </svg>
  )
}
