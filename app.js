/* ═══════════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════════ */
function toggleTheme(){
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  document.documentElement.setAttribute('data-theme',isLight?'dark':'light');
  document.getElementById('themeIcon').textContent=isLight?'🌙':'☀️';
  document.getElementById('themeLabel').textContent=isLight?'Dark':'Light';
  localStorage.setItem('tes_theme',isLight?'dark':'light');
}
// Apply saved theme on load
(function(){
  const saved=localStorage.getItem('tes_theme');
  if(saved==='light'){
    document.documentElement.setAttribute('data-theme','light');
    // Icons updated after DOM loads
    window.addEventListener('DOMContentLoaded',()=>{
      const icon=document.getElementById('themeIcon');
      const label=document.getElementById('themeLabel');
      if(icon)icon.textContent='☀️';
      if(label)label.textContent='Light';
    });
  }
})();

/* ═══════════════════════════════════════
   LOGIN SLIDESHOW (presentational only — rotates hero taglines)
═══════════════════════════════════════ */
(function(){
  window.addEventListener('DOMContentLoaded',()=>{
    const wrap=document.getElementById('loginSlides');
    if(!wrap)return;
    const slides=[...wrap.querySelectorAll('.login-slide')];
    const dots=[...wrap.querySelectorAll('.login-dot')];
    if(slides.length<2)return;
    let i=0,timer;
    const go=n=>{
      i=(n+slides.length)%slides.length;
      slides.forEach((s,k)=>s.classList.toggle('active',k===i));
      dots.forEach((d,k)=>d.classList.toggle('active',k===i));
    };
    const start=()=>{timer=setInterval(()=>go(i+1),5000);};
    const reset=()=>{clearInterval(timer);start();};
    dots.forEach(d=>d.addEventListener('click',()=>{go(+d.dataset.i);reset();}));
    start();
  });
})();

/* ═══════════════════════════════════════
   COMPANY INFO
═══════════════════════════════════════ */
const CO = {
  name:'Trends Engineering Services (PTY) Ltd',
  po:'P.O. BOX 30177', city:'FRANCISTOWN', tel:'72388904',
  vendor:'103913', vat:'BW00000259728-00-05-42',
  bank:'Stanbic Bank Botswana', acc:'9060 0026 4898 4',
  branch:'Francistown Branch', bcode:'064067', swift:'SBICBWGX',
};
const BPC_CO = { name:'BOTSWANA POWER CORPORATION', addr:'Motlakase House, Macheng Way', po:'P.O. Box 48', city:'GABORONE', tel:'3607000' };

/* ═══════════════════════════════════════
   PDF PARSER (Claude API)
═══════════════════════════════════════ */
async function parseWorkOrderPDF(input){
  if(!input.files[0])return;
  const file=input.files[0];
  const statusEl=document.getElementById('pdf-parse-status');
  statusEl.style.display='block';
  statusEl.textContent='⏳ Reading PDF...';
  statusEl.style.color='var(--am)';

  try{
    // Load PDF.js from CDN
    if(!window.pdfjsLib){
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
    let fullText='';
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      fullText+=content.items.map(item=>item.str).join(' ')+'\n';
    }

    // Helper: extract value after a label using regex
    const get=(patterns,text)=>{
      for(const pat of patterns){
        const m=text.match(pat);
        if(m&&m[1]&&m[1].trim())return m[1].trim();
      }
      return'';
    };

    const t=fullText;

    // Sales Order Number / WO Number
    const wo=get([/Sales Order Number[:\s]+(\d+)/i,/Sales Order[:\s]+(\d+)/i],t);

    // Project Number (BPC project no)
    const bpcProjNo=get([/Project Number[:\s]+([\d]+)/i],t);

    // Date — format is DD.MM.YYYY in PDF, convert to YYYY-MM-DD
    const rawDate=get([/Date\s*[:\s]+([\d]{2}\.[\d]{2}\.[\d]{4})/i,/Date\s*:\s*([\d\/\.\-]+)/i],t);
    let date='';
    if(rawDate){
      const parts=rawDate.split('.');
      if(parts.length===3)date=`${parts[2]}-${parts[1]}-${parts[0]}`;
      else date=rawDate;
    }

    // Project Type
    const projType=get([/Project Type[:\s]+([A-Z0-9]+)/i],t);

    // Contract Account
    const contract=get([/Contract Account No[:\s]+([\d]+)/i,/Contract Account[:\s]+([\d]+)/i],t);

    // Customer No
    const custNo=get([/Customer No[:\s]+([\d]+)/i],t);

    // Plot No
    const plotNo=get([/Plot No[:\s]+([\d]+)/i,/Plot\s*No\s*[:\s]+([\w\d]+)/i],t);

    // Ward
    const ward=get([/Ward\s*[:\s]+([A-Z0-9 ]+?)(?:\s+City|$|\n)/i,/Ward\s*:\s*([A-Z]+)/i],t);

    // City/Town
    const loc=get([/City\/Town\/Village\s*[:\s]+([A-Z]+)/i,/City\/Town[:\s]+([A-Z]+)/i],t);

    // Customer name — strip leading NESC prefix if present
    const custRaw=get([
      /Customer Name[:\s]+([A-Z][A-Z\s]+?)(?:\n|Contract|Plot|P\.O)/i,
      /([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*(?:P\.O\.Box|\n)/i,
      /ELECTRICITY SUPPLY TO.*?\n.*?([A-Z]{3,}\s+[A-Z]{3,})/i,
    ],t);
    const cust=custRaw.replace(/^NESC\s*/i,'').trim();

    // Customer address — build from plot, ward, town fields in PDF
    const addrRaw=get([/Address[:\s]+([^\n]+)/i,/Street[:\s]+([^\n]+)/i],t);
    const address=addrRaw||(plotNo&&ward&&loc?`Plot ${plotNo}, ${ward}, ${loc}`:(plotNo&&loc?`Plot ${plotNo}, ${loc}`:loc||''));

    // Mobile number — take the first one found
    const mobile=get([/Mobile Number\s*[:\s]+([\d]+)/i,/Cell[:\s]+([\d]+)/i,/Tel[:\s]+([\d]+)/i],t);

    // Connection type — parse EXACT description from PDF work order text
    // Look for the actual work description line which contains what type of connection it is
    const descLine=get([
      /Description of Work[:\s]+([^\n]+)/i,
      /Work Description[:\s]+([^\n]+)/i,
      /Service Type[:\s]+([^\n]+)/i,
      /Type of Connection[:\s]+([^\n]+)/i,
      /ELECTRICITY SUPPLY[:\s]+([^\n]+)/i,
    ],t)||'';
    let connType='U/G Conn'; // default fallback
    if(/three.?phase|3.?phase|3ph/i.test(descLine)||/three.?phase|3.?phase|3ph/i.test(t))connType='U/G 3-Phase';
    else if(/overhead|OHL|aerial|ABC/i.test(descLine))connType='OHL 400V';
    else if(/11\s*kV/i.test(descLine)||/11kV/i.test(descLine))connType='OHL 11kV';
    else if(/transform/i.test(descLine))connType='Transformer';
    else if(/underground|U\/G|UG|below ground/i.test(descLine))connType='U/G Conn';

    // Location factor
    const lfMatch=t.match(/location factor\s+([\d.]+)/i);
    const lf=lfMatch?lfMatch[1]:'29.25';

    // Populate form fields
const set=(id,val)=>{const e=document.getElementById(id);if(e&&val)e.value=val;};
set('nw-num',wo&&/^\d+$/.test(wo)?wo.padStart(10,'0'):wo);
set('nw-date',date);
set('nw-projtype',projType||'NESC');
set('nw-bpcprojno',bpcProjNo);
set('nw-projno',bpcProjNo);
set('nw-contract',contract);
set('nw-custno',custNo);
set('nw-cust',cust);
set('nw-plotno',plotNo);
set('nw-ward',ward);
set('nw-loc',loc);
set('nw-mobile',mobile);
set('nw-lf',lf);
set('nw-meter',get([/Meter Number[:\s]+([\w\d]+)/i,/Meter No[:\s]+([\w\d]+)/i],t)||'');
set('nw-address',address||(plotNo&&ward&&loc?`Plot ${plotNo}, ${ward}, ${loc}`:(plotNo&&loc?`Plot ${plotNo}, ${loc}`:'')));
// Build VO1 line items from the PDF — look for service descriptions with rates
    // Try to extract itemized lines: description + rate patterns
    const phase47=true; // default Phase 47
    const defaultItems=[];
    // Try to match "Description ... Rate" patterns in the PDF text
    // Common BPC WO patterns: look for lines containing "Service" or "Connection" with amounts
    const rateLines=t.match(/([A-Za-z][^\n]{5,60}?)\s+[\-–]?\s*([\d,]+\.?\d*)\s*(?:BWP|P)?/g)||[];
    rateLines.forEach(line=>{
      const m=line.match(/^([A-Za-z][^\d]{4,55}?)\s+([\d,]+\.?\d*)$/);
      if(m){
        const desc=m[1].trim().replace(/\s+/g,' ');
        const rate=parseFloat(m[2].replace(/,/g,''));
        if(rate>100&&rate<500000&&desc.length>5&&desc.length<80){
          defaultItems.push(`${desc} | Ea | 1 | ${rate.toFixed(2)}`);
        }
      }
    });
    // If nothing found from PDF, provide sensible defaults based on connType
    if(!defaultItems.length){
      if(connType==='U/G 3-Phase'){
        defaultItems.push('Service Conn; 230V; 60A; Three Phase; U/G | Ea | 1 | 12426.82');
      } else if(connType==='OHL 400V'){
        defaultItems.push('Service Conn; 230V; 60A; Single Phase; O/H | Ea | 1 | 11411.97');
      } else if(connType==='OHL 11kV'){
        defaultItems.push('OHL; 11kV; 3Ph; 100m; Gopher | m | 1 | 109.67');
      } else {
        // Default U/G Single Phase
        defaultItems.push('Service Conn; 230V; 60A; Single Phase; U/G | Ea | 1 | 12426.82');
      }
    }
    const el=document.getElementById('nw-type');
    if(el)el.value=defaultItems.join('\n');

    const filled=[wo,date,cust,loc,contract].filter(Boolean).length;
    if(filled===0)throw new Error('Could not extract fields — fill in manually');

    statusEl.textContent=`✓ Parsed: WO ${wo||'?'} · ${cust||'?'} · ${loc||'?'} — review and confirm`;
    statusEl.style.color='var(--gn)';
    setTimeout(()=>{statusEl.style.display='none';},5000);
  }catch(e){
    statusEl.textContent='✗ Parse failed: '+e.message;
    statusEl.style.color='var(--rd)';
  }
}

function clearWOForm(){
  ['nw-num','nw-date','nw-projtype','nw-cust','nw-contract','nw-custno','nw-plotno','nw-loc','nw-ward','nw-mobile','nw-bpcprojno','nw-projno','nw-meter','nw-address'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  document.getElementById('nw-phase').value='47';
  document.getElementById('nw-lf').value='29.25';
  document.getElementById('nw-pdf').value='';
  const statusEl=document.getElementById('pdf-parse-status');
  if(statusEl)statusEl.style.display='none';
}

/* ═══════════════════════════════════════
   RATES DATABASE
   Full 1,103 real BPC DSW rates (551 Phase 46 + 552 Phase 47) now live in
   rates.js, which loads BEFORE this script and defines the global RATES_SEED.
   (Replaces the inline seed array from the original single-file build.)
═══════════════════════════════════════ */
const RATES_SEED = (typeof window !== "undefined" && window.RATES_SEED) ? window.RATES_SEED : [];

/* ═══════════════════════════════════════
   PIPELINE STAGES
═══════════════════════════════════════ */
const STAGES = [
  {id:'wo_received',              lbl:'Work Order Received from BPC',              role:'admin'},
  {id:'vo1_created',              lbl:'Works Valuation (VO1) Created',             role:'admin'},
  {id:'linesman_notified',        lbl:'Linesman Notified (External)',               role:'admin'},
  {id:'field_received',           lbl:'Linesman Findings Uploaded',                role:'admin'},
  {id:'vo2_created',              lbl:'Variation Order (VO2) Created',             role:'admin'},
  {id:'works_valuation_created',  lbl:'Works Valuation Document Created',          role:'admin'},
  {id:'work_instruction_ready',   lbl:'Works Instruction Prepared',                role:'admin'},
  {id:'teams_notified',           lbl:'Teams Notified to Start Work (External)',   role:'admin'},
  {id:'work_complete',            lbl:'Teams Reported Work Complete',              role:'admin'},
  {id:'gis_notified',             lbl:'GIS Consultant Notified',                   role:'admin'},
  {id:'gis_complete',             lbl:'GIS Report Received & Uploaded',             role:'admin'},
  {id:'claim_docs_ready',         lbl:'Claim Documents Generated by Finance',      role:'finance'},
];
const STAGE_IDS = STAGES.map(s=>s.id);

function stageIdx(id){ return STAGE_IDS.indexOf(id); }
function stageLabel(id){ return STAGES.find(s=>s.id===id)?.lbl||id; }
function nextStage(id){ const i=stageIdx(id); return i>=0&&i<STAGE_IDS.length-1?STAGE_IDS[i+1]:null; }
function stagePct(id){ const i=stageIdx(id); return i<0?0:Math.round((i/10)*100); }
function stageBadge(id){
  if(id==='job_complete')return'b-gn';
  if(['gis_complete','claim_docs_ready','work_complete'].includes(id))return'b-bl';
  if(['teams_notified','gis_notified'].includes(id))return'b-am';
  return'b-gy';
}

const STAGE_DOCS = {
  wo_received:'bpc_wo', vo1_created:'vo1', linesman_notified:null, field_received:'field_report',
  vo2_created:'vo2', works_valuation_created:'works_valuation', work_instruction_ready:'works_instruction', 
  teams_notified:null, work_complete:null,
  gis_notified:'gis_report', gis_complete:'gis_report', 
  claim_docs_ready:'annexure,payment_cert,invoice,list_of_jobs,bpc_spreadsheet',
};

/* ═══════════════════════════════════════
   SUPABASE DATA LAYER  (sync-on-save)
   ───────────────────────────────────────
   The whole app keeps using one in-memory `DB` object exactly as
   before. This layer (a) loads shared data from Supabase into `DB`
   on login, and (b) pushes changes back in the background whenever
   saveDB() runs. If Supabase isn't configured, everything falls
   back to localStorage-only mode automatically.
═══════════════════════════════════════ */
const SB = { client:null, enabled:false, bucket:'claimdesk-scans', ready:false };

(function initSupabase(){
  try{
    const cfg = (window.CLAIMDESK_CONFIG)||{};
    if(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase){
      SB.client  = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      SB.bucket  = cfg.SCANS_BUCKET || 'claimdesk-scans';
      SB.enabled = true;
      console.log('ClaimDesk: Supabase connected.');
    }else{
      console.warn('ClaimDesk: Supabase not configured — running in offline localStorage mode.');
    }
  }catch(e){
    console.error('ClaimDesk: Supabase init failed, using offline mode.', e);
    SB.enabled = false;
  }
})();

/* Pull all shared data from Supabase into the in-memory DB (called on login). */
async function syncFromSupabase(){
  if(!SB.enabled){ SB.ready = true; return; }
  try{
    const c = SB.client;
    const [jobsR, docsR, batchR, logR, notifR, metaR] = await Promise.all([
      c.from('jobs').select('*'),
      c.from('documents').select('*'),
      c.from('claim_batches').select('*'),
      c.from('activity_log').select('*').order('ts',{ascending:false}).limit(500),
      c.from('notifications').select('*').order('ts',{ascending:false}).limit(300),
      c.from('app_meta').select('*'),
    ]);

    const jobs = {};
    (jobsR.data||[]).forEach(row=>{
      const j = row.data && typeof row.data==='object' ? row.data : {};
      j.wo = row.wo; j.cust = row.cust; j.loc = row.loc;
      j.phase = row.phase; j.stage = row.stage; j.claimRef = row.claim_ref||j.claimRef||'';
      jobs[row.wo] = j;
    });
    DB.jobs = jobs;

    (docsR.data||[]).forEach(d=>{
      const j = DB.jobs[d.wo]; if(!j) return;
      if(d.is_signed){
        j.scans = j.scans||{};
        j.scans[d.doc_type] = {
          storagePath:d.storage_path, filename:d.filename,
          uploadedAt:d.created_at, role:d.uploaded_role,
          url: SB.client.storage.from(SB.bucket).getPublicUrl(d.storage_path).data.publicUrl,
        };
      }else if(d.html){
        j.savedDocs = j.savedDocs||{};
        j.savedDocs[d.doc_type] = { html:d.html, savedAt:d.created_at, role:d.uploaded_role };
      }
    });

    const notifs = {admin:[],finance:[],md:[]};
    (notifR.data||[]).forEach(n=>{
      (notifs[n.role] = notifs[n.role]||[]).push({ id:n.id, msg:n.msg, wo:n.wo, read:n.is_read, ts:n.ts });
    });
    DB.notifs = notifs;

    DB.actLog = (logR.data||[]).map(l=>({ wo:l.wo, action:l.action, role:l.role, ts:l.ts }));

    DB.batchDocs = {};
    (batchR.data||[]).forEach(b=>{
      DB.batchDocs[b.id] = { cert:b.cert_no, wos:b.wos||[], docs:b.docs||{}, scans:b.scans||{}, createdAt:b.created_at };
    });

    const seq = (metaR.data||[]).find(m=>m.key==='certSeq');
    if(seq && seq.value!=null) DB.certSeq = Number(seq.value)||DB.certSeq;

    SB.ready = true;
    try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(_){}
  }catch(e){
    console.error('ClaimDesk: load from Supabase failed, using local cache.', e);
    SB.ready = true;
    if(typeof toast==='function') toast('Could not reach the server — showing last saved data','am');
  }
}

/* Push current DB state to Supabase (debounced; called by saveDB). */
let _sbSaveTimer = null;
function pushToSupabase(){
  if(!SB.enabled) return;
  clearTimeout(_sbSaveTimer);
  _sbSaveTimer = setTimeout(_pushNow, 400);
}
async function _pushNow(){
  if(!SB.enabled) return;
  const c = SB.client;
  try{
    const jobRows = Object.values(DB.jobs||{}).map(j=>({
      wo:j.wo, cust:j.cust, loc:j.loc, phase:j.phase, stage:j.stage,
      claim_ref:j.claimRef||null, data:j,
    }));
    if(jobRows.length) await c.from('jobs').upsert(jobRows, {onConflict:'wo'});

    const notifRows=[];
    Object.entries(DB.notifs||{}).forEach(([role,list])=>{
      (list||[]).forEach(n=> notifRows.push({ id:String(n.id), role, msg:n.msg, wo:n.wo||null, is_read:!!n.read, ts:n.ts }));
    });
    if(notifRows.length) await c.from('notifications').upsert(notifRows, {onConflict:'id'});

    const batchRows = Object.entries(DB.batchDocs||{}).map(([id,b])=>({
      id, cert_no:b.cert, wos:b.wos||[], docs:b.docs||{}, scans:b.scans||{},
    }));
    if(batchRows.length) await c.from('claim_batches').upsert(batchRows, {onConflict:'id'});

    if(DB.certSeq!=null) await c.from('app_meta').upsert({key:'certSeq', value:DB.certSeq}, {onConflict:'key'});
  }catch(e){
    console.error('ClaimDesk: background save to Supabase failed (kept locally).', e);
  }
}

/* Append a single activity-log row to Supabase. */
async function pushLogRow(entry){
  if(!SB.enabled) return;
  try{ await SB.client.from('activity_log').insert({ wo:entry.wo||null, action:entry.action, role:entry.role, ts:entry.ts }); }
  catch(e){ /* non-fatal */ }
}

/* ═══════════════════════════════════════
   LOCAL DB  (in-memory + localStorage cache + Supabase sync)
═══════════════════════════════════════ */
const DB_KEY = 'tes_v3';
let DB;
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){ const parsed = JSON.parse(raw); if(parsed && parsed.version) return parsed; }
  }catch(e){ console.warn('Could not load saved data:', e); }
  return null;
}
function saveDB(){
  try{
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  }catch(e){
    console.error('Local save failed:', e);
    if(typeof toast === 'function') toast('Local storage full — server copy still saved','am');
  }
  pushToSupabase();   // background push (no-op if offline)
}

const WO_SEED = [
  {wo:'448223',cust:'Ratanang Mahupe',   loc:'Kauxwi, Modubana', type:'U/G Conn', phase:'46'},
  {wo:'446197',cust:'Thimothiyo Popego', loc:'Shakawe',          type:'U/G Conn', phase:'46'},
  {wo:'448224',cust:'Maria Koloi',       loc:'Shakawe',          type:'U/G Conn', phase:'46'},
  {wo:'441033',cust:'Goitseone Molefe',  loc:'Ncaang',           type:'U/G Conn', phase:'46'},
  {wo:'449501',cust:'Diatsha Mbwedze',   loc:'Sepopa',           type:'OHL 400V', phase:'46'},
  {wo:'449502',cust:'Samarambo Mayira',  loc:'Ngarange',         type:'OHL 400V', phase:'46'},
];

function initDB(){
  const saved = loadDB();
  if(saved){
    DB = saved;
    // Forward-compatible defaults + ensure full rates are present
    DB.notifs = DB.notifs || {};
    DB.actLog = DB.actLog || [];
    DB.batchScans = DB.batchScans || {};
    DB.batchSaved = DB.batchSaved || {};
    if(!DB.rates || !DB.rates.length) DB.rates = [...RATES_SEED];
  }else{
    DB={version:3,jobs:{},notifs:{},actLog:[],rates:[...RATES_SEED],certSeq:1,batchScans:{},batchSaved:{}};
    saveDB();
  }
}
initDB();

function newJob(data){
  return {
    wo:data.wo, cust:data.cust||data.customer, loc:data.loc||data.location,
    type:data.type, phase:data.phase||'47', lf:data.lf||29.25, mk:data.mk||0,
    date:data.date||'', projType:data.projType||'NESC',
    contract:data.contract||'', custNo:data.custNo||'', plotNo:data.plotNo||'',
    ward:data.ward||'', mobile:data.mobile||'',
    bpcProjNo:data.bpcProjNo||'', projNo:data.projNo||'',
    meterNo:data.meterNo||'', address:data.address||'',
    createdAt:new Date().toISOString(), stage:'wo_received',
    vo1:{items:(()=>{
  const lines=(data.type||'').split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  if(lines.length&&lines[0].includes('|')){
    const parsed=lines.map(line=>{const parts=line.split('|').map(p=>p.trim());return{d:parts[0]||'',u:parts[1]||'Ea',q:parseFloat(parts[2])||1,r:parseFloat(parts[3])||0};}).filter(it=>it.d&&it.r>0);
    if(parsed.length) return parsed;
  }
  // No type provided — start with one blank row; Admin fills via autocomplete in VO1
  return[{d:'',u:'Ea',q:1,r:0}];
})(), lf:data.lf||29.25, mk:data.mk||0, phase:data.phase||'47'},
vo2:{items:[], lf:data.lf||29.25, mk:0, startDate:'', compDate:'', phase:data.phase||'47'},
    worksValuation:{created:false},
    fieldData:{}, gisData:{},
    actions:{},
    scans:{},
    claimRef:'',
  };
}

