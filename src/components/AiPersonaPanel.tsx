import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, LogOut, Loader2, Camera, Trash2 } from "lucide-react";
import { usePersona } from "@/lib/persona";
import { useAuth } from "@/lib/auth-context";
import { generatePlan } from "@/lib/plan.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function AiPersonaPanel() {
  const { persona, loading, save } = usePersona();
  const { user, signOut } = useAuth();
  const [local, setLocal] = useState(persona);
  const [savingTip, setSavingTip] = useState(false);
  const [tryingTip, setTryingTip] = useState(false);
  const [demoLine, setDemoLine] = useState<string>("");
  const planFn = useServerFn(generatePlan);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarPick = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("图片需小于 5MB"); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await commit({ avatar_url: pub.publicUrl });
      toast.success("头像已更新");
    } catch (e: any) {
      toast.error(e?.message ?? "上传失败");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    await commit({ avatar_url: null });
    toast.success("已移除头像");
  };

  if (loading || !local) {
    return (
      <div className="widget p-5 text-sm text-white/60 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> 正在加载人设...
      </div>
    );
  }

  const patch = (p: Partial<typeof local>) => {
    const next = { ...local, ...p };
    setLocal(next);
  };

  const commit = async (p: Partial<typeof local>) => {
    setSavingTip(true);
    await save(p);
    setTimeout(() => setSavingTip(false), 900);
  };

  const tryIt = async () => {
    setTryingTip(true);
    setDemoLine("");
    try {
      // 通过 generatePlan 调一次 AI，用人设说一句话
      const r = await planFn({
        data: {
          idea: `请用你的人设给${local.display_name}说一句早安问候，并自我介绍一下你能帮${local.display_name}做什么。要求：30字以内的summary必须像聊天，不要列日程。items 给 1 条空就行。`,
          mode: "create",
          personaPrompt: buildLocalPrefix(local),
        } as any,
      });
      if ("ok" in r && r.ok) {
        setDemoLine(r.plan.summary || "（AI 没说话）");
      } else {
        toast.error((r as any).error ?? "试一句失败");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "试一句失败");
    } finally {
      setTryingTip(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-glow" />
        <h3 className="font-display text-lg text-white">AI 人设 · 让助理懂你说话方式</h3>
        {savingTip && <span className="text-[10px] text-amber-glow ml-2">已自动保存</span>}
      </div>

      <div className="widget p-5 space-y-5">
        <div className="flex items-center justify-between text-xs">
          <div className="text-white/60">
            登录账号：<span className="text-white/85">{user?.email}</span>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white/70"
          >
            <LogOut className="w-3 h-3" /> 退出
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-white/60">AI 怎么称呼你</label>
          <input
            value={local.display_name}
            onChange={(e) => patch({ display_name: e.target.value })}
            onBlur={() => commit({ display_name: local.display_name })}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-amber-glow/50"
            placeholder="例：主人 / 老板 / Tobi"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-white/60">人设描述（所有 AI 输出都会按这个口吻）</label>
          <textarea
            value={local.persona_prompt}
            onChange={(e) => patch({ persona_prompt: e.target.value })}
            onBlur={() => commit({ persona_prompt: local.persona_prompt })}
            rows={5}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-amber-glow/50 resize-none leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {([
            ["humor_level", "幽默度", "冷静", "段子手"],
            ["sass_level", "贱度", "正经", "贱兮兮"],
            ["professional_level", "专业度", "随意", "专业"],
            ["verbosity_level", "啰嗦度", "简洁", "话痨"],
          ] as const).map(([k, label, lo, hi]) => (
            <div key={k}>
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>{label}</span>
                <span className="text-amber-glow tabular-nums">{local[k]}/5</span>
              </div>
              <input
                type="range" min={1} max={5} step={1}
                value={local[k]}
                onChange={(e) => patch({ [k]: Number(e.target.value) } as any)}
                onMouseUp={() => commit({ [k]: local[k] } as any)}
                onTouchEnd={() => commit({ [k]: local[k] } as any)}
                className="w-full accent-amber-glow"
              />
              <div className="flex justify-between text-[10px] text-white/40">
                <span>{lo}</span><span>{hi}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-white/60">禁忌话题（逗号分隔，AI 永远不会碰）</label>
          <input
            value={local.taboos?.join("，") ?? ""}
            onChange={(e) =>
              patch({ taboos: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
            }
            onBlur={() => commit({ taboos: local.taboos })}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none focus:border-amber-glow/50"
            placeholder="例：政治, 容貌焦虑"
          />
        </div>

        <div className="pt-2 border-t border-white/10 space-y-2">
          <button
            onClick={tryIt}
            disabled={tryingTip}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-glow/20 border border-amber-glow/40 text-amber-glow text-xs hover:bg-amber-glow/30 disabled:opacity-50"
          >
            {tryingTip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            让 AI 用这个人设说一句话试试
          </button>
          {demoLine && (
            <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 italic">
              "{demoLine}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildLocalPrefix(p: NonNullable<ReturnType<typeof usePersona>["persona"]>): string {
  // 与 persona.tsx 的 buildPersonaSystemPrompt 一致，避免循环依赖这里复制一份精简版
  return `# 你的人设设定\n${p.persona_prompt}\n称呼用户：${p.display_name}\n幽默度${p.humor_level}/5 贱度${p.sass_level}/5 专业度${p.professional_level}/5 啰嗦度${p.verbosity_level}/5\n${p.taboos?.length ? "禁忌：" + p.taboos.join("、") : ""}\n`;
}
