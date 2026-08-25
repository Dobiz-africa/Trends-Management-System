const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');

test('canonical workflow excludes removed operational gates',()=>{
  assert.deepEqual(core.STAGES,['wo_received','vo1_created','linesman_notified','field_received','gis_ready','vo2_created','works_valuation_created','work_instruction_ready','final_gis_pending','finance_draft','claim_docs_ready','job_complete']);
});
test('legacy stages migrate without deleting actions',()=>{
  const job={stage:'work_complete',actions:{work_complete:{date:'2026-08-01'}}};core.migrateWorkflow(job);
  assert.equal(job.stage,'work_instruction_ready');assert.equal(job.legacyStage,'work_complete');assert.equal(job.actions.work_complete.date,'2026-08-01');
});
test('VO2 requires both GIS documents',()=>{
  const job={stage:'gis_ready',scans:{gis_report:{}}};assert.equal(core.canTransition(job,'vo2_created'),false);
  job.scans.gis_cert={};assert.equal(core.canTransition(job,'vo2_created'),true);
});
test('Finance requires the separate final GIS documents',()=>{
  const job={stage:'final_gis_pending',scans:{gis_report:{},gis_cert:{},final_gis_report:{}}};
  assert.equal(core.canTransition(job,'finance_draft'),false);
  job.scans.final_gis_cert={};
  assert.equal(core.canTransition(job,'finance_draft'),true);
});
test('saving VO2 refreshes job detail to expose the next action',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const saveVO2=source.slice(source.indexOf('async function saveVO2('),source.indexOf('/* ═',source.indexOf('async function saveVO2(')));
  assert.match(saveVO2,/job\.stage='vo2_created'/);
  assert.match(saveVO2,/refreshDetail\(\);\s*refreshAll\(\);/);
});
test('VO2 modal offers completion at the GIS-ready stage',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/docType==='vo2'&&job\.stage==='gis_ready'[\s\S]{0,180}Complete VO2 &amp; Continue/);
});
test('amount in words handles pula and thebe',()=>{
  assert.equal(core.numWords(1234.56),'One thousand two hundred thirty-four pula and fifty-six thebe only');
  assert.equal(core.numWords(0),'Zero pula only');
});
test('claim validation reports missing prerequisites',()=>{
  const problems=core.validateClaimJobs([{wo:'1',cust:'A',loc:'Mohembo West',vo2:{items:[]},scans:{gis_report:{}}}]);
  assert.equal(problems.length,3);
});
test('Payment Certificate uses the requested Annexure wording and original footer structure',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const payment=source.slice(source.indexOf('function docPaymentCert('),source.indexOf('/* ── INVOICE',source.indexOf('function docPaymentCert(')));
  assert.match(payment,/Value of Work Completed \(see Annexure\)<\/td>/);
  assert.doesNotMatch(payment,/Value of Work Completed \(see Annexure \$\{/);
  for(const marker of ['Amount Due','Remarks line 1','Remarks line 2','Certificate Prepared by','Certificate Approved by','Transmission &amp; Distribution:'])assert.match(payment,new RegExp(marker));
});
test('Finance revisions reopen saved HTML, save before print, and can replace generated copies',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/storedBatchDocHTML\(certNo,docType\)\|\|generateBatchDocHTML/);
  assert.match(source,/function printModal\([\s\S]*saveBatchDocAttach\(CURRENT_CERT_NO, CURRENT_DOC_TYPE,\{quiet:true\}\)[\s\S]*serializeToHTML\(body\)/);
  assert.match(source,/Save &amp; Replace/);
  assert.match(source,/Regenerate &amp; Replace/);
  assert.match(source,/if\(job\.stage!=='job_complete'\)[\s\S]*claim_docs_revised/);
});
test('Annexure project titles wrap instead of being clipped in print',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const annexure=source.slice(source.indexOf('function docAnnexure('),source.indexOf('function docPaymentCert(',source.indexOf('function docAnnexure(')));
  assert.match(annexure,/class="annexure-table"[^>]*table-layout:fixed/);
  assert.match(annexure,/class="annexure-project-title"/);
  assert.match(annexure,/\$\{inWrap\(j\.cust\)\}/);
  assert.doesNotMatch(annexure,/inL\(j\.cust/);
});
test('claim batches resume review and Finance retains completed-document access',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/function renderClaimDrafts\(/);
  assert.match(source,/lastViewedDoc=docType/);
  assert.match(source,/viewedDocs=Array\.from\(new Set/);
  assert.match(source,/Continue Editing/);
  assert.match(source,/\[\.\.\.done,\.\.\.completed\]/);
  assert.match(source,/Finalize Claim/);
});
test('Inbox includes Linesman notifications and counts Finance ready tasks',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const inbox=source.slice(source.indexOf('function renderInbox('),source.indexOf('/*',source.indexOf('function renderInbox(')));
  assert.match(inbox,/DB\.notifs\?\.linesman/);
  assert.match(inbox,/clickNotif/);
  assert.match(inbox,/CU==='linesman'\?tasks\.filter\(t=>t\.badge==='New'\)\.length:tasks\.length/);
});
test('Finance claim pool permanently includes fresh, finalized, and completed work orders',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const claims=source.slice(source.indexOf('function renderClaims('),source.indexOf('function toggleClaim(',source.indexOf('function renderClaims(')));
  assert.match(claims,/\['finance_draft','claim_docs_ready','job_complete'\]/);
  assert.match(claims,/claimEligibleStages\.includes\(j\.stage\)/);
  assert.doesNotMatch(claims,/!j\.claimRef/);
  assert.match(claims,/\?'Complete':j\.stage==='claim_docs_ready'\?'Docs Ready':'Fresh'/);
});
test('Finance output documents use required currency, phase, location, date, and BPC columns',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const bpc=source.slice(source.indexOf('function docBPCSpreadsheet('),source.indexOf('function addListJobRow(',source.indexOf('function docBPCSpreadsheet(')));
  const list=source.slice(source.indexOf('function docListOfJobs('),source.indexOf('function doc',source.indexOf('function docListOfJobs(')+20));
  assert.doesNotMatch(bpc,/>WO No\.<\/th>/);
  assert.match(bpc,/eid\(j\.date\|\|j\.woDate\|\|j\.actions\?\.wo_received\?\.date/);
  assert.match(bpc,/jobClaimLocation\(j\)/);
  assert.match(list,/inL\('P'\+BWP\(t\.total\)/);
  assert.match(list,/inL\('Phase '\+String\(j\.phase/);
  assert.match(list,/inL\(jobClaimLocation\(j\)/);
  assert.match(list,/<strong>P\$\{BWP\(total\)\}<\/strong>/);
});
test('fullscreen printing serializes and persists the fullscreen editor',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const active=source.slice(source.lastIndexOf('function openDocFullscreen('),source.indexOf('/*',source.lastIndexOf('function openDocFullscreen(')));
  assert.match(active,/innerHTML=serializeToHTML\(body\)/);
  assert.match(active,/function syncFullscreenToModal\(/);
  assert.match(active,/serializeToHTML\(fsBody\)/);
  assert.match(active,/function printDocFS\(\)[\s\S]*const innerHtml=syncFullscreenToModal\(\)/);
});
test('email notifications are role-targeted, idempotent, and delivery-tracked',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','notifications.js'),'utf8');
  assert.match(source,/notificationId=`\$\{id\}_\$\{recipient\.role\}`/);
  assert.match(source,/'Idempotency-Key':key/);
  assert.match(source,/RESEND_API_KEY is not configured/);
  assert.match(source,/status:'failed',attempts:1,last_error:lastError/);
  assert.match(source,/recipientCount:\(recipients\|\|\[\]\)\.length/);
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(app,/result\.deliveries\|\|\[\]\)\.filter\(d=>d\.status==='failed'/);
  assert.match(app,/Email delivery failed:/);
});
test('local env loading accepts later local overrides without replacing OS variables',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','dev-server.cjs'),'utf8');
  assert.match(source,/const inheritedEnvKeys=new Set\(Object\.keys\(process\.env\)\)/);
  assert.match(source,/if\(!inheritedEnvKeys\.has\(key\)\)process\.env\[key\]=value/);
});