function safeVO2(job){
  if(job.vo2&&job.vo2.items&&job.vo2.items.length>0)return job.vo2;
  return{items:[],lf:job.vo1?job.vo1.lf:29.25,mk:10};
}
function bestTotal(job){
  return(job.vo2&&job.vo2.items&&job.vo2.items.length>0)?jTotal(job,'vo2'):jTotal(job,'vo1');
}
function jTotal(job, which){
  const vo2=safeVO2(job);
  const items=which==='vo2'?vo2.items:(job.vo1&&job.vo1.items?job.vo1.items:[]);
  const lf=which==='vo2'?vo2.lf:(job.vo1?job.vo1.lf:29.25);
  const mk=which==='vo2'?vo2.mk:(job.vo1?job.vo1.mk||0:0);
  const sub=items.reduce((s,i)=>s+(parseFloat(i.q)||0)*(parseFloat(i.r)||0),0);
  const loc=sub*(lf/100);
  const markup=(sub+loc)*(mk/100);
  return{sub,loc,markup,total:sub+loc+markup};
}
const P=n=>'P '+(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const BWP=n=>(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const fd=iso=>iso?new Date(iso).toLocaleDateString('en-BW',{day:'2-digit',month:'short',year:'numeric'}):'—';
const fdt=iso=>iso?new Date(iso).toLocaleString('en-BW',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let CU=''; // current role
let detailWO=null;
let selClaimJobs=new Set();
let recordCb=null;

const RN={admin:'Admin',finance:'Finance',md:'Manager'};

/* ═══════════════════════════════════════
   NOTIFICATIONS + LOG
═══════════════════════════════════════ */
function notify(roles,msg,wo=''){
  const arr=Array.isArray(roles)?roles:[roles];
  arr.forEach(r=>{
    if(!DB.notifs[r])DB.notifs[r]=[];
    DB.notifs[r].unshift({id:Date.now()+'_'+Math.random(),msg,wo,ts:new Date().toISOString(),read:false});
    if(DB.notifs[r].length>40)DB.notifs[r]=DB.notifs[r].slice(0,40);
  });
}
function addLog(wo,action){
  const entry={wo,action,role:RN[CU]||CU,ts:new Date().toISOString()};
  DB.actLog.unshift(entry);
  if(DB.actLog.length>500)DB.actLog=DB.actLog.slice(0,500);
  pushLogRow(entry);
}
function renderNotifs(){
  if(!CU)return;
  const list=(DB.notifs[CU]||[]);
  const unread=list.filter(n=>!n.read).length;
  document.getElementById('npip').classList.toggle('on',unread>0);
  const el=document.getElementById('nlist');
  if(!list.length){el.innerHTML='<div class="n-empty">No notifications</div>';return;}
  el.innerHTML=list.slice(0,20).map(n=>`
    <div class="nitem ${n.read?'read':'unread'}" onclick="clickNotif('${n.id}','${n.wo||''}')">
      <div class="ndot ${n.read?'read':''}"></div>
      <div><div class="nmsg">${n.msg}</div><div class="nts">${fd(n.ts)}</div></div>
    </div>`).join('');
}
function clickNotif(id,wo){
  (DB.notifs[CU]||[]).forEach(n=>{if(n.id===id)n.read=true;});
  saveDB();document.getElementById('npanel').classList.remove('open');renderNotifs();
  if(!wo||!DB.jobs[wo])return;
  openJobDetail(wo);
}
function markAllRead(){(DB.notifs[CU]||[]).forEach(n=>n.read=true);saveDB();renderNotifs();}
function toggleNotif(){
  document.getElementById('npanel').classList.toggle('open');
  if(document.getElementById('npanel').classList.contains('open'))renderNotifs();
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.notif-wrap'))document.getElementById('npanel')?.classList.remove('open');
});

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function toast(msg,type='gn'){
  const el=document.createElement('div');el.className=`toast toast-${type}`;
  const icons={gn:'<polyline points="20 6 9 17 4 12"/>',rd:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',am:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>'};
  el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type]||icons.gn}</svg>${msg}`;
  document.body.appendChild(el);setTimeout(()=>el.remove(),3500);
}

/* ═══════════════════════════════════════
   SCAN UPLOAD
═══════════════════════════════════════ */
function triggerScan(wo,docType){
  const el=document.getElementById(`scan-input-${wo}-${docType}`);if(el)el.click();
}
function handleScan(wo,docType,input){
  if(!input.files[0])return;
  const file=input.files[0];
  if(file.size>10*1024*1024){toast('File too large — max 10MB','am');return;}
  if(SB.enabled){
    _uploadScanToSupabase(wo,docType,file);
  }else{
    const reader=new FileReader();
    reader.onload=e=>{
      if(!DB.jobs[wo].scans)DB.jobs[wo].scans={};
      DB.jobs[wo].scans[docType]={dataUrl:e.target.result,filename:file.name,uploadedAt:new Date().toISOString(),role:CU};
      addLog(wo,`Signed scan uploaded: ${docType} (${file.name})`);
      saveDB();refreshDetail();
      toast('✓ Scan uploaded: '+file.name);
      notify(['md'],`New signed document uploaded for WO ${wo}: ${docType}`,wo);
    };
    reader.readAsDataURL(file);
  }
}
async function _uploadScanToSupabase(wo,docType,file){
  toast('Uploading scan…','am');
  try{
    const ext=(file.name.split('.').pop()||'pdf').toLowerCase();
    const path=`${wo}/${docType}_${Date.now()}.${ext}`;
    const {error:upErr}=await SB.client.storage.from(SB.bucket).upload(path,file,{upsert:true,contentType:file.type||undefined});
    if(upErr)throw upErr;
    const url=SB.client.storage.from(SB.bucket).getPublicUrl(path).data.publicUrl;
    if(!DB.jobs[wo].scans)DB.jobs[wo].scans={};
    DB.jobs[wo].scans[docType]={storagePath:path,url,filename:file.name,uploadedAt:new Date().toISOString(),role:CU};
    await SB.client.from('documents').insert({
      wo, doc_type:docType, is_signed:true, storage_path:path, filename:file.name, uploaded_role:CU,
    });
    addLog(wo,`Signed scan uploaded: ${docType} (${file.name})`);
    notify(['md'],`New signed document uploaded for WO ${wo}: ${docType}`,wo);
    saveDB();refreshDetail();
    toast('✓ Scan uploaded: '+file.name);
  }catch(e){
    console.error(e);
    toast('Upload failed: '+(e.message||'check connection'),'rd');
  }
}
function removeScan(wo,docType){
  if(!confirm('Remove this uploaded scan?'))return;
  if(!DB.jobs[wo]||!DB.jobs[wo].scans)return;
  const s=DB.jobs[wo].scans[docType];
  delete DB.jobs[wo].scans[docType];
  addLog(wo,'Scan removed: '+docType);
  saveDB();refreshDetail();refreshAll();
  toast('Scan removed','am');
  if(SB.enabled){
    (async()=>{
      try{
        if(s&&s.storagePath) await SB.client.storage.from(SB.bucket).remove([s.storagePath]);
        await SB.client.from('documents').delete().match({wo,doc_type:docType,is_signed:true});
      }catch(e){/* non-fatal */}
    })();
  }
}
function downloadScan(wo,docType){
  let s;
  if(wo&&DB.jobs[wo]){s=DB.jobs[wo]?.scans?.[docType];}
  if(!s){toast('No scan found to download','am');return;}
  try{
    const a=document.createElement('a');
    a.href=s.url||s.dataUrl;
    a.download=s.filename||docType+'.pdf';
    if(s.url){a.target='_blank';a.rel='noopener';}
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }catch(e){toast('Download failed: '+e.message,'rd');}
}
function scanWidget(wo,docType,editable){
  const s=DB.jobs[wo]?.scans?.[docType];
  if(s){
    return `<div class="scan-done">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
      <strong>${s.filename}</strong> · ${fd(s.uploadedAt)}
      <button class="btn btn-gy btn-sm" onclick="event.stopPropagation();downloadScan('${wo}','${docType}')">⬇ Download</button>
      ${editable?`<button class="btn btn-rd btn-sm" onclick="event.stopPropagation();removeScan('${wo}','${docType}')">✕ Remove</button>`:''}
    </div>`;
  }
  if(!editable) return `<span style="font-size:.72rem;color:var(--tx3)">No scan uploaded yet</span>`;
  return `<label class="scan-upload-label">
    📎 Upload Signed Scan
    <input type="file" id="scan-input-${wo}-${docType}" accept="image/*,application/pdf" onchange="handleScan('${wo}','${docType}',this)" style="display:none">
  </label>`;
}

/* ═══════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════ */
/* ══════════════════════════════════════════
   ROLE-SPECIFIC DASHBOARD RENDERS
══════════════════════════════════════════ */
function renderDashboard(){
  // Hide all panels, show only the one for CU
  ['dash-admin','dash-finance','dash-gis','dash-md'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  if(CU==='admin')   renderAdminDash();
  if(CU==='finance') renderFinanceDash();
  if(CU==='md')      renderMDDash();
}

/* ── ADMIN ── */
function renderAdminDash(){
  const el=document.getElementById('dash-admin');if(!el)return;
  el.style.display='block';
  const jobs=Object.values(DB.jobs);
  const ADMIN_NEEDS=[  // stages where admin must act
    'wo_received','vo1_created','field_received','vo2_created','work_instruction_ready','work_complete','gis_notified','claim_docs_ready'
  ];
  const EXTERNAL_WAITING=[  // waiting on linesman/teams
    'linesman_notified','teams_notified'
  ];
  const needsAction=jobs.filter(j=>ADMIN_NEEDS.includes(j.stage));
  const waiting=jobs.filter(j=>EXTERNAL_WAITING.includes(j.stage));
  const val=jobs.reduce((s,j)=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');return s+t.total;},0);
  document.getElementById('a-total').textContent=jobs.length;
  document.getElementById('a-action').textContent=needsAction.length;
  document.getElementById('a-prog').textContent=waiting.length;
  document.getElementById('a-val').textContent=P(val);

  const taskIcons={wo_received:'📋',vo1_created:'📤',field_received:'📝',vo2_created:'👷',work_instruction_ready:'📄',work_complete:'📍',gis_notified:'📋',claim_docs_ready:'✅'};
  const taskLabels={wo_received:'Create VO1 — Review uploaded WO',vo1_created:'Notify Linesman (external) — Record in system',field_received:'Upload Linesman Findings, then Create VO2',vo2_created:'Prepare Works Instruction document',work_instruction_ready:'Send Works Instruction to Teams (external) — Record',work_complete:'Notify GIS Consultant (external)',claim_docs_ready:'Review Finance Docs — Record Job as Complete'};
  const taskBadges={wo_received:'b-rd',vo1_created:'b-am',field_received:'b-am',vo2_created:'b-am',work_instruction_ready:'b-am',work_complete:'b-am',gis_notified:'b-am',claim_docs_ready:'b-gn'};
  const tasksEl=document.getElementById('a-tasks');
  if(!needsAction.length){tasksEl.innerHTML='<div style="padding:1.25rem;text-align:center;color:var(--gn);font-size:.82rem">✓ No pending actions right now</div>';}
  else{tasksEl.innerHTML=needsAction.map(j=>`
    <div class="tbl-row" style="grid-template-columns:30px 1fr 160px 100px;cursor:pointer" onclick="openJobDetail('${j.wo}')">
      <span style="font-size:1.1rem">${taskIcons[j.stage]||'📄'}</span>
      <div>
        <div style="font-size:.83rem;font-weight:600;color:var(--tx)">${taskLabels[j.stage]||stageLabel(j.stage)}</div>
        <div style="font-size:.72rem;color:var(--tx2);margin-top:1px">WO ${j.wo} · ${j.cust} · ${j.loc.split(',')[0]}</div>
      </div>
      <span style="font-size:.72rem;color:var(--tx2)">${stageLabel(j.stage)}</span>
      <span class="badge ${taskBadges[j.stage]||'b-am'}">Act Now</span>
    </div>`).join('');}

  const waitIcons={linesman_notified:'👷',teams_notified:'🔨',gis_notified:'📍'};
  const waitLabels={linesman_notified:'Linesman conducting field survey',teams_notified:'Teams executing work on site',gis_notified:'GIS consultant on site'};
  const waitEl=document.getElementById('a-waiting');
  if(!waiting.length){waitEl.innerHTML='<div style="padding:1.25rem;text-align:center;color:var(--tx3);font-size:.8rem">Nothing waiting on external parties</div>';}
  else{waitEl.innerHTML=waiting.map(j=>`
    <div class="tbl-row" style="grid-template-columns:30px 1fr 160px 80px;cursor:pointer" onclick="openJobDetail('${j.wo}')">
      <span style="font-size:1.1rem">${waitIcons[j.stage]||'⏳'}</span>
      <div>
        <div style="font-size:.83rem;font-weight:500;color:var(--tx2)">${waitLabels[j.stage]||stageLabel(j.stage)}</div>
        <div style="font-size:.72rem;color:var(--tx3);margin-top:1px">WO ${j.wo} · ${j.cust} · since ${j.actions[j.stage]?.date||'—'}</div>
      </div>
      <span style="font-size:.72rem;color:var(--tx2)">${j.loc.split(',')[0]}</span>
      <span class="badge b-bl">Waiting</span>
    </div>`).join('');}
}

/* ── FINANCE ── */
function renderFinanceDash(){
  const el=document.getElementById('dash-finance');if(!el)return;
  el.style.display='block';
  const jobs=Object.values(DB.jobs);
  const ready=jobs.filter(j=>j.stage==='gis_complete');
  const done=jobs.filter(j=>j.stage==='claim_docs_ready');
  const completed=jobs.filter(j=>j.stage==='job_complete');
  const netVal=ready.reduce((s,j)=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');return s+t.total*.92;},0)
    +done.reduce((s,j)=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');return s+t.total*.92;},0);
  document.getElementById('f-ready').textContent=ready.length;
  document.getElementById('f-done').textContent=done.length;
  document.getElementById('f-net').textContent=P(netVal);
  document.getElementById('f-sub').textContent=completed.length;

  const tasksEl=document.getElementById('f-tasks');
  if(!ready.length){tasksEl.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No jobs ready yet — waiting for GIS reports to be uploaded</div>';}
  else{tasksEl.innerHTML=ready.map(j=>{
    const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');
    return`<div class="tbl-row" style="grid-template-columns:30px 1fr 110px 110px 120px;cursor:pointer" onclick="openJobDetail('${j.wo}')">
      <span style="font-size:1.1rem">💰</span>
      <div>
        <div style="font-size:.83rem;font-weight:600;color:var(--tx)">${j.cust}</div>
        <div style="font-size:.72rem;color:var(--tx2);margin-top:1px">WO ${j.wo} · ${j.loc.split(',')[0]}</div>
      </div>
      <span class="mono" style="font-size:.8rem">${P(t.total)}</span>
      <span style="font-size:.72rem;color:var(--gn)">✓ GIS received</span>
      <span class="badge b-am">Generate Docs</span>
    </div>`;}).join('');}

  const procEl=document.getElementById('f-processed');
  if(![...done,...completed].length){procEl.innerHTML='<div style="padding:1rem;text-align:center;color:var(--tx3);font-size:.8rem">None yet</div>';}
  else{procEl.innerHTML=[...done,...completed].map(j=>{
    const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');
    return`<div class="tbl-row" style="grid-template-columns:30px 1fr 110px 100px;cursor:pointer" onclick="openJobDetail('${j.wo}')">
      <span style="font-size:1.1rem">${j.stage==='job_complete'?'✅':'📋'}</span>
      <div><div style="font-size:.83rem;font-weight:500;color:var(--tx2)">${j.cust} · WO ${j.wo}</div>
        <div style="font-size:.7rem;color:var(--tx3)">${j.claimRef||'—'}</div></div>
      <span class="mono" style="font-size:.8rem">${P(t.total)}</span>
      <span class="badge ${j.stage==='job_complete'?'b-gn':'b-bl'}">${j.stage==='job_complete'?'Complete':'Docs Ready'}</span>
    </div>`;}).join('');}
}


/* ── MANAGING DIRECTOR ── */
function renderMDDash(){
  const el=document.getElementById('dash-md');if(!el)return;
  el.style.display='block';
  const jobs=Object.values(DB.jobs);
  const active=jobs.filter(j=>j.stage!=='job_complete');
  const docsReady=jobs.filter(j=>j.stage==='claim_docs_ready');
  const jobsDone=jobs.filter(j=>j.stage==='job_complete');
  const val=jobs.reduce((s,j)=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');return s+t.total;},0);
  document.getElementById('m-total').textContent=jobs.length;
  document.getElementById('m-active').textContent=active.length;
  document.getElementById('m-docs').textContent=docsReady.length;
  document.getElementById('m-val').textContent=P(val);

  // Who is doing what right now
  // ── MD per-job pipeline + doc download tracker ──
  const MD_STEPS=[
    {sid:'vo1_created',     dt:'vo1',            lbl:'VO1'},
    {sid:'vo2_created',     dt:'vo2',            lbl:'VO2'},
    {sid:'works_valuation_created',dt:'works_valuation',lbl:'WV'},
    {sid:'work_instruction_ready', dt:'works_instruction',lbl:'WI'},
    {sid:'gis_complete',    dt:'gis_report',     lbl:'GIS'},
  ];
  const ST_LBL={wo_received:'Admin — Create VO1',vo1_created:'Admin — Notify Linesman',linesman_notified:'Linesman — Field Survey',field_received:'Admin — Create VO2',vo2_created:'Admin — Works Valuation',works_valuation_created:'Admin — Works Instruction',work_instruction_ready:'Admin — Send to Teams',teams_notified:'Teams — On Site',work_complete:'Admin — Notify GIS',gis_notified:'GIS — On Site',gis_complete:'Done — Claim Ready'};
  const ST_COL={wo_received:'var(--am)',vo1_created:'var(--am)',linesman_notified:'var(--bl)',field_received:'var(--am)',vo2_created:'var(--am)',works_valuation_created:'var(--am)',work_instruction_ready:'var(--am)',teams_notified:'var(--bl)',work_complete:'var(--am)',gis_notified:'var(--bl)',gis_complete:'var(--gn)'};
  const wwEl=document.getElementById('m-whoswhat');
  if(!jobs.length){wwEl.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No jobs yet</div>';}
  else{wwEl.innerHTML=jobs.map(j=>{
    const saved=j.savedDocs||{}, scans=j.scans||{};
    const col=ST_COL[j.stage]||'var(--tx3)';
    const tv=jTotal(j,(j.vo2&&j.vo2.items&&j.vo2.items.length)?'vo2':'vo1');
    const docBtns=MD_STEPS.map(s=>{
      const done=stageIdx(j.stage)>=stageIdx(s.sid);
      if(!done) return`<span style="font-size:.62rem;color:var(--tx3);padding:1px 4px;border:1px solid var(--bd);border-radius:3px;opacity:.35">${s.lbl}</span>`;
      if(scans[s.dt]) return`<button class="btn btn-gn btn-sm" style="font-size:.62rem;padding:2px 5px" onclick="downloadScan('${j.wo}','${s.dt}')">&#11015;${s.lbl}&#10003;</button>`;
      if(saved[s.dt]) return`<button class="btn btn-bl btn-sm" style="font-size:.62rem;padding:2px 5px" onclick="downloadSavedDoc('${j.wo}','${s.dt}')">&#11015;${s.lbl}</button>`;
      return`<button class="btn btn-gy btn-sm" style="font-size:.62rem;padding:2px 5px" onclick="openDocForAction('${j.wo}','${s.dt}')">&#128065;${s.lbl}</button>`;
    }).join(' ');
    return`<div style="padding:.65rem 1rem;border-bottom:1px solid var(--bd)">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
        <span class="mono" style="font-size:.76rem;color:var(--am);cursor:pointer;flex-shrink:0" onclick="openJobDetail('${j.wo}')">WO ${j.wo}</span>
        <span style="font-size:.8rem;font-weight:600;color:var(--tx);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${j.cust}</span>
        <span class="mono" style="font-size:.73rem;color:var(--am);flex-shrink:0">${P(tv.total)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
        <div style="width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0"></div>
        <span style="font-size:.69rem;color:${col}">${ST_LBL[j.stage]||j.stage}</span>
        <span style="font-size:.66rem;color:var(--tx3);margin-left:auto">${j.loc.split(',')[0]}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${docBtns}</div>
    </div>`;
  }).join('');}

    // Completed jobs — List of Jobs Done
  const doneEl=document.getElementById('m-done-jobs');
  if(doneEl){
    if(!jobsDone.length){
      doneEl.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No completed jobs yet</div>';
    } else {
      const totalClaimVal=jobsDone.reduce((s,j)=>{const t=j.vo2.items.length?jTotal(j,'vo2'):jTotal(j,'vo1');return s+t.total;},0);
      doneEl.innerHTML=`
        <div style="margin:.75rem 1rem;padding:.75rem 1rem;background:var(--gn-bg);border:1px solid var(--gn-b);border-radius:var(--rs);font-size:.78rem;color:var(--gn)">
          <div style="font-weight:700;font-size:.82rem;margin-bottom:6px">📋 Ready to Claim — ${jobsDone.length} completed job${jobsDone.length>1?'s':''} · Total: <span style="color:var(--am)">${P(totalClaimVal)}</span></div>
          <div style="color:var(--tx);line-height:1.6;font-size:.76rem">
            <strong>To submit a claim to BPC, prepare the following documents in order:</strong><br>
            1. <strong>List of Jobs Done</strong> — edit &amp; print from any completed job's Documents panel (Admin prepares this)<br>
            2. <strong>Annexure to Payment Certificate</strong> — Finance generates this via Claim Batch<br>
            3. <strong>Payment Certificate</strong> — Finance generates this via Claim Batch<br>
            4. <strong>Tax Invoice</strong> — Finance generates this via Claim Batch<br>
            5. <strong>VO1 &amp; VO2 documents</strong> — signed copies from each job<br>
            6. <strong>GIS Reports</strong> — signed copies from each job<br>
            7. <strong>BPC Work Orders</strong> — originals received from BPC<br><br>
            Print each document → obtain hand signatures → scan and upload back into the system → compile the full set and submit physically to BPC offices.
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-gn btn-sm" onclick="openDocForAction(null,'list_of_jobs')">📄 Open List of Jobs Done</button>
            <span style="font-size:.73rem;color:var(--tx2);align-self:center">↑ Edit, print &amp; sign this first, then bring all documents to BPC</span>
          </div>
        </div>
        ${jobsDone.map(j=>{
          const t=j.vo2.items.length?jTotal(j,'vo2'):jTotal(j,'vo1');
          return`<div style="display:grid;grid-template-columns:80px 1fr 80px 110px 100px 110px;gap:10px;padding:.6rem 1rem;border-bottom:1px solid var(--bd);font-size:.8rem;align-items:center;cursor:pointer;transition:.1s" onclick="openJobDetail('${j.wo}')" onmouseover="this.style.background='var(--sf2)'" onmouseout="this.style.background=''">
            <span class="mono">${j.wo}</span>
            <span>${j.cust}</span>
            <span class="tag">${j.loc.split(',')[0]}</span>
            <span class="mono">${P(t.total)}</span>
            <span style="font-size:.72rem;color:var(--tx3)">${j.actions.work_complete?.date||'—'}</span>
            <span class="badge b-gn">✓ Complete</span>
          </div>`;}).join('')}`;
    }
  }

  // Full jobs table
  const allEl=document.getElementById('m-alljobs');
  if(!jobs.length){allEl.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No work orders yet</div>';}
  else{allEl.innerHTML=jobs.map(j=>{
    const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');
    const doneDocs=Object.keys(j.scans||{}).length;
    const totalDocs=9;
    return`<div style="display:grid;grid-template-columns:80px 1fr 80px 100px 1fr 80px;gap:10px;padding:.6rem 1rem;border-bottom:1px solid var(--bd);font-size:.8rem;align-items:center;cursor:pointer;transition:.1s" onclick="openJobDetail('${j.wo}')" onmouseover="this.style.background='var(--sf2)'" onmouseout="this.style.background=''">
      <span class="mono">${j.wo}</span>
      <div><div>${j.cust}</div><div class="prog-w" style="width:120px;margin-top:3px"><div class="prog-b" style="width:${stagePct(j.stage)}%"></div></div></div>
      <span class="tag">${j.loc.split(',')[0]}</span>
      <span class="mono">${P(t.total)}</span>
      <span style="font-size:.72rem;color:var(--tx2)">${stageLabel(j.stage)}</span>
      <span style="font-size:.72rem;color:${doneDocs>0?'var(--gn)':'var(--tx3)'}">${doneDocs}/${totalDocs} scans</span>
    </div>`;}).join('');}
}

/* ═══════════════════════════════════════
   JOBS LIST
═══════════════════════════════════════ */
function renderJobs(){
  document.getElementById('jobs-add-btn').innerHTML=CU==='admin'?`<button class="btn btn-am btn-sm" onclick="openModal('addWOModal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Work Order</button>`:'';
  const jobs=Object.values(DB.jobs);
  document.getElementById('jobsList').innerHTML=jobs.length
    ?jobs.map(j=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');
      return`<div class="tbl-row jobs-cols clickable" onclick="openJobDetail('${j.wo}')">
        <span class="mono">${j.wo}</span><span>${j.cust}</span>
        <span class="tag">${j.loc.split(',')[0]}</span>
        <span class="mono">${P(t.total)}</span>
        <span style="font-size:.72rem;color:var(--tx2)">${stageLabel(j.stage)}</span>
        <span class="badge ${stageBadge(j.stage)}">${j.stage==='job_complete'?'✓ Done':'Active'}</span>
      </div>`;}).join('')
    :'<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No work orders yet. Click Add Work Order to begin.</div>';
}

/* ═══════════════════════════════════════
   ADD WORK ORDER
═══════════════════════════════════════ */
function saveNewWO(){
  const rawNum=document.getElementById('nw-num').value.trim();
  const num=rawNum&&/^\d+$/.test(rawNum)?rawNum.padStart(10,'0'):rawNum;
  const cust=document.getElementById('nw-cust').value.trim();
  const loc=document.getElementById('nw-loc').value.trim();
  const type=document.getElementById('nw-type')?.value||'';
  if(!num||!cust||!loc){toast('Fill in WO Number, Customer Name and Location','am');return;}
  if(DB.jobs[num]){toast('WO number already exists','rd');return;}
  const phase=document.getElementById('nw-phase').value||'47';
  const lf=parseFloat(document.getElementById('nw-lf').value)||29.25;
  const date=document.getElementById('nw-date').value||'';
  const projType=document.getElementById('nw-projtype').value.trim()||'NESC';
  const contract=document.getElementById('nw-contract').value.trim()||'';
  const custNo=document.getElementById('nw-custno').value.trim()||'';
  const plotNo=document.getElementById('nw-plotno').value.trim()||'';
  const ward=document.getElementById('nw-ward').value.trim()||'';
  const mobile=document.getElementById('nw-mobile').value.trim()||'';
  const bpcProjNo=document.getElementById('nw-bpcprojno').value.trim()||'';
  const projNo=document.getElementById('nw-projno').value.trim()||'';
  const meterNo=document.getElementById('nw-meter').value.trim()||'';
  const address=document.getElementById('nw-address').value.trim()||'';
  const job=newJob({wo:num,cust,loc,type,phase,lf,date,projType,contract,custNo,plotNo,ward,mobile,bpcProjNo,projNo,meterNo,address});
  const scanInput=document.getElementById('nw-scan');
  if(scanInput&&scanInput.files[0]){
    const f=scanInput.files[0];
    const reader=new FileReader();
    reader.onload=e=>{
      job.scans.bpc_wo={dataUrl:e.target.result,filename:f.name,uploadedAt:new Date().toISOString(),role:CU};
      DB.jobs[num]=job;addLog(num,'Work order created with BPC scan uploaded');saveDB();
      notify(['finance','gis','md'],`New WO ${num} — ${cust} added to system`,num);
      closeModal('addWOModal');clearWOForm();refreshAll();toast(`Work Order WO ${num} added`);
    };reader.readAsDataURL(f);
  } else {
    DB.jobs[num]=job;addLog(num,'Work order created from BPC email');saveDB();
    notify(['finance','gis','md'],`New WO ${num} — ${cust} added to system`,num);
    closeModal('addWOModal');clearWOForm();refreshAll();toast(`Work Order WO ${num} added`);
  }
}
function resetAddWOForm(){
  clearWOForm();
}

