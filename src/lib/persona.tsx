import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

export interface PersonaProfile {
  user_id: string;
  display_name: string;
  persona_prompt: string;
  humor_level: number;
  sass_level: number;
  professional_level: number;
  verbosity_level: number;
  tone_examples: string;
  taboos: string[];
}

const DEFAULT_PERSONA: Omit<PersonaProfile, "user_id"> = {
  display_name: "主人",
  persona_prompt:
    "你是我的私人 AI 助理。说话风格：幽默搞笑、贱贱的但很专业，敢吐槽我但不能人身攻击，偶尔用网络梗但别太频繁。称呼我为「主人」。",
  humor_level: 4,
  sass_level: 3,
  professional_level: 5,
  verbosity_level: 3,
  tone_examples: "",
  taboos: [],
};

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
        // 兜底：trigger 万一没建出来，本地兜一份默认
        const row = { user_id: user.id, ...DEFAULT_PERSONA };
        await supabase.from("user_profiles").insert(row);
        setPersona(row);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
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
