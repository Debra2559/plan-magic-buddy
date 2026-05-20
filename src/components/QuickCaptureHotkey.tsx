import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSylva, todayLocal } from "@/lib/sylva-store";

/**
 * 全局快捷键: Shift + Q + W (同时按下)
 * 将当前剪贴板内容 + 当前页面 URL 作为今日事件记录写入。
 * 注意: 浏览器无法注册系统级全局快捷键, 仅在本应用窗口聚焦时生效。
 */
export function QuickCaptureHotkey() {
  const { addItems } = useSylva();
  const pressed = useRef<Set<string>>(new Set());
  const cooldown = useRef(0);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const fire = async () => {
      const now = Date.now();
      if (now - cooldown.current < 1500) return;
      cooldown.current = now;

      let clip = "";
      try {
        clip = (await navigator.clipboard.readText()).trim();
      } catch {
        // 剪贴板未授权, 静默继续, 仅记录页面信息
      }

      const url = typeof window !== "undefined" ? window.location.href : "";
      const pageTitle = typeof document !== "undefined" ? document.title : "";

      const previewSrc = clip || pageTitle || url || "快速记录";
      const preview =
        previewSrc.length > 28 ? previewSrc.slice(0, 26) + "…" : previewSrc;

      const noteParts: string[] = [];
      if (clip) noteParts.push(`剪贴板: ${clip}`);
      if (pageTitle) noteParts.push(`页面: ${pageTitle}`);
      if (url) noteParts.push(`链接: ${url}`);
      const time = new Date().toTimeString().slice(0, 5);

      addItems([
        {
          type: "event",
          title: `速记: ${preview}`,
          date: todayLocal(),
          time,
          tag: "速记",
          note: noteParts.join(" · ") || "（无内容）",
        },
      ]);

      toast.success("已加入今日事件", {
        description: clip ? "剪贴板内容已记录" : "当前页面已记录",
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey) pressed.current.add("shift");
      if (key === "shift") pressed.current.add("shift");
      if (key === "q") pressed.current.add("q");
      if (key === "w") pressed.current.add("w");

      if (
        pressed.current.has("shift") &&
        pressed.current.has("q") &&
        pressed.current.has("w")
      ) {
        e.preventDefault();
        void fire();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "shift") pressed.current.delete("shift");
      if (key === "q") pressed.current.delete("q");
      if (key === "w") pressed.current.delete("w");
    };

    const onBlur = () => pressed.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [addItems]);

  return null;
}
