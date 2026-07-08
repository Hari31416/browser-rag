import { createFileRoute } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

export const Route = createFileRoute('/search')({
  component: SearchComponent,
})

function SearchComponent() {
  return (
    <div className="space-y-6 flex flex-col flex-1 h-full animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Search & Chat</h2>
        <p className="text-muted-foreground text-sm">
          Query your local knowledge base using semantic and keyword search.
        </p>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-[400px]">
        {/* Chat History Placeholder */}
        <Card className="flex-1 bg-card/30 border-border/40 backdrop-blur-sm p-6 flex items-center justify-center text-muted-foreground text-sm">
          No active search query. Type a question below to retrieve document contexts and generate answers.
        </Card>

        {/* Input area */}
        <div className="flex gap-2">
          <Input placeholder="Ask a question about your documents..." className="flex-1" />
          <Button className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Query
          </Button>
        </div>
      </div>
    </div>
  )
}
