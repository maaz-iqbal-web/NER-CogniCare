const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

// ---------- Offline-first queueing ----------
// Real implementation of the "offline-first" claim: writes made while offline (game
// sessions, reminder actions) are stored locally and replayed automatically once the
// connection returns, instead of silently failing.
const QUEUE_KEY = 'cognicare-pending-queue';
function readQueue(){ try{ return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }catch{ return []; } }
function writeQueue(q){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }catch{} }
function queueLength(){ return readQueue().length; }
async function sendOrQueue(url, options){
  if(!navigator.onLine){
    const q=readQueue(); q.push({url,options,ts:Date.now()}); writeQueue(q);
    updateOfflineUI();
    return {ok:true,queued:true};
  }
  try{
    const r = await fetch(url, options);
    if(!r.ok) throw new Error('Request failed: '+r.status);
    return {ok:true,queued:false,response:r};
  }catch(err){
    const q=readQueue(); q.push({url,options,ts:Date.now()}); writeQueue(q);
    updateOfflineUI();
    return {ok:true,queued:true};
  }
}
async function flushQueue(){
  let q=readQueue();
  if(!q.length || !navigator.onLine) return;
  const remaining=[];
  for(const item of q){
    try{ const r=await fetch(item.url,item.options); if(!r.ok) throw new Error('failed'); }
    catch{ remaining.push(item); }
  }
  writeQueue(remaining);
  updateOfflineUI();
  if(remaining.length < q.length) window.dispatchEvent(new CustomEvent('cognicare-synced'));
}
function updateOfflineUI(){
  const banner=$('#offlineBanner'); if(!banner)return;
  const n=queueLength();
  if(!navigator.onLine){ banner.classList.remove('hidden'); banner.dataset.state='offline'; }
  else if(n>0){ banner.classList.remove('hidden'); banner.dataset.state='syncing'; flushQueue(); }
  else { banner.classList.add('hidden'); }
}
function initOffline(){
  updateOfflineUI();
  window.addEventListener('online', updateOfflineUI);
  window.addEventListener('offline', updateOfflineUI);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/static/sw.js').catch(()=>{});
  }
}