/* ═══════════════════════════════════════
   INBOX
═══════════════════════════════════════ */
function renderInbox(){
  const tasks=[];
  const jobs=Object.values(DB.jobs);
  if(CU==='admin'){
    jobs.filter(j=>j.stage==='wo_received').forEach(j=>tasks.push({wo:j.wo,icon:'📋',name:'Create VO1 — Review BPC Work Order · WO '+j.wo,desc:j.cust+' · '+j.loc,badge:'Action Required',bc:'b-am'}));
    jobs.filter(j=>j.stage==='vo1_created').forEach(j=>tasks.push({wo:j.wo,icon:'📤',name:'Notify Linesman Externally — Record in System · WO '+j.wo,desc:j.cust,badge:'Next Step',bc:'b-gy'}));
    jobs.filter(j=>j.stage==='linesman_notified').forEach(j=>tasks.push({wo:j.wo,icon:'📥',name:'Upload Linesman Findings — WO '+j.wo,desc:j.cust+' · awaiting linesman field report',badge:'Waiting',bc:'b-bl'}));
    jobs.filter(j=>j.stage==='field_received').forEach(j=>tasks.push({wo:j.wo,icon:'📝',name:'Create VO2 from Field Findings — WO '+j.wo,desc:j.cust,badge:'Action Required',bc:'b-am'}));
    jobs.filter(j=>j.stage==='vo2_created').forEach(j=>tasks.push({wo:j.wo,icon:'📄',name:'Prepare Works Instruction — WO '+j.wo,desc:j.cust+' · ready to instruct teams',badge:'Action Required',bc:'b-am'}));
    jobs.filter(j=>j.stage==='work_instruction_ready').forEach(j=>tasks.push({wo:j.wo,icon:'📤',name:'Send WI to Teams (External) — Record in System · WO '+j.wo,desc:j.cust,badge:'Action Required',bc:'b-am'}));
    jobs.filter(j=>j.stage==='teams_notified').forEach(j=>tasks.push({wo:j.wo,icon:'✅',name:'Waiting: Teams Executing Work — WO '+j.wo,desc:j.cust+' · click when teams report back',badge:'Waiting',bc:'b-bl'}));
    jobs.filter(j=>j.stage==='work_complete').forEach(j=>tasks.push({wo:j.wo,icon:'📍',name:'Notify GIS Consultant Externally — Record in System · WO '+j.wo,desc:j.cust,badge:'Action Required',bc:'b-am'}));
    jobs.filter(j=>j.stage==='gis_notified').forEach(j=>tasks.push({wo:j.wo,icon:'📍',name:'Waiting: GIS Consultant on Site — WO '+j.wo,desc:j.cust+' · Notified: '+(j.actions.gis_notified?.date||'—'),badge:'Waiting',bc:'b-bl'}));
    jobs.filter(j=>j.stage==='gis_notified').length===0&&jobs.filter(j=>j.stage==='work_complete').forEach(()=>{});
    jobs.filter(j=>j.stage==='claim_docs_ready').forEach(j=>tasks.push({wo:j.wo,icon:'✅',name:'Finance Docs Ready — Record Job Complete · WO '+j.wo,desc:j.cust+' · all documents ready',badge:'Final Step',bc:'b-gn'}));
  }
  if(CU==='finance'){
    jobs.filter(j=>j.stage==='gis_complete').forEach(j=>tasks.push({wo:j.wo,icon:'💰',name:'Generate Claim Documents — WO '+j.wo,desc:j.cust+' · GIS report received',badge:'Ready',bc:'b-gn'}));
  }
  const badge=document.getElementById('ibadge');
  badge.style.display=tasks.length?'inline-block':'none';
  badge.textContent=tasks.filter(t=>t.bc!=='b-gn'&&t.bc!=='b-bl').length;
  const list=document.getElementById('inboxList');
  if(!tasks.length){list.innerHTML='<div style="padding:2rem;text-align:center;color:var(--tx3);font-size:.8rem">Your inbox is empty — nothing needs action right now</div>';return;}
  list.innerHTML=tasks.map(t=>{
    // GIS tasks open straight to their action form
    const clickFn = `openJobDetail('${t.wo}')`;
    return`<div class="tbl-row" style="grid-template-columns:30px 1fr 100px;cursor:pointer" onclick="${clickFn}">
      <span style="font-size:1.1rem">${t.icon}</span>
      <div>
        <div style="font-size:.82rem;font-weight:600;color:var(--tx)">${t.name}</div>
        <div style="font-size:.72rem;color:var(--tx2);margin-top:2px">${t.desc}</div>
      </div>
      <span class="badge ${t.bc}">${t.badge}</span>
    </div>`;}).join('');
}

