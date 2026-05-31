import { useRef, useState } from "react";
import { GitBranch, Plus, Trash2, Upload, Loader2, Check, Calendar, Clock, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useFollowUps, daysUntil, type FollowUp } from "@/lib/follow-ups";
import { extractTasksFromImage } from "@/lib/ocr-tasks.functions";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function FollowUpsPanel() {
  const { list, add, patch, remove } = useFollowUps();
  const extract = useServerFn(extractTasksFromImage);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Partial<FollowUp>>({});

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let added = 0;
      for (const f of Array.from(files).slice(0, 4)) {
        if (!f.type.startsWith("image/")) continue;
        const dataUrl = await fileToDataUrl(f);
        const res = await extract({ data: { imageDataUrl: dataUrl } });
        for (const t of res.tasks) {
          add({
            title: t.title,
            notes: t.notes,
            ddl: t.ddl,
            prerequisite: t.prerequisite,
            remindBeforeDays: t.remindBeforeDays ?? 3,
            intervalHours: 24,
            source: "ocr",
          });
          added++;
        }
      }
      toast.success(added > 0 ? `已识别 ${added} 条待办` : "图中未发现明确待办", {
        description: added > 0 ? "已加入条件提醒，可在下方调整" : undefined,
      });
    } catch (e) {
      toast.error("识别失败", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submitDraft = () => {
    if (!draft.title?.trim()) {
      toast.error("请先填写标题");
      return;
    }
    add({
      title: draft.title.trim(),
      prerequisite: draft.prerequisite?.trim() || undefined,
      ddl: draft.ddl || undefined,
      notes: draft.notes?.trim() || undefined,
      remindBeforeDays: draft.remindBeforeDays ?? 3,
      intervalHours: draft.intervalHours ?? 24,
      source: "manual",
    });
    setDraft({});
    toast.success("已添加条件提醒");
  };

  const pending = list.filter((f) => !f.done);
  const finished = list.filter((f) => f.done);

  return (
    <div className="space-y-4">
      {/* 上传截图识别 */}
      <div className="widget overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/70">
          <ImageIcon className="w-4 h-4 text-amber-glow" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground font-medium">从截图识别待办</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              上传聊天/通知/作业群截图，AI 会抽取要做的事 + DDL，自动建立条件提醒
            </div>
          </div>
        </div>
        <label
          className={`flex flex-col items-center justify-center gap-2 m-3 py-6 rounded-lg border border-dashed cursor-pointer transition ${
            busy ? "border-amber-glow/60 bg-amber-glow/10" : "border-border hover:border-amber-glow/60 hover:bg-amber-glow/5"
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="w-5 h-5 text-amber-glow animate-spin" />
              <span className="text-xs text-amber-glow">识别中…</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-foreground/60" />
              <span className="text-xs text-foreground/70">点击或拖拽图片（最多 4 张）</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {/* 手动新建 */}
      <div className="widget overflow-hidden">
        <div className="px-4 py-3 border-b border-border/70 flex items-center gap-2">
          <Plus className="w-4 h-4 text-amber-glow" />
          <div className="text-sm text-foreground font-medium">手动添加条件提醒</div>
        </div>
        <div className="p-3 space-y-2">
          <input
            value={draft.title ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="要做的事，例如：把毕业生登记表交档案"
            className="w-full text-sm bg-foreground/5 border border-border rounded-md px-3 py-2 outline-none focus:border-amber-glow"
          />
          <input
            value={draft.prerequisite ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, prerequisite: e.target.value }))}
            placeholder="（可选）依赖前置：例如 等老师签字之后"
            className="w-full text-sm bg-foreground/5 border border-border rounded-md px-3 py-2 outline-none focus:border-amber-glow"
          />
          <div className="flex gap-2 flex-wrap items-center">
            <label className="inline-flex items-center gap-1 text-xs text-foreground/70">
              <Calendar className="w-3 h-3" /> DDL
              <input
                type="date"
                value={draft.ddl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, ddl: e.target.value }))}
                className="bg-foreground/5 border border-border rounded-md px-2 py-1 font-mono text-xs outline-none focus:border-amber-glow"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-xs text-foreground/70">
              提前
              <input
                type="number"
                min={0}
                max={30}
                value={draft.remindBeforeDays ?? 3}
                onChange={(e) => setDraft((d) => ({ ...d, remindBeforeDays: Number(e.target.value) || 0 }))}
                className="w-14 bg-foreground/5 border border-border rounded-md px-2 py-1 text-xs outline-none focus:border-amber-glow"
              />
              天开始
            </label>
            <label className="inline-flex items-center gap-1 text-xs text-foreground/70">
              <Clock className="w-3 h-3" /> 每
              <input
                type="number"
                min={1}
                max={168}
                value={draft.intervalHours ?? 24}
                onChange={(e) => setDraft((d) => ({ ...d, intervalHours: Number(e.target.value) || 24 }))}
                className="w-14 bg-foreground/5 border border-border rounded-md px-2 py-1 text-xs outline-none focus:border-amber-glow"
              />
              小时问一次
            </label>
            <button
              onClick={submitDraft}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-amber-glow/25 border border-amber-glow/60 text-foreground hover:bg-amber-glow/40 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 添加
            </button>
          </div>
        </div>
      </div>

      {/* 进行中 */}
      <div className="widget overflow-hidden">
        <div className="px-4 py-3 border-b border-border/70 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-glow" />
          <div className="text-sm text-foreground font-medium">进行中 ({pending.length})</div>
        </div>
        {pending.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">还没有条件提醒</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {pending.map((f) => (
              <FollowUpRow key={f.id} f={f} onPatch={(p) => patch(f.id, p)} onRemove={() => remove(f.id)} />
            ))}
          </ul>
        )}
      </div>

      {finished.length > 0 && (
        <div className="widget overflow-hidden opacity-70">
          <div className="px-4 py-2 border-b border-border/60 text-xs text-muted-foreground">已完成 ({finished.length})</div>
          <ul className="divide-y divide-border/40">
            {finished.slice(0, 8).map((f) => (
              <li key={f.id} className="flex items-center px-4 py-2 gap-2">
                <Check className="w-3 h-3 text-amber-glow shrink-0" />
                <span className="flex-1 text-xs text-foreground/60 truncate line-through">{f.title}</span>
                <button onClick={() => remove(f.id)} className="text-foreground/30 hover:text-red-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FollowUpRow({
  f, onPatch, onRemove,
}: {
  f: FollowUp;
  onPatch: (p: Partial<FollowUp>) => void;
  onRemove: () => void;
}) {
  const left = daysUntil(f.ddl);
  return (
    <li className="px-4 py-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <button
          onClick={() => onPatch({ done: true })}
          title="标记完成"
          className="mt-0.5 w-4 h-4 rounded border border-border hover:border-amber-glow hover:bg-amber-glow/20 shrink-0 transition"
        />
        <div className="flex-1 min-w-0">
          <input
            value={f.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="w-full text-sm text-foreground bg-transparent outline-none"
          />
          {f.prerequisite && (
            <div className="text-xs text-muted-foreground mt-0.5">前置：{f.prerequisite}</div>
          )}
          {f.notes && (
            <div className="text-[11px] text-foreground/50 mt-0.5 whitespace-pre-wrap line-clamp-2">{f.notes}</div>
          )}
        </div>
        <button onClick={onRemove} className="text-foreground/30 hover:text-red-400 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 pl-6 items-center text-[11px] text-foreground/60">
        <label className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" /> DDL
          <input
            type="date"
            value={f.ddl ?? ""}
            onChange={(e) => onPatch({ ddl: e.target.value || undefined })}
            className="bg-foreground/5 border border-border rounded px-1.5 py-0.5 font-mono outline-none focus:border-amber-glow"
          />
        </label>
        {f.ddl && left !== null && (
          <span className={left < 0 ? "text-red-400" : left <= f.remindBeforeDays ? "text-amber-glow" : ""}>
            {left < 0 ? `逾期 ${-left} 天` : left === 0 ? "今天到期" : `还剩 ${left} 天`}
          </span>
        )}
        <label className="inline-flex items-center gap-1">
          提前
          <input
            type="number" min={0} max={30}
            value={f.remindBeforeDays}
            onChange={(e) => onPatch({ remindBeforeDays: Number(e.target.value) || 0 })}
            className="w-12 bg-foreground/5 border border-border rounded px-1.5 py-0.5 outline-none focus:border-amber-glow"
          />
          天
        </label>
        <label className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> 每
          <input
            type="number" min={1} max={168}
            value={f.intervalHours}
            onChange={(e) => onPatch({ intervalHours: Number(e.target.value) || 24 })}
            className="w-12 bg-foreground/5 border border-border rounded px-1.5 py-0.5 outline-none focus:border-amber-glow"
          />
          h
        </label>
        {f.snoozeUntil && f.snoozeUntil > Date.now() && (
          <span className="text-foreground/40">
            暂停到 {new Date(f.snoozeUntil).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "2-digit", day: "2-digit" })}
            <button onClick={() => onPatch({ snoozeUntil: undefined })} className="ml-1 underline hover:text-foreground">取消</button>
          </span>
        )}
        {f.source === "ocr" && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-glow/15 text-amber-glow">截图识别</span>}
      </div>
    </li>
  );
}