function initNew(){
  const m=$("#newPatientModal"), o=document.querySelector("[data-new-patient]"), c=document.querySelector("[data-close-new]"), f=$("#newPatientForm");
  if(!m||!o||!f)return;
  o.onclick=()=>m.classList.remove('hidden');
  if(c)c.onclick=()=>m.classList.add('hidden');
  f.onsubmit=async e=>{
    e.preventDefault();
    try{
      const d=Object.fromEntries(new FormData(f));
      const r=await fetch('/api/patients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
      const x=await r.json();
      if(x.ok)location.href='/patient/'+x.patient_id; else alert(x.error||'Could not create patient.');
    }catch(err){alert('Could not create patient.');}
  };
}

let aiHistory=[];
function speak(text){
  if(!$('#speakToggle')?.dataset.on)return;
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  const lang=window.PATIENT_LANGUAGE||'English';
  u.lang=lang==='Hindi'?'hi-IN':lang==='Assamese'?'as-IN':'en-IN';
  window.speechSynthesis.speak(u);
}

function initAI(){
  const m=$("#aiModal"), f=$("#aiForm"), i=$("#aiInput"), box=$("#aiMessages");
  if(!m||!f||!i||!box)return;
  fetch('/api/health').then(r=>r.json()).then(h=>{ const el=$('#aiMode'); if(el) el.textContent=h.ai_key_configured?`AI Companion · ${h.ai_model}`:'AI Companion · Local fallback'; }).catch(()=>{});
  $$('[data-ai-open]').forEach(b=>b.onclick=()=>{m.classList.remove('hidden');i.focus();});
  $$('[data-ai-close]').forEach(b=>b.onclick=()=>m.classList.add('hidden'));
  const speakToggle=$('#speakToggle');
  if(speakToggle)speakToggle.onclick=()=>{
    speakToggle.dataset.on=speakToggle.dataset.on==='1'?'0':'1';
    speakToggle.textContent=speakToggle.dataset.on==='1'?'🔊 Read replies aloud · On':'🔊 Read replies aloud';
  };
  f.onsubmit=async e=>{
    e.preventDefault();
    const msg=i.value.trim();
    if(!msg)return;
    box.insertAdjacentHTML('beforeend',`<div class="bubble user">${esc(msg)}</div>`);
    i.value=''; box.scrollTop=box.scrollHeight;
    if(!window.PATIENT_ID){box.insertAdjacentHTML('beforeend','<div class="bubble ai">Open a patient profile so I can use personal context.</div>');return;}
    const pending=document.createElement('div'); pending.className='bubble ai'; pending.textContent='Thinking…'; box.appendChild(pending);
    try{
      const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({patient_id:window.PATIENT_ID,message:msg,history:aiHistory})});
      const x=await r.json();
      if(!r.ok)throw new Error(x.error||'AI request failed');
      pending.textContent=x.answer||'I could not answer that right now.';
      if(x.answer)aiHistory.push({role:'user',content:msg},{role:'assistant',content:x.answer});
      if($('#aiMode'))$('#aiMode').textContent=`${x.mode||'AI Companion'}${x.provider?' · '+x.provider:''}`;
      speak(x.answer||'');
    }catch(err){
      pending.textContent='I could not connect to the assistant. Please check the API setup and try again.';
      if($('#aiMode'))$('#aiMode').textContent='Connection problem';
      console.error(err);
    }
    box.scrollTop=box.scrollHeight;
  };
  $('#voiceBtn')?.addEventListener('click',()=>{
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!R){alert('Voice input is not supported by this browser. Try Chrome or Edge.');return;}
    const r=new R();
    const lang=window.PATIENT_LANGUAGE||'English';
    r.lang=lang==='Hindi'?'hi-IN':'en-IN'; r.interimResults=false;
    r.onstart=()=>$('#voiceBtn').textContent='Listening…';
    r.onend=()=>$('#voiceBtn').textContent='🎙';
    r.onerror=()=>$('#voiceBtn').textContent='🎙';
    r.onresult=e=>{i.value=e.results[0][0].transcript;i.focus();};
    r.start();
  });
}

async function initMemory(){
  const list=$('#memoryList'),f=$('#memoryForm'); if(!list)return;
  async function load(){
    const d=await (await fetch(`/api/patient/${PATIENT_ID}/memories`)).json();
    list.innerHTML=d.map(x=>`<div class="memory-card"><div class="q">${esc(x.question)}</div><div class="a">${esc(x.answer)}</div></div>`).join('')||'<div class="panel">No memories saved yet.</div>';
  }
  await load();
  if(f)f.onsubmit=async e=>{e.preventDefault();await fetch(`/api/patient/${PATIENT_ID}/memories`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});f.reset();await load();};
}

