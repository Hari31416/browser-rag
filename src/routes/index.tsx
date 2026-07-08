import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Search, Activity, Cpu } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: DashboardComponent,
})

function DashboardComponent() {
  const stats = [
    { title: 'Total Documents', value: '0', description: 'Files uploaded locally', icon: FileText },
    { title: 'Total Chunks', value: '0', description: 'Extracted text passages', icon: Cpu },
    { title: 'Embedding Model', value: 'None selected', description: 'Active embedding model', icon: Activity },
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Welcome to Browser RAG
        </h2>
        <p className="text-muted-foreground text-sm max-w-2xl">
          A fully client-side, local-first Retrieval-Augmented Generation application. All document processing, vector search, and LLM generation happen entirely within your browser. No data ever leaves your device.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="bg-card/50 border-border/50 backdrop-blur-sm relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-border group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon className="h-24 w-24 text-primary" />
              </div>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono tracking-tight">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/30 border-border/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Search & Ask Questions</CardTitle>
            <CardDescription>
              Query your indexed documents using natural language with local semantic search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/search">
              <Button className="w-full flex items-center gap-2">
                <Search className="h-4 w-4" />
                Go to Search
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-card/30 border-border/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Manage Documents</CardTitle>
            <CardDescription>
              Upload PDF, MD, TXT, JSON files to chunk and index into PGlite database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/documents">
              <Button variant="secondary" className="w-full flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Go to Documents
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
