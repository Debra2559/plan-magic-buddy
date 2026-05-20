CREATE TABLE IF NOT EXISTS public.hackathon_settings (
  id text PRIMARY KEY DEFAULT 'singleton',
  enabled boolean NOT NULL DEFAULT true,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  scan_interval_hours integer NOT NULL DEFAULT 24,
  last_scanned_at timestamptz,
  last_scan_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hackathon_settings_singleton CHECK (id = 'singleton')
);

ALTER TABLE public.hackathon_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS hackathon_settings_updated_at ON public.hackathon_settings;
CREATE TRIGGER hackathon_settings_updated_at
BEFORE UPDATE ON public.hackathon_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hackathon_settings (id, sources)
VALUES (
  'singleton',
  '[
    {"name":"Devpost","query":"devpost hackathon register open","enabled":true},
    {"name":"Devpost","query":"site:devpost.com hackathon","enabled":true},
    {"name":"MLH","query":"mlh.io hackathon season","enabled":true},
    {"name":"DoraHacks","query":"dorahacks hackathon 报名","enabled":true},
    {"name":"DoraHacks","query":"site:dorahacks.io hackathon","enabled":true},
    {"name":"ETHGlobal","query":"ethglobal hackathon upcoming","enabled":true},
    {"name":"小红书","query":"小红书 黑客松 报名","enabled":true},
    {"name":"稀土掘金","query":"掘金 黑客松 2025 OR 2026","enabled":true},
    {"name":"微信公众号","query":"黑客松 报名 截止","enabled":true}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;