'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Settings, User, Save, RefreshCw, Database, Key,
  Globe, Clock, MapPin, Briefcase,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface UserProfile {
  id: string
  name: string | null
  email: string
  bio: string | null
  location: string | null
  occupation: string | null
  timezone: string
  language: string
  apiKeys: Array<{ id: string; provider: string; keyAlias: string; isActive: boolean }>
}

export function SettingsPanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(data => setProfile(data.user))
      .catch(() => toast.error('فشل تحميل الإعدادات'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          bio: profile.bio,
          location: profile.location,
          occupation: profile.occupation,
          timezone: profile.timezone,
          language: profile.language,
        }),
      })
      if (!res.ok) throw new Error('فشل الحفظ')
      toast.success('تم حفظ الإعدادات')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        جاري التحميل...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">الإعدادات</h2>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 max-w-2xl mx-auto">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4" />
                الملف الشخصي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>الاسم</Label>
                  <Input
                    value={profile.name ?? ''}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  المهنة
                </Label>
                <Input
                  value={profile.occupation ?? ''}
                  onChange={(e) => setProfile({ ...profile, occupation: e.target.value })}
                  placeholder="مثال: طالب هندسة كهربائية"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  الموقع
                </Label>
                <Input
                  value={profile.location ?? ''}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="مثال: الخليل، فلسطين"
                />
              </div>

              <div className="space-y-1.5">
                <Label>نبذة شخصية</Label>
                <Textarea
                  value={profile.bio ?? ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={3}
                  placeholder="اكتب نبذة عنك... سيستخدمها MiMo لفهمك بشكل أفضل"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    المنطقة الزمنية
                  </Label>
                  <Input
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    اللغة
                  </Label>
                  <Input
                    value={profile.language}
                    onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Key className="w-4 h-4" />
                مفاتيح API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                أضف مفاتيح API لمزودي الذكاء الاصطناعي لاستخدامهم في MiMo.
                تُحفظ مشفّرة محلياً ولا تُرسل خارج النظام.
              </p>
              {profile.apiKeys.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg">
                  لا توجد مفاتيح مضافة
                </div>
              ) : (
                profile.apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 p-2 border border-border rounded-md">
                    <Key className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-mono">{k.provider}</span>
                    <span className="text-xs text-muted-foreground flex-1">{k.keyAlias}</span>
                    <Badge variant={k.isActive ? 'default' : 'secondary'} className="text-[9px] py-0 h-4">
                      {k.isActive ? 'نشط' : 'متوقف'}
                    </Badge>
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" className="w-full" disabled>
                <Key className="w-3 h-3 ml-1" />
                إضافة مفتاح (قريباً)
              </Button>
            </CardContent>
          </Card>

          {/* Data management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                إدارة البيانات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                كل بيانات MiMo محفوظة محلياً في SQLite على جهازك.
                يمكنك تصديرها أو حذفها في أي وقت.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" disabled>
                  تصدير البيانات
                </Button>
                <Button variant="outline" size="sm" disabled className="text-rose-500 hover:text-rose-600">
                  حذف كل البيانات
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">عن MiMo AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>الإصدار</span>
                <span className="font-mono">0.1.0 MVP</span>
              </div>
              <div className="flex justify-between">
                <span>المحرك</span>
                <span className="font-mono">GLM (Z.ai)</span>
              </div>
              <div className="flex justify-between">
                <span>قاعدة البيانات</span>
                <span className="font-mono">SQLite + Prisma</span>
              </div>
              <div className="flex justify-between">
                <span>الـ Framework</span>
                <span className="font-mono">Next.js 16</span>
              </div>
              <div className="flex justify-between">
                <span>نوع الـ Agent</span>
                <span className="font-mono">ReAct (Reason + Act)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
