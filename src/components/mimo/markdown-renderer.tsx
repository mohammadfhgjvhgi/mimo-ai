'use client'

import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState } from 'react'
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { Artifact } from '@/components/mimo/artifact'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Preprocess content to fix common LLM markdown issues:
 * 1. Normalize excessive backticks (4+ → 3)
 * 2. Fix ```langCODE → ```lang\nCODE (when language identifier is followed by code on same line)
 * 3. Fix ```CODE → ```\nCODE (when no language but code on same line)
 * 4. Convert inline code with language prefix to code blocks
 * 5. Convert long inline code to code blocks
 */
function preprocessMarkdown(content: string): string {
  if (!content) return ''

  let result = content

  // Pattern -1: Normalize excessive backticks (4+ backticks become 3)
  result = result.replace(/`{4,}/g, '```')

  // Pattern 0: Fix ```langCODE → ```lang\nCODE
  // Only when language is followed by code (not newline)
  const knownLangsForP0 = ['python', 'javascript', 'typescript', 'bash', 'html', 'css', 'json', 'sql', 'yaml', 'xml', 'java', 'cpp', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'scala']
  const langPlusCodePattern = new RegExp('```(' + knownLangsForP0.join('|') + ')([a-zA-Z_#<!/(][^\\n\\s]*)', 'g')
  result = result.replace(langPlusCodePattern, (match, lang: string, codeStart: string) => {
    return '```' + lang + '\n' + codeStart
  })

  // Pattern 0c: Fix ```CODE → ```\nCODE (no language, code on same line)
  // Only match opening fences (non-whitespace follows), not closing fences
  const knownLangsList = ['python', 'javascript', 'js', 'typescript', 'ts', 'bash', 'sh', 'html', 'css', 'json', 'sql', 'yaml', 'xml', 'java', 'cpp', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'scala', 'r', 'matlab', 'perl']
  const knownLangPattern = knownLangsList.join('|')
  const fenceWithoutLang = new RegExp('```(?!(?:' + knownLangPattern + ')\\n)([a-zA-Z_#<(\\/])', 'g')
  result = result.replace(fenceWithoutLang, (match, char: string) => {
    return '```\n' + char
  })

  // Pattern 1: `languageCODE` where language is python/js/etc
  const langInlinePattern = /`((?:python|javascript|js|typescript|ts|bash|sh|html|css|json|sql|yaml|xml|java|c|cpp|go|rust|php|ruby|kotlin|swift|scala|r|matlab|perl)([\s\S]*?))`/g
  result = result.replace(langInlinePattern, (match, code: string) => {
    const langMatch = code.match(/^(python|javascript|js|typescript|ts|bash|sh|html|css|json|sql|yaml|xml|java|c|cpp|go|rust|php|ruby|kotlin|swift|scala|r|matlab|perl)/)
    if (langMatch) {
      const lang = langMatch[1]
      const actualCode = code.slice(lang.length)
      if (/[(){}\[\]=;:]/.test(actualCode) || actualCode.includes('\n')) {
        const normalizedLang = lang === 'js' ? 'javascript' : lang === 'ts' ? 'typescript' : lang
        return '```' + normalizedLang + '\n' + actualCode + '\n```'
      }
    }
    return match
  })

  // Pattern 2: Long inline code (>40 chars) with multiple statements
  result = result.replace(/`([^`\n]{40,})`/g, (match, code: string) => {
    if (/[(){}\[\]=;]/.test(code) && code.length > 40) {
      return '```\n' + code + '\n```'
    }
    return match
  })

  // Pattern 3: Inline code with newlines
  result = result.replace(/`([^`]*\n[^`]*)`/g, (match, code: string) => {
    const firstLine = code.split('\n')[0].trim()
    const langMatch = firstLine.match(/^(python|javascript|js|typescript|ts|bash|sh|html|css|json|sql|yaml|xml|java|c|cpp|go|rust|php|ruby|kotlin|swift|scala|r|matlab|perl)\s*$/)
    if (langMatch) {
      const lang = langMatch[1]
      const actualCode = code.split('\n').slice(1).join('\n')
      const normalizedLang = lang === 'js' ? 'javascript' : lang === 'ts' ? 'typescript' : lang
      return '```' + normalizedLang + '\n' + actualCode + '\n```'
    }
    return '```\n' + code + '\n```'
  })

  return result
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const { theme } = useAppStore()
  const processed = preprocessMarkdown(content)

  return (
    <div className={cn('prose-mimo', className)}>
      <ReactMarkdown
        components={{
          // Code blocks with syntax highlighting
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const rawChildren = Array.isArray(children) ? children.join('') : String(children)
            const codeStr = rawChildren.replace(/\n$/, '')

            // Inline code: no language class AND short AND no newlines
            const isInline = !match && !codeStr.includes('\n') && codeStr.length < 60

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-[0.85em] border border-border"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            // Block code
            let language = match ? match[1] : 'text'
            let displayCode = codeStr

            // Strip language identifier prefix if present in the code itself
            if (!match) {
              const langMatch = codeStr.match(/^(python|javascript|js|typescript|ts|bash|sh|html|css|json|sql|yaml|xml|java|c|cpp|go|rust|php|ruby|kotlin|swift|scala|r|matlab|perl)\s*\n([\s\S]*)/)
              if (langMatch) {
                language = langMatch[1] === 'js' ? 'javascript' : langMatch[1] === 'ts' ? 'typescript' : langMatch[1]
                displayCode = langMatch[2]
              }
            }

            // Use Artifact for HTML (has live preview) or for long code (>5 lines)
            const lineCount = displayCode.split('\n').length
            const isHtml = language === 'html' || displayCode.trim().startsWith('<!DOCTYPE') || displayCode.trim().startsWith('<html')

            if (isHtml || lineCount > 5) {
              return (
                <Artifact
                  type={isHtml ? 'html' : 'code'}
                  language={language}
                  code={displayCode}
                />
              )
            }

            // Short code blocks: use simple CodeBlock
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

          // Paragraphs (use div to avoid hydration issues with nested block elements)
          p({ children }: any) {
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
        {processed}
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
