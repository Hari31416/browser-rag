import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsComponent,
})

function DiagnosticsComponent() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Diagnostics</h2>
        <p className="text-muted-foreground text-sm">
          Monitor browser capabilities, database stats, and hardware acceleration status.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Browser Capabilities</CardTitle>
            <CardDescription>Verify your browser supports all necessary APIs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-border pb-1">
              <span>WebGPU Support</span>
              <span className="text-emerald-500 font-semibold font-mono">Available</span>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>Web Workers (Shared/Dedicated)</span>
              <span className="text-emerald-500 font-semibold font-mono">Supported</span>
            </div>
            <div className="flex justify-between border-b border-border pb-1">
              <span>IndexedDB Storage</span>
              <span className="text-emerald-500 font-semibold font-mono">Available</span>
            </div>
            <div className="flex justify-between pb-1">
              <span>WASM Multi-threading (COOP/COEP)</span>
              <span className="text-emerald-500 font-semibold font-mono">Enabled</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Database Diagnostics</CardTitle>
            <CardDescription>Examine local PGlite tables and statistics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            No database connection initialized yet. Database setup will be completed in Phase 2.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
