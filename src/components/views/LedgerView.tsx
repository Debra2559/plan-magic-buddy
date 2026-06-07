import { useMemo, useState } from "react";
import { useExpenses, useBudgets, EXPENSE_CATEGORIES, fenToYuan, yuanToFen, currentMonth, type Expense } from "@/lib/expenses";
import { Wallet, Plus, Trash2, AlertTriangle, TrendingUp, Pencil, Check, X, ScanLine } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { ExpenseImportDialog } from "@/components/ExpenseImportDialog";

const CAT_COLORS: Record<string, string> = {
  餐饮: "#f59e0b", 交通: "#06b6d4", 购物: "#ec4899", 娱乐: "#a78bfa",
  居住: "#84cc16", 医疗: "#ef4444", 学习: "#3b82f6", 人情: "#f97316", 其他: "#94a3b8",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LedgerView() {
  const { items, add, addMany, remove, update } = useExpenses();
  const { items: budgets, setBudget } = useBudgets();
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState<"流水" | "图表" | "预算">("流水");
  const [importing, setImporting] = useState(false);

  // 录入
  const [amountStr, setAmountStr] = useState("");
  const [category, setCategory] = useState<string>("餐饮");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");

  const monthItems = useMemo(() => items.filter((i) => i.date.startsWith(month)), [items, month]);
  const totalFen = monthItems.reduce((s, i) => s + i.amount, 0);

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of monthItems) m[i.category] = (m[i.category] ?? 0) + i.amount;
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthItems]);

  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of monthItems) m[i.date] = (m[i.date] ?? 0) + i.amount;
    return Object.entries(m).map(([date, amount]) => ({ date: date.slice(8, 10), amount: amount / 100 })).sort((a, b) => +a.date - +b.date);
  }, [monthItems]);

  const totalBudget = budgets.find((b) => b.month === month && b.category === null);
  const catBudgets = budgets.filter((b) => b.month === month && b.category !== null);

  const grouped = useMemo(() => {
    const g: Record<string, Expense[]> = {};
    for (const i of monthItems) (g[i.date] ||= []).push(i);
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthItems]);

  const submit = async () => {
    const fen = yuanToFen(amountStr);
    if (fen <= 0) return;
    await add({ amount: fen, category, date, note: note.trim() || undefined });
    setAmountStr(""); setNote("");
  };

  return (
    <div className="p-7 overflow-auto h-full">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1 flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> 记账
          </p>
          <h2 className="font-display text-3xl text-foreground">
            ¥ {fenToYuan(totalFen)}
            <span className="text-sm text-muted-foreground ml-2">本月</span>
          </h2>
          {totalBudget && (
            <BudgetBar used={totalFen} budget={totalBudget.amount} label="总预算" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImporting(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-glow/15 border border-amber-glow/40 text-amber-glow text-xs hover:bg-amber-glow/25"
            title="从微信 / 支付宝长截图识别并批量导入"
          >
            <ScanLine className="w-3 h-3" /> 截图导入
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-foreground/5 border border-border rounded-md px-2 py-1 text-xs text-foreground"
          />
          <div className="flex gap-1 p-1 rounded-lg bg-foreground/5">
            {(["流水", "图表", "预算"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs rounded-md ${tab === t ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 快速录入 */}
      <div className="rounded-xl border border-border bg-foreground/[0.04] p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-amber-glow">
          <span className="font-mono">¥</span>
          <input
            type="number" inputMode="decimal" step="0.01" placeholder="0.00"
            value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-24 bg-transparent border-b border-border text-lg font-mono text-foreground focus:outline-none focus:border-amber-glow"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-foreground/5 border border-border rounded-md px-2 py-1.5 text-xs text-foreground">
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="bg-foreground/5 border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
        <input
          placeholder="备注（可选）"
          value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 min-w-[120px] bg-foreground/5 border border-border rounded-md px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50"
        />
        <button onClick={submit}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-glow text-background text-xs font-medium hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> 记一笔
        </button>
      </div>

      {tab === "流水" && (
        <div className="space-y-5">
          {grouped.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground/70 text-sm">本月还没有支出</div>
          ) : grouped.map(([d, list]) => {
            const dayTotal = list.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={d}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-amber-glow text-sm">{d}</h3>
                  <span className="text-xs font-mono text-muted-foreground">¥ {fenToYuan(dayTotal)}</span>
                </div>
                <div className="space-y-1">
                  {list.map((e) => (
                    <ExpenseRow key={e.id} e={e} onDelete={() => remove(e.id)} onUpdate={(p) => update(e.id, p)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "图表" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-foreground/[0.04] p-4">
            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> 分类占比</div>
            {byCategory.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {byCategory.map((entry) => (
                        <Cell key={entry.name} fill={CAT_COLORS[entry.name] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => `¥ ${fenToYuan(v as number)}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 space-y-1">
              {byCategory.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[c.name] ?? "#94a3b8" }} />
                    {c.name}
                  </span>
                  <span className="font-mono text-muted-foreground">¥ {fenToYuan(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-foreground/[0.04] p-4">
            <div className="text-xs text-muted-foreground mb-3">每日支出</div>
            {byDay.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={byDay}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => `¥ ${(v as number).toFixed(2)}`}
                    />
                    <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "预算" && (
        <div className="space-y-3 max-w-xl">
          <BudgetEditor
            label="总预算"
            month={month}
            category={null}
            current={totalBudget?.amount}
            used={totalFen}
            onSave={(amt) => setBudget(month, null, amt)}
          />
          <div className="text-[10px] tracking-widest text-muted-foreground mt-5">分类预算</div>
          {EXPENSE_CATEGORIES.map((c) => {
            const b = catBudgets.find((x) => x.category === c);
            const used = monthItems.filter((i) => i.category === c).reduce((s, i) => s + i.amount, 0);
            return (
              <BudgetEditor
                key={c}
                label={c}
                month={month}
                category={c}
                current={b?.amount}
                used={used}
                onSave={(amt) => setBudget(month, c, amt)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ e, onDelete, onUpdate }: { e: Expense; onDelete: () => void; onUpdate: (p: Partial<Expense>) => void }) {
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState(fenToYuan(e.amount));
  const [note, setNote] = useState(e.note ?? "");
  const [cat, setCat] = useState(e.category);

  const save = () => {
    onUpdate({ amount: yuanToFen(amt), note: note || undefined, category: cat });
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-lg bg-foreground/[0.03] border border-white/[0.06] hover:border-border">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[e.category] ?? "#94a3b8" }} />
      {editing ? (
        <>
          <select value={cat} onChange={(ev) => setCat(ev.target.value)} className="bg-foreground/5 border border-border rounded px-1.5 py-0.5 text-xs">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="备注"
            className="flex-1 bg-foreground/5 border border-border rounded px-2 py-0.5 text-xs" />
          <input value={amt} onChange={(ev) => setAmt(ev.target.value)} type="number" step="0.01"
            className="w-20 bg-foreground/5 border border-border rounded px-2 py-0.5 text-xs font-mono text-right" />
          <button onClick={save} className="text-moss hover:text-moss/80 p-1"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(false)} className="text-muted-foreground p-1"><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <>
          <span className="text-xs text-foreground w-12 shrink-0">{e.category}</span>
          <span className="flex-1 text-xs text-muted-foreground truncate">{e.note || "—"}</span>
          <span className="font-mono text-sm text-foreground">¥ {fenToYuan(e.amount)}</span>
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}

function BudgetBar({ used, budget, label }: { used: number; budget: number; label: string }) {
  const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
  const over = used > budget;
  return (
    <div className="mt-2 w-64">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">{label} ¥{fenToYuan(used)} / ¥{fenToYuan(budget)}</span>
        {over && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="w-2.5 h-2.5" />超支</span>}
      </div>
      <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
        <div className={`h-full ${over ? "bg-destructive" : pct > 80 ? "bg-amber-glow" : "bg-moss"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BudgetEditor({ label, month: _month, category: _category, current, used, onSave }: {
  label: string; month: string; category: string | null; current?: number; used: number; onSave: (amt: number) => void;
}) {
  const [val, setVal] = useState(current ? fenToYuan(current) : "");
  const has = !!current;
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.04] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">¥</span>
          <input
            type="number" step="0.01" placeholder="未设置"
            value={val} onChange={(e) => setVal(e.target.value)}
            className="w-24 bg-foreground/5 border border-border rounded px-2 py-0.5 text-xs font-mono text-right" />
          <button onClick={() => { const f = yuanToFen(val); if (f > 0) onSave(f); }}
            className="text-xs px-2 py-0.5 rounded bg-amber-glow/20 text-amber-glow hover:bg-amber-glow/30">保存</button>
        </div>
      </div>
      {has && current && <BudgetBar used={used} budget={current} label="" />}
    </div>
  );
}
