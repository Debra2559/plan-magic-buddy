import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { extractExpensesFromImage } from "@/lib/expense-import.functions";
import { EXPENSE_CATEGORIES, yuanToFen, type Expense } from "@/lib/expenses";
import { fileToCompressedDataURL } from "@/components/ImageAttacher";
import { X, Upload, Loader2, ScanLine, Trash2, Check } from "lucide-react";

type Draft = Omit<Expense, "id" | "createdAt"> & { _key: string };

interface Props {
  onClose: () => void;
  onImport: (rows: Omit<Expense, "id" | "createdAt">[]) => Promise<number>;
}

export function ExpenseImportDialog({ onClose, onImport }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [scanning, setScanning] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractExpensesFromImage);

  const pickFile = async (file: File) => {
    setError(null);
    // 长截图保留更高分辨率以便 OCR
    const url = await fileToCompressedDataURL(file, 1800, 0.85);
    setImageUrl(url);
    setDrafts([]);
  };

  const scan = async () => {
    if (!imageUrl) return;
    setScanning(true); setError(null);
    try {
      const { expenses } = await extract({ data: { imageDataUrl: imageUrl, hint: hint.trim() || undefined } });
      setDrafts(expenses.map((e, i) => ({
        amount: yuanToFen(e.amount),
        category: e.category,
        note: e.note,
        date: e.date,
        paymentMethod: e.paymentMethod,
        _key: `${Date.now()}-${i}`,
      })));
      if (expenses.length === 0) setError("没识别到支出。换张更清晰的截图试试？");
    } catch (e: any) {
      setError(e?.message ?? "识别失败");
    } finally {
      setScanning(false);
    }
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((xs) => xs.map((d) => d._key === key ? { ...d, ...patch } : d));
  };
  const removeDraft = (key: string) => setDrafts((xs) => xs.filter((d) => d._key !== key));

  const doImport = async () => {
    if (drafts.length === 0) return;
    setImporting(true);
    const n = await onImport(drafts.map(({ _key, ...rest }) => rest));
    setImporting(false);
    if (n > 0) onClose();
  };

  const total = drafts.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-zinc-950 border border-amber-glow/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-amber-glow" />
            <h3 className="font-display text-lg text-foreground">从截图导入账单</h3>
            <span className="text-[10px] text-muted-foreground tracking-wider">微信 / 支付宝 / 银行长截图</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 grid md:grid-cols-2 gap-4">
          {/* Left: image + scan */}
          <div className="space-y-3">
            <div
              className="rounded-lg border-2 border-dashed border-border bg-foreground/[0.03] aspect-[3/4] flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-amber-glow/50"
              onClick={() => fileRef.current?.click()}
              onPaste={(e) => {
                const f = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"))?.getAsFile();
                if (f) void pickFile(f);
              }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="截图" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                  <Upload className="w-6 h-6" />
                  <span>点击选择 / 粘贴 / 拖入长截图</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); }}
              />
            </div>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="可选：补充提示（如「这是 11 月的支付宝账单」）"
              className="w-full bg-foreground/5 border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-amber-glow/60 focus:outline-none"
            />
            <button
              onClick={scan}
              disabled={!imageUrl || scanning}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-amber-glow text-background text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {scanning ? <><Loader2 className="w-4 h-4 animate-spin" /> 识别中…</> : <><ScanLine className="w-4 h-4" /> 开始识别</>}
            </button>
            {error && <p className="text-xs text-rose-300">{error}</p>}
          </div>

          {/* Right: drafts */}
          <div className="space-y-2 min-h-[300px]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-widest text-amber-glow">识别结果 · {drafts.length} 条</span>
              {drafts.length > 0 && (
                <span className="text-xs font-mono text-muted-foreground">合计 ¥ {(total / 100).toFixed(2)}</span>
              )}
            </div>
            {drafts.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground/60 text-xs border border-dashed border-border rounded-lg">
                上传截图后点「开始识别」
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-auto pr-1">
                {drafts.map((d) => (
                  <div key={d._key} className="group flex items-center gap-1.5 p-2 rounded-lg bg-foreground/[0.04] border border-white/[0.06]">
                    <input
                      type="date"
                      value={d.date}
                      onChange={(e) => updateDraft(d._key, { date: e.target.value })}
                      className="bg-transparent border-b border-border text-[10px] text-muted-foreground focus:outline-none focus:border-amber-glow w-[88px]"
                    />
                    <select
                      value={d.category}
                      onChange={(e) => updateDraft(d._key, { category: e.target.value })}
                      className="bg-foreground/5 border border-border rounded px-1 py-0.5 text-[11px] text-foreground"
                    >
                      {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                      value={d.note ?? ""}
                      onChange={(e) => updateDraft(d._key, { note: e.target.value })}
                      placeholder="备注"
                      className="flex-1 min-w-0 bg-transparent border-b border-border text-xs text-foreground focus:outline-none focus:border-amber-glow"
                    />
                    <span className="text-[10px] text-muted-foreground">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      value={(d.amount / 100).toFixed(2)}
                      onChange={(e) => updateDraft(d._key, { amount: yuanToFen(e.target.value) })}
                      className="w-20 bg-foreground/5 border border-border rounded px-1 py-0.5 text-xs font-mono text-right text-foreground"
                    />
                    <button
                      onClick={() => removeDraft(d._key)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border/60">
          <button onClick={onClose} className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-border text-foreground/75 hover:bg-foreground/10">
            取消
          </button>
          <button
            onClick={doImport}
            disabled={drafts.length === 0 || importing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
          >
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            导入 {drafts.length} 条
          </button>
        </div>
      </div>
    </div>
  );
}
