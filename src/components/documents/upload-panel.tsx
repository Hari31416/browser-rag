import { useState, useRef } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { UploadCloud, AlertCircle } from 'lucide-react'

interface UploadPanelProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export function UploadPanel({ onFilesSelected, disabled = false }: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (disabled) return
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  const triggerFileInput = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={triggerFileInput}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 relative ${
        isDragging
          ? 'border-primary bg-primary/10 scale-[0.99] shadow-inner shadow-primary/5'
          : 'border-border/60 hover:border-primary/50 hover:bg-accent/5'
      } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        onClick={(e) => e.stopPropagation()}
        multiple
        accept=".txt,.md,.json,.csv,.html,.pdf"
        className="hidden"
      />

      <div className={`p-4 rounded-full bg-accent/50 ${isDragging ? 'bg-primary/20 scale-110' : ''} transition-all duration-300`}>
        <UploadCloud className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold text-sm">
          {isDragging ? 'Drop your files here' : 'Upload your documents'}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          Drag and drop files, or click to browse. Supports PDF, Markdown, Text, HTML, CSV, and JSON.
        </p>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2 border border-border/40 px-2 py-0.5 rounded bg-muted/40">
        <AlertCircle className="h-3 w-3 text-muted-foreground" />
        <span>Processing runs locally inside your browser</span>
      </div>
    </div>
  )
}
export default UploadPanel
