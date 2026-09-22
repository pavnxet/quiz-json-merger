export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 🌐 Web Routes
    if (url.pathname === '/') return new Response(HTML_TEMPLATE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/manifest.json') return new Response(MANIFEST_JSON, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    if (url.pathname === '/sw.js') return new Response(SERVICE_WORKER_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });

    // 📤 Web Upload Endpoint
    if (url.pathname === '/upload' && request.method === 'POST') return handleWebUpload(request);

    // 🤖 Telegram Webhook
    if (url.pathname === '/webhook' && request.method === 'POST') return handleTelegramWebhook(request, env, ctx);
    if (url.pathname === '/setup-webhook') return handleSetupWebhook(request, env);

    return new Response('Not Found', { status: 404 });
  }
};

// 🔧 EXTRACTION HELPER (JSON OR STANDALONE HTML)
function extractQuizObject(content, filename) {
  if (!content) return null;
  const trimmed = content.trim();

  // 1. Direct JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Fall through to HTML search if parsing fails
    }
  }

  // 2. Embedded <script id="quiz-data"> in HTML
  const match = trimmed.match(/<script[^>]*id=["']quiz-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      throw new Error(`Found <script id="quiz-data"> in ${filename || 'file'}, but JSON is invalid: ${e.message}`);
    }
  }

  // 3. Fallback broad regex for schema_version + questions
  const broadMatch = trimmed.match(/\{[\s\r\n]*"schema_version"[\s\S]*"questions"[\s\S]*\}/i);
  if (broadMatch) {
    try {
      return JSON.parse(broadMatch[0]);
    } catch (e) {}
  }

  return JSON.parse(trimmed);
}

// 🔧 REUSABLE MERGE LOGIC (LEGACY FLAT ARRAY MODE & COMPILER V1.0 SCHEMA MODE)
function mergeJsonFiles(fileContents, options = {}) {
  const compilerMode = options.compilerMode !== false; // Default to true if not explicitly false

  if (compilerMode) {
    return mergeStandardQuizJson(fileContents);
  } else {
    return mergeLegacyFlatArray(fileContents);
  }
}

// Mode A: Legacy Flat Array [...]
function mergeLegacyFlatArray(fileContents) {
  const allQuestions = [];
  const stats = [];
  for (const { name, content } of fileContents) {
    try {
      const parsed = extractQuizObject(content, name);
      let count = 0;
      if (Array.isArray(parsed)) {
        count = parsed.length;
        allQuestions.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.questions)) {
          count = parsed.questions.length;
          allQuestions.push(...parsed.questions);
        } else {
          count = 1;
          allQuestions.push(parsed);
        }
      }
      stats.push({ file: name || 'upload', count, passages: 0 });
    } catch (e) {
      throw new Error(`Invalid content in ${name || 'unknown'}: ${e.message}`);
    }
  }
  if (allQuestions.length === 0) throw new Error('No valid questions found');
  return {
    merged: JSON.stringify(allQuestions, null, 2),
    total: allQuestions.length,
    totalPassages: 0,
    stats,
    isStandard: false
  };
}

