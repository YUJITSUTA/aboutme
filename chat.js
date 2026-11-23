// Netlify Function: relays chat messages to the Anthropic API.
// Set ANTHROPIC_API_KEY in Netlify > Site configuration > Environment variables.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

exports.handler = async (event) => {
  const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Missing ANTHROPIC_API_KEY' });

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }

  // Keep only the last 10 well-formed messages, starting with a user turn.
  let msgs = (Array.isArray(data.messages) ? data.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-10);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json(400, { error: 'No user message' });

  const system = String(data.context || 'You are a helpful assistant.').slice(0, 3000);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: msgs })
    });
    const out = await r.json();
    if (!r.ok) return json(502, { error: out.error?.message || 'Anthropic API error' });
    const reply = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return json(200, { reply });
  } catch (e) {
    return json(502, { error: 'Request failed' });
  }
};
