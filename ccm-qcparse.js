// 08 QC Parse — unpack EACH gpt-5 quality-control response (choices[0].message.content) into {score, verdict, critique}.
const out = [];
for (const item of $input.all()) {
  let qc = {};
  try {
    const j = item.json;
    const raw = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || j.response || '{}';
    qc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    qc = { score: 0, verdict: 'reject', critique: 'QC response unparseable: ' + String(e.message).substring(0, 100) };
  }
  out.push({ json: { score: typeof qc.score === 'number' ? qc.score : 0, subs: qc.subs || {}, verdict: qc.verdict || 'reject', critique: qc.critique || '' } });
}
return out;
