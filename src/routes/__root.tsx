import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
