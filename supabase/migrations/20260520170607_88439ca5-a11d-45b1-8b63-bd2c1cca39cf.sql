-- 强化 canvas_documents 的访问控制
ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_documents FORCE ROW LEVEL SECURITY;

-- 撤销匿名 / public 角色对该表的任何直接权限
REVOKE ALL ON public.canvas_documents FROM anon;
REVOKE ALL ON public.canvas_documents FROM public;

-- 仅授予 authenticated 必要的 DML 权限（实际访问仍由 RLS 控制）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas_documents TO authenticated;

-- 防御性：确保 user_id 不可为空（避免 NULL 行绕过策略）
ALTER TABLE public.canvas_documents ALTER COLUMN user_id SET NOT NULL;

-- 索引：加速按用户 + 类型查询
CREATE INDEX IF NOT EXISTS canvas_documents_user_kind_idx
  ON public.canvas_documents (user_id, kind);