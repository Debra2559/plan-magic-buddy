import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import forestBg from "@/assets/forest-bg.jpg";
import { Sparkles, Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "登录 · Sylva" },
      { name: "description", content: "登录 Sylva，让 AI 按你的人设规划每一天。" },
    ],
  }),
});

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  type PwdCheck = { status: "idle" | "checking" | "ok" | "weak" | "pwned"; msg: string; count?: number };
  const [pwdCheck, setPwdCheck] = useState<PwdCheck>({ status: "idle", msg: "" });

  // 实时密码强度 + HIBP 泄漏校验（仅注册模式）
  useEffect(() => {
    if (mode !== "signup") { setPwdCheck({ status: "idle", msg: "" }); return; }
    if (!pwd) { setPwdCheck({ status: "idle", msg: "" }); return; }
    // 本地基础强度
    const weakReasons: string[] = [];
    if (pwd.length < 8) weakReasons.push("至少 8 位");
    if (!/[A-Za-z]/.test(pwd)) weakReasons.push("需含字母");
    if (!/[0-9]/.test(pwd)) weakReasons.push("需含数字");
    if (weakReasons.length) {
      setPwdCheck({ status: "weak", msg: weakReasons.join("，") });
      return;
    }
    let cancelled = false;
    setPwdCheck({ status: "checking", msg: "正在校验是否为常见弱密码…" });
    const t = setTimeout(async () => {
      try {
        const buf = new TextEncoder().encode(pwd);
        const hash = await crypto.subtle.digest("SHA-1", buf);
        const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
        const prefix = hex.slice(0, 5);
        const suffix = hex.slice(5);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const text = await res.text();
        if (cancelled) return;
        const line = text.split("\n").map((l) => l.trim()).find((l) => l.startsWith(suffix + ":"));
        if (line) {
          const count = Number(line.split(":")[1]);
          setPwdCheck({ status: "pwned", msg: `这个密码在已知泄漏库中出现 ${count.toLocaleString()} 次，请换一个`, count });
        } else {
          setPwdCheck({ status: "ok", msg: "强度 OK，未在已知泄漏库中" });
        }
      } catch {
        if (!cancelled) setPwdCheck({ status: "ok", msg: "强度 OK（在线校验失败，仅本地校验通过）" });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pwd, mode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/desktop" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pwd) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pwd,
          options: { emailRedirectTo: window.location.origin + "/desktop" },
        });
        if (error) throw error;
        // 若未返回 session（开启了邮箱验证），尝试立即用同一组凭据登录
        if (!data.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: pwd });
          if (signInErr) {
            toast.success("注册成功，请查收邮件完成验证后再登录");
            return;
          }
        }
        toast.success("已注册并登录，正在进入...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (error) throw error;
      }
      nav({ to: "/desktop" });
    } catch (e: any) {
      toast.error(e?.message ?? "登录失败");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/desktop" });
      if (r.error) throw r.error;
      if (r.redirected) return;
      nav({ to: "/desktop" });
    } catch (e: any) {
      toast.error(e?.message ?? "Google 登录失败");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <img src={forestBg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/90 to-background" />
      </div>

      <div className="w-full max-w-sm widget p-7 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-glow/90 flex items-center justify-center">
            <span className="font-display text-primary-foreground text-sm">S</span>
          </div>
          <span className="font-display text-xl">Sylva</span>
        </div>

        <div>
          <h1 className="font-display text-2xl">{mode === "signin" ? "欢迎回来" : "建一个属于你的账号"}</h1>
          <p className="text-xs text-foreground/60 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-glow" /> 你的数据 / 你的人设，只属于你
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-foreground/60">邮箱</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-foreground/5 border border-foreground/10 text-sm outline-none focus:border-amber-glow/50"
              placeholder="you@sylva.app"
            />
          </div>
          <div>
            <label className="text-xs text-foreground/60">密码</label>
            <div className="relative mt-1">
              <input
                type={showPwd ? "text" : "password"}
                required
                minLength={6}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-foreground/5 border border-foreground/10 text-sm outline-none focus:border-amber-glow/50"
                placeholder="至少 6 位"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                tabIndex={-1}
                className="absolute inset-y-0 right-2 flex items-center px-1 text-foreground/40 hover:text-foreground/80"
                title={showPwd ? "隐藏密码" : "显示密码"}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
              <p
                className={`mt-1 text-[11px] ${
                  pwdCheck.status === "ok"
                    ? "text-moss"
                    : pwdCheck.status === "checking"
                      ? "text-foreground/50"
                      : "text-destructive"
                }`}
              >
                {pwdCheck.status === "checking" ? "⏳ " : pwdCheck.status === "ok" ? "✓ " : "⚠ "}
                {pwdCheck.msg}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={busy || (mode === "signup" && (pwdCheck.status === "weak" || pwdCheck.status === "pwned" || pwdCheck.status === "checking"))}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-glow text-primary-foreground text-sm font-medium hover:brightness-110 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {mode === "signin" ? "登录" : "注册"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-[10px] text-foreground/40">
          <div className="flex-1 h-px bg-foreground/10" />
          或
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-foreground/5 border border-foreground/10 text-sm hover:bg-foreground/10 disabled:opacity-50 transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.3 5.2c-.5.4 6.4-4.7 6.4-14.8 0-1.3-.1-2.3-.4-3.5z"/></svg>
          用 Google 继续
        </button>

        <div className="text-xs text-center text-foreground/60">
          {mode === "signin" ? "还没有账号？" : "已经有账号？"}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="ml-1 text-amber-glow hover:underline"
          >
            {mode === "signin" ? "去注册" : "去登录"}
          </button>
        </div>

        <div className="text-[10px] text-center text-foreground/40">
          <Link to="/" className="hover:text-foreground">← 回到介绍页</Link>
        </div>
      </div>
    </main>
  );
}
