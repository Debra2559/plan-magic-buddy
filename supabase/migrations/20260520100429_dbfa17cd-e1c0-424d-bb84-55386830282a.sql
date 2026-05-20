
CREATE TABLE IF NOT EXISTS public.ai_news_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  enabled BOOLEAN NOT NULL DEFAULT true,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  include_keywords TEXT[] NOT NULL DEFAULT '{}',
  exclude_keywords TEXT[] NOT NULL DEFAULT '{}',
  tag_filters TEXT[] NOT NULL DEFAULT '{}',
  scan_interval_hours INTEGER NOT NULL DEFAULT 24,
  time_window TEXT NOT NULL DEFAULT 'qdr:w',
  per_source_limit INTEGER NOT NULL DEFAULT 6,
  last_scanned_at TIMESTAMPTZ,
  last_scan_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_news_settings_singleton CHECK (id = 'singleton')
);

CREATE TRIGGER ai_news_settings_updated_at
BEFORE UPDATE ON public.ai_news_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_news_settings (id, sources)
VALUES (
  'singleton',
  '[
    {"name":"Hacker News","query":"site:news.ycombinator.com AI OR LLM OR agent","enabled":true},
    {"name":"TechCrunch","query":"site:techcrunch.com AI OR OpenAI OR Anthropic OR Google DeepMind","enabled":true},
    {"name":"The Verge","query":"site:theverge.com AI model release","enabled":true},
    {"name":"arXiv","query":"site:arxiv.org large language model OR agent OR reasoning","enabled":true},
    {"name":"机器之心","query":"site:jiqizhixin.com AI 大模型","enabled":true},
    {"name":"量子位","query":"site:qbitai.com AI 大模型 发布","enabled":true}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
