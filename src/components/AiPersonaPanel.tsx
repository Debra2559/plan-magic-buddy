import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, LogOut, Loader2, Camera, Trash2, Upload } from "lucide-react";
import { usePersona } from "@/lib/persona";
import { CachedAvatar } from "@/components/CachedAvatar";
import { useAuth } from "@/lib/auth-context";
import { tryPersonaLine } from "@/lib/persona-demo.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";
import { ProfileHistoryPanel } from "@/components/ProfileHistoryPanel";
import { PersonaPreviewPanel } from "@/components/PersonaPreviewPanel";
import { TaboosEditor } from "@/components/TaboosEditor";

// 精选两组风格：极简线条肖像（notionists-neutral）+ 抽象几何渐变（shapes）
// 整体走 Linear / Notion / Apple 设计审美，避免花哨的卡通 emoji
const PRESET_AVATARS: string[] = [
  ...["aurora", "atlas", "luna", "nova", "iris", "river", "sage", "wren"].map(
    (seed) =>
      `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${seed}&backgroundColor=f5f0e8,e8dccb,d4c4a8,c9b99a,b8a382,a89172`,
  ),
  ...["ink", "mist", "ember", "tide", "dusk", "stone", "moss", "clay"].map(
    (seed) =>
      `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}&backgroundType=gradientLinear&backgroundRotation=15,30,45,210,225,240`,
  ),
];


type PersonaTemplate = {
  name: string;
  emoji: string;
  desc: string;
  prompt: string;
  humor_level: number;
  sass_level: number;
  professional_level: number;
  verbosity_level: number;
};

type TemplateCategory = "日常" | "工作" | "情绪" | "成长";

const PERSONA_TEMPLATES: (PersonaTemplate & { category: TemplateCategory })[] = [
  {
    category: "日常",
    name: "贱兮兮助理", emoji: "😏",
    desc: "幽默搞笑、贱贱的但很专业",
    prompt: "你是我的私人 AI 助理。说话风格：幽默搞笑、贱贱的但很专业，敢吐槽我但不能人身攻击，偶尔用网络梗但别太频繁。称呼我为「主人」。",
    humor_level: 4, sass_level: 3, professional_level: 5, verbosity_level: 3,
  },
  {
    category: "工作",
    name: "高冷管家", emoji: "🎩",
    desc: "克制、礼貌、像英式管家",
    prompt: "你是一位克制、礼貌、像英式管家般的 AI 助理。说话简洁得体，永远先回答问题再补充背景，不开玩笑、不卖弄网络梗。称呼我为「先生/女士」。",
    humor_level: 1, sass_level: 1, professional_level: 5, verbosity_level: 2,
  },
  {
    category: "日常",
    name: "元气好友", emoji: "🌈",
    desc: "热情活泼，像闺蜜/兄弟",
    prompt: "你是我超热情的好朋友。说话像闺蜜/兄弟一样自然、活泼、爱用感叹号和表情，永远先共情再给建议，不端着不说教。直接喊我名字就行。",
    humor_level: 5, sass_level: 2, professional_level: 3, verbosity_level: 4,
  },
  {
    category: "工作",
    name: "极简效率脑", emoji: "⚡",
    desc: "只给结论、不废话",
    prompt: "你是极致高效的 AI 助理。回答永远先给结论，必要时列要点，禁用客套话、禁用「希望对你有帮助」之类结尾。能一句说清就别两句。",
    humor_level: 2, sass_level: 1, professional_level: 5, verbosity_level: 1,
  },
  {
    category: "成长",
    name: "毒舌教练", emoji: "🔥",
    desc: "敢说真话，专治拖延",
    prompt: "你是我的私人执行力教练，敢说真话、不哄我。当我找借口时直接戳破，但永远给出下一步可执行动作。语气坚定不刻薄，称呼我为「队友」。",
    humor_level: 3, sass_level: 5, professional_level: 5, verbosity_level: 2,
  },
  {
    category: "情绪",
    name: "温柔陪伴", emoji: "🫧",
    desc: "情绪稳定，先共情后建议",
    prompt: "你是一位情绪稳定、温柔的陪伴型 AI。永远先认真听、共情我的感受，再轻声给建议，不评判、不催促。语速放缓，多用「嗯」「我懂」这样的语气词。",
    humor_level: 2, sass_level: 1, professional_level: 3, verbosity_level: 4,
  },
  {
    category: "工作",
    name: "克制商务", emoji: "💼",
    desc: "正式书面、客户级口吻",
    prompt: "你是一位以书面正式语写作的商务助理。用敬语、避免口语和俚语，输出结构化：背景→结论→下一步。称呼我为「您」。",
    humor_level: 1, sass_level: 0, professional_level: 5, verbosity_level: 3,
  },
  {
    category: "成长",
    name: "学术导师", emoji: "🎓",
    desc: "苏格拉底式追问，重逻辑",
    prompt: "你是我的学术导师。回答时先指出我推理的关键假设与漏洞，再用 1-2 个反问推动我自己想清楚，最后才补充必要事实。引用要给出来源关键词。称呼我为「同学」。",
    humor_level: 1, sass_level: 2, professional_level: 5, verbosity_level: 4,
  },
  {
    category: "成长",
    name: "创意伙伴", emoji: "🎨",
    desc: "脑暴搭子，敢提怪点子",
    prompt: "你是我的创意脑暴搭子。每次至少给 3 个角度差异化的方案（保守 / 主流 / 大胆），允许不靠谱但要标注风险。鼓励我「先发散再收敛」，不要急着否定我的想法。",
    humor_level: 4, sass_level: 2, professional_level: 4, verbosity_level: 4,
  },
  {
    category: "情绪",
    name: "禅意陪谈", emoji: "🌿",
    desc: "慢节奏、留白、像散文",
    prompt: "你是一位禅意陪谈者。语速缓慢、句子短，多用留白与意象，少给建议、多陪我把想法说完。不催促、不评价。称呼我的名字。",
    humor_level: 1, sass_level: 0, professional_level: 3, verbosity_level: 2,
  },
];

