import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, LogOut, Loader2, Camera, Trash2, Upload } from "lucide-react";
import { usePersona } from "@/lib/persona";
import { useAuth } from "@/lib/auth-context";
import { generatePlan } from "@/lib/plan.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";

const PRESET_AVATARS: string[] = [
  "fox", "panda", "cat", "dog", "koala", "tiger", "bear", "rabbit",
  "owl", "penguin", "monkey", "lion", "wolf", "frog", "duck", "pig",
].map((seed) => `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}&backgroundType=gradientLinear`);


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
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => setLocal(persona), [persona]);

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

  const handleAvatarPick = (file: File) => {
    if (!user) { toast.error("请先登录"); return; }
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("图片需小于 5MB"); return; }
    setPickedFile(file);
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: "image/png",
        cacheControl: "31536000", // 1 年，URL 自带时间戳，更新自动绕过缓存
      });
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleAvatarPick(f);
  };


  const handleAvatarRemove = async () => {
    await commit({ avatar_url: null });
    toast.success("已移除头像");
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

        {/* 头像 + 拖拽上传 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex items-center gap-4 p-3 rounded-xl border border-dashed transition ${dragOver ? "border-amber-glow/60 bg-amber-glow/5" : "border-white/10 bg-white/[0.02]"}`}
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/15 bg-white/5 flex items-center justify-center text-2xl text-white/60">
              {local.avatar_url ? (
                <img src={local.avatar_url} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <span>{(local.display_name || "主").slice(0, 1)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-glow text-primary-foreground flex items-center justify-center shadow hover:brightness-110 disabled:opacity-60"
              title="更换头像"
            >
              {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarPick(f); e.target.value = ""; }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/70 mb-1 flex items-center gap-1.5">
              <Upload className="w-3 h-3" />
              {dragOver ? "松开以选择该图片" : "拖拽图片到这里，或"}
              {!dragOver && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="underline text-amber-glow hover:brightness-110"
                >
                  点击选择
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/50 flex-wrap">
              <span>上传后可圆形/方形裁剪 · JPG/PNG · 5MB 内</span>
              {local.avatar_url && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  className="px-2 py-0.5 rounded bg-white/5 border border-white/10 hover:bg-rose-400/10 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> 移除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 默认头像库 */}
        <div className="space-y-2">
          <div className="text-xs text-white/60">或从默认头像库挑一个</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_AVATARS.map((url) => {
              const active = local.avatar_url === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => commit({ avatar_url: url })}
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition ${active ? "border-amber-glow ring-2 ring-amber-glow/40" : "border-white/10 hover:border-white/30"}`}
                  title="使用这个头像"
                >
                  <img src={url} alt="预设头像" className="w-full h-full object-cover bg-white/5" loading="lazy" />
                </button>
              );
            })}
          </div>
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

      <AvatarCropDialog
        open={!!pickedFile}
        file={pickedFile}
        onClose={() => setPickedFile(null)}
        onConfirm={async (blob) => { await handleCroppedUpload(blob); }}
      />
    </div>
  );
}

function buildLocalPrefix(p: NonNullable<ReturnType<typeof usePersona>["persona"]>): string {
  // 与 persona.tsx 的 buildPersonaSystemPrompt 一致，避免循环依赖这里复制一份精简版
  return `# 你的人设设定\n${p.persona_prompt}\n称呼用户：${p.display_name}\n幽默度${p.humor_level}/5 贱度${p.sass_level}/5 专业度${p.professional_level}/5 啰嗦度${p.verbosity_level}/5\n${p.taboos?.length ? "禁忌：" + p.taboos.join("、") : ""}\n`;
}
