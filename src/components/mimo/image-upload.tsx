'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ImageUploadProps {
  onImageSelect: (dataUrl: string | null) => void
  disabled?: boolean
}

const MAX_SIZE = 4 * 1024 * 1024 // 4MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function ImageUpload({ onImageSelect, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      toast.error('الصيغة غير مدعومة. استخدم JPG, PNG, WEBP, أو GIF')
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error('حجم الصورة يجب أن يكون أقل من 4MB')
      return
    }

    // Convert to base64 data URL
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setPreview(result)
      onImageSelect(result)
    }
    reader.onerror = () => toast.error('فشل قراءة الصورة')
    reader.readAsDataURL(file)
  }

  const handleClear = () => {
    setPreview(null)
    onImageSelect(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (preview) {
    return (
      <div className="relative shrink-0">
        <img src={preview} alt="معاينة" className="w-9 h-9 rounded-lg object-cover" />
        <button
          onClick={handleClear}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title="إرفاق صورة"
      >
        <ImageIcon className="w-4 h-4" />
      </Button>
    </>
  )
}
