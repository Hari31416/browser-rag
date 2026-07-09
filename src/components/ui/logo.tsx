import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
}

/** Browser RAG app mark */
export function Logo({ className, size = 24 }: LogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.png`}
      width={size}
      height={size}
      alt=''
      aria-hidden
      className={cn('shrink-0', className)}
    />
  )
}