// Mode B: Quiz HTML Compiler Compatible (Schema v1.0 with quiz meta & passages)
function mergeStandardQuizJson(fileContents) {
  let primaryQuiz = {
    title: 'Combined Mock Examination',
    exam_name: 'Competitive Examination',
    test_number: 1,
    duration_minutes: 60,
    marks_per_question: 2,
    negative_marking: {
      enabled: true,
      marks_per_wrong: 0.67
    }
  };

  const distinctTitles = [];
  const passagesMap = {};
  const allQuestions = [];
  let totalDuration = 0;
  let foundMeta = false;
  const stats = [];

  fileContents.forEach(({ name, content }, fileIdx) => {
    let parsed;
    try {
      parsed = extractQuizObject(content, name);
    } catch (e) {
      throw new Error(`Error parsing ${name || 'file'}: ${e.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`File ${name || fileIdx + 1} does not contain valid quiz data.`);
    }

    let fileTopic = '';

    // Extract Quiz Metadata
    if (parsed.quiz && typeof parsed.quiz === 'object') {
      if (!foundMeta) {
        primaryQuiz = JSON.parse(JSON.stringify(parsed.quiz));
        foundMeta = true;
      }
      if (parsed.quiz.title && parsed.quiz.title !== 'Combined Mock Examination' && parsed.quiz.title !== 'Untitled Quiz') {
        if (!distinctTitles.includes(parsed.quiz.title)) distinctTitles.push(parsed.quiz.title);
        fileTopic = parsed.quiz.title;
      }
      if (parsed.quiz.topic && typeof parsed.quiz.topic === 'string') {
        fileTopic = parsed.quiz.topic;
      } else if (parsed.quiz.subject && typeof parsed.quiz.subject === 'string') {
        fileTopic = parsed.quiz.subject;
      }
      if (typeof parsed.quiz.duration_minutes === 'number') {
        totalDuration += parsed.quiz.duration_minutes;
      }
    }

    if (!fileTopic) {
      fileTopic = (name || `File ${fileIdx + 1}`).replace(/\.[^/.]+$/, '');
    }

    // Extract Passages
    let filePassagesCount = 0;
    if (Array.isArray(parsed.passages)) {
      parsed.passages.forEach(p => {
        if (p && p.id && !passagesMap[p.id]) {
          passagesMap[p.id] = p;
          filePassagesCount++;
        }
      });
    }

    // Extract Questions
    let qList = [];
    if (Array.isArray(parsed.questions)) {
      qList = parsed.questions;
    } else if (Array.isArray(parsed)) {
      qList = parsed;
    }

    qList.forEach(q => {
      if (q && typeof q === 'object') {
        const qClone = JSON.parse(JSON.stringify(q));
        if (!qClone.subject || qClone.subject === 'General' || qClone.subject === 'Untitled') {
          qClone.subject = fileTopic;
        }
        allQuestions.push(qClone);
      }
    });

    stats.push({ file: name || 'upload', count: qList.length, passages: filePassagesCount });
  });

  if (allQuestions.length === 0) throw new Error('No valid questions found in files');

  if (distinctTitles.length > 1) {
    primaryQuiz.title = 'Combined Quiz: ' + distinctTitles.join(' + ');
  } else if (distinctTitles.length === 1) {
    primaryQuiz.title = distinctTitles[0];
  }

  if (totalDuration > 0) {
    primaryQuiz.duration_minutes = totalDuration;
  }

  // Renumber questions sequentially
  let seenNumbers = {};
  let hasNumberCollision = false;
  for (const q of allQuestions) {
    const num = q.question_number;
    if (!num || seenNumbers[num]) {
      hasNumberCollision = true;
      break;
    }
    seenNumbers[num] = true;
  }

  allQuestions.forEach((q, i) => {
    if (hasNumberCollision || !q.question_number) {
      q.question_number = i + 1;
    }
  });

  primaryQuiz.total_questions = allQuestions.length;
  const mergedPassages = Object.values(passagesMap);

  const mergedResult = {
    schema_version: '1.0',
    quiz: primaryQuiz,
    questions: allQuestions
  };

  if (mergedPassages.length > 0) {
    mergedResult.passages = mergedPassages;
  }

  return {
    merged: JSON.stringify(mergedResult, null, 2),
    total: allQuestions.length,
    totalPassages: mergedPassages.length,
    stats,
    isStandard: true
  };
}

// 🌐 WEB UPLOAD HANDLER
async function handleWebUpload(request) {
  try {
    const formData = await request.formData();
    const files = [];
    for (const [key, value] of formData.entries()) if (key === 'files') files.push(value);
    if (files.length === 0) return new Response('No files uploaded', { status: 400 });

    const customName = formData.get('filename')?.trim() || 'merged';
    const safeName = customName.replace(/[^a-zA-Z0-9_\-\.]/g, '_') || 'merged';
    const fileName = safeName.endsWith('.json') ? safeName : `${safeName}.json`;

    // Check compiler compatibility toggle (default: true)
    const compilerModeRaw = formData.get('compiler_mode');
    const compilerMode = compilerModeRaw === null || compilerModeRaw === '1' || compilerModeRaw === 'true' || compilerModeRaw === 'on';

    const fileContents = await Promise.all(files.map(async f => ({ name: f.name, content: await f.text() })));
    const { merged, total, totalPassages, stats, isStandard } = mergeJsonFiles(fileContents, { compilerMode });
    const blob = new Blob([merged], { type: 'application/json' });
    
    return new Response(blob, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Merge-Stats': JSON.stringify({ files: stats, total, totalPassages, isStandard })
      }
    });
  } catch (e) { return new Response(`Error: ${e.message}`, { status: 400 }); }
}

// 🤖 TELEGRAM HANDLER (STATEFUL FILE COLLECTION)
async function handleTelegramWebhook(request, env, ctx) {
  let update;
  try { update = await request.json(); } catch { return new Response('ok'); }
  const msg = update.message;
  if (!msg) return new Response('ok');

  // 🔑 CRITICAL: Respond 200 OK immediately to stop Telegram retries
  ctx.waitUntil(
    processTelegramMessage(msg, env).catch(err => console.error('[TG] Background error:', err))
  );
  return new Response('ok');
}

async function processTelegramMessage(msg, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.PENDING_FILES) {
    console.error('[TG] Missing TELEGRAM_BOT_TOKEN or PENDING_FILES binding');
    return;
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = msg.chat.id.toString();
  const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

  try {
    let session = await env.PENDING_FILES.get(chatId, { type: 'json' }) || { files: [], lastUpdated: Date.now() };

    // 📥 COMMANDS
    if (msg.text === '/start') {
      session = { files: [], lastUpdated: Date.now() };
      await env.PENDING_FILES.put(chatId, JSON.stringify(session), { expirationTtl: 3600 });
      return tgSend(api('sendMessage'), { chat_id: chatId, text: "👋 Welcome! Send `.json` quiz files one by one.\n📁 I'll collect them until you type `/merge`.\n🗑️ Type `/cancel` to clear pending files." });
    }

    if (msg.text === '/merge') {
      if (session.files.length === 0) return tgSend(api('sendMessage'), { chat_id: chatId, text: "📭 No files collected. Send `.json` files first!" });
      await processMerge(chatId, session, env, api);
      return;
    }

    if (msg.text === '/cancel') {
      await env.PENDING_FILES.delete(chatId);
      return tgSend(api('sendMessage'), { chat_id: chatId, text: "🗑️ Pending files cleared." });
    }

    // 📎 FILE HANDLING
    if (msg.document) {
      const doc = msg.document;
      const isJson = doc.file_name?.endsWith('.json') || doc.mime_type === 'application/json';
      const isHtml = doc.file_name?.endsWith('.html') || doc.file_name?.endsWith('.htm') || doc.mime_type === 'text/html';
      if (isJson || isHtml) {
        session.files.push({ file_id: doc.file_id, file_name: doc.file_name });
        session.lastUpdated = Date.now();
        await env.PENDING_FILES.put(chatId, JSON.stringify(session), { expirationTtl: 3600 });
        return tgSend(api('sendMessage'), { chat_id: chatId, text: `✅ Added "${doc.file_name}"\n📊 Queue: ${session.files.length} file(s)\nSend more or type /merge` });
      }
      return tgSend(api('sendMessage'), { chat_id: chatId, text: "⚠️ Please send `.json` or exported `.html` quiz files." });
    }
  } catch (err) {
    console.error('[TG] Processing error:', err);
    await tgSend(api('sendMessage'), { chat_id: msg.chat.id, text: `❌ Error: ${err.message}` });
  }
}

async function processMerge(chatId, session, env, api) {
  const fileContents = [];
  for (const f of session.files) {
    const fileRes = await tgSend(api('getFile'), { file_id: f.file_id });
    if (!fileRes.ok) throw new Error(`Failed to fetch ${f.file_name}: ${fileRes.description}`);
    
    const content = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileRes.result.file_path}`).then(r => r.text());
    fileContents.push({ name: f.file_name, content });
  }

  const { merged, total, totalPassages, stats, isStandard } = mergeJsonFiles(fileContents, { compilerMode: true });
  const statsText = stats.map(s => `📄 ${s.file}: ${s.count} Qs${s.passages ? ' (' + s.passages + ' passages)' : ''}`).join('\n');
  const caption = `✅ Merged successfully (Compiler Schema v1.0)!\n📊 ${statsText}\n💡 Total: ${total} questions${totalPassages ? `, ${totalPassages} passages` : ''}`;

  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', new Blob([merged], { type: 'application/json' }), 'merged_quiz.json');
  formData.append('caption', caption);

  await fetch(api('sendDocument'), { method: 'POST', body: formData });
  await env.PENDING_FILES.delete(chatId); // Clear session after successful merge
}

async function tgSend(url, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return res.json();
}

async function handleSetupWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL;
  if (!token || !webhookUrl) return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } });
}