const CATEGORIES: ("全部" | TemplateCategory)[] = ["全部", "日常", "工作", "情绪", "成长"];



export function AiPersonaPanel() {
  const { persona, loading, save } = usePersona();
  const { user, signOut } = useAuth();
  const [local, setLocal] = useState(persona);
  const [savingTip, setSavingTip] = useState(false);
  const [tryingTip, setTryingTip] = useState(false);
  const [demoLine, setDemoLine] = useState<string>("");
  const tryFn = useServerFn(tryPersonaLine);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<(typeof CATEGORIES)[number]>("全部");

  useEffect(() => setLocal(persona), [persona]);

  if (loading || !local) {
    return (
      <div className="widget p-5 text-sm text-muted-foreground flex items-center gap-2">
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
    // 记住失败时要保留的当前头像（resolveAvatarUrl 会兜底默认头像）
    const previousAvatar = local.avatar_url;
    setUploadingAvatar(true);
    setUploadProgress(0);
    const toastId = toast.loading("正在上传头像…", { description: "0%" });
    try {
      const path = `${user.id}/avatar-${Date.now()}.png`;

      // 1) 拿一个签名上传 URL，便于用 XHR 跟踪真实进度
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUploadUrl(path);
      if (signErr || !signed) throw signErr ?? new Error("无法创建上传链接");

      // 2) XHR PUT 上传，监听 progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.signedUrl, true);
        xhr.setRequestHeader("Content-Type", "image/png");
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("cache-control", "max-age=31536000");
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(pct);
          toast.loading("正在上传头像…", { id: toastId, description: `${pct}%` });
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`上传失败 HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error("网络错误，请重试"));
        xhr.onabort = () => reject(new Error("上传已取消"));
        xhr.send(blob);
      });

      // 3) 拿公开链接并写入资料
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      toast.loading("保存中…", { id: toastId, description: "100%" });
      await commit({ avatar_url: pub.publicUrl });
      toast.success("头像已更新", { id: toastId, description: undefined });
    } catch (e: any) {
      // 失败：保留当前头像，UI 不动；resolveAvatarUrl 兜底默认头像
      setLocal((cur) => (cur ? { ...cur, avatar_url: previousAvatar } : cur));
      toast.error("上传失败", { id: toastId, description: e?.message ?? "请重试" });
    } finally {
      setUploadingAvatar(false);
      setUploadProgress(0);
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
      const r = await tryFn({
        data: {
          personaPrompt: buildLocalPrefix(local),
          displayName: local.display_name || "你",
        },
      });
      if (r.ok) {
        setDemoLine(r.line);
      } else {
        toast.error(r.error);
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
        <h3 className="font-display text-lg text-foreground">AI 人设 · 让助理懂你说话方式</h3>
        {savingTip && <span className="text-[10px] text-amber-glow ml-2">已自动保存</span>}
      </div>

      <div className="widget p-5 space-y-5">
        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            登录账号：<span className="text-white/85">{user?.email}</span>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-foreground/5 border border-border hover:bg-foreground/10 text-foreground/75"
          >
            <LogOut className="w-3 h-3" /> 退出
          </button>
        </div>

        {/* 头像 + 拖拽上传 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex items-center gap-4 p-3 rounded-xl border border-dashed transition ${dragOver ? "border-amber-glow/60 bg-amber-glow/5" : "border-border bg-foreground/[0.03]"}`}
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-foreground/5 flex items-center justify-center text-2xl text-muted-foreground relative">
              <CachedAvatar
                src={local.avatar_url}
                alt="头像"
                lazy={false}
                className={`w-full h-full object-cover transition ${uploadingAvatar ? "opacity-60 blur-[1px]" : ""}`}
              />
              {uploadingAvatar && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60">
                  <Loader2 className="w-4 h-4 animate-spin text-foreground mb-0.5" />
                  <span className="text-[10px] text-foreground font-medium tabular-nums">{uploadProgress}%</span>
                </div>
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
            <div className="text-xs text-foreground/75 mb-1 flex items-center gap-1.5">
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
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
              <span>上传后可圆形/方形裁剪 · JPG/PNG · 5MB 内</span>
              {local.avatar_url && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  className="px-2 py-0.5 rounded bg-foreground/5 border border-border hover:bg-rose-400/10 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> 移除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 默认头像库 */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">或从默认头像库挑一个</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_AVATARS.map((url) => {
              const active = local.avatar_url === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => commit({ avatar_url: url })}
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition ${active ? "border-amber-glow ring-2 ring-amber-glow/40" : "border-border hover:border-white/30"}`}
                  title="使用这个头像"
                >
                  <CachedAvatar src={url} alt="预设头像" className="w-full h-full object-cover bg-foreground/5" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">你怎么称呼 AI（显示在左上角）</label>
            <input
              value={local.ai_nickname ?? ""}
              onChange={(e) => patch({ ai_nickname: e.target.value })}
              onBlur={() => commit({ ai_nickname: (local.ai_nickname ?? "").trim() || "Sylva" })}
              className="w-full px-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm text-foreground outline-none focus:border-amber-glow/50"
              placeholder="例：Sylva / 小西 / 助理"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">AI 怎么称呼你</label>
            <input
              value={local.display_name}
              onChange={(e) => patch({ display_name: e.target.value })}
              onBlur={() => commit({ display_name: local.display_name })}
              className="w-full px-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm text-foreground outline-none focus:border-amber-glow/50"
              placeholder="例：主人 / 老板 / Tobi"
            />
          </div>
        </div>


        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">人设模板库 · 一键切换，下方可继续微调</label>
            <span className="text-[10px] text-muted-foreground/70">{PERSONA_TEMPLATES.length} 款风格</span>
          </div>

          {/* 分类筛选 */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const active = templateCategory === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTemplateCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                    active
                      ? "bg-amber-glow/20 border-amber-glow/60 text-amber-glow"
                      : "bg-foreground/5 border-border text-foreground/70 hover:border-amber-glow/30"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {/* 模板卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PERSONA_TEMPLATES.filter((t) => templateCategory === "全部" || t.category === templateCategory).map((t) => {
              const applied = local.persona_prompt?.trim() === t.prompt.trim();
              const bars: Array<{ k: string; v: number }> = [
                { k: "幽默", v: t.humor_level },
                { k: "贱度", v: t.sass_level },
                { k: "专业", v: t.professional_level },
                { k: "啰嗦", v: t.verbosity_level },
              ];
              return (
                <div
                  key={t.name}
                  className={`group relative rounded-xl p-3 border transition flex flex-col gap-2 ${
                    applied
                      ? "border-amber-glow/60 bg-amber-glow/10 shadow-[0_0_0_1px_rgba(245,184,67,0.25)]"
                      : "border-border bg-background/40 hover:border-amber-glow/40 hover:bg-background/60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-muted-foreground">
                          {t.category}
                        </span>
                        {applied && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-glow/25 text-amber-glow border border-amber-glow/40">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.desc}</div>
                    </div>
                  </div>

                  {/* 风格指标条 */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {bars.map((b) => (
                      <div key={b.k} className="flex flex-col gap-0.5">
                        <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
                          <div
                            className="h-full bg-amber-glow/70"
                            style={{ width: `${(b.v / 5) * 100}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-muted-foreground/80 text-center tabular-nums">
                          {b.k} {b.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        persona_prompt: t.prompt,
                        humor_level: t.humor_level,
                        sass_level: t.sass_level,
                        professional_level: t.professional_level,
                        verbosity_level: t.verbosity_level,
                      };
                      patch(next);
                      commit(next);
                      toast.success(`已套用「${t.name}」`, { description: "下方可继续微调" });
                    }}
                    disabled={applied}
                    className={`mt-0.5 text-[11px] px-2.5 py-1 rounded-md border transition ${
                      applied
                        ? "bg-foreground/5 border-border text-muted-foreground cursor-default"
                        : "bg-amber-glow/15 border-amber-glow/40 text-amber-glow hover:bg-amber-glow/25"
                    }`}
                  >
                    {applied ? "已套用" : "套用此模板"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-muted-foreground/70 pt-1">
            ↓ 套用后可在下方文本框 / 滑杆里继续微调，所有改动会自动保存。
          </div>
          <textarea
            value={local.persona_prompt}
            onChange={(e) => patch({ persona_prompt: e.target.value })}
            onBlur={() => commit({ persona_prompt: local.persona_prompt })}
            rows={5}
            className="w-full px-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm text-foreground outline-none focus:border-amber-glow/50 resize-none leading-relaxed"
          />
        </div>





        <div>
          <TaboosEditor
            value={local.taboos ?? []}
            onChange={(next) => patch({ taboos: next })}
            onCommit={(next) => commit({ taboos: next })}
          />
        </div>


        <div className="pt-2 border-t border-border space-y-2">
          <button
            onClick={tryIt}
            disabled={tryingTip}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-glow/20 border border-amber-glow/40 text-amber-glow text-xs hover:bg-amber-glow/30 disabled:opacity-50"
          >
            {tryingTip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            让 AI 用这个人设说一句话试试
          </button>
          {demoLine && (
            <div className="px-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm text-white/85 italic">
              "{demoLine}"
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border">
          <PersonaPreviewPanel
            personaPrompt={buildLocalPrefix(local)}
            displayName={local.display_name || "你"}
            aiNickname={local.ai_nickname || "Sylva"}
          />
        </div>

        <ProfileHistoryPanel />
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