/* ═══════════════════════════════════════
   RECORD ACTION MODAL
═══════════════════════════════════════ */
let recordStage='', recordWO='';
function openRecord(wo,stage,title,desc,extraLabel=''){
  recordWO=wo; recordStage=stage;
  document.getElementById('rec-title').textContent=title;
  document.getElementById('rec-desc').textContent=desc;
  document.getElementById('rec-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('rec-notes').value='';
  document.getElementById('rec-extra').value='';
  if(extraLabel){
    document.getElementById('rec-extra-label').textContent=extraLabel;
    document.getElementById('rec-extra-label').style.display='block';
    document.getElementById('rec-extra').style.display='block';
  } else {
    document.getElementById('rec-extra-label').style.display='none';
    document.getElementById('rec-extra').style.display='none';
  }
  openModal('recordModal');
}
function confirmRecord(){
  const date=document.getElementById('rec-date').value;
  const notes=document.getElementById('rec-notes').value.trim();
  const extra=document.getElementById('rec-extra').value.trim();
  if(!date){toast('Please select a date','am');return;}
  const job=DB.jobs[recordWO];if(!job)return;
  job.actions[recordStage]={date,notes,extra};
  job.stage=recordStage;
  addLog(recordWO,stageLabel(recordStage)+' — recorded by '+RN[CU]);
  // Stage-specific notifications
  if(recordStage==='linesman_notified'){notify(['md'],`Linesman notified for WO ${recordWO} — ${job.cust}. Awaiting field findings.`,recordWO);}
  if(recordStage==='teams_notified'){notify(['md'],`Teams notified for WO ${recordWO} — ${job.cust}. Work in progress.`,recordWO);}
  if(recordStage==='work_complete'){notify(['finance','md'],`Work complete: WO ${recordWO} — ${job.cust}. Next: Notify GIS consultant, then finance will prepare claim docs.`,recordWO);}
  if(recordStage==='gis_notified'){notify(['md'],`GIS consultant notified for WO ${recordWO} — ${job.cust}. Awaiting GIS report.`,recordWO);}
  if(recordStage==='job_complete'){
    addLog(recordWO,'Job added to List of Jobs Done');
    notify(['md'],`Job complete: WO ${recordWO} — ${job.cust}. Added to List of Jobs Done.`,recordWO);
  }
  saveDB();closeModal('recordModal');refreshDetail();refreshAll();
  toast(stageLabel(recordStage)+' recorded');
}

/* ═══════════════════════════════════════
   JOB DETAIL
═══════════════════════════════════════ */
function openJobDetail(wo){
  detailWO=wo;
  const job=DB.jobs[wo];if(!job)return;
  document.getElementById('n-jobdetail').style.display='flex';
  nav('jobdetail');
}
function goBackFromDetail(){nav('jobs');}
function refreshDetail(){if(detailWO)renderJobDetail(detailWO);}

function renderJobDetail(wo){
  const job=DB.jobs[wo];if(!job)return;
  const canEdit=CU==='admin';
  const isFinance=CU==='finance';
  const isMD=CU==='md';
  const t=jTotal(job,job.vo2.items.length?'vo2':'vo1');
  const pct=stagePct(job.stage);

  // Header
  document.getElementById('jdHeader').innerHTML=`
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <span class="jd-wo">WO ${job.wo}</span>
        <span class="badge ${stageBadge(job.stage)}">${stageLabel(job.stage)}</span>
      </div>
      <div style="font-size:1rem;font-weight:600;color:var(--tx)">${job.cust}</div>
      <div style="font-size:.78rem;color:var(--tx2);margin-top:2px">${job.loc} · ${job.type} · Phase ${job.phase}</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:1.2rem;font-weight:600;color:var(--am)">${P(t.total)}</div>
      <div style="font-size:.67rem;color:var(--tx3);margin-top:2px">${pct}% complete</div>
      <div style="width:100px;margin-top:4px"><div class="prog-w" style="height:6px"><div class="prog-b" style="width:${pct}%"></div></div></div>
    </div>`;

  // Pipeline - FILTERED BY ROLE
  const currIdx=stageIdx(job.stage);

  // MD gets a special rich view — not the action pipeline
  if(isMD){
    // Build MD pipeline view: ticked steps + documents per step
    const mdStepDocs={
      vo1_created:{label:'Works Valuation (VO1) Created',docs:['vo1']},
      linesman_notified:{label:'Linesman Notified (External)',docs:[]},
      field_received:{label:'Linesman Findings Received',docs:['field_report']},
      vo2_created:{label:'Variation Order (VO2) Created',docs:['vo2']},
      works_valuation_created:{label:'Works Valuation Document Created',docs:['works_valuation']},
      work_instruction_ready:{label:'Works Instruction Prepared',docs:[]},
      teams_notified:{label:'Teams Notified to Start Work',docs:[]},
      work_complete:{label:'Teams Reported Work Complete',docs:['works_instruction']},
      gis_notified:{label:'GIS Consultant Notified',docs:[]},
      gis_complete:{label:'GIS Report & Certificate Received',docs:['gis_report','gis_cert']},
      claim_docs_ready:{label:'Claim Documents Generated',docs:['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet']},
    };
    const docLabelMap={vo1:'VO1',vo2:'VO2',field_report:'Field Report',works_valuation:'Works Valuation',works_instruction:'Works Instruction',gis_report:'GIS Report',gis_cert:'GIS Certificate',annexure:'Annexure',payment_cert:'Payment Certificate',invoice:'Invoice',list_of_jobs:'List of Jobs',bpc_spreadsheet:'BPC Spreadsheet'};
    document.getElementById('jdPipeline').innerHTML=STAGES.map(st=>{
      const globalIdx=STAGE_IDS.indexOf(st.id);
      const state=globalIdx<currIdx?'done':globalIdx===currIdx?'active':'pending';
      const action=job.actions[st.id];
      const stepInfo=mdStepDocs[st.id]||{docs:[]};
      const docs=stepInfo.docs||[];
      // Build doc buttons for this step
      let docHtml='';
      if(state==='done'&&docs.length){
        docHtml='<div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">';
        docs.forEach(dt=>{
          const hasSaved=job.savedDocs&&job.savedDocs[dt]&&job.savedDocs[dt].html;
          const hasScan=job.scans&&job.scans[dt];
          // For claim docs, also check batchDocs
          let canView=hasSaved||hasScan;
          if(!canView&&['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'].includes(dt)&&job.claimRef){
            const bm=Object.values(DB.jobs).find(j=>j.claimRef===job.claimRef&&j.savedDocs&&j.savedDocs[dt]);
            if(bm)canView=true;
            if(!canView&&DB.batchDocs&&DB.batchDocs[job.claimRef]){
              const bmap={annexure:'annexure',payment_cert:'paymentCert',invoice:'invoice',list_of_jobs:'listOfJobs',bpc_spreadsheet:'bpcSpreadsheet'};
              if(DB.batchDocs[job.claimRef][bmap[dt]])canView=true;
            }
          }
          if(canView){
            docHtml+=`<button class="btn btn-bl btn-sm" onclick="openDocForAction('${wo}','${dt}')">👁 ${docLabelMap[dt]||dt}</button>`;
            if(hasScan)docHtml+=`<button class="btn btn-gn btn-sm" onclick="downloadScan('${wo}','${dt}')">⬇ Signed</button>`;
          } else {
            docHtml+=`<span style="font-size:.68rem;color:var(--tx3);padding:2px 5px;border:1px solid var(--bd);border-radius:3px;opacity:.5">${docLabelMap[dt]||dt} — pending</span>`;
          }
        });
        // Add claim batch button at claim_docs_ready step
        if(st.id==='claim_docs_ready'){
          docHtml+=`<button class="btn btn-am btn-sm" onclick="nav('claims')" style="margin-left:4px">💰 Open Claim Batch</button>`;
        }
        docHtml+='</div>';
      }
      return`<div class="pipe-step">
        <div class="pipe-dot ${state}">${state==='done'?'✓':state==='active'?'●':''}</div>
        <div class="pipe-info">
          <div class="pipe-lbl ${state}">${st.lbl}</div>
          ${action?`<div class="pipe-date">Recorded: ${action.date}${action.extra?' · '+action.extra:''}${action.notes?' · '+action.notes:''}</div>`:''}
          ${docHtml}
        </div>
      </div>`;
    }).join('');
    // MD nav — make sure claims is visible
    const claimsNav=document.getElementById('n-claims');
    if(claimsNav)claimsNav.style.display='flex';
  } else {

  // Define which stages each role can see
  let visibleStages = STAGES; // Default all
  if(CU === 'finance') {
    visibleStages = STAGES.filter(st => st.id === 'claim_docs_ready');
  }
  // Admin and MD see all stages (no filter)
  
  document.getElementById('jdPipeline').innerHTML=visibleStages.map((st,i)=>{
    // Calculate proper index for display
    const globalIdx = STAGE_IDS.indexOf(st.id);
    const state = globalIdx < currIdx ? 'done' : globalIdx === currIdx ? 'active' : 'pending';
    const action=job.actions[st.id];
    const docKey=STAGE_DOCS[st.id];
    const hasScan=docKey&&docKey.split(',').some(d=>job.scans[d]);
    let actBtns='';
    // Show actions for: done steps, active step, or the very next pending step for each role
    const adminNextSteps = {
  wo_received:    'vo1_created',
  vo1_created:    'linesman_notified',
  linesman_notified: 'field_received',
  field_received: 'vo2_created',
  vo2_created:    'works_val_created',
  works_val_created: 'work_instruction_ready',
  work_instruction_ready: 'teams_notified',
  teams_notified: 'work_complete',
  work_complete:  'gis_notified',
  gis_notified:   'gis_complete',
  gis_complete:   null,
  claim_docs_ready: null,
};
    const isAdminNext = canEdit && adminNextSteps[job.stage] === st.id;
    const isMyNextStep = isAdminNext
                      || (isFinance && st.id==='claim_docs_ready' && job.stage==='gis_complete');
    if((globalIdx<=currIdx+1)&&(state!=='pending'||isMyNextStep)){
      // Show appropriate action buttons per role + stage
      if(canEdit){
        if(st.id==='wo_received'&&state==='active')
          actBtns+=`<div style="background:var(--bl-bg);border:1px solid var(--bl-b);border-radius:var(--rs);padding:.45rem .75rem;font-size:.73rem;color:var(--bl);margin-bottom:5px">📥 Upload the BPC Work Order document you received by email using the Documents panel below, then create VO1.</div><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','vo1')">Create VO1</button>`;
        if(st.id==='vo1_created'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','vo1')">View VO1</button>`;
        if(st.id==='vo1_created'&&state==='active')
          actBtns+=`<button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','vo1')">View / Edit VO1</button><button class="btn btn-gy btn-sm" onclick="openRecord('${wo}','linesman_notified','Record: Linesman Notified','Record when you notified the linesman. Reminder: contact the linesman externally (phone/email) and share the VO1 document.')">Record Linesman Notified</button>`;
        if(st.id==='linesman_notified'&&state==='active')
          actBtns+=`<div style="background:var(--am-bg);border:1px solid var(--am-b);border-radius:var(--rs);padding:.4rem .7rem;font-size:.72rem;color:#c88000">⏳ Waiting for linesman. When he reports back externally, use the button below to record his findings.</div><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','field_report')">📝 Record Linesman Findings</button>`;
        if(st.id==='linesman_notified'&&state==='done')
          actBtns+=`<span style="font-size:.72rem;color:var(--gn)">✓ Linesman notified on ${action?.date||'—'}</span>`;
        if(st.id==='field_received'&&state==='active')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','field_report')">View Field Findings</button><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','vo2')">📝 Create VO2 from Field Findings</button>`;
        if(st.id==='field_received'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','field_report')">View Field Findings</button>`;
        if(st.id==='vo2_created'&&state==='active')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','vo2')">View VO2</button><button class="btn btn-am btn-sm" onclick="createWorksValuation('${wo}')">📄 Create Works Valuation Document →</button>`;
        // vo2_created pending: handled by field_received active state
        if(st.id==='vo2_created'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','vo2')">View VO2</button>`;
        if(st.id==='works_valuation_created'&&state==='active')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','works_valuation')">View Works Valuation</button><button class="btn btn-am btn-sm" onclick="advanceStageWV('${wo}')">✓ Save Works Valuation — Proceed to Notify Teams</button>`;
        if(st.id==='works_valuation_created'&&state==='pending')
          actBtns+=`<button class="btn btn-am btn-sm" onclick="createWorksValuation('${wo}')">📄 Create Works Valuation Document</button>`;
        if(st.id==='works_valuation_created'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','works_valuation')">View Works Valuation</button>`;
        if(st.id==='work_instruction_ready'&&state==='active')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','works_instruction')">View Works Instruction</button><button class="btn btn-am btn-sm" onclick="advanceStageWI('${wo}')">✓ Works Instruction Ready — Send to Teams</button>`;
        if(st.id==='work_instruction_ready'&&state==='pending')
          actBtns+=`<button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','works_instruction')">📄 Prepare Works Instruction</button>`;
        if(st.id==='work_instruction_ready'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','works_instruction')">View Works Instruction</button>`;
        if(st.id==='teams_notified'&&(state==='active'||state==='pending'))
          actBtns+=`<div style="background:var(--am-bg);border:1px solid var(--am-b);border-radius:var(--rs);padding:.4rem .7rem;font-size:.72rem;color:#c88000;margin-bottom:5px">📤 Notify the field teams externally (WhatsApp/email) to commence work, then record below.</div><button class="btn btn-am btn-sm" onclick="openRecord('${wo}','teams_notified','Record: Teams Notified to Start Work','Record when you notified the teams to start work.','Team(s) assigned (e.g. Shakawe Team A)')">📤 Record Teams Notified</button>`;
        if(st.id==='teams_notified'&&state==='done')
          actBtns+=`<span style="font-size:.72rem;color:var(--gn)">✓ Teams notified on ${action?.date||'—'} · ${action?.extra||''}</span><div style="margin-top:5px"><button class="btn btn-am btn-sm" onclick="openRecord('${wo}','work_complete','Record: Teams Reported Work Complete','Record when the field team reported back to you that work is complete.')">✅ Record: Teams Reported Work Complete</button></div>`;
        if(st.id==='work_complete'&&(state==='active'||state==='pending'))
          actBtns+=`<div style="background:var(--bl-bg);border:1px solid var(--bl-b);border-radius:var(--rs);padding:.4rem .7rem;font-size:.72rem;color:var(--bl);margin-bottom:5px">✅ Teams have completed the work. Step 1: Fill in the Works Instruction (completion record). Step 2: Notify the GIS consultant.</div><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','works_instruction')">📄 Step 1: Fill in Works Instruction (Completion Record)</button><button class="btn btn-gy btn-sm" onclick="openRecord('${wo}','gis_notified','Record: GIS Consultant Notified','Record when you sent the assignment to the GIS consultant externally.')">📍 Step 2: Notify GIS Consultant (External) — Record</button>`;
        if(st.id==='work_complete'&&state==='done')
          actBtns+=`<span style="font-size:.72rem;color:var(--gn)">✓ Work complete on ${action?.date||'—'}</span>`;
        if(st.id==='gis_notified'&&state==='active')
          actBtns+=`<div style="background:var(--am-bg);border:1px solid var(--am-b);border-radius:var(--rs);padding:.4rem .7rem;font-size:.72rem;color:#c88000;margin-bottom:5px">📤 Notify the GIS consultant externally. When he returns, he will send you TWO documents: (1) GIS Report and (2) GIS Certificate. Upload both below.</div><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_report')">📋 Record & Upload GIS Report</button><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_cert')">📋 Record & Upload GIS Certificate</button>`;
        if(st.id==='gis_notified'&&state==='done')
          actBtns+=`<span style="font-size:.72rem;color:var(--gn)">✓ GIS notified on ${action?.date||'—'}</span><div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_report')">📋 Upload GIS Report</button><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_cert')">📋 Upload GIS Certificate</button></div>`;
        if(st.id==='gis_complete'&&state==='active')
          actBtns+=`<div style="font-size:.72rem;color:var(--am);margin-bottom:4px">Upload both GIS documents received from the consultant:</div><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_report')">📋 GIS Report</button><button class="btn btn-am btn-sm" onclick="openDocForAction('${wo}','gis_cert')">📋 GIS Certificate</button></div>`;
        if(st.id==='gis_complete'&&state==='done')
          actBtns+=`<span style="font-size:.72rem;color:var(--gn)">✓ GIS documents uploaded</span><div style="margin-top:4px;display:flex;gap:5px"><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','gis_report')">View GIS Report</button><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','gis_cert')">View GIS Certificate</button></div>`;
        if(st.id==='claim_docs_ready'&&state==='active')
          actBtns+=`<div style="background:var(--gn-bg);border:1px solid var(--gn-b);border-radius:var(--rs);padding:.45rem .75rem;font-size:.73rem;color:var(--gn);margin-bottom:6px">✅ Finance has generated the claim documents. Review them below, then record this job as complete.</div><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','payment_cert')">View Payment Certificate</button><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','invoice')">View Invoice</button><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','annexure')">View Annexure</button><button class="btn btn-gn" onclick="openRecord('${wo}','job_complete','Record: Job Complete','All claim documents are ready. Recording this marks the job as complete and adds it to the List of Jobs Done.')">✅ Record Job as Complete</button>`;
        if(st.id==='claim_docs_ready'&&state==='done')
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','payment_cert')">View Payment Certificate</button><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','invoice')">View Invoice</button><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','annexure')">View Annexure</button><button class="btn btn-gn" onclick="openRecord('${wo}','job_complete','Record: Job Complete','All documents are ready. Record this job as complete. It will be added to the List of Jobs Done.')">✅ Record Job as Complete</button>`;
        if(st.id==='job_complete'&&state==='done')
          actBtns+=`<span class="badge b-gn">✅ Job complete on ${action?.date||'—'} — Added to List of Jobs Done</span><button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','list_of_jobs')">View List of Jobs Done</button>`;
      }

      if(isFinance&&st.id==='claim_docs_ready'){
        if(job.stage==='gis_complete'){
          actBtns+=`<button class="btn btn-am" onclick="nav('claims')">💰 Go to Claim Batch — Generate Documents</button>`;
        } else if(state==='done') {
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${job.wo}','payment_cert')">View Payment Certificate</button>`;
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${job.wo}','invoice')">View Invoice</button>`;
          actBtns+=`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${job.wo}','annexure')">View Annexure</button>`;
        }
      }
      // Scan upload for any doc-producing stage
      if((canEdit||isFinance)&&docKey){
        docKey.split(',').forEach(dk=>{
          actBtns+=`<span style="margin-left:2px">${scanWidget(wo,dk.trim(),true)}</span>`;
        });
      }
    }
    return`<div class="pipe-step">
      <div class="pipe-dot ${state}">${state==='done'?'✓':state==='active'?'●':''}</div>
      <div class="pipe-info">
        <div class="pipe-lbl ${state}">${st.lbl}</div>
        ${action?`<div class="pipe-date">Recorded: ${action.date}${action.extra?' · '+action.extra:''}${action.notes?' · '+action.notes:''}</div>`:''}
        ${hasScan?`<div class="pipe-date" style="color:var(--gn)">✓ Signed scan available</div>`:''}
        ${actBtns?`<div class="pipe-actions">${actBtns}</div>`:''}
      </div>
    </div>`;
  }).join('');
  } // end non-MD pipeline

  // Documents panel - FILTERED BY ROLE
  const allDocTypes=['bpc_wo','vo1','field_report','vo2','works_valuation','works_instruction','gis_report','gis_cert','annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'];
  let visibleDocTypes = [...allDocTypes];
  if(CU === 'finance') {
    visibleDocTypes = ['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'];
  }
  // MD sees everything
  if(CU === 'md') {
    visibleDocTypes = [...allDocTypes];
  }
  
  const localDocLabels={bpc_wo:'BPC Work Order (from BPC email)',vo1:'Works Valuation (VO1)',field_report:'Linesman Field Findings',vo2:'Variation Order (VO2)',works_valuation:'Works Valuation Document',works_instruction:'Works Instruction',gis_report:'GIS Geo-Analysis Report',annexure:'Annexure to Payment Certificate',payment_cert:'Payment Certificate',invoice:'Tax Invoice',list_of_jobs:'List of Jobs Done',bpc_spreadsheet:'BPC Spreadsheet'};
  const docsReadyCt=visibleDocTypes.filter(d=>job.scans[d]||(job.savedDocs&&job.savedDocs[d])).length;
  document.getElementById('jdDocsCount').textContent=`${docsReadyCt} of ${visibleDocTypes.length} ready`;
  document.getElementById('jdDocsList').innerHTML=visibleDocTypes.map(d=>{
    const scan=job.scans[d];
    const saved=job.savedDocs&&job.savedDocs[d];
    const hasGenerated=['vo1','vo2','field_report','works_valuation','works_instruction','annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'].includes(d);
    const isMultiJob=['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'].includes(d);
    const isReady=!!(scan||saved);
    const statusBadge=scan?'b-gn':saved?'b-bl':'b-gy';
    const statusText=scan?'Signed Copy':saved?'Soft Copy':'Pending';
    const iconClass=scan?'uploaded':saved?'generated':'pending';
    // MD and everyone can view if saved or scan exists, or if generated doc type
    const canView=hasGenerated&&(!isMultiJob||job.claimRef);
    return`<div class="doc-card">
      <div class="doc-card-top">
        <div class="doc-card-icon ${iconClass}">${scan?'✓':saved?'📄':'⏳'}</div>
        <div class="doc-card-name">${localDocLabels[d]}${isMultiJob?' (Batch)':''}</div>
        <span class="badge ${statusBadge}">${statusText}</span>
      </div>
      <div class="doc-card-btns">
        ${canView?`<button class="btn btn-gy btn-sm" onclick="openDocForAction('${wo}','${d}')">👁 View / Print</button>`:''}
        ${saved?`<button class="btn btn-bl btn-sm" onclick="downloadSavedDoc('${wo}','${d}')">⬇ Download</button>`:''}
        ${scan?`<button class="btn btn-gn btn-sm" onclick="event.stopPropagation();downloadScan('${wo}','${d}')">⬇ Signed</button>`:''}
        ${CU!=='md'&&scan?`<button class="btn btn-rd btn-sm" onclick="event.stopPropagation();removeScan('${wo}','${d}')">✕ Remove</button>`:''}
        ${CU!=='md'?`<label class="scan-upload-label" style="font-size:.72rem">📎 ${scan?'Replace':'Upload'}<input type="file" accept="image/*,application/pdf" onchange="handleScan('${wo}','${d}',this)" style="display:none"></label>`:''}
        ${!isReady&&!canView&&CU==='md'?`<span style="font-size:.72rem;color:var(--tx3)">Not yet available</span>`:''}
      </div>
    </div>`;
  }).join('');

  // Summary
  const t1live=jTotal(job,'vo1');
  const t2live=job.vo2.items.length?jTotal(job,'vo2'):null;
  const claimAmount=t2live?t2live.total:t1live.total;
  document.getElementById('jdSummary').innerHTML=`
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">WO Number</span> &nbsp; <span class="mono">${job.wo}</span></div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">Type</span> &nbsp; ${job.type}</div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">Phase</span> &nbsp; ${job.phase}</div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">Loc. Factor</span> &nbsp; ${job.vo1.lf}%</div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">VO1 Total</span> &nbsp; <span class="mono">${P(t1live.total)}</span></div>
    ${t2live?`<div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">VO2 Total</span> &nbsp; <span class="mono">${P(t2live.total)}</span></div>`:''}
    <div style="font-size:.82rem;font-weight:600;border-bottom:1px solid var(--bd);padding:5px 0;background:var(--am-bg);margin:3px -4px;padding-left:4px"><span style="color:var(--tx3)">Claim Amount</span> &nbsp; <span style="color:var(--am)">${P(claimAmount)}</span> <span style="font-size:.67rem;color:var(--tx3)">(${t2live?'VO2':'VO1'})</span></div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">Teams</span> &nbsp; ${job.actions.teams_notified?.extra||'—'}</div>
    <div style="font-size:.78rem;border-bottom:1px solid var(--bd);padding:4px 0"><span style="color:var(--tx3)">Work Done</span> &nbsp; ${job.actions.work_complete?.date||'—'}</div>
    <div style="font-size:.78rem;padding:4px 0"><span style="color:var(--tx3)">Claim Ref.</span> &nbsp; ${job.claimRef||'—'}</div>`;

  // Activity - only MD sees
  const jLogs=DB.actLog.filter(l=>l.wo===wo);
  if(isMD){
    document.getElementById('jdActivity').innerHTML=jLogs.length
      ?jLogs.map(l=>`<div style="display:flex;gap:8px;padding:.5rem 0;border-bottom:1px solid var(--bd)">
          <div style="width:7px;height:7px;border-radius:50%;background:var(--am-b);flex-shrink:0;margin-top:5px"></div>
          <div><div style="font-size:.78rem;color:var(--tx)">${l.action}</div>
            <div style="font-size:.65rem;color:var(--tx3);margin-top:2px">${l.role} · ${fdt(l.ts)}</div></div>
        </div>`).join('')
      :'<div style="font-size:.78rem;color:var(--tx3);padding:.5rem 0">No activity yet</div>';
  } else {
    document.getElementById('jdActivity').innerHTML='<div style="font-size:.78rem;color:var(--tx3);padding:.5rem 0">Activity log restricted to Managing Director only.</div>';
  }
}


/* ═══════════════════════════════════════
   OPEN DOCUMENT MODAL
═══════════════════════════════════════ */
function openDocForAction(wo,docType){
  const job=wo?DB.jobs[wo]:null;
  const titles={vo1:'Works Valuation (VO1)'+(wo?' · WO '+wo:''),vo2:'Variation Order (VO2)'+(wo?' · WO '+wo:''),works_valuation:'Works Valuation Document'+(wo?' · WO '+wo:''),field_report:'Linesman Field Findings'+(wo?' · WO '+wo:''),works_instruction:'Works Instruction'+(wo?' · WO '+wo:''),gis_report:'GIS Geo-Analysis Report'+(wo?' · WO '+wo:''),bpc_wo:'BPC Work Order'+(wo?' · WO '+wo:''),annexure:'Annexure to Payment Certificate'+(wo?' · WO '+wo:''),payment_cert:'Payment Certificate'+(wo?' · WO '+wo:''),invoice:'Tax Invoice'+(wo?' · WO '+wo:''),list_of_jobs:'List of Jobs Done — Trends Engineering Services',bpc_spreadsheet:'BPC Spreadsheet — Batch Claim Document'};
  document.getElementById('docModalTitle').textContent=titles[docType]||docType;

  // For claim docs, try to find the Finance-saved version first
  const claimDocTypes=['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'];
  let html='';

  if(claimDocTypes.includes(docType)){
    // Check this job's savedDocs first
    if(job&&job.savedDocs&&job.savedDocs[docType]&&job.savedDocs[docType].html){
      html=job.savedDocs[docType].html;
    } else {
      // Search ALL jobs for any with same claimRef that has this doc saved
      const certNo=job?.claimRef;
      let found=false;
      if(certNo){
        const batchMatch=Object.values(DB.jobs).find(j=>j.claimRef===certNo&&j.savedDocs&&j.savedDocs[docType]&&j.savedDocs[docType].html);
        if(batchMatch){html=batchMatch.savedDocs[docType].html;found=true;}
      }
      // Also check DB.batchDocs
      if(!found&&certNo&&DB.batchDocs&&DB.batchDocs[certNo]){
        const bmap={annexure:'annexure',payment_cert:'paymentCert',invoice:'invoice',list_of_jobs:'listOfJobs',bpc_spreadsheet:'bpcSpreadsheet'};
        const bkey=bmap[docType];
        if(bkey&&DB.batchDocs[certNo][bkey]){html=DB.batchDocs[certNo][bkey];found=true;}
      }
      // Last resort: regenerate live (works for all roles)
      if(!found){
        html=buildDoc(docType,job);
      }
    }
  } else {
    // For non-claim docs, check savedDocs first then rebuild
    if(job&&job.savedDocs&&job.savedDocs[docType]&&job.savedDocs[docType].html){
      html=job.savedDocs[docType].html;
    } else {
      html=buildDoc(docType,job);
    }
  }

  document.getElementById('docModalBody').innerHTML=html;
  document.getElementById('docModalFoot').innerHTML=buildDocFoot(docType,job);
  openModal('docModal');
}
function buildDocFoot(docType,job){
  const wo=job?job.wo:'';
  const isMDView=CU==='md';
  let btns=`<button class="btn btn-print btn-sm" onclick="printModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print</button>`;
  btns+=`<button class="btn btn-bl btn-sm" onclick="downloadDocAsPDF('${wo}','${docType}')">&#11015; Download PDF</button>`;

  if(wo){
    if(job&&job.scans&&job.scans[docType]){
      btns+=`<button class="btn btn-gn btn-sm" onclick="downloadScan('${wo}','${docType}')">&#11015; Signed Copy</button>`;
    }
    if(!isMDView){
      btns+=`<button class="btn btn-gn btn-sm" onclick="saveDocToStep('${wo}','${docType}')">&#128190; Save &amp; Attach</button>`;
      btns+=`<label class="scan-upload-label">📎 Upload / Replace<input type="file" id="scan-input-modal-${wo}-${docType}" accept="image/*,application/pdf" onchange="handleScan('${wo}','${docType}',this);closeModal('docModal')" style="display:none"></label>`;
    }
  }

  if(!isMDView&&CU==='admin'&&job){
    if(docType==='vo1'&&job.stage==='wo_received')
      btns+=`<button class="btn btn-am" onclick="advanceStage('${wo}','vo1_created')">✓ Mark VO1 Complete</button>`;
    if(docType==='field_report'&&(job.stage==='linesman_notified'||job.stage==='field_received'))
      btns+=`<button class="btn btn-am" onclick="advanceStage('${wo}','field_received')">✓ Save Field Findings</button>`;
    if(docType==='vo2'&&(job.stage==='field_received'||job.stage==='vo2_created'))
      btns+=`<button class="btn btn-am" onclick="saveVO2('${wo}')">✓ Save VO2</button>`;
    if(docType==='works_instruction'&&(job.stage==='vo2_created'||job.stage==='work_instruction_ready'))
      btns+=`<button class="btn btn-am" onclick="advanceStageWI('${wo}')">✓ Works Instruction Ready</button>`;
    if(docType==='gis_report'&&['gis_notified','gis_complete'].includes(job.stage)&&job.stage!=='gis_complete')
      btns+=`<button class="btn btn-am" onclick="advanceStage('${job.wo}','gis_complete')">✓ Mark GIS Complete</button>`;
  }
  if(!isMDView&&CU==='finance'&&job){
    if(docType==='payment_cert'||docType==='invoice'||docType==='annexure'||docType==='list_of_jobs'||docType==='bpc_spreadsheet')
      btns+=`<button class="btn btn-gn btn-sm" onclick="saveDocToStep('${wo}','${docType}')">&#128190; Save &amp; Attach</button>`;
  }
  return btns;
}
function advanceStageWV(wo){
  const job=DB.jobs[wo];if(!job)return;
  job.stage='work_instruction_ready';
  job.actions['work_instruction_ready']={date:new Date().toISOString().slice(0,10),notes:'Works Valuation saved',extra:''};
  addLog(wo,'Works Valuation saved — ready to notify teams');
  notify(['md'],`Works Valuation completed for WO ${wo} — ${job.cust}. Admin will now notify teams.`,wo);
  saveDB();closeModal('docModal');refreshDetail();refreshAll();
  toast('Works Valuation saved — now notify teams to start work');
  setTimeout(()=>openRecord(wo,'teams_notified','Record: Notify Teams to Start Work','Send the job details to your field teams externally (WhatsApp/email), then record here when done.','Team(s) assigned (e.g. Shakawe Team A)'),400);
}
function advanceStageWI(wo){
  const job=DB.jobs[wo];if(!job)return;
  job.stage='work_instruction_ready';
  job.actions['work_instruction_ready']={date:new Date().toISOString().slice(0,10),notes:'',extra:''};
  addLog(wo,'Works Instruction prepared — stage advanced');
  saveDB();closeModal('docModal');
  // Immediately prompt to record teams notified
  setTimeout(()=>openRecord(wo,'teams_notified','Record: Works Instruction Sent to Teams','Send the Works Instruction to the team externally (WhatsApp/email) with this doc, then record here.','Team(s) assigned (e.g. Shakawe Team A)'),200);
  refreshDetail();refreshAll();
  toast('Works Instruction ready — record sending it to teams');
}
function advanceStage(wo,newStage){
  const job=DB.jobs[wo];if(!job)return;
  job.stage=newStage;
  job.actions[newStage]={date:new Date().toISOString().slice(0,10),notes:'',extra:''};
  addLog(wo,stageLabel(newStage)+' — stage advanced');
  // Auto-save the document for this stage so MD can see it immediately
  const stageDocMap={
    vo1_created:'vo1',
    field_received:'field_report',
    vo2_created:'vo2',
    works_valuation_created:'works_valuation',
    work_instruction_ready:'works_instruction',
    gis_complete:'gis_report',
  };
  const autoDocType=stageDocMap[newStage];
  if(autoDocType){
    if(!job.savedDocs)job.savedDocs={};
    job.savedDocs[autoDocType]={
      html:buildDoc(autoDocType,job),
      savedAt:new Date().toISOString(),
      role:CU,
      autoSaved:true
    };
    addLog(wo,`Auto-saved document: ${autoDocType}`);
  }
  if(newStage==='vo1_created')notify(['md'],`VO1 created &amp; attached for WO ${wo} — ${job.cust}. Click to view.`,wo);
  if(newStage==='field_received')notify(['md'],`Linesman findings recorded &amp; attached for WO ${wo}`,wo);
  if(newStage==='gis_complete')notify(['md'],`GIS report attached for WO ${wo} — ${job.cust}. Finance can now generate claim docs.`,wo);
  saveDB();closeModal('docModal');refreshDetail();refreshAll();
  toast(stageLabel(newStage)+' ✓ — document auto-attached for MD');
}
function saveVO2(wo){
  const job=DB.jobs[wo];if(!job)return;
  // collect VO2 items from form
  const items=job.vo2.items.map((it,i)=>({
    d:document.getElementById(`vo2-d-${wo}-${i}`)?.value||it.d,
    u:document.getElementById(`vo2-u-${wo}-${i}`)?.value||it.u,
    q:parseFloat(document.getElementById(`vo2-q-${wo}-${i}`)?.value)||it.q||0,
    r:parseFloat(document.getElementById(`vo2-r-${wo}-${i}`)?.value)||it.r||0,
  }));
  job.vo2.items=items.length?items:job.vo2.items;
  job.stage='vo2_created';
  job.actions['vo2_created']={date:new Date().toISOString().slice(0,10),notes:'',extra:''};
  const t1=jTotal(job,'vo1'),t2=jTotal(job,'vo2');
  const diff=t2.total-t1.total;
  const pctDiff=t1.total>0?((diff/t1.total)*100):0;
  let msg=diff>0?`VO2 exceeds VO1 by ${P(diff)} (${pctDiff.toFixed(1)}%). Review before creating Works Valuation.`:`VO2 saved within VO1 budget. Next: Create Works Valuation Document.`;
  addLog(wo,'VO2 (Variation Order) created');
  notify(['md'],`VO2 created for WO ${wo} — ${job.cust}. Next: Works Valuation Document.`,wo);
  saveDB();closeModal('docModal');refreshDetail();refreshAll();
  toast('VO2 saved — next step: create Works Valuation');
  setTimeout(()=>toast(msg,diff>0?'am':'gn'),400);
}

/* ═══════════════════════════════════════
   CLAIMS BATCH (Finance)
═══════════════════════════════════════ */
function renderClaims(){
  const eligible=Object.values(DB.jobs).filter(j=>stageIdx(j.stage)>=stageIdx('gis_complete'));
  const list=document.getElementById('claimsList');
  if(!eligible.length){list.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No eligible jobs yet — GIS report must be uploaded first</div>';document.getElementById('claimSummary').innerHTML='';return;}
  list.innerHTML=eligible.map(j=>{
    const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');
    return`<div style="display:grid;grid-template-columns:32px 90px 1fr 90px 130px 90px;gap:10px;padding:.62rem 1rem;border-bottom:1px solid var(--bd);font-size:.8rem;align-items:center;cursor:pointer;transition:.1s" onclick="toggleClaim('${j.wo}')" onmouseover="this.style.background='var(--sf2)'" onmouseout="this.style.background=''">
      <span><input type="checkbox" id="cc-${j.wo}" ${selClaimJobs.has(j.wo)?'checked':''} onclick="toggleClaim('${j.wo}',event)" style="cursor:pointer;width:15px;height:15px;accent-color:var(--am)"></span>
      <span class="mono">${j.wo}</span><span>${j.cust}</span>
      <span class="tag">${j.loc.split(',')[0]}</span>
      <span class="mono">${P(t.total)}</span>
      <span style="font-size:.75rem;color:var(--tx2)">${j.actions.work_complete?.date||'—'}</span>
    </div>`;}).join('');
  updateClaimSummary();
}
function toggleClaim(wo,e){if(e)e.stopPropagation();selClaimJobs.has(wo)?selClaimJobs.delete(wo):selClaimJobs.add(wo);renderClaims();}
function updateClaimSummary(){
  const total=Array.from(selClaimJobs).reduce((s,wo)=>{const j=DB.jobs[wo];if(!j)return s;return s+jTotal(j,j.vo2.items.length?'vo2':'vo1').total;},0);
  const n=selClaimJobs.size;
  document.getElementById('claimSummary').innerHTML=n>0?`
    <div class="ua ua-gn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${n} job${n>1?'s':''} selected · Gross: <strong>${P(total)}</strong> · Retention (5%): <strong>(${P(total*.05)})</strong> · WHT (3%): <strong>(${P(total*.03)})</strong> · Net Payable: <strong>${P(total*.92)}</strong></span>
    </div>`:'';
}
function generateClaimDocs(){
  if(!selClaimJobs.size){toast('Select at least one job','am');return;}
  const certNo=document.getElementById('certInput').value.trim()||`TES-0${String(DB.certSeq).padStart(2,'0')}`;
  DB.certSeq++;
  const batchWOs=Array.from(selClaimJobs);
  const batchJobs=batchWOs.map(wo=>DB.jobs[wo]).filter(j=>j&&j.vo1&&j.vo1.items);
  
  if(!batchJobs.length){toast('Selected jobs are missing data — please re-add them','rd');return;}

  // Set claimRef on all selected jobs FIRST before generating docs
  batchJobs.forEach(job=>{
    job.claimRef=certNo;
    job.stage='claim_docs_ready';
    addLog(job.wo,`Claim docs generated — Cert: ${certNo}`);
  });
  
  saveDB();
  
  // Store batch documents — pass the first job with claimRef already set
  if(!DB.batchDocs)DB.batchDocs={};
  const firstJob=batchJobs[0];
  DB.batchDocs[certNo]={
    jobs:batchJobs,
    annexure:docAnnexure(firstJob),
    paymentCert:docPaymentCert(firstJob),
    invoice:docInvoice(firstJob),
    listOfJobs:docListOfJobs(firstJob),
    bpcSpreadsheet:docBPCSpreadsheet(batchJobs,certNo)
  };
  
  // Auto-save all claim docs on each job so MD can view them
  batchJobs.forEach(job=>{
    if(!job.savedDocs)job.savedDocs={};
    job.savedDocs['annexure']={html:docAnnexure(job),savedAt:new Date().toISOString(),role:CU,autoSaved:true};
    job.savedDocs['payment_cert']={html:docPaymentCert(job),savedAt:new Date().toISOString(),role:CU,autoSaved:true};
    job.savedDocs['invoice']={html:docInvoice(job),savedAt:new Date().toISOString(),role:CU,autoSaved:true};
    job.savedDocs['list_of_jobs']={html:docListOfJobs(job),savedAt:new Date().toISOString(),role:CU,autoSaved:true};
    job.savedDocs['bpc_spreadsheet']={html:docBPCSpreadsheet(batchJobs,certNo),savedAt:new Date().toISOString(),role:CU,autoSaved:true};
  });
  saveDB();
  notify(['admin','md'],`Claim ${certNo} generated — ${batchJobs.length} jobs — all documents attached`,`${batchJobs[0]?.wo||''}`);
  renderClaims();renderInbox();renderDashboard();
  
  // Show batch doc modal
  document.getElementById('docModalTitle').textContent=`Claim Batch ${certNo} — ${batchJobs.length} Jobs`;
  document.getElementById('docModalBody').innerHTML=docBatchSummary(batchJobs,certNo);
 document.getElementById('docModalFoot').innerHTML=`
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span style="font-size:.72rem;color:var(--tx2);font-weight:600">Open document:</span>
      <button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','annexure')">Annexure</button>
      <button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','payment_cert')">Payment Cert</button>
      <button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','invoice')">Invoice</button>
      <button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','list_of_jobs')">List of Jobs</button>
      <button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','bpc_spreadsheet')">BPC Spreadsheet</button>
      <button class="btn btn-gy btn-sm" onclick="closeModal('docModal');refreshDetail()">✕ Close</button>
    </div>`;
  openModal('docModal');
  selClaimJobs.clear();
  toast(`Claim ${certNo} generated — ${batchJobs.length} jobs`);
}

// Add this function to view batch docs
function viewBatchDoc(certNo,docType){
  const batch=DB.batchDocs?.[certNo];
  const batchJobs=Object.values(DB.jobs).filter(j=>j.claimRef===certNo&&j.vo1&&j.vo1.items);
  const firstJob=batchJobs[0];
  const titles={
    annexure:'Annexure to Payment Certificate',
    payment_cert:'Payment Certificate',
    invoice:'Tax Invoice',
    list_of_jobs:'List of Jobs Done',
    bpc_spreadsheet:'BPC Spreadsheet'
  };
  // Regenerate doc live so values are always current
  let html='';
  if(docType==='annexure')       html=docAnnexure(firstJob);
  else if(docType==='payment_cert') html=docPaymentCert(firstJob);
  else if(docType==='invoice')   html=docInvoice(firstJob);
  else if(docType==='list_of_jobs') html=docListOfJobs(firstJob);
  else if(docType==='bpc_spreadsheet') html=docBPCSpreadsheet(batchJobs,certNo);
  else if(batch)                 html=batch[docType]||'';
  if(!html){toast('Document not available','rd');return;}
  document.getElementById('docModalTitle').textContent=`${titles[docType]||docType} — Cert ${certNo}`;
  document.getElementById('docModalBody').innerHTML=html;
  const docOrder=['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'];
  const currentIdx=docOrder.indexOf(docType);
  const prevDoc=currentIdx>0?docOrder[currentIdx-1]:null;
  const nextDoc=currentIdx<docOrder.length-1?docOrder[currentIdx+1]:null;
  const docTitleShort={annexure:'Annexure',payment_cert:'Payment Cert',invoice:'Invoice',list_of_jobs:'List of Jobs',bpc_spreadsheet:'BPC Spreadsheet'};

  document.getElementById('docModalFoot').innerHTML=`
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%">
      <div style="display:flex;gap:5px;align-items:center;flex:1">
        ${prevDoc?`<button class="btn btn-gy btn-sm" onclick="viewBatchDoc('${certNo}','${prevDoc}')">← ${docTitleShort[prevDoc]}</button>`:'<span style="width:80px"></span>'}
        <span style="font-size:.68rem;color:var(--tx3);margin:0 4px">${currentIdx+1} of ${docOrder.length}</span>
        ${nextDoc?`<button class="btn btn-am btn-sm" onclick="viewBatchDoc('${certNo}','${nextDoc}')">${docTitleShort[nextDoc]} →</button>`:'<span style="width:80px"></span>'}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-print btn-sm" onclick="printModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print</button>
        ${CU!=='md'?`<button class="btn btn-gn btn-sm" onclick="saveBatchDocAttach('${certNo}','${docType}')">💾 Save &amp; Attach</button>`:''}
        ${CU!=='md'?`<label class="scan-upload-label" style="font-size:.72rem">📎 Upload / Replace<input type="file" accept="image/*,application/pdf" onchange="handleBatchScan('${certNo}','${docType}',this)" style="display:none"></label>`:''}
        ${(DB.batchScans&&DB.batchScans['bs_'+certNo+'_'+docType])?`<button class="btn btn-gn btn-sm" onclick="downloadBatchScan('${certNo}','${docType}')">⬇ Signed</button>`:''}
        <button class="btn btn-gy btn-sm" onclick="closeModal('docModal');refreshDetail()">✕ Close</button>
      </div>
    </div>`;
}

function openBatchDoc(docType,certNo){
  const batchJobs=Object.values(DB.jobs).filter(j=>j.claimRef===certNo);
  const titles={annexure:'Annexure to Payment Certificate',payment_cert:'Payment Certificate',invoice:'Tax Invoice',list_of_jobs:'List of Jobs Done',bpc_spreadsheet:'BPC Spreadsheet'};
  document.getElementById('docModalTitle').textContent=`${titles[docType]||docType} — Cert ${certNo}`;
  document.getElementById('docModalBody').innerHTML=buildBatchDoc(docType,batchJobs,certNo);
}

function buildBatchDoc(docType,batchJobs,certNo){
  const firstJob=batchJobs[0];
  switch(docType){
    case 'annexure': return docAnnexure(firstJob);
    case 'payment_cert': return docPaymentCert(firstJob);
    case 'invoice': return docInvoice(firstJob);
    case 'list_of_jobs': return docListOfJobs(firstJob);
    case 'bpc_spreadsheet': return docBPCSpreadsheet(batchJobs,certNo);
    default: return '<p style="padding:1rem;color:#555">Document not available</p>';
  }
}

function docBatchSummary(batchJobs,certNo){
  const gross=batchJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);
  const ret=gross*.05,wht=gross*.03,net=gross-ret-wht;
  return`<div class="paper">
  <div style="font-size:11pt;font-weight:bold;margin-bottom:8px">CLAIM BATCH: ${certNo}</div><hr>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:10px">
    <thead><tr style="background:#d9d9d9">
      <th style="border:1px solid #999;padding:4px 6px;text-align:left">WO No.</th>
      <th style="border:1px solid #999;padding:4px 6px;text-align:left">Customer</th>
      <th style="border:1px solid #999;padding:4px 6px;text-align:left">Location</th>
      <th style="border:1px solid #999;padding:4px 6px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>
      ${batchJobs.map(j=>{const t=jTotal(j,j.vo2.items.length?'vo2':'vo1');return`<tr>
        <td style="border:1px solid #bbb;padding:3px 6px">${j.wo}</td>
        <td style="border:1px solid #bbb;padding:3px 6px">${j.cust}</td>
        <td style="border:1px solid #bbb;padding:3px 6px">${j.loc}</td>
        <td style="border:1px solid #bbb;padding:3px 6px;text-align:right">${P(t.total)}</td>
      </tr>`;}).join('')}
      <tr style="background:#d9d9d9;font-weight:bold">
        <td colspan="3" style="border:1px solid #999;padding:4px 6px;text-align:right">GROSS TOTAL</td>
        <td style="border:1px solid #999;padding:4px 6px;text-align:right">${P(gross)}</td>
      </tr>
    </tbody>
  </table>
  <table style="width:50%;margin-left:auto;font-size:8.5pt;border-collapse:collapse">
    <tr><td style="padding:3px 6px">Gross Total</td><td style="text-align:right;padding:3px 6px">${P(gross)}</td></tr>
    <tr><td style="padding:3px 6px;color:#c00">Less Retention (5%)</td><td style="text-align:right;padding:3px 6px;color:#c00">(${P(ret)})</td></tr>
    <tr><td style="padding:3px 6px;color:#c00">Less WHT (3%)</td><td style="text-align:right;padding:3px 6px;color:#c00">(${P(wht)})</td></tr>
    <tr style="background:#d9d9d9;font-weight:bold"><td style="padding:4px 6px;border-top:2px solid #000">NET PAYABLE</td><td style="text-align:right;padding:4px 6px;border-top:2px solid #000">${P(net)}</td></tr>
  </table>
  <div style="margin-top:12px;font-size:8pt;color:#555">Click buttons below to view, edit and print each document in the batch.</div>
  </div>`;
}

/* ═══════════════════════════════════════
   ACTIVITY LOG
═══════════════════════════════════════ */
function renderActLog(filter=''){
  let logs=DB.actLog;
  if(filter)logs=logs.filter(l=>l.role?.toLowerCase().includes(filter.toLowerCase()));
  document.getElementById('actLogList').innerHTML=logs.length
    ?logs.map(l=>`<div style="display:flex;gap:.85rem;padding:.7rem 1rem;border-bottom:1px solid var(--bd);transition:.1s" onmouseover="this.style.background='var(--sf2)'" onmouseout="this.style.background=''">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--bd2);flex-shrink:0;margin-top:5px"></div>
        <div><div style="font-size:.8rem;font-weight:500;color:var(--tx)">${l.action}${l.wo?' — WO '+l.wo:''}</div>
          <div style="font-size:.67rem;color:var(--tx3);margin-top:2px">${l.role} · ${fdt(l.ts)}</div></div>
      </div>`).join('')
    :'<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No activity yet</div>';
}

/* ═══════════════════════════════════════
   RATES
═══════════════════════════════════════ */
function renderRates(q=''){
  const ql=q.toLowerCase();
  const phase=(document.getElementById('ratePhase')?.value)||'';
  let filtered=DB.rates;
  if(phase) filtered=filtered.filter(r=>r.phase===phase);
  if(ql) filtered=filtered.filter(r=>r.d.toLowerCase().includes(ql)||r.c.toLowerCase().includes(ql));
  const countEl=document.getElementById('ratesCount');
  if(countEl) countEl.textContent='('+filtered.length+' rate'+(filtered.length!==1?'s':'')+')';
  if(!filtered.length){
    document.getElementById('ratesList').innerHTML=`<div style="padding:1.5rem;text-align:center;color:var(--tx3);font-size:.8rem">No rates match "${q||phase}"</div>`;
    return;
  }
  document.getElementById('ratesList').innerHTML=filtered.map(r=>`
    <div style="display:grid;grid-template-columns:1fr 55px 105px 90px 62px 80px;gap:10px;padding:.55rem 1rem;border-bottom:1px solid var(--bd);font-size:.78rem;align-items:center;transition:.1s" onmouseover="this.style.background='var(--sf2)'" onmouseout="this.style.background=''">
      <span style="color:var(--tx)">${r.d}</span>
      <span class="tag">${r.u}</span>
      <span class="mono">${P(r.r)}</span>
      <span class="tag">${r.c}</span>
      <span class="badge ${r.phase==='46'?'b-bl':'b-am'}">Ph ${r.phase}</span>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" ${r.on?'checked':''} style="accent-color:var(--am);cursor:pointer;width:14px;height:14px" onchange="toggleRate('${r.id}',this.checked)">
        <span class="badge ${r.on?'b-gn':'b-gy'}">${r.on?'Active':'Off'}</span>
      </label>
    </div>`).join('');
}
function toggleRate(id,val){
  const r=DB.rates.find(x=>x.id===id);if(!r)return;
  r.on=val;saveDB();toast(r.d.slice(0,30)+(val?' activated':' deactivated'),val?'gn':'am');
}

/* ═══════════════════════════════════════
   PAPER DOCUMENT BUILDERS
═══════════════════════════════════════ */
function lh(title){
  return`<table class="lh-t"><tr>
    <td style="width:55%"><div class="lh-bpc">BOTSWANA POWER CORPORATION</div>
    <div class="lh-addr">P.O. Box 48 · Tel ${BPC_CO.tel}</div>
    <div class="lh-addr">${BPC_CO.city}</div></td>
    <td style="text-align:right"><div class="lh-title">${title}</div></td>
  </tr></table><hr>`;
}
function sigBlank(label){
  return`<div class="sig-box"><div class="sig-lbl">${label}</div><div class="sig-line"></div><div class="sig-sub">Name: _________________________ Date: _______________</div></div>`;
}

function buildDoc(docType,job){
  switch(docType){
    case 'vo1': return docVO1(job);
    case 'vo2': return docVO2(job);
    case 'works_valuation': return docWorksValuation(job);
    case 'field_report': return docFieldReport(job);
    case 'works_instruction': return docWorksInstruction(job);
    case 'gis_report': return docGISReport(job);
    case 'gis_cert': return docGISCert(job);
    case 'annexure': return docAnnexure(job);
    case 'payment_cert': return docPaymentCert(job);
    case 'invoice': return docInvoice(job);
    case 'list_of_jobs': return docListOfJobs(job);
    case 'bpc_spreadsheet': return docBPCSpreadsheet(job);
    case 'bpc_wo': return`<div class="ua ua-bl" style="margin:0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Upload the scanned BPC work order document you received by email. This is the original BPC document — upload it here so it is stored in the system for reference.</div>`;
    default: return'<p style="padding:1rem;color:#555">Document not available</p>';
  }
}

/* ── WORKS VALUATION VO1 ── */
function docVO1(job){
  const t=jTotal(job,'vo1');
  const canEdit=CU==='admin'&&job.stage==='wo_received';
  const phaseOpts=['46','47'].map(p=>`<option value="${p}" ${(job.vo1.phase||job.phase||'47')===p?'selected':''}'>Phase ${p}</option>`).join('');
  const rows=job.vo1.items.map((it,i)=>`<tr>
    <td class="c">${i+1}</td>
    <td style="min-width:200px">${acInput(job.wo,'vo1',i)}</td>
    <td class="c"><input class="ef ef-b" id="vo1u${job.wo}${i}" value="${it.u||'Ea'}" style="width:38px" onchange="DB.jobs['${job.wo}'].vo1.items[${i}].u=this.value"></td>
    <td class="r"><input class="ef ef-b" id="vo1q${job.wo}${i}" value="${it.q||1}" style="width:38px;text-align:right" onchange="DB.jobs['${job.wo}'].vo1.items[${i}].q=parseFloat(this.value)||0;recalcVO1('${job.wo}')"></td>
    <td class="r"><input class="ef ef-b" id="vo1r${job.wo}${i}" value="${(it.r||0).toFixed(2)}" style="width:76px;text-align:right" onchange="DB.jobs['${job.wo}'].vo1.items[${i}].r=parseFloat(this.value)||0;recalcVO1('${job.wo}')"></td>
    <td class="r ef-c" id="vo1v${job.wo}${i}">${((it.q||0)*(it.r||0)).toFixed(2)}</td>
  </tr>`).join('');
  const custPayDate=job.date||job.actions.wo_received?.date||'';
  return`<div class="paper">
  <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
    <tr>
      <td style="width:60%;vertical-align:top">
        <div style="font-weight:bold;font-size:10pt">BOTSWANA POWER CORPORATION</div>
        <div style="font-size:8.5pt">P. O. Box 48 &nbsp;&nbsp;&nbsp; Tel &nbsp; 3607000</div>
        <div style="font-size:8.5pt">Gaborone &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Fax &nbsp; 3607731</div>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:11pt;font-weight:bold">Works Valuation</div>
      </td>
    </tr>
  </table>
  <hr>
  <div style="margin-bottom:6px"><span style="font-weight:bold;font-size:9pt">BPC &nbsp; W/O No. :</span> &nbsp; <input class="ef ef-b" value="${job.wo}" style="width:80px" onchange="DB.jobs['${job.wo}'].wo=this.value;saveDB()"></div>
  <div style="font-weight:bold;font-size:9pt;margin-bottom:4px">Project Details</div>
  <table class="hdt">
    <tr><td class="lbl">Contract :</td><td colspan="3"><input class="ef ef-b" value="FREE CONNECTIONS PHASE ${job.phase} PROJECT" style="width:235px" onchange="DB.jobs['${job.wo}'].contractDesc=this.value;saveDB()"> &nbsp; BPC Project No.: <input class="ef ef-b" value="${job.bpcProjNo||job.wo}" style="width:90px" onchange="DB.jobs['${job.wo}'].bpcProjNo=this.value;saveDB()"></td></tr>
    <tr><td class="lbl">Contractor :</td><td colspan="3">${CO.name}</td></tr>
    <tr><td class="lbl">Project Title :</td><td><input class="ef ef-b" value="${job.cust}" onchange="DB.jobs['${job.wo}'].cust=this.value;saveDB()" style="width:98%"></td>
      <td class="lbl" style="white-space:nowrap">Location Factor :</td><td><input class="ef ef-b" value="${job.vo1.lf||29.25}" style="width:40px" onchange="DB.jobs['${job.wo}'].vo1.lf=parseFloat(this.value)||0;recalcVO1('${job.wo}')"></td></tr>
    <tr><td class="lbl">Location :</td><td><input class="ef ef-b" value="${job.loc}" onchange="DB.jobs['${job.wo}'].loc=this.value;saveDB()" style="width:98%"></td>
      <td class="lbl" style="white-space:nowrap">Customer Payment Date :</td><td><input class="ef ef-b" type="date" value="${custPayDate}" style="width:110px"></td></tr>
    <tr><td class="lbl">Wayleave Approval :</td><td>BPC</td><td class="lbl">Date Wayleave Available :</td><td><input class="ef ef-b" value="Not Required" style="width:98%"></td></tr>
  </table><hr>
  <div style="font-weight:bold;font-size:9pt;margin-bottom:4px">Details of BPC &nbsp; W/O No. : &nbsp; ${job.wo}</div>
  <div style="font-weight:bold;font-size:9pt;margin:4px 0">VO1 — Phase <select id="vo1phase${job.wo}" class="ef ef-b" style="width:80px;font-size:8.5pt" onchange="DB.jobs['${job.wo}'].vo1.phase=this.value;saveDB();toast('VO1 Phase updated to '+this.value)"><option value="46" ${(job.vo1.phase||job.phase||'47')==='46'?'selected':''}>Phase 46</option><option value="47" ${(job.vo1.phase||job.phase||'47')==='47'?'selected':''}>Phase 47</option></select></div>
  <table class="boq">
    <thead><tr><th class="c" style="width:28px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:44px">UNIT</th><th class="r" style="width:55px">QUANTITY</th><th class="r" style="width:80px">RATE/UNIT</th><th class="r" style="width:90px">VALUE</th></tr></thead>
    <tbody id="vo1rows${job.wo}">${rows}</tbody>
  </table>
  <button onclick="addVO1Row('${job.wo}')" style="font-size:8pt;padding:2px 8px;cursor:pointer;margin-top:5px;border:1px solid #bbb;border-radius:3px;background:#f8f8f8">+ Add item</button>
  <table style="width:100%;margin-top:8px;font-size:8.5pt;border-collapse:collapse">
    <tr><td style="width:65%;text-align:right;padding:2px 5px">Items Subtotal</td><td style="text-align:right;border-bottom:1px solid #ccc;padding:2px 5px" id="vo1rawsub${job.wo}">${t.sub.toFixed(2)}</td></tr>
    <tr><td style="text-align:right;padding:2px 5px">Location Factor @ <input class="ef ef-b" value="${job.vo1.lf||29.25}" style="width:36px;text-align:center" onchange="DB.jobs['${job.wo}'].vo1.lf=parseFloat(this.value)||0;recalcVO1('${job.wo}')">%</td><td style="text-align:right;border-bottom:1px solid #ccc;padding:2px 5px" id="vo1loc${job.wo}">${t.loc.toFixed(2)}</td></tr>
    <tr><td style="text-align:right;padding:2px 5px;background:#f8f8f8">Sub Total</td><td style="text-align:right;border-bottom:1px solid #ccc;padding:2px 5px;background:#f8f8f8;font-weight:bold" id="vo1sub${job.wo}">${(t.sub+t.loc).toFixed(2)}</td></tr>
    <tr><td style="text-align:right;padding:2px 5px">Markup @ <input class="ef ef-b" value="${job.vo1.mk||''}" placeholder="0" style="width:36px;text-align:center" onchange="DB.jobs['${job.wo}'].vo1.mk=parseFloat(this.value)||0;recalcVO1('${job.wo}')">%</td><td style="text-align:right;border-bottom:1px solid #ccc;padding:2px 5px" id="vo1mk${job.wo}">${t.markup.toFixed(2)}</td></tr>
    <tr style="background:#d9d9d9"><td style="text-align:right;padding:3px 5px;font-weight:bold;font-size:9pt">TOTAL (BWP)</td><td style="text-align:right;border:2px solid #000;padding:3px 5px;font-weight:bold;font-size:9.5pt" id="vo1tot${job.wo}">${t.total.toFixed(2)}</td></tr>
  </table>
  <div style="font-size:8pt;color:#555;margin-top:8px;padding:5px 8px;border:1px solid #e0e0e0;background:#fafafa">  </div>`;
}

/* ── WORKS VALUATION DOCUMENT (combines VO1 + VO2) ── */
function docWorksValuation(job){
  const t1=jTotal(job,'vo1');
  const t2=jTotal(job,'vo2');
  const custPayDate=job.actions.wo_received?.date||job.date||'';
  const phase=job.vo1.phase||job.phase||'47';

  const vo1rows=job.vo1.items.map((it,i)=>`<tr>
    <td class="c">${i+1}</td>
    <td>${it.d||''}</td>
    <td class="c">${it.u||'Ea'}</td>
    <td class="r">${it.q||0}</td>
    <td class="r">${(it.r||0).toFixed(2)}</td>
    <td class="r">${((it.q||0)*(it.r||0)).toFixed(2)}</td>
  </tr>`).join('');

  const vo2rows=job.vo2.items.map((it,i)=>`<tr>
    <td class="c">${i+1}</td>
    <td>${it.d||''}</td>
    <td class="c">${it.u||'Ea'}</td>
    <td class="r">${it.q||0}</td>
    <td class="r">${(it.r||0).toFixed(2)}</td>
    <td class="r">${((it.q||0)*(it.r||0)).toFixed(2)}</td>
  </tr>`).join('');

  return`<div class="paper">
  <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
    <tr>
      <td style="width:60%;vertical-align:top">
        <div style="font-weight:bold;font-size:10pt">BOTSWANA POWER CORPORATION</div>
        <div style="font-size:8.5pt">P. O. Box 48 &nbsp;&nbsp;&nbsp; Tel &nbsp; 3607000</div>
        <div style="font-size:8.5pt">Gaborone &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Fax &nbsp; 3607731</div>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:11pt;font-weight:bold">Works Valuation</div>
      </td>
    </tr>
  </table>
  <hr>
  <div style="margin-bottom:6px"><span style="font-weight:bold;font-size:9pt">BPC W/O No. :</span> &nbsp; <input class="ef ef-b" value="${job.wo}" style="width:80px"></div>
  <div style="font-weight:bold;font-size:9pt;margin-bottom:4px">Project Details</div>
  <table class="hdt">
    <tr><td class="lbl">Contract :</td><td colspan="3">FREE CONNECTIONS PHASE ${phase} PROJECT &nbsp;&nbsp;&nbsp;&nbsp; BPC Project No. : <input class="ef ef-b" value="${job.bpcProjNo||''}" style="width:90px"></td></tr>
    <tr><td class="lbl">Contractor :</td><td colspan="3">${CO.name}</td></tr>
    <tr><td class="lbl">Project Title :</td><td><input class="ef ef-b" value="${job.cust}" style="width:98%"></td>
      <td class="lbl" style="white-space:nowrap">Location Factor :</td><td><input class="ef ef-b" value="${job.vo1.lf||29.25}" style="width:40px">%</td></tr>
    <tr><td class="lbl">Location :</td><td><input class="ef ef-b" value="${job.loc}" style="width:98%"></td>
      <td class="lbl" style="white-space:nowrap">Customer Payment Date :</td><td><input class="ef ef-b" type="date" value="${custPayDate}" style="width:110px"></td></tr>
    <tr><td class="lbl">Wayleave Approval :</td><td>BPC</td><td class="lbl">Date Wayleave Available :</td><td><input class="ef ef-b" value="Not Required" style="width:98%"></td></tr>
  </table><hr>
  <div style="font-weight:bold;font-size:9pt;margin-bottom:4px">Details of BPC W/O No. : ${job.wo}</div>

  <div style="font-weight:bold;font-size:9pt;margin:6px 0 3px;background:#d9d9d9;padding:2px 5px">VO1 — Phase ${phase}</div>
  <table class="boq">
    <thead><tr><th class="c" style="width:28px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:44px">UNIT</th><th class="r" style="width:55px">QUANTITY</th><th class="r" style="width:80px">RATE/UNIT</th><th class="r" style="width:90px">VALUE</th></tr></thead>
    <tbody>${vo1rows}</tbody>
  </table>
  <table style="width:100%;margin-top:5px;font-size:8.5pt;border-collapse:collapse">
    <tr><td style="width:70%;text-align:right;padding:2px 5px">Items Subtotal</td><td style="text-align:right;padding:2px 5px">${t1.sub.toFixed(2)}</td></tr>
    <tr><td style="text-align:right;padding:2px 5px">Location Factor @ ${job.vo1.lf||29.25}%</td><td style="text-align:right;padding:2px 5px">${t1.loc.toFixed(2)}</td></tr>
    ${job.vo1.mk?`<tr><td style="text-align:right;padding:2px 5px">Markup @ ${job.vo1.mk}%</td><td style="text-align:right;padding:2px 5px">${t1.markup.toFixed(2)}</td></tr>`:''}
    <tr style="background:#d9d9d9;font-weight:bold"><td style="text-align:right;padding:3px 5px;border-top:2px solid #000">VO1 TOTAL (BWP)</td><td style="text-align:right;padding:3px 5px;border-top:2px solid #000;border:2px solid #000">${t1.total.toFixed(2)}</td></tr>
  </table>

  <div style="font-weight:bold;font-size:9pt;margin:10px 0 3px;background:#d9d9d9;padding:2px 5px">VO2 — Phase ${job.vo2.phase||phase}</div>
  <table class="boq">
    <thead><tr><th class="c" style="width:28px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:44px">UNIT</th><th class="r" style="width:55px">QUANTITY</th><th class="r" style="width:80px">RATE/UNIT</th><th class="r" style="width:90px">VALUE</th></tr></thead>
    <tbody>${vo2rows||'<tr><td colspan="6" style="text-align:center;padding:6px;color:#999">No VO2 items</td></tr>'}</tbody>
  </table>
  <table style="width:100%;margin-top:5px;font-size:8.5pt;border-collapse:collapse">
  <tr><td style="width:70%;text-align:right;padding:2px 5px">Items Subtotal</td><td style="text-align:right;padding:2px 5px">${t2.sub.toFixed(2)}</td></tr>
  <tr><td style="text-align:right;padding:2px 5px">Location Factor @ ${job.vo2.lf||29.25}%</td><td style="text-align:right;padding:2px 5px">${t2.loc.toFixed(2)}</td></tr>
  ${job.vo2.mk?`<tr><td style="text-align:right;padding:2px 5px">Markup @ ${job.vo2.mk}%</td><td style="text-align:right;padding:2px 5px">${t2.markup.toFixed(2)}</td></tr>`:''}
  <tr style="background:#d9d9d9;font-weight:bold"><td style="text-align:right;padding:3px 5px;border-top:2px solid #000">VO2 TOTAL (BWP)</td><td style="text-align:right;padding:3px 5px;border-top:2px solid #000;border:2px solid #000">${t2.total.toFixed(2)}</td></tr>
</table>

  <table style="width:100%;margin-top:10px;font-size:8.5pt;border-collapse:collapse">
    <tr style="background:#d9d9d9;font-weight:bold;font-size:9.5pt">
      <td style="padding:4px 5px;text-align:right;border:2px solid #000">CLAIM AMOUNT (VO2) (BWP)</td>
      <td style="padding:4px 5px;text-align:right;border:2px solid #000;width:110px">${t2.total>0?t2.total.toFixed(2):t1.total.toFixed(2)}</td>
    </tr>
  </table>

  <div style="margin-top:18px;border-top:1px solid #000;padding-top:4px;width:60%">
    <div style="font-size:8.5pt;font-weight:bold;margin-bottom:22px">Name : ……………………………………………………………………………….</div>
    <div style="font-size:8pt;color:#555">(Inspector-BPC)</div>
  </div>
  </div>`;
}

/* ── VARIATION ORDER VO2 ── */
function docVO2(job){
  if(!(job.vo2&&job.vo2.items&&job.vo2.items.length)) job.vo2.items=(job.vo1&&job.vo1.items||[]).map(i=>({...i}));
  const t=jTotal(job,'vo2'), t1=jTotal(job,'vo1');
  const custPayDate=job.date||job.actions.wo_received?.date||'';
  const rows=job.vo2.items.map((it,i)=>`<tr>
    <td>${i+1}.0</td>
    <td style="min-width:190px"><div class="ac-wrap"><input class="ac-in" id="vo2d${job.wo}${i}" value="${(it.d||'').replace(/"/g,'&quot;')}" placeholder="Search rates..." oninput="acS('${job.wo}','vo2',${i},this.value)" onfocus="acS('${job.wo}','vo2',${i},this.value)" onblur="setTimeout(()=>acC('acd-vo2-${job.wo}-${i}'),180)" onkeydown="acK(event,'${job.wo}','vo2',${i})"><div class="ac-dd" id="acd-vo2-${job.wo}-${i}" style="display:none"></div></div></td>
    <td class="c"><input class="ef ef-b" id="vo2u${job.wo}${i}" value="${it.u||'Ea'}" style="width:38px" onchange="DB.jobs['${job.wo}'].vo2.items[${i}].u=this.value"></td>
    <td class="r"><input class="ef ef-b" id="vo2q${job.wo}${i}" value="${it.q||0}" style="width:38px;text-align:right" onchange="DB.jobs['${job.wo}'].vo2.items[${i}].q=parseFloat(this.value)||0;recalcVO2('${job.wo}')"></td>
    <td class="r"><input class="ef ef-b" id="vo2r${job.wo}${i}" value="${(it.r||0).toFixed(2)}" style="width:76px;text-align:right" onchange="DB.jobs['${job.wo}'].vo2.items[${i}].r=parseFloat(this.value)||0;recalcVO2('${job.wo}')"></td>
    <td class="r" id="vo2v${job.wo}${i}">${((it.q||0)*(it.r||0)).toFixed(2)}</td>
  </tr>`).join('');
  return`<div class="paper">
  ${lh('Variation Order')}
  <table class="hdt">
    <tr><td class="lbl">Contract :</td><td colspan="3"><input class="ef ef-b" value="FREE CONNECTIONS PHASE ${job.phase} PROJECT" style="width:235px"> &nbsp; BPC Project No.: <input class="ef ef-b" value="${job.bpcProjNo||job.wo}" style="width:90px"></td></tr>
    <tr><td class="lbl">PROJECT TITLE:</td><td>${job.cust}</td><td class="lbl">PHASE:</td><td>${job.phase}</td></tr>
    <tr><td class="lbl">LOCATION:</td><td>${job.loc}</td><td class="lbl">BPC W/O No.:</td><td>${job.wo}</td></tr>
    <tr><td class="lbl" style="white-space:nowrap">Customer Payment Date :</td><td><input class="ef ef-b" type="date" value="${custPayDate}" style="width:120px"></td>
      <td class="lbl">Location Factor:</td><td><input class="ef ef-b" value="${job.vo2.lf||29.25}" style="width:40px" onchange="DB.jobs['${job.wo}'].vo2.lf=parseFloat(this.value)||0;recalcVO2('${job.wo}')">%</td></tr>
    <tr><td class="lbl">Markup:</td><td><input class="ef ef-b" value="${job.vo2.mk||''}" placeholder="0" style="width:40px" onchange="DB.jobs['${job.wo}'].vo2.mk=parseFloat(this.value)||0;recalcVO2('${job.wo}')">%</td><td></td><td></td></tr>
  </table><hr>
  <span class="p-grey">VO2 — Actual Quantities After Field Inspection — Phase <select id="vo2phase${job.wo}" class="ef ef-b" style="width:80px;font-size:8.5pt;background:#d9d9d9;border:none" onchange="DB.jobs['${job.wo}'].vo2.phase=this.value;saveDB();toast('VO2 Phase updated to '+this.value)"><option value="46" ${(job.vo2.phase||job.phase||'47')==='46'?'selected':''}>Phase 46</option><option value="47" ${(job.vo2.phase||job.phase||'47')==='47'?'selected':''}>Phase 47</option></select></span>
  <table class="boq">
    <thead><tr><th style="width:32px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:44px">UNIT</th><th class="r" style="width:46px">QTY</th><th class="r" style="width:78px">UNIT COST</th><th class="r" style="width:90px">TOTAL (BWP)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <button onclick="addVO2Row('${job.wo}')" style="font-size:8pt;padding:2px 8px;cursor:pointer;margin-top:5px">+ Add row</button>
  <div style="margin-top:8px;background:#f8f8f8;border:1px solid #ddd;padding:6px 8px">
    <div style="display:flex;justify-content:space-between;font-size:8.5pt;padding:1px 0;background:#fffbe8"><span>Location Factor</span><span id="vo2loc${job.wo}">${t.loc.toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:8.5pt;padding:1px 0"><span>SUB TOTAL</span><span id="vo2sub${job.wo}">${(t.sub+t.loc).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:8.5pt;padding:1px 0"><span>Markup</span><span id="vo2mk${job.wo}">${t.markup.toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:9pt;padding:3px 0;border-top:2px solid #000;margin-top:2px"><span>TOTAL (BWP)</span><span id="vo2tot${job.wo}">${t.total.toFixed(2)}</span></div>
  </div>
  </div>`;
}

/* ── FIELD REPORT ── */
function docFieldReport(job){
  const f=job.fieldData||{};
  const canEdit=CU==='admin';
  return`<div class="paper">
  <div style="font-size:11pt;font-weight:bold;text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px">FIELD MEASUREMENT REPORT</div>
  <table class="hdt">
    <tr><td class="lbl">BPC W/O No. :</td><td>${job.wo}</td><td class="lbl">Customer :</td><td>${job.cust}</td></tr>
    <tr><td colspan="4"><span class="lbl">Location :</span> ${job.loc}</td></tr>
  </table><hr>
  ${f.submitted?`<div style="background:#d9f7e8;border:1px solid #4caf50;padding:5px 8px;margin-bottom:8px;font-size:8pt">✓ Field findings recorded on ${f.recordedDate||'—'}</div>`:''}
  <table class="boq"><tbody>
    <tr><td style="width:175px;font-weight:bold">Airdac Length (m)</td><td>${canEdit?`<input class="ef ef-b" id="ff_airdac" value="${f.airdac||''}" placeholder="e.g. 45" style="width:100%">`:f.airdac||'—'}</td></tr>
    <tr><td style="font-weight:bold">ABC Cable (m)</td><td>${canEdit?`<input class="ef ef-b" id="ff_abc" value="${f.abc||''}" placeholder="e.g. 30" style="width:100%">`:f.abc||'—'}</td></tr>
    <tr><td style="font-weight:bold">No. of LV Poles</td><td>${canEdit?`<input class="ef ef-b" id="ff_poles" value="${f.poles||''}" placeholder="e.g. 2" style="width:100%">`:f.poles||'—'}</td></tr>
    <tr><td style="font-weight:bold">T-Off Point</td><td>${canEdit?`<input class="ef ef-b" id="ff_toff" value="${f.toff||''}" placeholder="Existing pole/structure" style="width:100%">`:f.toff||'—'}</td></tr>
    <tr><td style="font-weight:bold">Supply Type</td><td>${canEdit?`<input class="ef ef-b" id="ff_supply" value="${f.supply||job.type||''}" style="width:100%">`:f.supply||'—'}</td></tr>
    <tr><td style="font-weight:bold">Site Conditions / Notes</td><td>${canEdit?`<textarea class="ef ef-b" id="ff_notes" style="width:100%;min-height:50px">${f.notes||''}</textarea>`:f.notes||'—'}</td></tr>
    <tr><td style="font-weight:bold">Linesman Drawings/Photos</td><td>
      ${canEdit?`<input type="file" id="ff_drawing" accept="image/*,application/pdf" style="font-size:8pt"><div id="ff_preview" style="margin-top:4px"></div>${f.drawing?`<span style="font-size:7.5pt;color:#666">Previous: ${f.drawing}</span>`:''}`:`${f.drawing?`<span>📎 ${f.drawing}</span>`:'—'}`}
    </td></tr>
    ${f.photoData?`<tr><td style="font-weight:bold">Photo</td><td><img src="${f.photoData}" style="max-width:220px;max-height:140px;border:1px solid #ccc;border-radius:4px"></td></tr>`:''}
  </tbody></table>
  <div class="sig-area">
    ${sigBlank('Linesman (hand-signed copy provided to Admin)')}
    ${sigBlank('Admin (Received & Recorded)')}
  </div>
  </div>`;
}

/* ── WORKS INSTRUCTION ── */
function docWorksInstruction(job){
  const t1=jTotal(job,'vo1');
  const t2=jTotal(job,'vo2');
  const finalCost=t2.total>0?t2.total:t1.total;
  const ef=(id,val,w,type)=>`<input class="ef ef-b" id="${id}" value="${val||''}" style="width:${w||'90%'}" ${type?`type="${type}"`:''}  >`;
  return`<div class="paper">
  <table style="width:100%;border-collapse:collapse;margin-bottom:5px">
    <tr>
      <td style="width:60%;vertical-align:top">
        <div style="font-weight:bold;font-size:10pt">BOTSWANA POWER CORPORATION</div>
        <div style="font-size:8.5pt">P. O. Box 48 &nbsp;&nbsp; Tel &nbsp; ${ef('wi_tel','3607000','60px')} &nbsp;&nbsp; Gaborone</div>
        <div style="font-size:8.5pt">Fax &nbsp; ${ef('wi_fax','3607731','60px')}</div>
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:11pt;font-weight:bold">Works Instruction</div>
        <div style="font-size:9pt">BPC &nbsp; W/O No. : &nbsp; <strong>${job.wo}</strong></div>
      </td>
    </tr>
  </table><hr>
  <div style="font-weight:bold;font-size:9pt;background:#f0f0f0;padding:2px 6px;margin-bottom:3px">Contract Details</div>
  <table class="hdt">
    <tr><td class="lbl">Contract :</td><td>${ef('wi_contract','FREE CONNECTIONS PHASE '+job.phase+' PROJECT','65%')}</td>
      <td class="lbl" style="white-space:nowrap">BPC Contract No. :</td><td>${ef('wi_contractno',job.contract||'','90px')}</td></tr>
    <tr><td class="lbl">Contractor :</td><td colspan="3">${ef('wi_contractor',CO.name,'98%')}</td></tr>
  </table>
  <div style="font-weight:bold;font-size:9pt;background:#f0f0f0;padding:2px 6px;margin:3px 0">Work Details</div>
  <table class="hdt">
    <tr><td class="lbl">Project Title :</td><td>${ef('wi_title',job.cust,'98%')}</td>
      <td class="lbl" style="white-space:nowrap">Location Factor :</td><td>${ef('wi_lf',String(job.vo1.lf||29.25),'50px')}</td></tr>
    <tr><td class="lbl">Location :</td><td>${ef('wi_loc',job.loc,'98%')}</td>
     <td class="lbl" style="white-space:nowrap">Customer Payment Date :</td><td>${ef('wi_custdate',job.actions.wo_received?.date||job.date||'','110px','date')}</td></tr>
    <tr><td class="lbl">Drawings :</td><td>${ef('wi_drawings','Attached','80px')}</td>
      <td class="lbl" style="white-space:nowrap">Date Wayleave Available :</td><td>${ef('wi_wayleave','','110px')}</td></tr>
    <tr><td class="lbl">Wayleave Approval :</td><td>${ef('wi_wayleaveapproval','BPC','60px')}</td><td></td><td></td></tr>
  </table>
  <div style="font-weight:bold;font-size:9pt;background:#f0f0f0;padding:2px 6px;margin:3px 0">Commencement of Works</div>
  <table class="hdt">
    <tr><td class="lbl">Agreed Start Date :</td><td>${ef('wi_start',job.actions.teams_notified?.date||'','110px','date')}</td>
      <td class="lbl" style="white-space:nowrap">Intial W/O Cost:</td><td><strong>${ef('wi_initcost',t1.total.toFixed(2),'100px')}</strong></td></tr>
    <tr><td class="lbl">Agreed Completion Date :</td><td>${ef('wi_agreedcomp','','110px','date')}</td>
      <td class="lbl" style="white-space:nowrap">Weekly Penalty for Delay :</td><td>${ef('wi_penalty','0','60px')}</td></tr>
    <tr><td class="lbl">% Complete :</td><td>${ef('wi_pct','1','40px')}</td><td></td><td></td></tr>
  </table>
  <div style="font-weight:bold;font-size:9pt;background:#f0f0f0;padding:2px 6px;margin:3px 0">Completion of Works</div>
  <table class="hdt">
    <tr><td class="lbl">Actual Completion Date :</td><td>${ef('wi_actualcomp',job.actions.work_complete?.date||'','110px','date')}</td>
      <td class="lbl" style="white-space:nowrap">Delay to Completion (Weeks):</td><td>${ef('wi_delay','0','60px')}</td></tr>
    <tr><td class="lbl">Reason for Delay :</td><td colspan="3">${ef('wi_reasondelay','NIL','98%')}</td></tr>
    <tr><td class="lbl">Final W/O Cost</td><td><strong>${ef('wi_finalcost',finalCost.toFixed(2),'110px')}</strong></td>
      <td class="lbl" style="white-space:nowrap">Final V/O No:</td><td>${ef('wi_fvono',t2.total>0?'2':'1','40px')}</td></tr>
    <tr><td class="lbl">Penalty Deduction :</td><td>${ef('wi_penaltyded','0','80px')}</td><td></td><td></td></tr>
    <tr><td class="lbl">Interim Payments :</td><td>${ef('wi_interim','0','80px')}</td><td></td><td></td></tr>
    <tr><td class="lbl">Final W/O Payment:</td><td><strong>${ef('wi_finalpay',finalCost.toFixed(2),'110px')}</strong></td>
      <td class="lbl" style="white-space:nowrap">Payment Cert. (Final):</td><td>${ef('wi_paymentcertfinal',CO.name,'150px')}</td></tr>
  </table>
  <div style="margin-top:8px;font-size:9pt">
    Signed For Contractor : &nbsp; ${ef('wi_signedcontractor','…………………………………………………………………','70%')}
  </div>
  <div style="margin-top:5px;font-size:9pt">
    Name : &nbsp; ${ef('wi_namecontractor','','70%')}
  </div>
  <div style="margin-top:10px;font-weight:bold;font-size:9pt;background:#f0f0f0;padding:2px 6px">Certification of Works</div>
  <table style="width:100%;border-collapse:collapse;margin-top:6px">
    <tr>
      <td style="width:50%;padding-right:12px">
        <div style="font-size:8.5pt;font-weight:bold">Certified For Payment</div>
        <div style="margin-top:20px;border-bottom:1px solid #000;height:22px"></div>
        <div style="margin-top:4px;font-size:8.5pt">Name : ${ef('wi_certname','','95%')}</div>
        <div style="font-size:7.5pt;color:#555">(Inspector-BPC)</div>
      </td>
      <td style="width:50%;padding-left:12px">
        <div style="font-size:8.5pt;font-weight:bold">Approved for Payment</div>
        <div style="margin-top:20px;border-bottom:1px solid #000;height:22px"></div>
        <div style="margin-top:4px;font-size:8.5pt">Name : ${ef('wi_approvname','','95%')}</div>
        <div style="font-size:7.5pt;color:#555">(for Botswana Power Corporation)</div>
      </td>
    </tr>
  </table>
  </div>`;
}

/* ── GIS REPORT ── */
function docGISReport(job){
  const g=job.gisData||{};
  const canEdit=CU==='admin';
  const ef=(id,val,ph)=>canEdit?`<input class="ef ef-b" id="${id}" value="${val||''}" placeholder="${ph}" style="width:98%">`:val||'—';
  const ta=(id,val,ph)=>canEdit?`<textarea class="ef ef-b" id="${id}" placeholder="${ph}" style="width:98%;min-height:50px">${val||''}</textarea>`:val||'—';
  return`<div class="paper">
  <div style="font-size:11pt;font-weight:bold;text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px">GIS GEO-ANALYSIS REPORT</div>
  <table class="hdt">
    <tr><td class="lbl">BPC W/O No. :</td><td><strong>${job.wo}</strong></td><td class="lbl">Phase :</td><td>${job.phase}</td></tr>
    <tr><td class="lbl">Customer :</td><td>${job.cust}</td><td class="lbl">Survey Date :</td><td>${ef('g_date',g.date,'YYYY-MM-DD')}</td></tr>
    <tr><td class="lbl">Location :</td><td colspan="3">${job.loc}</td></tr>
  </table><hr>
  <span class="p-grey">1. SITE INFORMATION</span>
  <table class="boq"><tbody>
    <tr><td style="width:160px;font-weight:bold">Coordinates</td><td>${ef('g_coords',g.coords,'-18.3667, 21.8500')}</td></tr>
    <tr><td style="font-weight:bold">Erf / Plot</td><td>${ef('g_erf',g.erf,'Plot number')}</td></tr>
    <tr><td style="font-weight:bold">Soil Type</td><td>${ef('g_soil',g.soil,'e.g. Sandy loam')}</td></tr>
    <tr><td style="font-weight:bold">Accessibility</td><td>${ef('g_access',g.access,'Good / Poor / 4x4 required')}</td></tr>
    <tr><td style="font-weight:bold">Nearest LV Network</td><td>${ef('g_lv',g.lv,'Distance to nearest LV line (m)')}</td></tr>
  </tbody></table>
  <span class="p-grey">2. FINDINGS</span>${ta('g_findings',g.findings,'Site conditions, obstacles, existing infrastructure...')}
  <span class="p-grey">3. PROPOSED ROUTE / RECOMMENDATION</span>${ta('g_recs',g.recs,'Recommended connection route, installation method...')}
  <span class="p-grey">4. SURVEYOR</span>
  <table class="boq"><tbody>
    <tr><td style="width:160px;font-weight:bold">Surveyor Name</td><td>${ef('g_surveyor',g.surveyor,'Full name')}</td></tr>
    <tr><td style="font-weight:bold">Company</td><td>${ef('g_company',g.company,'GIS firm name')}</td></tr>
    <tr><td style="font-weight:bold">Equipment Used</td><td>${ef('g_equipment',g.equipment,'GPS, Total Station, etc.')}</td></tr>
  </tbody></table>
  <div class="sig-area">
    ${sigBlank('GIS Consultant')}
    ${sigBlank('BPC Representative')}
  </div>
  </div>`;
}

/* ── GIS CERTIFICATE ── */
function docGISCert(job){
  const canEdit=CU==='admin';
  const ef=(id,val,ph)=>canEdit?`<input class="ef ef-b" id="${id}" value="${val||''}" placeholder="${ph}" style="width:98%">`:val||'—';
  return`<div class="paper">
  <div style="font-size:11pt;font-weight:bold;text-align:center;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px">GIS CERTIFICATE</div>
  <table class="hdt">
    <tr><td class="lbl">BPC W/O No. :</td><td><strong>${job.wo}</strong></td><td class="lbl">Phase :</td><td>${job.phase}</td></tr>
    <tr><td class="lbl">Customer :</td><td>${job.cust}</td><td class="lbl">Date :</td><td>${ef('gc_date','','YYYY-MM-DD')}</td></tr>
    <tr><td class="lbl">Location :</td><td colspan="3">${job.loc}</td></tr>
  </table><hr>
  <span class="p-grey">CERTIFICATION</span>
  <table class="boq"><tbody>
    <tr><td style="width:180px;font-weight:bold">Certificate No.</td><td>${ef('gc_certno','','e.g. GIS-CERT-001')}</td></tr>
    <tr><td style="font-weight:bold">Survey Reference</td><td>${ef('gc_ref','','Reference number')}</td></tr>
    <tr><td style="font-weight:bold">Connection Confirmed</td><td>${ef('gc_conn','','Type of connection confirmed')}</td></tr>
    <tr><td style="font-weight:bold">Date of Survey</td><td><input class="ef ef-b" id="gc_survdate" type="date" value="" style="width:98%"></td></tr>
    <tr><td style="font-weight:bold">Remarks</td><td>${ef('gc_remarks','','Any certification remarks')}</td></tr>
  </tbody></table>
  <div class="sig-area" style="margin-top:14px">
    ${sigBlank('GIS Consultant (Certified)')}
    ${sigBlank('Admin (Received)')}
  </div>
  </div>`;
}

/* ── ANNEXURE TO PAYMENT CERTIFICATE ── */
function docAnnexure(job){
  const certNo=job?.claimRef||'TES-001';
  const claimJobs=(job
    ?(certNo!=='TES-001'
      ?Object.values(DB.jobs).filter(j=>j.claimRef===certNo)
      :[job])
    :Object.values(DB.jobs).filter(j=>j.stage==='claim_docs_ready'||j.stage==='job_complete')
  ).filter(j=>j&&j.vo1&&j.vo1.items);
  const totalFinal=claimJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);
  const inL=(val,w)=>`<input type="text" value="${val||''}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;outline:none">`;
  const inR=(val,w)=>`<input type="text" value="${val||''}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;outline:none;text-align:right">`;
  const rows=claimJobs.map(j=>{
    const tVO1=jTotal(j,'vo1');
    const tVO2=(j.vo2&&j.vo2.items&&j.vo2.items.length)?jTotal(j,'vo2'):null;
    const amt=tVO2?BWP(tVO2.total):BWP(tVO1.total);
    return`<tr>
      <td style="border:1px solid #bbb;padding:3px 5px">${inL(j.wo,'70px')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px">${inL(j.cust,'99%')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px">${inL(j.meterNo||'','110px')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px;text-align:right">${inR(amt,'100px')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px;text-align:right">${inR('0.00','65px')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px;text-align:right">${inR('0.00','80px')}</td>
      <td style="border:1px solid #bbb;padding:3px 5px;text-align:right">${inR(amt,'100px')}</td>
    </tr>`;
  }).join('');
  return`<div class="paper">
  <table style="width:100%;border-collapse:collapse;margin-bottom:0">
    <tr>
      <td style="padding:4px 0">
        <img src="data:image/png;base64,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" style="width:100%;max-width:100%;height:auto;display:block">
      </td>
    </tr>
  </table>
  <div style="border-top:2.5px solid #e07b00;margin:4px 0 2px"></div>
  <div style="text-align:center;font-style:italic;font-size:9pt;color:#333;padding:3px 0">"your success, our priority"</div>
  <div style="border-top:1px solid #bbb;margin:3px 0 8px"></div>
  <div style="text-align:center;font-weight:bold;font-size:11pt;margin-bottom:10px">ANNEXURE TO PAYMENT CERTIFICATE</div>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:8px">
    <tr>
      <td style="padding:2px 4px;width:170px;font-weight:bold">Payment Certificate:</td>
      <td style="padding:2px 4px;width:180px">${inL(certNo,'130px')}</td>
      <td style="padding:2px 4px;width:50px;font-weight:bold">Ref:</td>
      <td style="padding:2px 4px">${inL(certNo,'110px')}</td>
    </tr>
    <tr>
      <td style="padding:2px 4px;font-weight:bold">Contract:</td>
      <td colspan="3" style="padding:2px 4px">${inL('Free Connections Projects - North','98%')}</td>
    </tr>
    <tr>
      <td style="padding:2px 4px;font-weight:bold">Employer:</td>
      <td colspan="3" style="padding:2px 4px">${inL('Botswana Power Corporation','98%')}</td>
    </tr>
    <tr>
      <td style="padding:2px 4px;font-weight:bold">Contractor:</td>
      <td colspan="3" style="padding:2px 4px">${inL(CO.name,'98%')}</td>
    </tr>
    <tr>
      <td style="padding:2px 4px;font-weight:bold">Region:</td>
      <td style="padding:2px 4px">${inL('North','100px')}</td>
      <td style="padding:2px 4px;font-weight:bold">Date:</td>
      <td style="padding:2px 4px"><input type="date" value="${new Date().toISOString().slice(0,10)}" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;outline:none"></td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
    <thead>
      <tr style="background:#f0f0f0">
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:left;width:80px;font-weight:bold">BPC W/O No</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:left;font-weight:bold">Project Title</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:left;width:120px;font-weight:bold">Meter Number</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:right;width:110px;font-weight:bold">Final Cost</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:right;width:75px;font-weight:bold">Penalties</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:right;width:90px;font-weight:bold">Interim Payments</th>
        <th style="border:1px solid #bbb;padding:5px 6px;text-align:right;width:110px;font-weight:bold">Final Payment</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr style="font-weight:bold;border-top:2px solid #aaa">
        <td style="border:1px solid #bbb;padding:4px 6px" colspan="3"><strong>TOTAL</strong></td>
        <td style="border:1px solid #bbb;padding:4px 6px;text-align:right">${inR(BWP(totalFinal),'100px')}</td>
        <td style="border:1px solid #bbb;padding:4px 6px;text-align:right">0.00</td>
        <td style="border:1px solid #bbb;padding:4px 6px;text-align:right">0.00</td>
        <td style="border:1px solid #bbb;padding:4px 6px;text-align:right">${inR(BWP(totalFinal),'100px')}</td>
      </tr>
    </tbody>
  </table>
  </div>`;
}


/* ── PAYMENT CERTIFICATE (exact match to CLAIM xlsx PAYMENT CERTIFICATE sheet) ── */
function recalcPC(){
  try{
    const g=id=>parseFloat((document.getElementById(id)||{}).value||'0')||0;
    const r1=g('pcr1'),r2=g('pcr2'),r3=g('pcr3'),r5=g('pcr5');
    const r4=r1+r2+r3;
    const r6=r4+r5;
    const r7=g('pcr7'),r8=g('pcr8'),r9=g('pcr9');
    const r10=r7+r8+r9;
    const r11=r6-r10;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=BWP(v);};
    set('pcr4',r4);set('pcr6',r6);set('pcr10',r10);set('pcr11',r11);
    const w=document.getElementById('pc_words');if(w)w.textContent='('+numWords(r11)+')';
  }catch(e){}
}
function docPaymentCert(job){
  const certNo=job?.claimRef||'TES-001';
  const claimJobs=job
    ?Object.values(DB.jobs).filter(j=>j.claimRef===certNo)
    :Object.values(DB.jobs).filter(j=>j.stage==='claim_docs_ready'||j.stage==='job_complete');
  const gross=claimJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);
  const ret=gross*.05, wht=gross*.03, net=gross-ret-wht;
  const ef=(val,w,id)=>`<input class="ef ef-b" ${id?`id="${id}"`:''}  value="${val||''}" style="width:${w||'90%'}">`;
  return`<div class="paper">
  <div style="font-size:13pt;font-weight:bold;text-align:center;margin-bottom:5px">PAYMENT CERTIFICATE</div>
  <hr>
  <table class="hdt" style="margin-bottom:6px">
    <tr><td class="lbl">Reference No.</td><td>…………….</td><td>${ef(certNo,'90px')}</td>
      <td class="lbl" style="text-align:right">Date:</td><td><input class="ef ef-b" type="date" value="${new Date().toISOString().slice(0,10)}"></td></tr>
    <tr><td class="lbl">Certificate No.</td><td>:…………….</td><td colspan="3">${ef(certNo,'90px')}</td></tr>
    <tr><td class="lbl">Project</td><td>:…………….</td><td colspan="3">${ef('Free Connections Projects - North','98%')}</td></tr>
    <tr><td class="lbl">Employer</td><td>:…………….</td><td colspan="3">${ef('Botswana Power Corporation','98%')}</td></tr>
    <tr><td class="lbl">Contractor</td><td>:…………….</td><td colspan="3">${ef(CO.name,'98%')}</td></tr>
  </table>
  <div style="font-size:8.5pt;font-weight:bold;margin:4px 0">Contract Statement (Including VAT)</div>
  <table style="width:100%;font-size:8.5pt;border-collapse:collapse">
    <tr><td>Original Approved Contract Value</td><td style="width:20px;text-align:right">P</td><td style="width:130px;text-align:right">${ef('0.00','120px')}</td></tr>
    <tr><td>Value Of Work Completed To Date (Excl. Vat)</td><td style="text-align:right">P</td><td style="text-align:right">${ef(BWP(gross),'120px')}</td></tr>
    <tr><td>Less Previous Payments</td><td style="text-align:right">P</td><td style="text-align:right">${ef('0.00','120px')}</td></tr>
  </table>
  <div style="background:#d9d9d9;font-weight:bold;padding:2px 5px;font-size:9pt;margin:5px 0 2px">Amount Certified To Date</div>
  <table style="width:100%;font-size:8.5pt;border-collapse:collapse">
    <tr><td style="padding:2px 5px;width:4%">1.</td><td>Value of Work Completed (see Annexure ${ef(certNo,'70px')})</td><td style="width:20px;text-align:right;padding:2px">P</td><td style="width:130px;text-align:right;padding:2px"><input class="ef ef-b" id="pcr1" value="${BWP(gross)}" style="width:120px;text-align:right" oninput="recalcPC()"></td></tr>
    <tr><td style="padding:2px 5px">2.</td><td>Value of Interim Work previously claimed but now 100% completed (see Annexure)</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px"><input class="ef ef-b" id="pcr2" value="0.00" style="width:120px;text-align:right" oninput="recalcPC()"></td></tr>
    <tr><td style="padding:2px 5px">3.</td><td>Interim Value of work completed (see Annexure)</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px"><input class="ef ef-b" id="pcr3" value="0.00" style="width:120px;text-align:right" oninput="recalcPC()"></td></tr>
    <tr style="background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999"><td style="padding:2px 5px">4.</td><td>Sub total of Work completed</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px;font-weight:bold" id="pcr4">${BWP(gross)}</td></tr>
    <tr><td style="padding:2px 5px">5.</td><td>Plus VAT @ 14%</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px"><input class="ef ef-b" id="pcr5" value="${BWP(gross*0.14)}" style="width:120px;text-align:right" oninput="recalcPC()"></td></tr>
    <tr style="background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999"><td style="padding:2px 5px">6.</td><td>Total Valuation Certified To Date</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px;font-weight:bold" id="pcr6">${BWP(gross)}</td></tr>
  </table>
  <div style="background:#d9d9d9;font-weight:bold;padding:2px 5px;font-size:9pt;margin:5px 0 2px">Deductions</div>
  <table style="width:100%;font-size:8.5pt;border-collapse:collapse">
    <tr><td style="padding:2px 5px;width:4%">7.</td><td>Less Retention (5% of Value of Work Now Completed excluding VAT)</td><td style="width:20px;text-align:right;padding:2px">P</td><td style="width:130px;text-align:right;padding:2px;color:#c00"><input class="ef ef-b" id="pcr7" value="${BWP(ret)}" style="width:120px;text-align:right;color:#c00" oninput="recalcPC()"></td></tr>
    <tr><td style="padding:2px 5px">8.</td><td>Less Witholding Tax @ 3% of Value of Work Completed</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px;color:#c00"><input class="ef ef-b" id="pcr8" value="${BWP(wht)}" style="width:120px;text-align:right;color:#c00" oninput="recalcPC()"></td></tr>
    <tr><td style="padding:2px 5px">9.</td><td>Less Retention (10% of Interim Value of Work Claimed excluding VAT)</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px;color:#c00"><input class="ef ef-b" id="pcr9" value="0.00" style="width:120px;text-align:right;color:#c00" oninput="recalcPC()"></td></tr>
    <tr style="background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999"><td style="padding:2px 5px">10.</td><td>Sub-Total-Sum Items 7-9</td><td style="text-align:right;padding:2px">P</td><td style="text-align:right;padding:2px;color:#c00;font-weight:bold" id="pcr10">${BWP(ret+wht)}</td></tr>
  </table>
  <div style="background:#d9d9d9;font-weight:bold;padding:2px 5px;font-size:9pt;margin:5px 0 2px">Amount Due</div>
  <table style="width:100%;font-size:8.5pt;border-collapse:collapse">
    <tr style="background:#d9d9d9;font-weight:bold;border-top:2px solid #000"><td style="padding:3px 5px;width:4%">11.</td><td>Item 6 - Item 10</td><td style="width:20px;text-align:right;padding:3px">P</td><td style="width:130px;text-align:right;padding:3px;font-size:9.5pt;font-weight:bold" id="pcr11">${BWP(net)}</td></tr>
  </table>
  <div style="font-size:8pt;font-style:italic;margin:4px 5px" id="pc_words">(${numWords(net)})</div>
  <div style="margin:5px;font-size:8.5pt">Remarks: <input class="ef ef-b" value="" placeholder="________________________________________" style="width:82%"></div>
  <div style="margin:5px;font-size:8.5pt">________________________________________</div>
  <div style="margin:5px 5px 8px;font-size:8pt">We hereby certify that the value of work shown is correct and recommend payment in full of the amount shown</div>
  <table style="width:100%;border-collapse:collapse;margin-top:10px">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:12px">
        <div style="font-size:8.5pt;margin-bottom:20px">Certificate Prepared by:</div>
        <div style="border-bottom:1px solid #000;margin-bottom:3px;height:18px"></div>
        <div style="font-size:8.5pt">Name: <input class="ef ef-b" value="" style="width:70%"></div>
        <div style="font-size:7.5pt;color:#555">for Botswana Power Corporation</div>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:12px">
        <div style="font-size:8.5pt;margin-bottom:20px">Certificate Approved by:</div>
        <div style="border-bottom:1px solid #000;margin-bottom:3px;height:18px"></div>
        <div style="font-size:8.5pt">Name: <input class="ef ef-b" value="" style="width:70%"></div>
        <div style="font-size:7.5pt;color:#555">for Botswana Power Corporation</div>
      </td>
    </tr>
  </table>
  <div style="margin-top:10px;font-size:8.5pt">Transmission &amp; Distribution:<br>Botswana Power Corporation</div>
  </div>`;
}

/* ── INVOICE (exact match to CLAIM_10 INVOICE sheet) ── */
function docInvoice(job){
  const certNo=job?.claimRef||'TES-001';
  const claimJobs=job
    ?Object.values(DB.jobs).filter(j=>j.claimRef===certNo)
    :Object.values(DB.jobs).filter(j=>j.stage==='claim_docs_ready'||j.stage==='job_complete');
  const phase=job?.phase||claimJobs[0]?.phase||'46';
  const gross=claimJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);
  const vat=gross*.14;
  const ret=gross*.05, wht=gross*.03;
  const amountDue=gross+vat-ret-wht;
  const invNo=`INV_${certNo}.${new Date().getFullYear()}`;
  const ef=(val,w)=>`<input class="ef ef-b" value="${val||''}" style="width:${w||'90%'}">`;
  return`<div class="paper">
  <table style="width:100%;border-collapse:collapse;margin-bottom:0">
    <tr>
      <td style="padding:4px 0">
        <img src="data:image/png;base64,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" style="width:100%;max-width:100%;height:auto;display:block">
      </td>
    </tr>
  </table>
  <div style="border-top:2.5px solid #e07b00;margin:4px 0 2px"></div>
  <div style="text-align:center;font-style:italic;font-size:9pt;color:#333;padding:3px 0">"your success, our priority"</div>
  <div style="border-top:1px solid #bbb;margin:3px 0 8px"></div>
  <div style="background:#1a3a8f;padding:7px 12px;margin-bottom:10px;text-align:center">
    <span style="color:#fff;font-size:13pt;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:1px">INVOICE</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:8px">
    <tr>
      <td style="width:48%;vertical-align:top;font-size:8.5pt;padding-right:10px">
        <div style="font-weight:bold">BOTSWANA POWER CORPORATION</div>
        <div>Motlakase House</div>
        <div>Macheng Way</div>
        <div>P.O. Box 48</div>
        <div>Gaborone</div>
      </td>
      <td style="vertical-align:top;font-size:8.5pt">
        <table style="font-size:8.5pt;border-collapse:collapse;width:100%">
          <tr><td style="padding:1px 3px;white-space:nowrap;font-weight:bold;width:130px">Invoice Number:</td><td style="padding:1px 3px">${ef(invNo,'140px')}</td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">Project No:</td><td style="padding:1px 3px">${ef('DSW/TRENDS/ ZERO CONNECTION','170px')}</td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">Reference:</td><td style="padding:1px 3px">${ef(certNo,'100px')}</td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">Invoice Date:</td><td style="padding:1px 3px"><input class="ef ef-b" type="date" value="${new Date().toISOString().slice(0,10)}" style="width:130px"></td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">Vendor No:</td><td style="padding:1px 3px">${ef(CO.vendor,'90px')}</td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">Terms:</td><td style="padding:1px 3px">${ef('45 Days','80px')}</td></tr>
          <tr><td style="padding:1px 3px;font-weight:bold">VAT No.:</td><td style="padding:1px 3px">${ef(CO.vat,'180px')}</td></tr>
        </table>
      </td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:8px">
    <thead>
      <tr>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:left;width:40px">Item</th>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:left">Description</th>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:center;width:40px">Qty</th>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:right;width:120px">Unit Price</th>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:right;width:75px">Discount</th>
        <th style="border:1px solid #bbb;padding:5px 6px;font-weight:bold;text-align:right;width:120px">Price</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border:1px solid #bbb;padding:3px 6px;vertical-align:top;text-align:center">1.0</td>
        <td style="border:1px solid #bbb;padding:3px 6px;vertical-align:top">
          <input class="ef ef-b" value="BPC DISTRIBUTION SMALL WORKS" style="width:99%;font-weight:bold;margin-bottom:3px">
          <input class="ef ef-b" value="PAYMENT CERTIFICATE NO. ${certNo}" style="width:99%;margin-bottom:3px">
          <input class="ef ef-b" value="PHASE ${phase} REVISED ZERO CONNECTION" style="width:99%;margin-bottom:3px">
          <input class="ef ef-b" value="PROGRAMME RATE" style="width:99%">
        </td>
        <td style="border:1px solid #bbb;padding:3px 6px;text-align:center;vertical-align:top"><input class="ef ef-b" value="1" style="width:35px;text-align:center" id="inv_qty" oninput="recalcInv()"></td>
        <td style="border:1px solid #bbb;padding:3px 6px;text-align:right;vertical-align:top"><input class="ef ef-b" value="${BWP(gross)}" style="width:110px;text-align:right" id="inv_unit" oninput="recalcInv()"></td>
        <td style="border:1px solid #bbb;padding:3px 6px;text-align:right;vertical-align:top"><input class="ef ef-b" value="0.00" style="width:65px;text-align:right" id="inv_disc" oninput="recalcInv()"></td>
        <td style="border:1px solid #bbb;padding:3px 6px;text-align:right;vertical-align:top;font-weight:bold" id="inv_price">${BWP(gross)}</td>
      </tr>
      <tr><td colspan="6" style="border:1px solid #bbb;padding:3px 6px;height:15px"></td></tr>
      <tr><td colspan="6" style="border:1px solid #bbb;padding:3px 6px;height:15px"></td></tr>
    </tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:4px">
    <tr>
      <td style="width:52%;vertical-align:top;padding-right:14px">
        <div style="font-weight:bold;text-decoration:underline;margin-bottom:6px;font-size:8.5pt">BANKING DETAILS</div>
        <input class="ef ef-b" value="${CO.name}" style="width:99%;display:block;margin-bottom:3px">
        <input class="ef ef-b" value="${CO.bank}" style="width:99%;display:block;margin-bottom:3px">
        <input class="ef ef-b" value="Account No: ${CO.acc}" style="width:99%;display:block;margin-bottom:3px">
        <input class="ef ef-b" value="${CO.branch}" style="width:99%;display:block;margin-bottom:3px">
        <input class="ef ef-b" value="Branch Code: ${CO.bcode}  |  SWIFT Code: ${CO.swift}" style="width:99%;display:block">
      </td>
      <td style="vertical-align:top">
        <table style="width:100%;font-size:8.5pt;border-collapse:collapse">
          <tr><td style="padding:3px 6px;border:1px solid #e0e0e0">Invoice Subtotal</td><td style="text-align:right;padding:3px 6px;border:1px solid #e0e0e0;font-weight:bold" id="inv_sub">${BWP(gross)}</td></tr>
          <tr style="background:#d9edff"><td style="padding:3px 6px;border:1px solid #e0e0e0">VAT 14%</td><td style="text-align:right;padding:3px 6px;border:1px solid #e0e0e0"><input class="ef ef-b" value="${BWP(gross*0.14)}" id="inv_vat" style="width:110px;text-align:right" oninput="recalcInv()"></td></tr>
          <tr style="background:#d9edff"><td style="padding:3px 6px;border:1px solid #e0e0e0">Less Retention 5%</td><td style="text-align:right;padding:3px 6px;border:1px solid #e0e0e0"><input class="ef ef-b" value="${BWP(ret)}" id="inv_ret" style="width:110px;text-align:right" oninput="recalcInv()"></td></tr>
          <tr style="background:#d9edff"><td style="padding:3px 6px;border:1px solid #e0e0e0">Less Witholding Tax 3%</td><td style="text-align:right;padding:3px 6px;border:1px solid #e0e0e0"><input class="ef ef-b" value="${BWP(wht)}" id="inv_wht" style="width:110px;text-align:right" oninput="recalcInv()"></td></tr>
          <tr style="background:#1a3a8f"><td style="padding:4px 6px;color:#fff;font-weight:bold;border:1px solid #1a3a8f">AMOUNT DUE</td><td style="text-align:right;padding:4px 6px;color:#fff;font-weight:bold;border:1px solid #1a3a8f" id="inv_due">${BWP(amountDue)}</td></tr>
        </table>
      </td>
    </tr>
  </table>
  <div style="margin-top:12px;font-size:8pt">
    <div style="font-weight:bold;margin-bottom:4px">Terms of Payment</div>
    <div>1. Payment would be required to be made in full in Botswana Pula strictly 100% Net 45 days from Invoice date.</div>
    <div style="margin-top:3px">2. Without prejudice to our right to payment as before provided, you will be liable for interest on any overdue sum at a rate of 2.5% above prime overdraft rate, from the due date of such payment until payment is actually made.</div>
  </div>
  </div>`;
}

