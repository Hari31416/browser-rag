import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,
})

function SettingsComponent() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure model parameters, embedding providers, and local LLM preferences.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Embedding Settings</CardTitle>
            <CardDescription>Select embedding model and manage indexing preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Embedding model selection controls will be implemented in Phase 5.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>LLM Settings</CardTitle>
            <CardDescription>Select local LLM and manage generation preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              LLM engine and adapter settings will be implemented in Phase 8.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
