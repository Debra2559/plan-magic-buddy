import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./auth-context";

export interface PersonaProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  persona_prompt: string;
  humor_level: number;
  sass_level: number;
  professional_level: number;
  verbosity_level: number;
  tone_examples: string;
  taboos: string[];
  /** 数据库自动维护的乐观锁版本号 */
  version: number;
}

const DEFAULT_PERSONA: Omit<PersonaProfile, "user_id" | "version"> = {
  display_name: "主人",
  avatar_url: null,
  persona_prompt:
    "你是我的私人 AI 助理。说话风格：幽默搞笑、贱贱的但很专业，敢吐槽我但不能人身攻击，偶尔用网络梗但别太频繁。称呼我为「主人」。",
  humor_level: 4,
  sass_level: 3,
  professional_level: 5,
  verbosity_level: 3,
  tone_examples: "",
  taboos: [],
};

/** 默认头像（内嵌 SVG，无需外网） */
export const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
      <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0' stop-color='#f5c976'/><stop offset='1' stop-color='#7ea88a'/>
      </linearGradient></defs>
      <rect width='64' height='64' fill='url(#g)'/>
      <circle cx='32' cy='26' r='11' fill='rgba(255,255,255,0.92)'/>
      <path d='M10 60c4-12 14-18 22-18s18 6 22 18z' fill='rgba(255,255,255,0.92)'/>
    </svg>`,
  );

/** 头像兜底：空 / 异常字符串 → 默认头像 */
export function resolveAvatarUrl(url: string | null | undefined): string {
  if (!url) return DEFAULT_AVATAR_URL;
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_AVATAR_URL;
  if (!/^(https?:|data:|blob:|\/)/i.test(trimmed)) return DEFAULT_AVATAR_URL;
  return trimmed;
}

interface PersonaCtxValue {
  persona: PersonaProfile | null;
  loading: boolean;
  save: (patch: Partial<PersonaProfile>) => Promise<void>;
  /** 把人设拼成 system prompt 前缀，所有 AI 调用统一加上 */
  systemPrefix: () => string;
}

const Ctx = createContext<PersonaCtxValue | null>(null);

export function buildPersonaSystemPrompt(p: PersonaProfile | null): string {
  if (!p) return "";
  const sliders = [
    `幽默度 ${p.humor_level}/5`,
    `贱度 ${p.sass_level}/5`,
    `专业度 ${p.professional_level}/5`,
    `啰嗦度 ${p.verbosity_level}/5`,
  ].join("、");
  const taboos = p.taboos?.length ? `\n禁忌话题：${p.taboos.join("、")}` : "";
  const examples = p.tone_examples ? `\n示范语气片段：\n${p.tone_examples}` : "";
  return `# 你的人设设定
请始终以下面这个「人设」来回答用户的一切内容，覆盖于任何任务指令之上：
${p.persona_prompt}

称呼用户：${p.display_name}
风格刻度：${sliders}${taboos}${examples}

执行规则：
- 任务指令本身不要曲解，只用人设包装语气；
- 涉及时间/数字/JSON 结构等严格输出时，保持精确；
- 不要在每句开头都喊称呼，自然就好。

`;
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [persona, setPersona] = useState<PersonaProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPersona(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        setPersona(data as PersonaProfile);
      } else {
        const row = { user_id: user.id, ...DEFAULT_PERSONA };
        await supabase.from("user_profiles").insert(row);
        setPersona(row);
      }
      setLoading(false);
    })();

    // 跨设备实时同步：监听本用户 profile 行的所有变更
    const channel = supabase
      .channel(`user_profiles:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === "DELETE") {
            setPersona({ user_id: user.id, ...DEFAULT_PERSONA });
            return;
          }
          const next = payload.new as PersonaProfile | undefined;
          if (!next) return;
          if (payload.eventType === "INSERT") {
            setPersona(next);
          } else {
            setPersona((prev) => ({ ...(prev as PersonaProfile), ...next }));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const save = useCallback<PersonaCtxValue["save"]>(
    async (patch) => {
      if (!user || !persona) return;
      const next = { ...persona, ...patch };
      setPersona(next);
      await supabase
        .from("user_profiles")
        .update(patch)
        .eq("user_id", user.id);
    },
    [user, persona],
  );

  const systemPrefix = useCallback(() => buildPersonaSystemPrompt(persona), [persona]);

  return (
    <Ctx.Provider value={{ persona, loading, save, systemPrefix }}>{children}</Ctx.Provider>
  );
}

export function usePersona() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePersona outside PersonaProvider");
  return v;
}