function recalcInv(){
  try{
    const g=id=>parseFloat((document.getElementById(id)||{}).value?.replace(/,/g,'')||'0')||0;
    const qty=g('inv_qty'),unit=g('inv_unit'),disc=g('inv_disc');
    const sub=qty*unit-disc;
    const vat=g('inv_vat'),ret=g('inv_ret'),wht=g('inv_wht');
    const due=sub+vat-ret-wht;
    const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=BWP(v);};
    s('inv_price',sub);s('inv_sub',sub);s('inv_due',due);
  }catch(e){}
}

/* ── BPC SPREADSHEET (Finance generates for batch) ── */
function docBPCSpreadsheet(jobsOrJob,certNoOverride){
  // Accept either an array of jobs (batch) or a single job (legacy)
  let batchJobs, certNo;
  if(Array.isArray(jobsOrJob)){
    batchJobs=jobsOrJob;
    certNo=certNoOverride||batchJobs[0]?.claimRef||'TES-001';
  } else {
    const job=jobsOrJob;
    certNo=certNoOverride||job?.claimRef||'TES-001';
    batchJobs=Object.values(DB.jobs).filter(j=>j.claimRef===certNo);
    if(!batchJobs.length&&job)batchJobs=[job];
  }

  const ei=(v,w)=>`<input type="text" value="${(v||'').toString().replace(/"/g,'&quot;')}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial;font-size:6.5pt;color:#000;padding:0 1px;outline:none">`;
  const eir=(v,w)=>`<input type="text" value="${(v||'').toString()}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial;font-size:6.5pt;color:#000;padding:0 1px;outline:none;text-align:right">`;
  const eid=(v)=>`<input type="date" value="${v||''}" style="width:98%;border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial;font-size:6pt;color:#000;padding:0;outline:none">`;

  const rows=batchJobs.map((j,i)=>{
    const t=bestTotal(j);
    const invNo=`INV_${certNo}.${new Date().getFullYear()}`;
    const startDate=j.actions.vo2_created?.date||j.actions.teams_notified?.date||'';
    const compDate=j.actions.work_complete?.date||'';
    return`<tr>
      <td style="border:1px solid #bbb;padding:2px;text-align:center;font-size:6.5pt">${i+1}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(j.wo,'55px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(j.projNo||j.bpcProjNo||j.wo,'80px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(j.meterNo||'','75px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(CO.name,'125px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(CO.vendor,'52px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${eir(BWP(t.total),'80px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei('100','28px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${eid(j.date)}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei('Ph '+j.phase+'-Free Con','78px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(invNo,'100px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(j.loc,'88px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${eid(startDate)}</td>
      <td style="border:1px solid #bbb;padding:2px">${eid(compDate)}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei(CO.name,'120px')}</td>
      <td style="border:1px solid #bbb;padding:2px">${ei('BPC Engineer','100px')}</td>
    </tr>`;
  }).join('');

  const grandTotal=batchJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);

  return`<div class="paper" style="overflow-x:auto">
  <div style="font-size:10pt;font-weight:bold;margin-bottom:5px">BPC SPREADSHEET — CLAIM ${certNo} (${batchJobs.length} job${batchJobs.length!==1?'s':''})</div>
  <hr>
  <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:6px">
    <thead>
      <tr style="background:#d9d9d9">
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">WO No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Project No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Meter No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Vendor Name</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Vendor No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Amount (BWP)</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">%</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">WO Date</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Phase</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Invoice No.</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Location</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Start Date</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Completion</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">Internal Responsible</th>
        <th style="border:1px solid #999;padding:3px;white-space:nowrap">External Responsible</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr style="background:#d9d9d9;font-weight:bold;border-top:2px solid #999">
        <td colspan="6" style="border:1px solid #999;padding:3px;text-align:right"><strong>TOTAL</strong></td>
        <td style="border:1px solid #999;padding:3px;text-align:right"><strong>${BWP(grandTotal)}</strong></td>
        <td colspan="9" style="border:1px solid #999;padding:3px"></td>
      </tr>
    </tbody>
  </table>
  </div>`;
}

