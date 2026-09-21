// Tech topic brain: daily.dev trends -> video topic bank for the tech explainer channel
// Runs after the morning digest. Scores articles for explainer-video value, keeps the
// best ones in state/tech-topic-bank.json (committed back by the workflow), and pushes
// new ideas to the phone. Render stays manual: quarry-render tech-video.yml takes `topic`.
import fs from 'fs';

const API = 'https://api.daily.dev/public/v1';
const BANK_FILE = 'state/tech-topic-bank.json';
const FEEDS = ['/feeds/tag/webdev', '/feeds/tag/programming', '/feeds/tag/ai'];
const BANK_CAP = 20;          // max open ideas kept in the bank
const MIN_SCORE = 10;         // quality gate for entering the bank
const NOTIFY_TOP = 3;         // ideas shown in the phone message

function log(m) { console.log('[topics] ' + m); }

function cleanTitle(t) {
  return String(t).split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 140);
}

// Evergreen explainer material vs one-day news chatter
const EVERGREEN = /\b(how|why|what happens|guide|explained|explain|architecture|deep dive|inside|mistake|vs\.?|actually|truth|stop|myth|works? under|under the hood)\b/i;
const NEWSY = /\b(launch|releas(e|es|ed)|announc|break|rais(e|ed|ing)|acquir|funding|layoff|shut ?down|dies|gains?\s\d+%)|hackaday links/i;
const SOCIAL_URL = /x\.com|twitter\.com|reddit\.com/i;

function scorePost(p) {
  const title = cleanTitle(p.title);
  let s = (p.numUpvotes || 0) + 3 * (p.numComments || 0);
  if (EVERGREEN.test(title)) s += 5;
  if (SOCIAL_URL.test(p.url || '')) s -= 8;
  if (NEWSY.test(title)) s -= 5;
  if (p.readTime && p.readTime > 25) s -= 5; // too long for one explainer
  return s;
}

async function fetchFeed(pathname) {
  const token = (process.env.DAILY_DEV_TOKEN || '').trim();
  if (!token) throw new Error('no DAILY_DEV_TOKEN');
  const res = await fetch(API + pathname, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error(pathname + ' HTTP ' + res.status);
  const json = await res.json();
  const raw = Array.isArray(json.data) ? json.data : ((json.data && json.data.edges) ? json.data.edges.map(e => e.node || e) : []);
  return raw.filter(p => p && p.title && p.url);
}

function loadBank() {
  try {
    const b = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
    if (Array.isArray(b.topics)) return b;
  } catch (e) { /* first run */ }
  return { updated: null, topics: [] };
}

function sameTopic(a, b) {
  if (a.id && a.id === b.id) return true;
  const x = cleanTitle(a.title).toLowerCase();
  const y = cleanTitle(b.title).toLowerCase();
  return x.length > 20 && y.length > 20 && (x.includes(y) || y.includes(x));
}

async function main() {
  log('Fetching topic feeds...');
  const candidates = new Map(); // id -> post
  const feedErrors = [];
  for (const f of FEEDS) {
    try {
      const posts = await fetchFeed(f + '?limit=15');
      log(f + ': ' + posts.length + ' posts');
      for (const p of posts) if (!candidates.has(p.id)) candidates.set(p.id, p);
    } catch (e) { feedErrors.push(f + ': ' + e.message); }
  }
  if (!candidates.size) {
    log('FAIL: all feeds failed — ' + feedErrors.join(' | '));
    process.exit(1);
  }

  const bank = loadBank();
  const fresh = [...candidates.values()]
    .map(p => ({ post: p, score: scorePost(p) }))
    .filter(x => x.score >= MIN_SCORE)
    .filter(x => !bank.topics.some(t => sameTopic(t, x.post)))
    .sort((a, b) => b.score - a.score);

  const today = new Date().toISOString().slice(0, 10);
  const added = fresh.map(x => ({
    id: x.post.id,
    title: cleanTitle(x.post.title),
    url: x.post.url,
    source: (x.post.source && x.post.source.name) || '',
    tags: x.post.tags || [],
    score: x.score,
    addedAt: today,
    status: 'new'
  }));
  bank.topics.push(...added);

  // Prune: used topics leave the bank at once; open ideas capped at BANK_CAP (oldest dropped)
  const open = bank.topics.filter(t => t.status !== 'used');
  const used = bank.topics.filter(t => t.status === 'used');
  bank.topics = open.sort((a, b) => (b.score - a.score) || (b.addedAt > a.addedAt ? 1 : -1)).slice(0, BANK_CAP).concat(used);
  bank.updated = new Date().toISOString();

  fs.mkdirSync('state', { recursive: true });
  fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
  log('Bank: ' + open.length + ' open ideas, +' + added.length + ' new today, ' + used.length + ' used so far');
  if (feedErrors.length) log('GAP: some feeds failed — ' + feedErrors.join(' | '));

  if (!added.length) { log('No new topic-worthy ideas today'); return; }

  const top = added.slice(0, NOTIFY_TOP);
  const body = top.map((t, i) => (i + 1) + '. [' + t.score + '] ' + t.title + '\n   ' + t.url).join('\n\n');
  console.log('[topics] New ideas:\n' + body);

  const topic = (process.env.NTFY_TOPIC || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!topic) { log('GAP: no NTFY_TOPIC — ideas not pushed to phone'); return; }
  const res = await fetch('https://ntfy.sh/' + topic, {
    method: 'POST',
    headers: {
      'Title': 'Tech video ideas - ' + added.length + ' new (top ' + top.length + ')',
      'Tags': 'clapper'
    },
    body: body
  });
  if (res.ok) log('NTFY: ideas sent to phone OK');
  else { log('FAIL: NTFY HTTP ' + res.status); process.exit(1); }
}

main().catch(e => { log('FAIL: ' + e.message); process.exit(1); });