// 📱 PWA ASSETS
const MANIFEST_JSON = JSON.stringify({
  name: "Quiz JSON Merger", short_name: "QuizMerge", start_url: "/", display: "standalone",
  background_color: "#f4f5f7", theme_color: "#0052cc",
  icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' fill='%230052cc' rx='24'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='80' fill='white'%3E📄%3C/text%3E%3C/svg%3E", sizes: "192x192", type: "image/svg+xml" }]
});

const SERVICE_WORKER_JS = `
const CACHE = 'quiz-merge-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => res.status === 200 ? (caches.open(CACHE).then(c => c.put(e.request, res.clone())), res) : res)).catch(() => new Response('Offline'))));
`;

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quiz JSON Merger</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0052cc">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    :root{--primary:#0052cc;--primary-hover:#003d99;--bg:#f4f5f7;--card:#fff;--text:#172b4d;--border:#dfe1e6;--success:#e3fcef;--success-text:#006644;--error:#ffebec;--error-text:#c4001d;--danger:#ff5630}
    body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);display:flex;justify-content:center;padding:2rem;margin:0}
    .container{background:var(--card);padding:2rem;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1);max-width:550px;width:100%}
    h1{margin:0 0 1rem;font-size:1.5rem}label{display:block;margin:1rem 0 .5rem;font-weight:600}
    input[type=text]{width:100%;padding:.6rem;border:1px solid var(--border);border-radius:6px;box-sizing:border-box}
    .drop-zone{border:2px dashed var(--border);border-radius:8px;padding:2rem;text-align:center;cursor:pointer;background:#fafbfc;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .drop-zone:hover,.dragover{border-color:var(--primary);background:#f0f7ff;transform:scale(1.01)}
    .drop-zone p{margin:.25rem 0}.drop-zone .hint{color:#6b778c;font-size:.9rem}
    .file-list-header{display:flex;justify-content:space-between;align-items:center;margin-top:.75rem}
    .clear-btn{background:none;border:none;color:var(--danger);cursor:pointer;font-size:.85rem;font-weight:500;padding:.25rem .5rem;border-radius:4px}
    .clear-btn:hover{background:#ffeae6}
    .file-list{list-style:none;padding:0;margin:.5rem 0 0;max-height:180px;overflow-y:auto}
    .file-list li{background:#f4f5f7;padding:.5rem .75rem;margin-bottom:.4rem;border-radius:6px;font-size:.9rem;display:flex;justify-content:space-between;align-items:center;border-left:3px solid var(--primary)}
    .file-list .size{color:#6b778c;font-size:.8rem}
    .toggle-box{background:#f0f7ff;border:1px solid #b3d4ff;border-radius:8px;padding:.75rem 1rem;margin-top:1.25rem;display:flex;align-items:flex-start;gap:.75rem;cursor:pointer}
    .toggle-box input[type=checkbox]{width:1.2rem;height:1.2rem;margin-top:.15rem;accent-color:var(--primary);cursor:pointer}
    .toggle-content{flex:1}
    .toggle-title{font-weight:600;font-size:.95rem;display:flex;align-items:center;gap:.4rem}
    .toggle-desc{font-size:.8rem;color:#42526e;margin-top:.2rem;line-height:1.3}
    button{margin-top:1.5rem;width:100%;padding:.75rem;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;transition:background .2s}
    button:hover{background:var(--primary-hover)}button:disabled{background:#a5adba;cursor:not-allowed}
    #status,#summary{margin-top:1rem;padding:.75rem;border-radius:6px;display:none;text-align:center;font-weight:500}
    .success{background:var(--success);color:var(--success-text)}.error{background:var(--error);color:var(--error-text)}
    #summary{background:#f0f7ff;border:1px solid #b3d4ff;text-align:left}#summary h3{margin:0 0 .5rem;font-size:1.1rem}
    #summary-list{padding-left:1.2rem;margin:.5rem 0}#summary-list li{margin-bottom:.25rem}
    .total-badge{display:inline-block;background:var(--primary);color:#fff;padding:.25rem .6rem;border-radius:4px;font-weight:bold;font-size:.9rem}
    .pwa-note{font-size:.8rem;color:#6b778c;text-align:center;margin-top:1rem}
  </style>
</head>
<body>
  <div class="container">
    <h1>📄 Quiz JSON Merger</h1>
    <form id="mergeForm">
      <label>Upload Quiz Files (JSON or Standalone Quiz HTML):</label>
      <div id="drop-zone" class="drop-zone">
        <p>📂 Drag & drop files here</p>
        <p class="hint">or click to browse (.json, .html)</p>
        <input type="file" id="files" name="files" multiple accept=".json,application/json,.html,text/html" hidden>
      </div>
      <div class="file-list-header">
        <span id="file-count">0 files selected</span>
        <button type="button" id="clear-btn" class="clear-btn" style="display:none">Clear All</button>
      </div>
      <ul id="file-list" class="file-list"></ul>

      <label class="toggle-box" for="compiler_mode">
        <input type="checkbox" id="compiler_mode" name="compiler_mode" value="1" checked>
        <div class="toggle-content">
          <div class="toggle-title">🎯 Quiz HTML Compiler Format (v1.0 Schema)</div>
          <div class="toggle-desc">
            Output full structured quiz format with <code>schema_version: "1.0"</code>, metadata, passages, and subject tagging. Turn OFF for generic raw question arrays <code>[...]</code>.
          </div>
        </div>
      </label>

      <label for="filename">Custom Output Filename:</label>
      <input type="text" id="filename" name="filename" placeholder="merged_quiz_questions" required>
      <button type="submit" id="submitBtn">Upload & Merge</button>
    </form>
    <div id="summary">
      <h3>📊 Merge Summary</h3>
      <ul id="summary-list"></ul>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <div>Total Questions: <span class="total-badge" id="total-count">0</span></div>
        <div id="passages-badge-wrap" style="display:none">Passages: <span class="total-badge" style="background:#00875a" id="total-passages">0</span></div>
        <div id="mode-badge" class="total-badge" style="background:#505f79;font-weight:normal">v1.0 Schema</div>
      </div>
    </div>
    <div id="status"></div>
    <div class="pwa-note">💡 Install as PWA for offline access & mobile home screen</div>
  </div>
  <script>
    const dropZone=document.getElementById('drop-zone'),fileInput=document.getElementById('files'),fileList=document.getElementById('file-list'),fileCount=document.getElementById('file-count'),clearBtn=document.getElementById('clear-btn'),form=document.getElementById('mergeForm'),btn=document.getElementById('submitBtn'),status=document.getElementById('status'),summary=document.getElementById('summary'),summaryList=document.getElementById('summary-list'),totalCount=document.getElementById('total-count'),totalPassages=document.getElementById('total-passages'),passagesWrap=document.getElementById('passages-badge-wrap'),modeBadge=document.getElementById('mode-badge');
    let selectedFiles=[];
    ['dragenter','dragover','dragleave','drop'].forEach(e=>dropZone.addEventListener(e,ev=>{ev.preventDefault();ev.stopPropagation()}));
    ['dragenter','dragover'].forEach(e=>dropZone.addEventListener(e,()=>dropZone.classList.add('dragover')));
    ['dragleave','drop'].forEach(e=>dropZone.addEventListener(e,()=>dropZone.classList.remove('dragover')));
    dropZone.addEventListener('click',()=>fileInput.click());
    function handleFiles(newFiles){if(!newFiles.length)return;const existing=new Set(selectedFiles.map(f=>f.name));const unique=Array.from(newFiles).filter(f=>!existing.has(f.name));selectedFiles.push(...unique);const dt=new DataTransfer();selectedFiles.forEach(f=>dt.items.add(f));fileInput.files=dt.files;renderList(selectedFiles)}
    dropZone.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));
    fileInput.addEventListener('change',e=>handleFiles(e.target.files));
    function renderList(files){fileList.innerHTML='';fileCount.textContent=\`\${files.length} file\${files.length!==1?'s':''} selected\`;clearBtn.style.display=files.length?'block':'none';files.forEach(f=>{const li=document.createElement('li');li.innerHTML=\`<span>\${f.name.endsWith('.html')||f.name.endsWith('.htm')?'🌐':'📄'} \${f.name}</span><span class="size">\${(f.size/1024).toFixed(1)} KB</span>\`;fileList.appendChild(li)})}
    clearBtn.addEventListener('click',()=>{selectedFiles=[];fileInput.value='';renderList([]);summary.style.display='none'});
    form.addEventListener('submit',async e=>{e.preventDefault();if(!selectedFiles.length){status.className='error';status.textContent='❌ Select at least one file.';status.style.display='block';return}const fn=document.getElementById('filename').value.trim();const out=fn.endsWith('.json')?fn:fn+'.json';btn.disabled=true;btn.textContent='Processing...';status.style.display='none';summary.style.display='none';try{const fd=new FormData(form);const res=await fetch('/upload',{method:'POST',body:fd});if(!res.ok)throw new Error(await res.text()||'Merge failed');const h=res.headers.get('X-Merge-Stats');if(h){const s=JSON.parse(h);summaryList.innerHTML='';s.files.forEach(f=>{const li=document.createElement('li');li.textContent=\`\${f.file}: \${f.count} questions\${f.passages?' ('+f.passages+' passages)':''}\`;summaryList.appendChild(li)});totalCount.textContent=s.total;if(s.totalPassages>0){totalPassages.textContent=s.totalPassages;passagesWrap.style.display='inline-block'}else{passagesWrap.style.display='none'}modeBadge.textContent=s.isStandard?'v1.0 Schema Mode':'Raw Array Mode';modeBadge.style.background=s.isStandard?'#0052cc':'#505f79';summary.style.display='block'}const blob=await res.blob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=out;document.body.appendChild(a);a.click();URL.revokeObjectURL(u);document.body.removeChild(a);status.className='success';status.textContent='✅ Merged & downloaded!'}catch(err){status.className='error';status.textContent=\`❌ \${err.message}\`}finally{status.style.display='block';btn.disabled=false;btn.textContent='Upload & Merge'}});
    if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(console.error);
  </script>
</body>
</html>`;
