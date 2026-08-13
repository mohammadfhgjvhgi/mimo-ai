"use client";

import { useMimo } from "@/lib/mimo-store";
import { t, getDirection, listLocales } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Languages, Sun, Moon, Monitor, Type, Globe, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsDialog() {
  const {
    settingsOpen,
    setSettingsOpen,
    locale,
    setLocale,
    theme,
    setTheme,
  } = useMimo();

  const dir = getDirection(locale);

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {t("settings.title", locale)}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-5 pr-1">
            {/* Language */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Languages className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("settings.language", locale)}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {listLocales().map((l) => (
                  <Button
                    key={l}
                    variant={locale === l ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLocale(l)}
                    className="justify-start"
                    dir={getDirection(l)}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {l === "ar" ? "العربية" : "English"}
                  </Button>
                ))}
              </div>
            </section>

            {/* Theme */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("settings.theme", locale)}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ThemeButton
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                  icon={<Moon className="w-3.5 h-3.5" />}
                  label={t("settings.theme.dark", locale)}
                />
                <ThemeButton
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                  icon={<Sun className="w-3.5 h-3.5" />}
                  label={t("settings.theme.light", locale)}
                />
                <ThemeButton
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                  icon={<Monitor className="w-3.5 h-3.5" />}
                  label={t("settings.theme.system", locale)}
                />
              </div>
            </section>

            {/* Direction info */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Type className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("settings.direction", locale)}</h3>
              </div>
              <div className="text-xs text-muted-foreground p-2 rounded-md bg-muted/30">
                {dir === "rtl"
                  ? locale === "ar"
                    ? "الاتجاه: يمين لليسار (RTL)"
                    : "Direction: Right to Left (RTL)"
                  : locale === "ar"
                  ? "الاتجاه: يسار لليمين (LTR)"
                  : "Direction: Left to Right (LTR)"}
              </div>
            </section>

            {/* System stats */}
            <section>
              <h3 className="text-sm font-semibold mb-2">
                {locale === "ar" ? "معلومات النظام" : "System Info"}
              </h3>
              <div className="text-xs space-y-1 text-muted-foreground">
                <div>MiMo AI Engineering Platform v2.0</div>
                <div>12 agents · 15 tools · 69 skills</div>
                <div>z-ai-web-dev-sdk · GLM-4-plus</div>
                <div>Next.js 16 · TypeScript 5 · Prisma</div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="flex-col h-auto py-2 gap-1"
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </Button>
  );
}
