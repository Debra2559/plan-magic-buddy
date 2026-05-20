import type { KeyboardEvent } from "react";

/**
 * 多行输入框的统一键盘行为：
 * - enterToSubmit=true：Enter 提交，Shift+Enter 换行
 * - enterToSubmit=false：Enter 换行，⌘/Ctrl+Enter 提交
 * 都会跳过 IME 候选词回车（isComposing）。
 * 返回 true 表示「触发了提交」，调用方应当随之调用提交动作。
 */
export function shouldSubmitOnKey(
  e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  enterToSubmit: boolean,
): boolean {
  if (e.key !== "Enter") return false;
  // 中文输入法选词回车不算
  if ((e.nativeEvent as any).isComposing) return false;
  if (enterToSubmit) {
    // Enter 提交；Shift+Enter 换行（让默认行为发生）
    return !e.shiftKey;
  }
  // Enter 换行；只有 ⌘/Ctrl+Enter 才提交
  return e.metaKey || e.ctrlKey;
}
