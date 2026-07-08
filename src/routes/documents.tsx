import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/documents')({
  component: DocumentsComponent,
})

function DocumentsComponent() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Document Management</h2>
        <p className="text-muted-foreground text-sm">
          Upload and index documents into your local PGlite vector database.
        </p>
      </div>

      <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>File Upload</CardTitle>
          <CardDescription>Drag and drop files here to extract and index them.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer bg-accent/5">
            <span className="text-muted-foreground text-sm">Upload components will be loaded in Phase 3.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