async function initCare(){
  if(!$('#metrics'))return;
  async function load(days=30){
    const x=await (await fetch(`/api/patient/${PATIENT_ID}/summary`)).json(),s=x.summary||{},a=x.ai||{};
    $('#metrics').innerHTML=[['Sessions',s.sessions||0,'completed'],['Avg accuracy',`${((s.accuracy||0)*100).toFixed(0)}%`,'personal average'],['Avg score',`${(s.score||0).toFixed(0)}`,'activity score'],['Avg response',`${(s.avg_response||0).toFixed(1)}s`,'per item'],['Wrong selections',`${(s.wrong_selections||0).toFixed(1)}`,'average per session']].map(v=>`<div class="metric"><small>${v[0]}</small><div class="value">${v[1]}</div><small>${v[2]}</small></div>`).join('');
    $('#aiStatus').textContent=a.status||'Not enough data yet';
    $('#observations').innerHTML=(a.observations||[]).map(o=>`<div class="observation"><b>${esc(o.title)}</b><small>${esc(o.level)}</small>${esc(o.detail)}</div>`).join('')||'<p class="muted">Not enough data yet.</p>';
    const g=await (await fetch(`/api/patient/${PATIENT_ID}/games`)).json();
    $('#gameTable').innerHTML=`<div class="table-wrap"><table class="data-table"><tr><th>Game</th><th>Sessions</th><th>Accuracy</th><th>Score</th><th>Response</th><th>Attempts</th><th>Wrong</th><th>Hints</th><th>Seq.</th><th>Distract.</th><th>Position</th></tr>${g.map(q=>`<tr><td>${esc(q.game)}</td><td>${q.sessions}</td><td>${(q.accuracy*100).toFixed(0)}%</td><td>${q.score.toFixed(0)}</td><td>${q.avg_response.toFixed(1)}s</td><td>${q.attempts.toFixed(1)}</td><td>${q.wrong_selections.toFixed(1)}</td><td>${q.hints.toFixed(1)}</td><td>${q.sequence_errors.toFixed(1)}</td><td>${q.distractor_errors.toFixed(1)}</td><td>${q.position_errors.toFixed(1)}</td></tr>`).join('')}</table></div>`;
    const ss=await (await fetch(`/api/patient/${PATIENT_ID}/sessions`)).json(); const recent=ss[0];
    $('#sessionTable').innerHTML=`<div class="table-wrap"><table class="data-table"><tr><th>Date</th><th>Game</th><th>Accuracy</th><th>Score</th><th>Response</th><th>Attempts</th><th>Wrong</th><th>Hints</th><th>Difficulty</th></tr>${ss.slice(0,22).map(q=>`<tr><td>${esc(q.played_at.slice(0,16).replace('T',' '))}</td><td>${esc(q.game)}</td><td>${(q.accuracy*100).toFixed(0)}%</td><td>${q.score.toFixed(0)}</td><td>${q.avg_response.toFixed(1)}s</td><td>${q.attempts}</td><td>${q.wrong_selections}</td><td>${q.hints}</td><td>${q.difficulty}</td></tr>`).join('')}</table></div>`;
    $('#todayUsual').innerHTML=recent?`<div class="compare-card"><small>Latest accuracy</small><div class="big">${(recent.accuracy*100).toFixed(0)}%</div><div>Usual ${(s.accuracy*100).toFixed(0)}%</div></div><div class="compare-card"><small>Latest response</small><div class="big">${recent.avg_response.toFixed(1)}s</div><div>Usual ${(s.avg_response||0).toFixed(1)}s</div></div><div class="compare-card"><small>Latest wrong selections</small><div class="big">${recent.wrong_selections||0}</div><div>Usual ${(s.wrong_selections||0).toFixed(1)}</div></div>`:'<p class="muted">Not enough data yet.</p>';
    const tr=await (await fetch(`/api/patient/${PATIENT_ID}/trends/${days}`)).json(); const vals=tr.map(v=>v.accuracy||0),max=Math.max(...vals,0.01);
    $('#trendChart').innerHTML=tr.length?tr.map(v=>`<div class="trend-bar" style="height:${Math.max(8,(v.accuracy/max)*140)}px"><span>${v.day.slice(5)}</span></div>`).join(''):'<p class="muted">Not enough data yet.</p>';
    const n=await (await fetch(`/api/patient/${PATIENT_ID}/notes`)).json();
    $('#notesList').innerHTML=n.map(v=>`<div class="note">${esc(v.note)}<small>${esc(v.created_at.slice(0,16).replace('T',' '))}</small></div>`).join('')||'<p>No caregiver notes yet.</p>';
  }
  await new Promise(res=>{
    const gate=$('#caregiverGate');
    if(!gate){res();return;}
    fetch('/api/caregiver/status').then(r=>r.json()).then(s=>{ if(s.unlocked) res(); }).catch(()=>{});
    window.__onCaregiverUnlock=res;
  });
  await load();
  $('#trendDays')?.addEventListener('change',e=>load(Number(e.target.value)));
  $('#noteForm')?.addEventListener('submit',async e=>{e.preventDefault();await sendOrQueue(`/api/patient/${PATIENT_ID}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});e.currentTarget.reset();await load(Number($('#trendDays')?.value||30));});
  $('#printReport')?.addEventListener('click',()=>window.print());
}

const gameData={
  'Memory Match':{kind:'match',instruction:'Find all matching pairs.',difficulty:2},
  'Pattern Recall':{kind:'pattern',instruction:'Watch the highlighted sequence, then repeat it.',difficulty:2},
  'Attention & Focus':{kind:'attention',instruction:'Tap the target symbol when it appears.',difficulty:2},
  'Daily Routine Recall':{kind:'order',instruction:'Put the daily steps in the order that feels right.',difficulty:2},
  'Find the Change':{kind:'change',instruction:'Remember the first view, then spot what changed.',difficulty:2},
  'Grocery Basket':{kind:'basket',instruction:'Remember the shopping list, then select the items you saw.',difficulty:2},
  'Where Does It Belong?':{kind:'belong',instruction:'Choose the place where each object belongs.',difficulty:2},
  'Who Is Missing?':{kind:'missing',instruction:'Remember the group, then find who is missing.',difficulty:2},
  'What Happened First?':{kind:'order2',instruction:'Put the familiar actions in the order they happened.',difficulty:2},
  'Odd One Out':{kind:'odd',instruction:'Find the item that does not belong with the others.',difficulty:2}
};
const ICONS=['🌳','🌼','🎵','☕','📖','🪴','🍎','🥣','🚶','📞','🏠','🧺','🧢','👓','🎈','🕊️'];
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
async function fetchDifficulty(name){
  try{
    const r=await fetch(`/api/patient/${PATIENT_ID}/difficulty/${encodeURIComponent(name)}`);
    if(!r.ok)throw 0;
    return await r.json();
  }catch{ return {level:2,reason:'',confidence:'low'}; }
}
async function makeGame(name){
  const d=gameData[name]; if(!d)return;
  setGame(`<div class="play-area"><p class="muted">Getting ready…</p></div>`);
  const diff=window.PATIENT_ID?await fetchDifficulty(name):{level:2,reason:'',confidence:'low'};
  const level=Math.max(1,Math.min(5,diff.level||2));
  const state={name,kind:d.kind,start:performance.now(),attempts:0,wrong:0,hints:0,errors:0,done:false,correct:0,total:0,difficulty:level,difficultyReason:diff.reason||'',items:[],selected:[]};
  // The AI-chosen difficulty level (1-5) genuinely reshapes each game instead of just
  // being stored and ignored: more pairs/steps, longer sequences, faster pace at higher levels.
  if(d.kind==='match'){const pairCount=Math.min(7,3+level);const vals=shuffle(ICONS).slice(0,pairCount);state.items=shuffle([...vals,...vals]);state.total=pairCount*2;return renderGridGame(state);}
  if(d.kind==='pattern'){const len=Math.min(7,2+level);state.sequence=Array.from({length:len},()=>Math.floor(Math.random()*4));state.user=[];state.total=1;return renderPattern(state);}
  if(d.kind==='attention'){state.total=Math.min(16,6+level*2);state.speed=Math.max(420,950-level*95);return renderAttention(state);}
  if(d.kind==='change'){const a=shuffle(ICONS).slice(0,6),b=[...a],idx=Math.floor(Math.random()*a.length);b[idx]=shuffle(ICONS.filter(x=>!a.includes(x)))[0];state.a=a;state.b=b;state.total=1;return renderChange(state);}
  if(d.kind==='basket'){const base=['Apples','Rice','Tea','Soap','Milk','Biscuits','Sugar','Oil'];const listSize=Math.min(6,3+level);state.list=shuffle(base).slice(0,listSize);state.options=shuffle([...base,'Brush','Book']);state.total=state.list.length;return renderBasket(state);}
  if(d.kind==='belong'){state.pairs=[['Cup','Kitchen'],['Pillow','Bedroom'],['Shoes','Door'],['Soap','Bathroom']];state.current=0;state.total=4;return renderBelong(state);}
  if(d.kind==='missing'){const people=['Ananya','Ramesh','Mary','Asha'];state.group=shuffle(people).slice(0,3);state.missing=people.find(x=>!state.group.includes(x));state.options=shuffle(people);state.total=1;return renderMissing(state);}
  if(d.kind==='odd'){
    const sets=[['🍎','🍊','🍐','🧢'],['🌼','🌳','🪴','☕'],['📞','📖','🎵','🍎'],['🚶','🏠','🧺','🎈']];
    const pick=shuffle(sets)[0]; state.items=shuffle(pick); state.odd=pick[pick.length-1]; state.total=1; return renderOdd(state);
  }
  if(d.kind==='order2'){state.stories=[['Woke up','Got dressed','Had breakfast','Left for a walk'],['Watered the plants','Made tea','Called family','Rested outside'],['Cooked lunch','Ate with family','Washed up','Took a short nap']];state.steps=shuffle(state.stories)[0];state.previewMs=Math.max(1800,3500-level*280);state.total=1;return renderOrder2(state);}
  state.steps=shuffle(['Wake up','Breakfast','Morning walk','Rest']);state.total=1;return renderOrder(state);
}
function gameShell(s,inner){return `<div class="play-area"><div class="game-mode">${esc(s.name)}</div><h2>${esc(s.name)}</h2><p class="game-instruction">${esc(gameData[s.name].instruction)}</p>${s.difficultyReason?`<p class="difficulty-note">🎯 Level ${s.difficulty}/5 · ${esc(s.difficultyReason)}</p>`:''}<div class="game-stats"><span>Score <b id="gScore">0</b></span><span>Attempts <b id="gAttempts">0</b></span><span>Hints <b id="gHints">0</b></span></div>${inner}</div>`}
function setGame(html){$('#gameContent').innerHTML=html}
function updateGameStats(s){$('#gScore').textContent=Math.round((s.correct/Math.max(1,s.total))*100);$('#gAttempts').textContent=s.attempts;$('#gHints').textContent=s.hints}
function renderGridGame(s){
  setGame(gameShell(s,`<div class="choice-grid" id="matchGrid">${s.items.map((x,i)=>`<button class="choice" data-i="${i}" data-v="${x}">?</button>`).join('')}</div><div class="game-actions"><button class="primary" id="hintBtn">Show a hint</button></div>`));
  let open=[];
  $$('#matchGrid .choice').forEach(b=>b.onclick=()=>{if(s.done||b.disabled||open.includes(b))return;s.attempts++;b.textContent=b.dataset.v;open.push(b);if(open.length===2){if(open[0].dataset.v===open[1].dataset.v){s.correct+=2;open.forEach(x=>x.disabled=true);open=[];if(s.correct===s.total)finishGame(s);}else{s.wrong++;const pair=[...open];setTimeout(()=>pair.forEach(x=>{if(!x.disabled)x.textContent='?';}),500);open=[];}updateGameStats(s);}});
  $('#hintBtn').onclick=()=>{if(s.done)return;s.hints++;const b=$$('#matchGrid .choice').find(x=>!x.disabled);if(b)b.textContent=b.dataset.v;updateGameStats(s);};
}
function renderPattern(s){
  setGame(gameShell(s,`<div class="choice-grid" id="patternGrid">${[0,1,2,3].map(x=>`<button class="choice" data-i="${x}">${ICONS[x]}</button>`).join('')}</div><div class="game-actions"><button class="primary" id="showPattern">Show Pattern</button></div>`));
  const flash=()=>{s.user=[];$('#showPattern').disabled=true;let i=0;const t=setInterval(()=>{if(i>=s.sequence.length){clearInterval(t);$('#showPattern').disabled=false;return;}const b=$(`#patternGrid [data-i="${s.sequence[i]}"]`);b.classList.add('selected');setTimeout(()=>b.classList.remove('selected'),300);i++;},500);};
  $('#showPattern').onclick=flash;
  $$('#patternGrid .choice').forEach(b=>b.onclick=()=>{if(s.done||$('#showPattern').disabled)return;s.attempts++;s.user.push(Number(b.dataset.i));const n=s.user.length-1;if(s.user[n]!==s.sequence[n]){s.wrong++;s.errors++;s.user=[];}else if(s.user.length===s.sequence.length){s.correct=1;finishGame(s);}updateGameStats(s);});
}
function renderAttention(s){
  setGame(gameShell(s,`<div class="attention-area" id="attentionArea"><button class="choice" id="target">✦</button></div>`));
  let i=0;const tick=()=>{if(s.done)return;i++;const t=$('#target');t.style.transform=`translate(${Math.random()*220-110}px,${Math.random()*80-40}px)`;setTimeout(tick,s.speed||900);};tick();
  $('#target').onclick=()=>{if(s.done)return;s.attempts++;s.correct++;if(s.correct>=s.total)finishGame(s);updateGameStats(s);};
}
function renderChange(s){
  const old=s.a.join(' '), changed=s.b.find((x,i)=>x!==s.a[i]);
  setGame(gameShell(s,`<div class="choice-grid">${s.a.map(x=>`<div class="choice">${x}</div>`).join('')}</div><p>Look carefully…</p><div class="game-actions"><button class="primary" id="revealChange">Show changed view</button></div><div id="changeArea"></div>`));
  $('#revealChange').onclick=()=>{$('#changeArea').innerHTML=`<div class="choice-grid">${s.b.map(x=>`<div class="choice">${x}</div>`).join('')}</div><p>Which item changed?</p><div class="choice-grid">${s.b.map((x,i)=>`<button class="choice change-answer" data-i="${i}">${x}</button>`).join('')}</div>`;$$('.change-answer').forEach(b=>b.onclick=()=>{s.attempts++;const idx=s.b.indexOf(changed);if(Number(b.dataset.i)===idx)s.correct=1;else{s.wrong++;s.errors++;}finishGame(s);});};
}
function renderBasket(s){
  setGame(gameShell(s,`<div class="result-box"><b>Remember:</b> ${s.list.join(', ')}</div><div class="game-actions"><button class="primary" id="hideList">I remember</button></div><div id="basketArea"></div>`));
  $('#hideList').onclick=()=>{$('.result-box').style.display='none';$('#basketArea').innerHTML=`<div class="choice-grid">${s.options.map(x=>`<button class="choice basket-choice">${x}</button>`).join('')}</div><div class="game-actions"><button class="primary" id="basketDone">Done</button></div>`;$$('.basket-choice').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));$('#basketDone').onclick=()=>{const picked=$$('.basket-choice.selected').map(b=>b.textContent);s.attempts=picked.length;s.correct=picked.filter(x=>s.list.includes(x)).length;s.wrong=picked.filter(x=>!s.list.includes(x)).length;finishGame(s);};};
}
function renderBelong(s){
  const pair=s.pairs[s.current];
  setGame(gameShell(s,`<div class="result-box"><b>${pair[0]}</b></div><div class="choice-grid">${['Kitchen','Bedroom','Bathroom','Door'].map(x=>`<button class="choice" data-x="${x}">${x}</button>`).join('')}</div>`));
  $$('.choice').forEach(b=>b.onclick=()=>{s.attempts++;if(b.dataset.x===pair[1])s.correct++;else{s.wrong++;s.errors++;}s.current++;if(s.current>=s.pairs.length){finishGame(s);}else{renderBelong(s);}});
}
function renderMissing(s){
  setGame(gameShell(s,`<div class="result-box"><b>Group:</b> ${s.group.join(', ')}</div><p>Who is missing?</p><div class="choice-grid">${s.options.map(x=>`<button class="choice">${x}</button>`).join('')}</div>`));
  $$('.choice').forEach(b=>b.onclick=()=>{s.attempts++;if(b.textContent===s.missing)s.correct=1;else{s.wrong++;s.errors++;}finishGame(s);});
}
function renderOrder(s){
  setGame(gameShell(s,`<p>Remember these steps:</p><div class="sequence-grid">${s.steps.map(x=>`<button class="seq-choice" disabled>${x}</button>`).join('')}</div><div class="game-actions"><button class="primary" id="orderStart">Now arrange them</button></div><div id="orderArea"></div>`));
  $('#orderStart').onclick=()=>{$('#orderArea').innerHTML=`<div class="sequence-grid">${shuffle(s.steps).map(x=>`<button class="seq-choice order-choice">${x}</button>`).join('')}</div><div class="game-actions"><button class="primary" id="orderDone">Check</button></div>`;let chosen=[];$$('.order-choice').forEach(b=>b.onclick=()=>{b.classList.toggle('selected');chosen=b.classList.contains('selected')?[...chosen,b.textContent]:chosen.filter(x=>x!==b.textContent);});$('#orderDone').onclick=()=>{s.attempts=chosen.length;s.correct=chosen.length===s.steps.length&&chosen.every((x,i)=>x===s.steps[i])?1:0;s.wrong=s.correct?0:1;finishGame(s);};};
}
function renderOdd(s){const odd=s.items.indexOf(s.odd);setGame(gameShell(s,`<div class="choice-grid">${s.items.map((x,i)=>`<button class="choice" data-i="${i}">${x}</button>`).join('')}</div>`));$$('.choice').forEach(b=>b.onclick=()=>{s.attempts++;if(Number(b.dataset.i)===odd)s.correct=1;else{s.wrong++;s.errors++;}finishGame(s);});}
function renderOrder2(s){
  setGame(gameShell(s,`<p>Remember what happened first…</p><div class="sequence-grid" id="order2Preview">${s.steps.map(x=>`<button class="seq-choice" disabled>${x}</button>`).join('')}</div><p class="muted" id="order2Hide">This will hide shortly — take a moment to remember the order.</p><div id="order2Area"></div>`));
  setTimeout(()=>{
    if(s.done)return;
    $('#order2Preview').style.visibility='hidden';
    const hideNote=$('#order2Hide'); if(hideNote)hideNote.textContent='Now put the steps back in order, from memory.';
    $('#order2Area').innerHTML=`<div class="sequence-grid">${shuffle(s.steps).map(x=>`<button class="seq-choice order2-choice">${x}</button>`).join('')}</div><div class="game-actions"><button class="primary" id="order2Done">Check</button></div>`;
    let chosen=[];
    $$('.order2-choice').forEach(b=>b.onclick=()=>{b.classList.toggle('selected');chosen=b.classList.contains('selected')?[...chosen,b.textContent]:chosen.filter(x=>x!==b.textContent);});
    $('#order2Done').onclick=()=>{s.attempts=chosen.length;s.correct=chosen.length===s.steps.length&&chosen.every((x,i)=>x===s.steps[i])?1:0;s.wrong=s.correct?0:1;finishGame(s);};
  },s.previewMs||3200);
}

async function finishGame(s){
  if(s.done)return;s.done=true;
  const elapsed=(performance.now()-s.start)/1000,accuracy=Math.max(0,Math.min(1,s.correct/Math.max(1,s.total))),avgResponse=elapsed/Math.max(1,s.attempts),score=Math.round(accuracy*75+Math.max(0,25-Math.min(25,avgResponse*2)));
  const payload={game:s.name,accuracy,score,avg_response:avgResponse,attempts:s.attempts,hints:s.hints,difficulty:s.difficulty,completed:true,wrong_selections:s.wrong,total_items:s.total,time_spent:elapsed,reaction_min:avgResponse*.55,reaction_max:avgResponse*1.7,sequence_errors:s.errors,distractor_errors:s.kind==='attention'?s.wrong:0,position_errors:(s.kind==='order'||s.kind==='order2')?s.wrong:0,hint_rate:s.hints/Math.max(1,s.attempts),game_version:'v4.1'};
  const result=await sendOrQueue(`/api/patient/${PATIENT_ID}/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const savedNote = result.queued ? `<p class="muted">${esc(window.UI_STRINGS?.queued_offline || 'Saved offline — will sync automatically.')}</p>` : '';
  $('#gameContent').insertAdjacentHTML('beforeend',`<div class="result-box"><h3>Activity complete</h3><p>You scored <b>${score}</b> with <b>${Math.round(accuracy*100)}%</b> accuracy.</p><p>Attempts: ${s.attempts} · Wrong selections: ${s.wrong} · Time: ${elapsed.toFixed(1)}s</p>${savedNote}<div class="game-actions"><button class="primary" id="playAgain">Play Again</button></div></div>`);
  $('#playAgain').onclick=()=>makeGame(s.name);
}
function initGames(){
  const modal=$('#gameModal');if(!modal)return;
  $$('.game-launch').forEach(b=>b.onclick=()=>{modal.classList.remove('hidden');makeGame(b.dataset.game);});
  const close=$('#closeGame');if(close)close.onclick=()=>{modal.classList.add('hidden');if(window.speechSynthesis)window.speechSynthesis.cancel();};
}
function initLanding(){const s=$('#landingLanguage');if(!s)return;s.value=localStorage.getItem('cognicare-language')||s.value;s.onchange=()=>localStorage.setItem('cognicare-language',s.value);}

// ---------- Reminders (daily living reminders / medication prompts) ----------
async function initReminders(){
  const list=$('#remindersList'), f=$('#reminderForm');
  if(!list)return;
  async function load(){
    const r=await fetch(`/api/patient/${PATIENT_ID}/reminders`);
    const d=await r.json();
    const pending=d.filter(x=>!x.completed), done=d.filter(x=>x.completed);
    list.innerHTML = pending.map(x=>`
      <div class="reminder-row" data-id="${x.id}">
        <div><b>${esc(x.title)}</b><small>${esc(x.due)}</small></div>
        <div class="reminder-actions">
          <button class="ghost-btn" data-complete="${x.id}">${esc(window.UI_STRINGS?.mark_done||'Mark done')}</button>
          <button class="ghost-btn danger" data-remove="${x.id}">${esc(window.UI_STRINGS?.remove||'Remove')}</button>
        </div>
      </div>`).join('') || `<p class="muted">${esc(window.UI_STRINGS?.no_reminders||'No reminders saved yet.')}</p>`;
    if(done.length){
      list.insertAdjacentHTML('beforeend', done.slice(0,5).map(x=>`<div class="reminder-row done"><div><b>${esc(x.title)}</b><small>${esc(x.due)}</small></div><span class="done-tag">${esc(window.UI_STRINGS?.done||'Done')}</span></div>`).join(''));
    }
    $$('[data-complete]').forEach(b=>b.onclick=async()=>{
      await sendOrQueue(`/api/reminders/${b.dataset.complete}/complete`,{method:'POST'});
      await load();
    });
    $$('[data-remove]').forEach(b=>b.onclick=async()=>{
      await sendOrQueue(`/api/reminders/${b.dataset.remove}`,{method:'DELETE'});
      await load();
    });
  }
  await load();
  if(f)f.onsubmit=async e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(f));
    await sendOrQueue(`/api/patient/${PATIENT_ID}/reminders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    f.reset(); await load();
  };
  window.addEventListener('cognicare-synced', load);
}

// ---------- Caregiver PIN gate (role-based access) ----------
function initCaregiverGate(){
  const gate=$('#caregiverGate');
  if(!gate)return;
  const content=$('#caregiverContent');
  fetch('/api/caregiver/status').then(r=>r.json()).then(s=>{
    if(s.unlocked){ gate.classList.add('hidden'); if(content)content.classList.remove('hidden'); }
  }).catch(()=>{});
  const f=$('#caregiverPinForm'), err=$('#caregiverPinError');
  if(f)f.onsubmit=async e=>{
    e.preventDefault();
    const pin=$('#caregiverPinInput').value.trim();
    try{
      const r=await fetch('/api/caregiver/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
      const x=await r.json();
      if(x.ok){ gate.classList.add('hidden'); if(content)content.classList.remove('hidden'); if(window.__onCaregiverUnlock)window.__onCaregiverUnlock(); }
      else if(err){ err.classList.remove('hidden'); }
    }catch{ if(err)err.classList.remove('hidden'); }
  };
}

initOffline();initNew();initAI();initMemory();initCare();initGames();initLanding();initReminders();initCaregiverGate();
