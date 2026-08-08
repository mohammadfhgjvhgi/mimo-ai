'use client'

import { useRef, useState, useCallback } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  active: boolean
  onActiveChange: (active: boolean) => void
}

export function VoiceInput({ onTranscript, disabled, active, onActiveChange }: VoiceInputProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    onActiveChange(false)
  }, [onActiveChange])

  const startRecording = useCallback(async () => {
    if (disabled) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // Convert to base64
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1]
          setIsProcessing(true)
          try {
            const res = await fetch('/api/asr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64 }),
            })
            const data = await res.json()
            if (data.text) {
              onTranscript(data.text)
              toast.success('تم تفريغ الصوت')
            } else {
              toast.error('لم يتم التعرف على الصوت')
            }
          } catch (e) {
            toast.error('فشل تفريغ الصوت')
          } finally {
            setIsProcessing(false)
          }
        }
        reader.readAsDataURL(blob)
      }

      mr.start()
      onActiveChange(true)
    } catch (e) {
      toast.error('فشل الوصول إلى الميكروفون')
      onActiveChange(false)
    }
  }, [disabled, onActiveChange, onTranscript])

  const toggle = () => {
    if (active) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className={`h-9 w-9 shrink-0 ${active ? 'bg-rose-500/20 text-rose-500' : ''}`}
      disabled={disabled || isProcessing}
      onClick={toggle}
      title={active ? 'إيقاف التسجيل' : 'إدخال صوتي'}
    >
      {isProcessing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : active ? (
        <Square className="w-4 h-4" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </Button>
  )
}
