import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "切换到亮色模式" : "切换到暗色模式"}
      aria-label="切换主题"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border border-border bg-card/60 text-foreground hover:bg-card transition ${className}`}
    >
      {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      <span>{isDark ? "亮色" : "暗色"}</span>
    </button>
  );
}
