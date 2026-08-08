'use client'

import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState } from 'react'
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const { theme } = useAppStore()

  return (
    <div className={cn('prose-mimo', className)}>
      <ReactMarkdown
        components={{
          // Code blocks with syntax highlighting
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            // Get the raw text - handle both string and array children
            const rawChildren = Array.isArray(children) ? children.join('') : String(children)
            const codeStr = rawChildren.replace(/\n$/, '')

            // Detect block code: has language OR contains newlines OR is long
            const isBlock = match || codeStr.includes('\n') || codeStr.length > 80

            if (!isBlock) {
              // Inline code
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-[0.85em] border border-border"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            // Block code with syntax highlighting
            // Strip leading language identifier if LLM forgot triple backticks
            // e.g. "python\ndef foo():..." -> language="python", code="def foo():..."
            let language = match ? match[1] : 'text'
            let displayCode = codeStr

            // Detect "python" or "javascript" prefix when no language class
            if (!match) {
              const langMatch = codeStr.match(/^(python|javascript|js|typescript|ts|bash|sh|html|css|json|sql|yaml|xml)\s*\n([\s\S]*)/)
              if (langMatch) {
                language = langMatch[1] === 'js' ? 'javascript' : langMatch[1] === 'ts' ? 'typescript' : langMatch[1]
                displayCode = langMatch[2]
              }
            }

            return (
              <CodeBlock
                code={displayCode}
                language={language}
                theme={theme}
              />
            )
          },

          // Tables
          table({ children }: any) {
            return (
              <div className="my-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs border-collapse">
                  {children}
                </table>
              </div>
            )
          },
          thead({ children }: any) {
            return <thead className="bg-muted/50">{children}</thead>
          },
          th({ children }: any) {
            return <th className="px-3 py-2 text-right font-semibold border-b border-border">{children}</th>
          },
          td({ children }: any) {
            return <td className="px-3 py-2 border-b border-border/50">{children}</td>
          },

          // Links
          a({ href, children }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2"
              >
                {children}
              </a>
            )
          },

          // Blockquotes
          blockquote({ children }: any) {
            return (
              <blockquote className="my-2 pr-3 border-r-4 border-primary/50 bg-muted/30 py-1 rounded-l">
                {children}
              </blockquote>
            )
          },

          // Lists
          ul({ children }: any) {
            return <ul className="my-1.5 list-disc pr-5 space-y-0.5">{children}</ul>
          },
          ol({ children }: any) {
            return <ol className="my-1.5 list-decimal pr-5 space-y-0.5">{children}</ol>
          },
          li({ children }: any) {
            return <li className="text-sm">{children}</li>
          },

          // Headings
          h1({ children }: any) {
            return <h1 className="text-lg font-bold mt-3 mb-2 text-foreground">{children}</h1>
          },
          h2({ children }: any) {
            return <h2 className="text-base font-bold mt-3 mb-1.5 text-foreground">{children}</h2>
          },
          h3({ children }: any) {
            return <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h3>
          },
          h4({ children }: any) {
            return <h4 className="text-sm font-medium mt-2 mb-1 text-foreground">{children}</h4>
          },

          // Paragraphs
          p({ children }: any) {
            // Use div instead of p to avoid hydration errors with nested block elements
            return <div className="my-1.5 leading-relaxed">{children}</div>
          },

          // Horizontal rule
          hr() {
            return <hr className="my-3 border-border" />
          },

          // Strong / Em
          strong({ children }: any) {
            return <strong className="font-semibold text-foreground">{children}</strong>
          },
          em({ children }: any) {
            return <em className="italic">{children}</em>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

interface CodeBlockProps {
  code: string
  language: string
  theme: 'light' | 'dark'
}

function CodeBlock({ code, language, theme }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lineCount = code.split('\n').length
  const shouldCollapse = lineCount > 30

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border bg-muted/30" dir="ltr">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/70 border-b border-border">
        <div className="flex items-center gap-2">
          {shouldCollapse && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hover:bg-accent rounded p-0.5"
            >
              {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            {language}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {lineCount} سطر
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={handleCopy}
        >
          {copied ? (
            <><Check className="w-3 h-3 ml-1 text-emerald-500" /> تم</>
          ) : (
            <><Copy className="w-3 h-3 ml-1" /> نسخ</>
          )}
        </Button>
      </div>

      {/* Code */}
      {!collapsed && (
        <SyntaxHighlighter
          language={language}
          style={theme === 'dark' ? oneDark : oneLight}
          customStyle={{
            margin: 0,
            background: 'transparent',
            fontSize: '12px',
            padding: '12px',
            fontFamily: 'var(--font-geist-mono), monospace',
          }}
          wrapLongLines={true}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  )
}
