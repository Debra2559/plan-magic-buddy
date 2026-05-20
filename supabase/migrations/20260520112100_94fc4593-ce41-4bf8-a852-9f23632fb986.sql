update ai_news_settings set sources = '[
  {"name":"Hacker News","query":"hacker news AI OR LLM OR agent","enabled":true},
  {"name":"TechCrunch","query":"techcrunch AI OpenAI Anthropic DeepMind","enabled":true},
  {"name":"The Verge","query":"the verge AI model release","enabled":true},
  {"name":"arXiv","query":"arxiv large language model agent reasoning","enabled":true},
  {"name":"机器之心","query":"机器之心 AI 大模型","enabled":true},
  {"name":"量子位","query":"量子位 AI 大模型 发布","enabled":true}
]'::jsonb, time_window='qdr:m', last_scanned_at=null where id='singleton';