/* ── LIST OF JOBS DONE — Admin creates ── */
function addListJobRow(){
  const tb=document.getElementById('loj_tbody');if(!tb)return;
  const i=tb.rows.length;
  const inL=(val,w)=>`<input type="text" value="${val||''}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:6.5pt;color:#000;padding:0 1px;outline:none;box-sizing:border-box">`;
  const inD=(val)=>`<input type="date" value="${val||''}" style="width:98%;border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:6pt;color:#000;padding:0;outline:none;box-sizing:border-box">`;
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td style="border:1px solid #bbb;padding:1px 3px;text-align:center">${i+1}.0</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('Trends Engineering Services (PTY) Ltd','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('103913','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px;text-align:right">${inL('0.00','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px;text-align:center">${inL('100','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inD('')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inD('')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>
    <td style="border:1px solid #bbb;padding:1px 3px">${inL('','98%')}</td>`;
  tb.appendChild(tr);
}
function docListOfJobs(job){
  const allDoneJobs=Object.values(DB.jobs).filter(j=>stageIdx(j.stage)>=stageIdx('work_complete'));
  const claimJobs=job&&job.claimRef
    ?Object.values(DB.jobs).filter(j=>j.claimRef===job.claimRef)
    :allDoneJobs;
  const displayJobs=claimJobs.length?claimJobs:allDoneJobs;
  const total=displayJobs.reduce((s,j)=>{const t=bestTotal(j);return s+t.total;},0);
  const certNo=job?.claimRef||'TES-001';
  const inL=(val,w)=>`<input type="text" value="${(val||'').replace(/"/g,'&quot;')}" style="width:${w||'98%'};border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:6.5pt;color:#000;padding:0 1px;outline:none;box-sizing:border-box">`;
  const inD=(val)=>`<input type="date" value="${val||''}" style="width:98%;border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:6pt;color:#000;padding:0;outline:none;box-sizing:border-box">`;
  const rows=displayJobs.map((j,i)=>{
    const t=bestTotal(j);
    const invNo=`INV_${certNo}.${new Date().getFullYear()}`;
    return`<tr>
      <td style="border:1px solid #bbb;padding:1px 3px;text-align:center">${i+1}.0</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(j.wo,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(CO.name,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(CO.vendor,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px;text-align:right">${inL(BWP(t.total),'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px;text-align:center">${inL('100','98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(j.phase,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(invNo,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL(j.loc,'98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inD(j.actions.teams_notified?.date||'')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inD(j.actions.work_complete?.date||'')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL('Kagiso Jeff Kewagamang','98%')}</td>
      <td style="border:1px solid #bbb;padding:1px 3px">${inL('Poloko Moiseraela','98%')}</td>
    </tr>`;
  }).join('');
  return`<div class="paper" style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
    <tr>
      <td>
        <div style="font-size:9pt;font-weight:bold"><input type="text" value="ZERO CONNECTION PROJECT - NORTH" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:9pt;font-weight:bold;color:#000;padding:0 2px;outline:none;width:280px"></div>
        <div style="font-size:8.5pt;margin-top:2px">DATE: <input type="date" value="${new Date().toISOString().slice(0,10)}" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;outline:none;width:120px"></div>
      </td>
      <td style="text-align:right;font-size:8.5pt;vertical-align:top">
        CLAIM No. &nbsp; <input type="text" value="${certNo}" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;outline:none;width:80px">
      </td>
    </tr>
  </table>
  <hr>
  <div style="overflow-x:auto;width:100%">
  <table style="width:100%;min-width:900px;border-collapse:collapse;font-size:9pt;table-layout:fixed">
    <colgroup>
      <col style="width:34px">
      <col style="width:58px">
      <col style="width:130px">
      <col style="width:56px">
      <col style="width:70px">
      <col style="width:34px">
      <col style="width:42px">
      <col style="width:72px">
      <col style="width:80px">
      <col style="width:64px">
      <col style="width:64px">
      <col style="width:100px">
      <col style="width:100px">
    </colgroup>
    <thead>
      <tr style="background:#d9d9d9">
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">ITEM No.</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">PROJECT No.</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">VENDOR NAME</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">VENDOR No.</th>
        <th style="border:1px solid #999;padding:2px 3px;text-align:right;overflow:hidden">AMOUNT</th>
        <th style="border:1px solid #999;padding:2px 3px;text-align:center;overflow:hidden">%</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">PHASE</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">INVOICE No.</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">LOCATION</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">START DATE</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden"></th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">INTERNAL</th>
        <th style="border:1px solid #999;padding:2px 3px;overflow:hidden">EXTERNAL</th>
      </tr>
    </thead>
    <tbody id="loj_tbody">
      ${rows}
      <tr style="background:#f0f0f0;font-weight:bold;border-top:2px solid #999">
        <td style="border:1px solid #bbb;padding:2px 3px" colspan="4"><strong>TOTAL CLAIM</strong></td>
        <td style="border:1px solid #bbb;padding:2px 3px;text-align:right"><strong>${BWP(total)}</strong></td>
        <td style="border:1px solid #bbb;padding:2px 3px" colspan="7"></td>
      </tr>
    </tbody>
  </table>
  </div>
  <button onclick="addListJobRow()" style="margin-top:6px;font-size:8pt;padding:3px 10px;cursor:pointer;border:1px solid #bbb;border-radius:3px;background:#f8f8f8;font-family:Arial,sans-serif">+ Add Row</button>
  <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div style="border-top:1px solid #000;padding-top:4px">
      <div style="font-size:8pt;font-weight:bold;margin-bottom:16px">Prepared by (Admin · Trends Engineering)</div>
      <div style="border-bottom:1px solid #aaa;height:20px;margin-bottom:3px"></div>
      <div style="font-size:8pt">Name: <input type="text" value="" style="width:55%;border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8pt;color:#000;padding:0 2px;outline:none"> &nbsp; Date: <input type="date" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8pt;color:#000;padding:0 2px;outline:none;width:110px"></div>
    </div>
    <div style="border-top:1px solid #000;padding-top:4px">
      <div style="font-size:8pt;font-weight:bold;margin-bottom:16px">Verified by (Managing Director · Trends Engineering)</div>
      <div style="border-bottom:1px solid #aaa;height:20px;margin-bottom:3px"></div>
      <div style="font-size:8pt">Name: <input type="text" value="" style="width:55%;border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8pt;color:#000;padding:0 2px;outline:none"> &nbsp; Date: <input type="date" style="border:none;border-bottom:1px solid #aaa;background:transparent;font-family:Arial,sans-serif;font-size:8pt;color:#000;padding:0 2px;outline:none;width:110px"></div>
    </div>
  </div>
  </div>`;
}

function numWords(n){const m=Math.floor(n),c=Math.round((n-m)*100);return`${m.toLocaleString()} Pula${c?', '+c+' thebe':''} only`;}

/* ═══════════════════════════════════════
   LIVE RECALC
═══════════════════════════════════════ */

/* ─── FIX 9: Save doc to step & download ─── */
function saveDocToStep(wo,docType){
  const job=DB.jobs[wo];if(!job)return;
  if(!job.savedDocs)job.savedDocs={};
  // If the doc modal is currently open with this doc, capture edited values
  const modalBody=document.getElementById('docModalBody');
  let html;
  if(modalBody&&modalBody.innerHTML.trim()){
    serializeFormValues(modalBody);
    html=modalBody.innerHTML;
  } else {
    html=buildDoc(docType,job);
  }
  job.savedDocs[docType]={html,savedAt:new Date().toISOString(),role:CU,autoSaved:true};
  addLog(wo,`Document saved: ${docType} by ${RN[CU]}`);
  notify(['md'],`New document saved for WO ${wo}: ${docLabels[docType]||docType} — click to view`,wo);
  saveDB();
  toast('✓ Document saved and attached — MD can now view it','gn');
  refreshDetail();
}

// Global doc labels for notifications
const docLabels={
  bpc_wo:'BPC Work Order',vo1:'Works Valuation (VO1)',field_report:'Linesman Field Report',
  vo2:'Variation Order (VO2)',works_valuation:'Works Valuation Document',
  works_instruction:'Works Instruction',gis_report:'GIS Report',gis_cert:'GIS Certificate',
  annexure:'Annexure to Payment Certificate',payment_cert:'Payment Certificate',
  invoice:'Tax Invoice',list_of_jobs:'List of Jobs Done',bpc_spreadsheet:'BPC Spreadsheet'
};
/* ═══════════════════════════════════════
   PDF GENERATION — silent download, no print dialog
   ───────────────────────────────────────
   Key fix for blank pages: we render into a hidden off-screen
   <div id="pdfRenderSurface"> which has an explicit white
   background and the same CSS as the print popup. html2pdf
   screenshots THAT element, not the dark-themed modal, so the
   output is always a clean white A4 document.
═══════════════════════════════════════ */

// The exact same CSS used in printModal — copy kept in sync here
// so PDF and Print produce identical output
const PDF_DOC_CSS=`
  *{box-sizing:border-box;margin:0;padding:0}
  body,div{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45;color:#000;background:#fff}
  .paper{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45;color:#000;background:#fff}
  .paper hr{border:none;border-top:1.5px solid #000;margin:6px 0}
  .lh-t{width:100%;border-collapse:collapse;margin-bottom:7px}
  .lh-t td{vertical-align:top;padding:1px 3px;font-size:9pt}
  .hdt{width:100%;border-collapse:collapse;margin-bottom:4px}
  .hdt td{padding:2px 5px;font-size:8.5pt;vertical-align:top}
  .hdt .lbl{font-weight:bold;white-space:nowrap;width:160px}
  .ef{display:inline-block;border:none;border-bottom:1px solid #000;background:transparent;font-family:Arial;font-size:8.5pt;color:#000;padding:0 2px;min-width:60px}
  .ef-b{border-bottom:1px solid #000;color:#000}
  .ef-c{color:#555;border-bottom:1px dotted #bbb}
  .boq{width:100%;border-collapse:collapse;font-size:8.5pt;margin:4px 0}
  .boq th{background:#d9d9d9;border:1px solid #999;padding:4px 5px;font-weight:bold;text-align:left;font-size:8pt}
  .boq td{border:1px solid #bbb;padding:3px 5px;vertical-align:middle}
  .boq td.r,.boq th.r{text-align:right}.boq td.c,.boq th.c{text-align:center}
  .boq .sr td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
  .boq .tr td{background:#d9d9d9;font-weight:bold;border-top:2px solid #000}
  .p-grey{background:#d9d9d9;padding:2px 6px;font-weight:bold;font-size:9pt;display:block;margin:7px 0 3px}
  .sig-area{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px}
  .sig-box{border-top:1px solid #000;padding-top:4px}
  .sig-lbl{font-size:8pt;font-weight:bold;margin-bottom:18px}
  .sig-line{border-bottom:1px solid #000;margin-bottom:3px;height:22px}
  .sig-sub{font-size:7.5pt;color:#666}
  .pc-row{display:flex;padding:3px 5px;border-bottom:1px solid #e8e8e8;font-size:8.5pt}
  .pc-row .n{width:25px;flex-shrink:0}.pc-row .d{flex:1}
  .pc-row .c{width:20px;text-align:right;flex-shrink:0}
  .pc-row .v{width:95px;text-align:right;font-weight:bold;flex-shrink:0}
  .pc-row.sub{background:#f0f0f0;font-weight:bold;border:none;border-top:1.5px solid #999;margin-top:2px}
  .pc-row.fin{background:#d9d9d9;font-weight:bold;border:none;border-top:2px solid #000;margin-top:4px;font-size:9pt}
  .pc-row.ded .v{color:#cc0000}
  .pc-sec{background:#d9d9d9;font-weight:bold;padding:3px 5px;font-size:9pt;display:block;margin:5px 0 2px}
  .jt{width:100%;border-collapse:collapse;font-size:7.5pt}
  .jt th{background:#d9d9d9;border:1px solid #999;padding:3px 4px;font-weight:bold;text-align:center;font-size:7pt}
  .jt td{border:1px solid #bbb;padding:3px 4px}
  .jt .tot td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
  input,textarea,select{border:none!important;border-bottom:1px solid #000!important;
    background:transparent!important;color:#000!important;
    font-family:Arial,sans-serif!important;font-size:8.5pt!important;padding:0 2px!important;width:auto!important}
  button,.btn,.scan-done,.scan-upload-label,.ua,.pipe-step,.ac-dd{display:none!important}
  img{max-width:100%;height:auto}
`;

/* Inject a <style> tag into the render surface so the CSS applies
   without needing it baked into every document's HTML */
let _pdfStyleInjected=false;
function _ensurePDFStyle(surface){
  if(_pdfStyleInjected) return;
  const s=document.createElement('style');
  s.textContent=PDF_DOC_CSS;
  surface.appendChild(s);
  _pdfStyleInjected=true;
}

/* Bake live input/select/textarea values into a clone's HTML */
function _bakeValues(sourceEl){
  const clone=sourceEl.cloneNode(true);
  sourceEl.querySelectorAll('input').forEach((el,i)=>{
    const c=clone.querySelectorAll('input')[i]; if(!c) return;
    if(el.type==='checkbox'||el.type==='radio') c.checked=el.checked;
    else c.setAttribute('value',el.value);
  });
  sourceEl.querySelectorAll('textarea').forEach((el,i)=>{
    const c=clone.querySelectorAll('textarea')[i]; if(c) c.textContent=el.value;
  });
  sourceEl.querySelectorAll('select').forEach((el,i)=>{
    const c=clone.querySelectorAll('select')[i]; if(!c) return;
    Array.from(el.options).forEach((o,j)=>{if(c.options[j]) c.options[j].selected=o.selected;});
  });
  // Hide UI buttons inside the document
  clone.querySelectorAll('button,.btn,.scan-done,.scan-upload-label,.ua,.ac-dd').forEach(e=>e.remove());
  return clone;
}

/* Core PDF generation.
   innerHtml: the document's HTML string
   filename:  without extension
   sourceEl:  optional live DOM element to bake values from */
async function generatePDF(innerHtml, filename, sourceEl){
  if(!window.html2pdf){
    toast('PDF library not loaded — check your internet connection','rd');
    return;
  }
  toast('Generating PDF…','am');

  // Bake live input values if we have the live element
  let html=innerHtml;
  if(sourceEl){
    const clone=_bakeValues(sourceEl);
    html=clone.innerHTML;
  }

  // Strategy: render inside a hidden iframe that has its own clean white document.
  // html2canvas captures the iframe's body — no dark theme, no positioning tricks,
  // no viewport clipping. This is the most reliable approach for clean PDF output.
  const iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;top:0;left:0;width:794px;height:1px;border:none;opacity:0;pointer-events:none;z-index:-999';
  document.body.appendChild(iframe);

  try{
    // Write a complete white HTML document into the iframe
    const iDoc=iframe.contentDocument||iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff!important;color:#000!important;font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45;padding:0;margin:0}
.paper{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45;background:#fff;color:#000}
.paper hr{border:none;border-top:1.5px solid #000;margin:6px 0}
.lh-t{width:100%;border-collapse:collapse;margin-bottom:7px}
.lh-t td{vertical-align:top;padding:1px 3px;font-size:9pt}
.hdt{width:100%;border-collapse:collapse;margin-bottom:4px}
.hdt td{padding:2px 5px;font-size:8.5pt;vertical-align:top}
.hdt .lbl{font-weight:bold;white-space:nowrap;width:160px}
.ef,.ef-b{display:inline-block;border:none;border-bottom:1px solid #000;background:transparent;font-family:Arial;font-size:8.5pt;color:#000;padding:0 2px;min-width:60px}
.ef-c{color:#555;border-bottom:1px dotted #bbb}
.boq{width:100%;border-collapse:collapse;font-size:8.5pt;margin:4px 0}
.boq th{background:#d9d9d9;border:1px solid #999;padding:4px 5px;font-weight:bold;text-align:left;font-size:8pt}
.boq td{border:1px solid #bbb;padding:3px 5px;vertical-align:middle}
.boq td.r,.boq th.r{text-align:right}.boq td.c,.boq th.c{text-align:center}
.boq .sr td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
.boq .tr td{background:#d9d9d9;font-weight:bold;border-top:2px solid #000}
.p-grey{background:#d9d9d9;padding:2px 6px;font-weight:bold;font-size:9pt;display:block;margin:7px 0 3px}
.sig-area{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px}
.sig-box{border-top:1px solid #000;padding-top:4px}
.sig-lbl{font-size:8pt;font-weight:bold;margin-bottom:18px}
.sig-line{border-bottom:1px solid #000;margin-bottom:3px;height:22px}
.sig-sub{font-size:7.5pt;color:#666}
.pc-row{display:flex;padding:3px 5px;border-bottom:1px solid #e8e8e8;font-size:8.5pt}
.pc-row .n{width:25px;flex-shrink:0}.pc-row .d{flex:1}
.pc-row .c{width:20px;text-align:right;flex-shrink:0}
.pc-row .v{width:95px;text-align:right;font-weight:bold;flex-shrink:0}
.pc-row.sub{background:#f0f0f0;font-weight:bold;border:none;border-top:1.5px solid #999;margin-top:2px}
.pc-row.fin{background:#d9d9d9;font-weight:bold;border:none;border-top:2px solid #000;margin-top:4px}
.pc-row.ded .v{color:#cc0000}
.pc-sec{background:#d9d9d9;font-weight:bold;padding:3px 5px;font-size:9pt;display:block;margin:5px 0 2px}
.jt{width:100%;border-collapse:collapse;font-size:7.5pt}
.jt th{background:#d9d9d9;border:1px solid #999;padding:3px 4px;font-weight:bold;text-align:center;font-size:7pt}
.jt td{border:1px solid #bbb;padding:3px 4px}
.jt .tot td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
input,textarea,select{border:none!important;border-bottom:1px solid #000!important;background:transparent!important;color:#000!important;font-family:Arial,sans-serif!important;font-size:8.5pt!important;padding:0 2px!important;width:auto!important;outline:none!important}
button,.btn,.scan-done,.scan-upload-label,.ua,.pipe-step,.ac-dd{display:none!important}
img{max-width:100%;height:auto}
</style></head><body style="padding:18px;background:#fff">${html}</body></html>`);
    iDoc.close();

    // Let the iframe render fully
    await new Promise(r=>setTimeout(r,250));

    // Resize iframe to match content height so html2canvas captures everything
    const h=iDoc.body.scrollHeight||842;
    iframe.style.height=h+'px';

    await new Promise(r=>setTimeout(r,80));

    const opt={
      margin:[10,10,10,10],
      filename:filename+'.pdf',
      image:{type:'jpeg',quality:0.98},
      html2canvas:{
        scale:2,
        useCORS:true,
        logging:false,
        backgroundColor:'#ffffff',
        scrollX:0,
        scrollY:0,
        windowWidth:794,
        windowHeight:h,
      },
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['css','legacy']},
    };

    await window.html2pdf().set(opt).from(iDoc.body).save();
    toast('✓ PDF downloaded: '+filename+'.pdf','gn');

  }catch(e){
    console.error('PDF generation failed:',e);
    toast('PDF failed — try Print instead','rd');
  }finally{
    // Always clean up the iframe
    try{ document.body.removeChild(iframe); }catch(_){}
  }
}

/* Download a saved soft-copy document as PDF */
function downloadSavedDoc(wo,docType){
  const job=DB.jobs[wo];
  const saved=job&&job.savedDocs&&job.savedDocs[docType];
  if(!saved){toast('Not saved yet — click 💾 Save & Attach first','am');return;}
  const filename=docType.replace(/_/g,'-')+'_WO'+wo;
  generatePDF(saved.html, filename, null);
}

/* Download the currently-open document modal as PDF (captures live edits) */
function downloadDocAsPDF(wo,docType){
  const body=document.getElementById('docModalBody');
  if(!body){toast('No document open','am');return;}
  serializeFormValues(body);
  const filename=(docType||'document').replace(/_/g,'-')+(wo?'_WO'+wo:'');
  generatePDF(body.innerHTML, filename, body);
}
/* ─── FIX 7: Batch doc save/scan helpers ─── */
function saveBatchDocRecord(certNo,docType){
  if(!DB.batchSaved)DB.batchSaved={};
  DB.batchSaved[certNo+'_'+docType]={savedAt:new Date().toISOString(),role:CU};
  saveDB();toast('Saved: '+docType.replace(/_/g,' '),'gn');
  const all=['list_of_jobs','annexure','payment_cert','invoice','bpc_spreadsheet'];
  if(all.every(d=>DB.batchSaved[certNo+'_'+d])){
    notify(['admin','md'],'Claim batch '+certNo+': all 5 documents saved — ready for submission.');
    toast('All 5 saved — Admin notified','gn');
  }
}

function serializeFormValues(container){
  // Bake current input values into the HTML so they survive innerHTML round-trips
  container.querySelectorAll('input').forEach(el=>{
    if(el.type==='checkbox'||el.type==='radio'){
      if(el.checked)el.setAttribute('checked','checked');
      else el.removeAttribute('checked');
    } else {
      el.setAttribute('value',el.value);
    }
  });
  container.querySelectorAll('textarea').forEach(el=>{
    el.textContent=el.value;
  });
  container.querySelectorAll('select').forEach(el=>{
    Array.from(el.options).forEach(opt=>{
      if(opt.selected)opt.setAttribute('selected','selected');
      else opt.removeAttribute('selected');
    });
  });
}

function saveBatchDocAttach(certNo,docType){
  // Save the current edited state of the doc and attach to all jobs in this batch
  const batchJobs=Object.values(DB.jobs).filter(j=>j.claimRef===certNo&&j.vo1&&j.vo1.items);
  if(!batchJobs.length){toast('No jobs found for this batch','rd');return;}
  // Serialize all input values into attributes before capturing HTML
  const modalBody=document.getElementById('docModalBody');
  serializeFormValues(modalBody);
  const currentHtml=modalBody.innerHTML;
  batchJobs.forEach(job=>{
    if(!job.savedDocs)job.savedDocs={};
    job.savedDocs[docType]={
      html:currentHtml,
      savedAt:new Date().toISOString(),
      role:CU,
      autoSaved:false,
      certNo:certNo
    };
  });
  // Also store in batchSaved
  if(!DB.batchSaved)DB.batchSaved={};
  DB.batchSaved[certNo+'_'+docType]={savedAt:new Date().toISOString(),role:CU};
  addLog('',`Claim doc saved & attached: ${docType} — Batch ${certNo}`);
  notify(['admin','md'],`Finance saved ${(docLabels&&docLabels[docType])||docType} for Claim ${certNo} — available to view`,batchJobs[0]?.wo||'');
  saveDB();
  toast(`✓ ${(docLabels&&docLabels[docType])||docType} saved & attached — Admin and MD can now view it`,'gn');
  // Check if all 5 are now saved
  const all=['annexure','payment_cert','invoice','list_of_jobs','bpc_spreadsheet'];
  if(all.every(d=>DB.batchSaved[certNo+'_'+d])){
    notify(['admin','md'],`Claim ${certNo}: ALL 5 documents saved and ready for submission!`,batchJobs[0]?.wo||'');
    toast('🎉 All 5 claim docs saved — ready for submission!','gn');
  }
}
function handleBatchScan(certNo,docType,input){
  if(!input.files[0])return;
  const file=input.files[0];
  if(file.size>5*1024*1024){toast('Max 5MB','am');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    if(!DB.batchScans)DB.batchScans={};
    DB.batchScans['bs_'+certNo+'_'+docType]={dataUrl:e.target.result,filename:file.name,uploadedAt:new Date().toISOString()};
    addLog('','Signed scan: '+docType+' Batch '+certNo);
    saveDB();notify(['admin','md'],'Finance uploaded signed '+docType.replace(/_/g,' ')+' — Batch '+certNo);
    toast('Scan saved: '+file.name);
    if(typeof viewBatchDoc==='function')viewBatchDoc(certNo,docType);
  };reader.readAsDataURL(file);
}
function downloadBatchScan(certNo,docType){
  const s=DB.batchScans&&DB.batchScans['bs_'+certNo+'_'+docType];
  if(!s){toast('No scan','am');return;}
  const a=document.createElement('a');a.href=s.dataUrl;a.download=s.filename||docType+'.pdf';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

function recalcVO1(wo){
  const job=DB.jobs[wo];if(!job)return;
  // Guard: no negative quantities or rates (they would flow into claim documents)
  let _fixed=false;
  job.vo1.items.forEach((it,i)=>{
    if((it.q||0)<0){it.q=0;_fixed=true;const e=document.getElementById(`vo1q${wo}${i}`);if(e)e.value=0;}
    if((it.r||0)<0){it.r=0;_fixed=true;const e=document.getElementById(`vo1r${wo}${i}`);if(e)e.value=(0).toFixed(2);}
  });
  if(_fixed)toast('Negative values are not allowed — reset to 0','am');
  let sub=0;
  job.vo1.items.forEach((it,i)=>{const v=(it.q||0)*(it.r||0);sub+=v;const el=document.getElementById(`vo1v${wo}${i}`);if(el)el.textContent=v.toFixed(2);});
  const lf=job.vo1.lf||29.25, mk=job.vo1.mk||0;
  const loc=sub*(lf/100);
  const markup=(sub+loc)*(mk/100);
  const tot=sub+loc+markup;
  job.vo1._cachedTotal=tot;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s(`vo1rawsub${wo}`,sub.toFixed(2));
  s(`vo1loc${wo}`,loc.toFixed(2));
  s(`vo1sub${wo}`,(sub+loc).toFixed(2));
  s(`vo1mk${wo}`,markup.toFixed(2));
  s(`vo1tot${wo}`,tot.toFixed(2));
  saveDB();
}
function recalcVO2(wo){
  const job=DB.jobs[wo];if(!job)return;
  // Guard: no negative quantities or rates
  let _fixed=false;
  job.vo2.items.forEach((it,i)=>{
    if((it.q||0)<0){it.q=0;_fixed=true;const e=document.getElementById(`vo2q${wo}${i}`);if(e)e.value=0;}
    if((it.r||0)<0){it.r=0;_fixed=true;const e=document.getElementById(`vo2r${wo}${i}`);if(e)e.value=(0).toFixed(2);}
  });
  if(_fixed)toast('Negative values are not allowed — reset to 0','am');
  let sub=0;
  job.vo2.items.forEach((it,i)=>{const v=(it.q||0)*(it.r||0);sub+=v;const el=document.getElementById(`vo2v${wo}${i}`);if(el)el.textContent=v.toFixed(2);});
  const lf=job.vo2.lf||29.25,mk=job.vo2.mk||10;
  const loc=sub*(lf/100),markup=(sub+loc)*(mk/100),tot=sub+loc+markup;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s(`vo2loc${wo}`,loc.toFixed(2));s(`vo2sub${wo}`,(sub+loc).toFixed(2));s(`vo2mk${wo}`,markup.toFixed(2));s(`vo2tot${wo}`,tot.toFixed(2));
  saveDB();
}
function addVO1Row(wo){DB.jobs[wo].vo1.items.push({d:'New Item',u:'Ea',q:1,r:0});saveDB();openDocForAction(wo,'vo1');}
function addVO2Row(wo){DB.jobs[wo].vo2.items.push({d:'New Item',u:'Ea',q:1,r:0});saveDB();openDocForAction(wo,'vo2');}
function createWorksValuation(wo){
  const job=DB.jobs[wo];
  if(!job||!job.vo2.items.length){toast('VO2 must be created first','am');return;}
  job.worksValuation={created:true,date:new Date().toISOString()};
  job.stage='works_valuation_created';
  job.actions.works_valuation_created={date:new Date().toISOString().slice(0,10),notes:'Works Valuation document created'};
  addLog(wo,'Works Valuation document created');
  notify(['md'],'Works Valuation created for WO '+wo,wo);
  saveDB();
  toast('✓ Works Valuation created');
  openDocForAction(wo,'works_valuation');
  refreshDetail();
}
function changeVO1Phase(wo,phase){
  DB.jobs[wo].vo1.phase=phase;
  saveDB();
  toast('VO1 phase updated to Phase '+phase);
}
function changeVO2Phase(wo,phase){
  DB.jobs[wo].vo2.phase=phase;
  saveDB();
  toast('VO2 phase updated to Phase '+phase);
}

/* ═══════════════════════════════════════
   AUTOCOMPLETE
═══════════════════════════════════════ */
function acInput(wo,dt,idx){
  const items=dt==='vo2'?DB.jobs[wo].vo2.items:DB.jobs[wo].vo1.items;
  const it=items[idx];
  const iid=`${dt==='vo1'?'vo1d':'vo2d'}${wo}${idx}`, did=`acd-${dt}-${wo}-${idx}`;
  return`<div class="ac-wrap"><input class="ac-in" id="${iid}" value="${(it.d||'').replace(/"/g,'&quot;')}" placeholder="Type to search BPC rates..." oninput="acS('${wo}','${dt}',${idx},this.value)" onfocus="acS('${wo}','${dt}',${idx},this.value)" onblur="setTimeout(()=>acC('${did}'),180)" onkeydown="acK(event,'${wo}','${dt}',${idx})"><div class="ac-dd" id="${did}" style="display:none"></div></div>`;
}
function acS(wo,dt,idx,q){
  const did=`acd-${dt}-${wo}-${idx}`, dd=document.getElementById(did);if(!dd)return;
  const job=DB.jobs[wo];
  // Read the phase from the dropdown element if it exists, else fall back to job data
  const phaseEl=document.getElementById(`${dt==='vo1'?'vo1':'vo2'}phase${wo}`);
  const jobPhase=phaseEl?phaseEl.value:((dt==='vo1'?job.vo1&&job.vo1.phase:job.vo2&&job.vo2.phase)||job.phase||'47');
  const ql=q.trim().toLowerCase();
  const active=DB.rates.filter(r=>r.on&&r.phase===jobPhase);
  const m=ql.length===0?active.slice(0,15):active.filter(r=>r.d.toLowerCase().includes(ql)||r.c.toLowerCase().includes(ql)).slice(0,15);
  if(!m.length){dd.innerHTML='<div class="ac-empty">No match in Phase '+jobPhase+' rates — type freely to add custom item</div>';dd.style.display='block';return;}
  dd.innerHTML=m.map(r=>`<div class="ac-it" onmousedown="acSel('${wo}','${dt}',${idx},'${r.d.replace(/'/g,"\\'")}','${r.u}',${r.r},'${did}')"><div class="ac-desc">${r.d}</div><div class="ac-meta"><span class="ac-rate">BWP ${r.r.toLocaleString('en-BW',{minimumFractionDigits:2})}</span><span>per ${r.u}</span><span class="ac-cat">${r.c} · Ph${r.phase}</span></div></div>`).join('');
  dd.style.display='block';
}
function acSel(wo,dt,idx,desc,unit,rate,did){
  const items=dt==='vo2'?DB.jobs[wo].vo2.items:DB.jobs[wo].vo1.items;
  items[idx].d=desc;items[idx].u=unit;items[idx].r=rate;
  const inp=document.getElementById(`${dt==='vo1'?'vo1d':'vo2d'}${wo}${idx}`);if(inp)inp.value=desc;
  const uel=document.getElementById(`${dt==='vo1'?'vo1u':'vo2u'}${wo}${idx}`);if(uel)uel.value=unit;
  const rel=document.getElementById(`${dt==='vo1'?'vo1r':'vo2r'}${wo}${idx}`);if(rel)rel.value=rate.toFixed(2);
  dt==='vo1'?recalcVO1(wo):recalcVO2(wo);
  acC(did);
}
function acC(did){const d=document.getElementById(did);if(d)d.style.display='none';}
function acK(e,wo,dt,idx){if(e.key==='Escape')acC(`acd-${dt}-${wo}-${idx}`);}

/* ═══════════════════════════════════════
   PRINT
═══════════════════════════════════════ */
function printModal(){
  const modalBody=document.getElementById('docModalBody');
  serializeFormValues(modalBody);
  const content=modalBody.innerHTML;
  const title=document.getElementById('docModalTitle').textContent;
  const pw=window.open('','_blank','width=860,height=760');
  if(!pw){toast('Pop-up blocked — allow pop-ups for this site then try again','am');return;}
  pw.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:20px}
    .paper{background:#fff;color:#000;font-family:Arial,sans-serif;font-size:9pt;line-height:1.45}
    .paper *{box-sizing:border-box}
    .paper hr{border:none;border-top:1.5px solid #000;margin:6px 0}
    .lh-t{width:100%;border-collapse:collapse;margin-bottom:7px}
    .lh-t td{vertical-align:top;padding:1px 3px;font-size:9pt}
    .hdt{width:100%;border-collapse:collapse;margin-bottom:4px}
    .hdt td{padding:2px 5px;font-size:8.5pt;vertical-align:top}
    .hdt .lbl{font-weight:bold;white-space:nowrap;width:160px}
    .ef{display:inline-block;border:none;border-bottom:1px solid #000;background:transparent;font-family:Arial,sans-serif;font-size:8.5pt;color:#000;padding:0 2px;min-width:60px}
    .ef-b{border-bottom:1px solid #000;color:#000}
    .ef-c{color:#555;border-bottom:1px dotted #bbb}
    .boq{width:100%;border-collapse:collapse;font-size:8.5pt;margin:4px 0}
    .boq th{background:#d9d9d9;border:1px solid #999;padding:4px 5px;font-weight:bold;text-align:left;font-size:8pt}
    .boq td{border:1px solid #bbb;padding:3px 5px;vertical-align:middle}
    .boq td.r,.boq th.r{text-align:right}.boq td.c,.boq th.c{text-align:center}
    .boq .sr td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
    .boq .tr td{background:#d9d9d9;font-weight:bold;border-top:2px solid #000}
    .p-grey{background:#d9d9d9;padding:2px 6px;font-weight:bold;font-size:9pt;display:block;margin:7px 0 3px}
    .sig-area{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px}
    .sig-box{border-top:1px solid #000;padding-top:4px}
    .sig-lbl{font-size:8pt;font-weight:bold;margin-bottom:18px}
    .sig-line{border-bottom:1px solid #000;margin-bottom:3px;height:22px}
    .sig-sub{font-size:7.5pt;color:#666}
    .pc-row{display:flex;padding:3px 5px;border-bottom:1px solid #e8e8e8;font-size:8.5pt}
    .pc-row .n{width:25px;flex-shrink:0}.pc-row .d{flex:1}.pc-row .c{width:20px;text-align:right;flex-shrink:0}.pc-row .v{width:95px;text-align:right;font-weight:bold;flex-shrink:0}
    .pc-row.sub{background:#f0f0f0;font-weight:bold;border:none;border-top:1.5px solid #999;margin-top:2px}
    .pc-row.fin{background:#d9d9d9;font-weight:bold;border:none;border-top:2px solid #000;margin-top:4px;font-size:9pt}
    .pc-row.ded .v{color:#cc0000}
    .pc-sec{background:#d9d9d9;font-weight:bold;padding:3px 5px;font-size:9pt;display:block;margin:5px 0 2px}
    .jt{width:100%;border-collapse:collapse;font-size:7.5pt}
    .jt th{background:#d9d9d9;border:1px solid #999;padding:3px 4px;font-weight:bold;text-align:center;font-size:7pt}
    .jt td{border:1px solid #bbb;padding:3px 4px}
    .jt .tot td{background:#f0f0f0;font-weight:bold;border-top:1.5px solid #999}
    input,textarea,select{border:none!important;border-bottom:1px solid #000!important;background:transparent!important;font-family:Arial,sans-serif;font-size:8.5pt;padding:0 2px;width:auto}
    button,.btn,.scan-done,.ua,.pipe-step,.ac-dd{display:none!important}
    @media print{body{padding:10px}}
  </style></head><body>${content}</body></html>`);
  pw.document.close();
  pw.onload=()=>{pw.focus();pw.print();};
  // Fallback if onload doesn't fire
  setTimeout(()=>{try{pw.focus();pw.print();}catch(e){}},600);
}

/* ═══════════════════════════════════════
   MODALS
═══════════════════════════════════════ */
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
function nav(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('act'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('act'));
  document.getElementById('sc-'+screen)?.classList.add('act');
  const titles={dashboard:'Dashboard',jobs:'Work Orders',inbox:'Inbox',claims:'Claim Batch',rates:'Rates Sheet',actlog:'Activity Log',jobdetail:'Job Detail'};
  document.getElementById('tbt').textContent=titles[screen]||screen;
  document.getElementById('n-'+screen)?.classList.add('act');
  if(screen==='dashboard'){renderDashboard();}
  if(screen==='jobs'){renderJobs();}
  if(screen==='inbox'){renderInbox();}
  if(screen==='claims'){renderClaims();}
  if(screen==='rates'){renderRates();}
  if(screen==='actlog'){renderActLog();}
  if(screen==='jobdetail'&&detailWO){renderJobDetail(detailWO);}
}
function refreshAll(){renderDashboard();renderJobs();renderInbox();renderNotifs();}

/* ═══════════════════════════════════════
   LOGIN / LOGOUT
═══════════════════════════════════════ */
// Role cards set the hidden select, then defer to the original doLogin()
function pickRole(role){
  document.getElementById('loginRole').value = role;
  doLogin();
}
async function doLogin(){
  const r=document.getElementById('loginRole').value;
  if(!r){document.getElementById('loginRole').style.borderColor='var(--rd)';return;}
  CU=r;
  // Reset all screens — clear any stale job detail from a previous role session
  detailWO=null;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('act'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('act'));
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('mainApp').style.display='block';
  document.getElementById('sbRn').textContent=RN[r];

  // Role-specific nav — always hide jobdetail first
  const show=id=>{const e=document.getElementById(id);if(e)e.style.display='flex';};
  const hide=id=>{const e=document.getElementById(id);if(e)e.style.display='none';};
  ['n-inbox','n-claims','n-rates','n-actlog','n-jobdetail'].forEach(hide);

  if(r==='admin'){show('n-inbox');show('n-rates');show('n-actlog');}
  if(r==='finance'){show('n-inbox');show('n-claims');}
  if(r==='md'){show('n-actlog');show('n-jobs');show('n-claims');}

  // Pull the latest shared data from Supabase before rendering
  if(SB.enabled){
    const tbt=document.getElementById('tbt'); if(tbt) tbt.textContent='Loading…';
    await syncFromSupabase();
  }

  addLog('','Signed in as '+RN[r]);
  // Always land on dashboard — never carry over a screen from another role
  nav('dashboard');
  renderNotifs();
}
function doLogout(){
  addLog('','Signed out');saveDB();
  CU='';detailWO=null;
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('mainApp').style.display='none';
  document.getElementById('loginRole').value='';
}
