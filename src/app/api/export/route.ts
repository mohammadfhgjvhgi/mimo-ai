import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/export?conversationId=xxx
 * Exports a conversation as a PDF file using ReportLab (via Python subprocess)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    await ensureDefaultUser()

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Generate PDF using ReportLab via Python
    const { exec } = await import('child_process')
    const { writeFile } = await import('fs/promises')
    const { existsSync, mkdirSync } = await import('fs')
    const path = await import('path')

    const EXPORT_DIR = '/home/z/my-project/download'
    if (!existsSync(EXPORT_DIR)) {
      mkdirSync(EXPORT_DIR, { recursive: true })
    }

    const pdfPath = path.join(EXPORT_DIR, `conversation-${conversation.id}.pdf`)
    const dataPath = path.join(EXPORT_DIR, `conversation-${conversation.id}.json`)

    // Write conversation data as JSON
    const conversationData = {
      title: conversation.title,
      createdAt: conversation.createdAt,
      messages: conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    }
    await writeFile(dataPath, JSON.stringify(conversationData, null, 2), 'utf-8')

    // Write Python script
    const scriptPath = path.join(EXPORT_DIR, `gen-pdf-${conversation.id}.py`)
    const pythonScript = `
import json
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import sys

# Register Arabic-supporting font
font_paths = [
    '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf',
    '/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf',
]
font_registered = False
for fp in font_paths:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('ArabicFont', fp))
            font_registered = True
            break
        except:
            pass

font_name = 'ArabicFont' if font_registered else 'Helvetica'

# Load data
with open('${dataPath}', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Create PDF
doc = SimpleDocTemplate('${pdfPath}', pagesize=A4,
    rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)

styles = getSampleStyleSheet()
title_style = ParagraphStyle('CustomTitle', parent=styles['Title'],
    fontName=font_name, fontSize=18, spaceAfter=20, alignment=TA_RIGHT)
meta_style = ParagraphStyle('Meta', parent=styles['Normal'],
    fontName=font_name, fontSize=9, textColor='#666666', alignment=TA_RIGHT)
user_style = ParagraphStyle('User', parent=styles['Normal'],
    fontName=font_name, fontSize=11, alignment=TA_RIGHT,
    backColor='#f0f0f0', borderPadding=8, spaceBefore=8, spaceAfter=4)
ai_style = ParagraphStyle('AI', parent=styles['Normal'],
    fontName=font_name, fontSize=11, alignment=TA_RIGHT,
    backColor='#e8f5e9', borderPadding=8, spaceBefore=8, spaceAfter=4)
label_style = ParagraphStyle('Label', parent=styles['Normal'],
    fontName=font_name, fontSize=9, textColor='#888888', alignment=TA_RIGHT)

story = []
story.append(Paragraph('MiMo AI — محادثة', title_style))
story.append(Paragraph(f'العنوان: {data["title"]}', meta_style))
story.append(Paragraph(f'التاريخ: {data["createdAt"]}', meta_style))
story.append(Spacer(1, 20))

for msg in data['messages']:
    role = msg['role']
    content = msg['content']
    created = msg['createdAt']

    if role == 'user':
        story.append(Paragraph('👤 أنت', label_style))
        story.append(Paragraph(content.replace('\\n', '<br/>'), user_style))
    elif role == 'assistant':
        story.append(Paragraph('🤖 MiMo AI', label_style))
        story.append(Paragraph(content.replace('\\n', '<br/>'), ai_style))
    elif role == 'system':
        story.append(Paragraph('⚙️ نظام', label_style))
        story.append(Paragraph(content.replace('\\n', '<br/>'), ai_style))

    story.append(Spacer(1, 6))

doc.build(story)
print('OK')
`

    await writeFile(scriptPath, pythonScript, 'utf-8')

    const { execAsync } = await import('@/lib/ai/tools').then(m => ({ execAsync: m })) as any
    // Use direct exec
    const { promisify } = await import('util')
    const execP = promisify(exec)

    try {
      await execP(`python3 ${scriptPath}`, { timeout: 15000 })
    } catch (e: any) {
      return NextResponse.json(
        { error: `فشل توليد PDF: ${e.message}`, stderr: e.stderr ?? '' },
        { status: 500 }
      )
    }

    // Read the generated PDF
    const { readFile } = await import('fs/promises')
    const pdfBuffer = await readFile(pdfPath)

    // Cleanup
    const { unlink } = await import('fs/promises')
    await Promise.all([
      unlink(scriptPath).catch(() => {}),
      unlink(dataPath).catch(() => {}),
    ])

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="mimo-conversation.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: `فشل التصدير: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
