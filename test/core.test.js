const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');

test('canonical workflow excludes removed operational gates',()=>{
  assert.deepEqual(core.STAGES,['wo_received','vo1_created','linesman_notified','field_received','gis_ready','vo2_created','works_valuation_created','work_instruction_ready','finance_draft','claim_docs_ready','job_complete']);
});
test('legacy stages migrate without deleting actions',()=>{
  const job={stage:'work_complete',actions:{work_complete:{date:'2026-08-01'}}};core.migrateWorkflow(job);
  assert.equal(job.stage,'work_instruction_ready');assert.equal(job.legacyStage,'work_complete');assert.equal(job.actions.work_complete.date,'2026-08-01');
});
test('VO2 requires both GIS documents',()=>{
  const job={stage:'gis_ready',scans:{gis_report:{}}};assert.equal(core.canTransition(job,'vo2_created'),false);
  job.scans.gis_cert={};assert.equal(core.canTransition(job,'vo2_created'),true);
});
test('Works Instruction proceeds directly to Finance and legacy final GIS jobs migrate',()=>{
  const job={stage:'work_instruction_ready',scans:{gis_report:{},gis_cert:{}}};
  assert.equal(core.canTransition(job,'finance_draft'),true);
  const legacy={stage:'final_gis_pending'};core.migrateWorkflow(legacy);
  assert.equal(legacy.stage,'finance_draft');
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
  assert.equal(problems.length,2);
});
test('work-order locations preserve multi-word towns and exclude the next PDF label',()=>{
  const job={
    loc:'MOHEMBO WEST Project Consultant:',ward:'KGOSING',plotNo:'1707',
    locationData:{village:'MOHEMBO WEST Project Consultant:',ward:'KGOSING',plotNo:'1707'}
  };
  assert.equal(core.cleanLocationPart(job.loc),'MOHEMBO WEST');
  assert.equal(core.formatJobLocation(job),'MOHEMBO WEST, Ward KGOSING, Plot 1707');
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const parser=source.slice(source.indexOf('async function parseWorkOrderPDF('),source.indexOf('function resetAddWOForm('));
  assert.match(parser,/Project Consultant\|Ward\|Plot/);
  for(const marker of ['docVO1','docVO2','docWorksValuation','docWorksInstruction','docBPCSpreadsheet','docListOfJobs']){
    const start=source.indexOf(`function ${marker}(`);
    const next=source.indexOf('\nfunction ',start+10);
    assert.match(source.slice(start,next<0?source.length:next),/jobClaimLocation\(/,`${marker} must use the canonical work-order location`);
  }
});
test('Payment Certificate uses the requested Annexure wording and original footer structure',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const payment=source.slice(source.indexOf('function docPaymentCert('),source.indexOf('/* ── INVOICE',source.indexOf('function docPaymentCert(')));
  assert.match(payment,/Value of Work Completed \(see Annexure\)<\/td>/);
  assert.doesNotMatch(payment,/Value of Work Completed \(see Annexure \$\{/);
  for(const marker of ['Amount Due','Remarks line 1','Remarks line 2','Certificate Prepared by','Certificate Approved by','Transmission &amp; Distribution:'])assert.match(payment,new RegExp(marker));
  assert.match(payment,/correct and recommended for payment in full of the amount shown/);
});
test('Finance revisions reopen saved HTML, save before print, and can replace generated copies',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/storedBatchDocHTML\(certNo,docType\)\|\|generateBatchDocHTML/);
  assert.match(source,/function printModal\([\s\S]*saveBatchDocAttach\(CURRENT_CERT_NO, CURRENT_DOC_TYPE,\{quiet:true\}\)[\s\S]*serializeToHTML\(body\)/);
  assert.match(source,/Save now/);
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
  const bpc=source.slice(source.indexOf('function docBPCSpreadsheet('),source.indexOf('function docListOfJobs(',source.indexOf('function docBPCSpreadsheet(')));
  const list=source.slice(source.indexOf('function docListOfJobs('),source.indexOf('function doc',source.indexOf('function docListOfJobs(')+20));
  assert.doesNotMatch(bpc,/>WO No\.<\/th>/);
  assert.match(bpc,/eid\(j\.date\|\|j\.woDate\|\|j\.actions\?\.wo_received\?\.date/);
  assert.match(bpc,/jobClaimLocation\(j\)/);
  assert.match(list,/inL\('P'\+BWP\(t\.total\)/);
  assert.match(list,/inL\('Phase '\+String\(j\.phase/);
  assert.match(list,/inL\(jobClaimLocation\(j\)/);
  assert.match(list,/<strong>P\$\{BWP\(total\)\}<\/strong>/);
});
test('finalizing a batch advances every selected Finance Draft work order',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','claims.js'),'utf8');
  const finalize=source.slice(source.indexOf("if(action==='finalize')"),source.indexOf("return res.status(400)",source.indexOf("if(action==='finalize')")));
  assert.match(finalize,/for\(const row of rows\)/);
  assert.match(finalize,/row\.stage==='finance_draft'/);
  assert.match(finalize,/stage:'claim_docs_ready'/);
  assert.match(finalize,/if\(!updated\?\.length\).*retry the batch/);
  assert.match(finalize,/wos:advancedWOs/);
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const clientFinalize=app.slice(app.indexOf('async function finalizeClaim('),app.indexOf('/**',app.indexOf('async function finalizeClaim(')));
  assert.match(clientFinalize,/batchJobs\.forEach\(job=>\{/);
  assert.match(clientFinalize,/job\.stage='claim_docs_ready'/);
});
test('follow-up document requirements are enforced',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  for(const marker of [
    'value="${jobClaimLocation(job)}"',
    '>${jobClaimLocation(job)}</td>',
    "ef('wi_loc',jobClaimLocation(job),'98%')"
  ])assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(source,/addListJobRow/);
  assert.match(source,/async function downloadBPCSpreadsheetXLSX\(certNo\)/);
  assert.match(source,/workbook\.addWorksheet\('BPC Spreadsheet'/);
  assert.match(source,/const headers=\['Item No\.'[\s\S]{0,400}'External Responsible Person'\]/);
  assert.match(source,/cell\.border=\{/);
  assert.match(source,/const separator=\{style:'medium'/);
  assert.match(source,/const frame=\{style:'thick'/);
  assert.match(source,/numFmt='#,##0\.00'/);
  assert.match(source,/orientation:'landscape',paperSize:9,fitToPage:true/);
  assert.match(source,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(source,/docType==='bpc_spreadsheet'[\s\S]{0,500}Download Excel/);
  assert.match(source,/docType==='bpc_spreadsheet'\?'Print \/ PDF':'Print'/);
  assert.match(source,/function prepareWideClaimPrint\(doc,docType\)/);
  assert.match(source,/\['list_of_jobs','bpc_spreadsheet'\]\.includes\(docType\)/);
  assert.match(source,/min-width:0!important;table-layout:fixed!important/);
  assert.match(source,/field\.replaceWith\(printable\)/);
  assert.match(source,/colspan="8"/,'List of Jobs total row spans all 13 columns');
  assert.match(source,/\.bpc-print-table thead th\{[\s\S]{0,150}white-space:nowrap!important/);
  assert.match(source,/>Completeness<\/th>/);
  assert.match(source,/>Date<\/th>/);
  assert.doesNotMatch(source,/class="bpc-print-table"[\s\S]{0,3000}>Work Order Date<\/th>/);
  assert.match(source,/ITEM<br>No\./);
  assert.match(source,/PROJECT<br>NUMBER/);
  assert.match(source,/PLANNED<br>START DATE/);
  assert.match(source,/ACTUAL<br>COMPLETION DATE/);
  assert.match(source,/\.bpc-print-table tbody td,[\s\S]{0,180}white-space:nowrap!important/);
  assert.match(source,/\.print-field-value\{[\s\S]{0,120}white-space:nowrap/);
  const printModal=source.slice(source.indexOf('function printModal('),source.indexOf('/*',source.indexOf('function printModal(')));
  assert.doesNotMatch(printModal,/downloadBPCSpreadsheetXLSX/);
  assert.match(source,/class="invoice-meta"/);
  assert.match(source,/invoice-meta td:last-child input\{display:inline-block;text-align:right;margin-left:auto\}/);
  assert.match(source,/\{id:'job_complete',[^\n]+role:'md'\}/,'Manager owns the completion stage');
  assert.match(source,/recordStage==='job_complete'&&CU!=='md'/);
  assert.match(source,/if\(isMD&&st\.id==='claim_docs_ready'\)/);
  assert.match(source,/fullscreen\?\.style\.display==='flex'[\s\S]{0,100}syncFullscreenToModal/);
  const finalize=source.slice(source.indexOf('async function finalizeClaim('),source.indexOf('/**',source.indexOf('async function finalizeClaim(')));
  assert.match(finalize,/passedPreGIS=stageIdx\(job\.stage\)>=stageIdx\('vo2_created'\)/);
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
  assert.match(source,/notificationId=`\$\{id\}_\$\{recipient\.isTestCopy\?'test':recipient\.role\}`/);
  assert.match(source,/'Idempotency-Key':key/);
  assert.match(source,/RESEND_API_KEY is not configured/);
  assert.match(source,/status:'failed',attempts:1,last_error:lastError/);
  assert.match(source,/recipientCount:\(recipients\|\|\[\]\)\.length/);
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(app,/result\.deliveries\|\|\[\]\)\.filter\(d=>d\.status==='failed'/);
  assert.match(app,/Email delivery failed:/);
});
test('configured test inbox receives one copy without changing its Supabase role',()=>{
  for(const filename of ['notifications.js','notifications-local.cjs']){
    const source=fs.readFileSync(path.join(__dirname,'..','api',filename),'utf8');
    assert.match(source,/process\.env\.NOTIFICATION_TEST_EMAIL/);
    assert.match(source,/process\.env\.NOTIFICATION_TEST_ONLY/);
    assert.match(source,/users\?email=eq\.\$\{encodeURIComponent\(testEmail\)\}/);
    assert.match(source,/recipients\.some\(recipient=>String\(recipient\.email\|\|''\)\.toLowerCase\(\)===testEmail\)/);
    assert.match(source,/isTestCopy:true/);
    assert.match(source,/recipients=testOnly\?\[/);
    assert.match(source,/recipient\.id\|\|recipient\.email/);
  }
  const example=fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8');
  assert.match(example,/NOTIFICATION_TEST_EMAIL=dev@dobusiness\.africa/);
  assert.match(example,/NOTIFICATION_TEST_ONLY=true/);
});
test('email delivery is limited to role handoffs and uses a neutral greeting',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const notifyFn=app.slice(app.indexOf('function notify(roles'),app.indexOf('function addLog(',app.indexOf('function notify(roles')));
  assert.doesNotMatch(notifyFn.slice(0,notifyFn.indexOf('function notifyWithEmail')),/dispatchServerNotification/);
  assert.match(notifyFn,/function notifyWithEmail\([\s\S]*dispatchServerNotification/);
  assert.match(app,/notifyWithEmail\('linesman',[^\n]+field report document containing all required field reports/);
  assert.match(app,/notifyWithEmail\(\['admin'\],[^\n]+Linesman field reports/);
  assert.match(app,/notifyWithEmail\(\['finance'\],[^\n]+is waiting for you/);
  assert.match(app,/notifyWithEmail\(\['md'\],[^\n]+Claim batch documents are in process/);
  assert.match(app,/notifyWithEmail\(\['md'\],[^\n]+Finance team has completed Claim/);
  for(const filename of ['notifications.js','notifications-local.cjs']){
    const email=fs.readFileSync(path.join(__dirname,'..','api',filename),'utf8');
    assert.match(email,/<p>Hello,<\/p>/);
    assert.match(email,/<p>Thank you\.<\/p>/);
    assert.doesNotMatch(email,/Hello \$\{escapeHtml\(recipient/);
    assert.doesNotMatch(email,/This automated message was sent to the/);
  }
});
test('local env loading accepts later local overrides without replacing OS variables',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','dev-server.cjs'),'utf8');
  assert.match(source,/const inheritedEnvKeys=new Set\(Object\.keys\(process\.env\)\)/);
  assert.match(source,/if\(!inheritedEnvKeys\.has\(key\)\)process\.env\[key\]=value/);
});

test('production role switcher is restricted to configured admin accounts',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/if\(!profile\?\.is_admin\)return false/);
  assert.match(source,/DEV_ROLE_SWITCH_EMAILS\.includes\(email\)/);
  assert.doesNotMatch(source,/DEVELOPER_MODE&&!IS_PRODUCTION_HOST/);
});

test('dashboard login cannot remain behind an endless loading overlay',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const loader=source.slice(source.indexOf('async function loadDashboardAfterLogin'),source.indexOf('function switchRole'));
  assert.match(loader,/withTimeout\(syncFromSupabase\(\),15000/);
  assert.match(loader,/finally\{[\s\S]*loadOv\.style\.display='none'/);
  assert.doesNotMatch(loader,/await flushPendingSave\(\)/);
  assert.match(loader,/Could not load the latest work orders/);
});

test('legacy deleted work orders are classified into the recycle bin',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/row\.stage==='work_order_deleted'/);
  assert.match(source,/isRecycled=Boolean\(row\.deleted_at\|\|j\.deletedAt\|\|isLegacyDeleted\)/);
  assert.match(source,/if\(job\.stage==='work_order_deleted'\)/);
  assert.match(source,/isLegacyDeleted\?'Previously deleted'/);
  assert.doesNotMatch(source,/Deleted before the Recycle Bin upgrade/);
});

test('recycling a work order needs confirmation but no deletion reason',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const api=fs.readFileSync(path.join(__dirname,'..','api','work-orders.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
  assert.doesNotMatch(html,/deleteWOReason|Reason for recycling/);
  assert.doesNotMatch(app,/Enter a reason for recycling|deleteWOReason/);
  assert.doesNotMatch(api,/Deletion reason is required/);
  assert.match(html,/Move work order to Recycle Bin/);
  assert.match(css,/#deleteWOConfirmBtn\{[^}]*color:#fff/);
});

test('documents panels use one merged Linesman document and attach the parsed BPC file',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/const LINESMAN_MERGED_DOC_KEY='ln_merged_pdf'/);
  assert.match(source,/field_received:\[LINESMAN_MERGED_DOC_KEY\]/);
  assert.match(source,/const allDocTypes=\['bpc_wo','vo1',LINESMAN_MERGED_DOC_KEY/);
  assert.match(source,/visibleDocTypes = \[LINESMAN_MERGED_DOC_KEY\]/);
  assert.match(source,/\[LINESMAN_MERGED_DOC_KEY\]:LINESMAN_MERGED_DOC_LABEL/);
  const documentsPanel=source.slice(source.indexOf('// Documents panel - FILTERED BY ROLE'),source.indexOf('// Summary',source.indexOf('// Documents panel - FILTERED BY ROLE')));
  assert.doesNotMatch(documentsPanel,/\.\.\.LN_DOC_KEYS/);
  const create=source.slice(source.indexOf('async function saveNewWO('),source.indexOf('function resetAddWOForm(',source.indexOf('async function saveNewWO(')));
  assert.match(create,/await saveDBAndWait\(\)/);
  assert.match(create,/await _uploadScanToSupabase\(num,'bpc_wo',fileToUpload\)/);
  assert.ok(create.indexOf('await saveDBAndWait()')<create.indexOf("await _uploadScanToSupabase(num,'bpc_wo',fileToUpload)"),'job is persisted before its BPC document row is attached');
});

test('VO1 and VO2 allow the final item row to be deleted',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const vo1Start=source.lastIndexOf('function deleteVO1Row(wo,idx)');
  const vo2Start=source.lastIndexOf('function deleteVO2Row(wo,idx)');
  const vo1=source.slice(vo1Start,vo2Start);
  const vo2=source.slice(vo2Start,source.indexOf('/*',vo2Start));
  assert.match(vo1,/\.vo1\.items\.splice\(idx, 1\)/);
  assert.match(vo2,/\.vo2\.items\.splice\(idx, 1\)/);
  assert.doesNotMatch(vo1,/length <= 1|Cannot delete the last row/);
  assert.doesNotMatch(vo2,/length <= 1|Cannot delete the last row/);
  assert.match(vo1,/openRowDeleteConfirm\(\(\)=>\{/);
  assert.match(vo2,/openRowDeleteConfirm\(\(\)=>\{/);
  assert.doesNotMatch(vo1,/confirm\('Delete this row\?'\)/);
  assert.doesNotMatch(vo2,/confirm\('Delete this row\?'\)/);
});

test('row deletion uses a branded confirmation modal',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(app,/function openRowDeleteConfirm\(action\)/);
  assert.match(app,/function closeRowDeleteConfirm\(approved\)/);
  assert.match(html,/id="rowDeleteModal" class="overlay"/);
  assert.match(html,/>Delete item\?<\/h3>/);
  assert.match(html,/>Delete item<\/button>/);
});

test('authentication feedback is rendered inside the login forms',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const auth=app.slice(app.indexOf('async function forgotPassword()'),app.indexOf('function withTimeout('));
  assert.match(html,/id="loginFeedback" class="auth-feedback" role="alert"/);
  assert.match(html,/id="resetFeedback" class="auth-feedback" role="alert"/);
  assert.match(app,/function showAuthFeedback\(targetId,message,type='error'\)/);
  assert.match(auth,/The email address or password is incorrect/);
  assert.doesNotMatch(auth,/alert\(/);
});

test('Linesman upload interface uses clear field-report wording',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const dashboard=app.slice(app.indexOf('function renderLinesmanDash()'),app.indexOf('function selectLinesmanFile(',app.indexOf('function renderLinesmanDash()')));
  assert.match(dashboard,/Upload Field Reports/);
  assert.match(dashboard,/Field reports pending/);
  assert.doesNotMatch(dashboard,/Upload All 6 Documents|All Documents \(Merged PDF\)|documents uploaded/);
  assert.match(html,/>Upload Field Reports<\/h3>/);
  assert.match(html,/>✅ Submit Field Reports<\/button>/);
  assert.doesNotMatch(html,/Upload Field Documents \(Merged PDF\)/);
});

test('uploaded document downloads open in a new browser tab',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const scanDownload=source.slice(source.indexOf('async function downloadScan('),source.indexOf('async function viewScanFile('));
  const externalDownload=source.slice(source.indexOf('function downloadExternalFile('),source.indexOf('/**',source.indexOf('function downloadExternalFile(')));
  const batchDownload=source.slice(source.indexOf('function downloadBatchScan('),source.indexOf('function recalcVO1('));
  assert.match(scanDownload,/window\.open\('','_blank'\)/);
  assert.match(scanDownload,/win\.location\.replace\(await scanSource\(s\)\)/);
  assert.doesNotMatch(scanDownload,/\.download=/);
  assert.match(externalDownload,/window\.open\(file\.data, '_blank'\)/);
  assert.match(batchDownload,/window\.open\(s\.dataUrl,'_blank'\)/);
});

test('upload-only document cards use the real file without placeholder copies',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/const UPLOADED_ONLY_DOC_TYPES=\['bpc_wo',LINESMAN_MERGED_DOC_KEY,'gis_report','gis_cert'\]/);
  const detail=source.slice(source.indexOf('function renderJobDetail('),source.indexOf('/*',source.indexOf('function renderJobDetail(')));
  assert.match(detail,/const saved=!UPLOADED_ONLY_DOC_TYPES\.includes\(d\)/);
  assert.match(detail,/UPLOADED_ONLY_DOC_TYPES\.includes\(d\)\?'Download':'Signed Copy'/);
  const opener=source.slice(source.indexOf('function openDocForAction('),source.indexOf('function buildDocFoot('));
  assert.match(opener,/UPLOADED_ONLY_DOC_TYPES\.includes\(docType\)&&job\.scans\?\.\[docType\]/);
  assert.match(opener,/downloadScan\(wo,docType\)/);
  assert.doesNotMatch(source,/html:\s*'GIS report uploaded'/);
  const advance=source.slice(source.indexOf('async function advanceStage('),source.indexOf('async function saveVO2('));
  assert.doesNotMatch(advance,/gis_ready:'gis_report'/);
});

test('editable documents autosave without advancing workflow stages',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const autosave=source.slice(source.indexOf('function setDocumentSaveStatus('),source.indexOf('// Global doc labels'));
  assert.match(autosave,/function enableDocumentAutosave\(mode\)/);
  assert.match(autosave,/setTimeout\(\(\)=>autosaveCurrentDocument\(\),700\)/);
  assert.match(autosave,/saveBatchDocAttach\(CURRENT_CERT_NO,CURRENT_DOC_TYPE,\{quiet:true,autosave:true\}\)/);
  assert.match(autosave,/saveDocToStep\(CURRENT_DOC_WO,CURRENT_DOC_TYPE,\{quiet:true,refresh:false\}\)/);
  assert.match(autosave,/markJobDirty\(wo\)/);
  assert.doesNotMatch(autosave,/advanceStage\(/);
  const close=source.slice(source.indexOf('function closeModal('),source.indexOf('/* FULLSCREEN DOCUMENT VIEWER',source.indexOf('function closeModal(')));
  assert.match(close,/autosaveCurrentDocument\(true\)/);
  assert.doesNotMatch(close,/Close without saving/);
  assert.match(source,/Saved automatically/);
});

test('completed work orders are reusable across independent claim batches and old drafts recover',()=>{
  const api=fs.readFileSync(path.join(__dirname,'..','api','claims.js'),'utf8');
  assert.match(api,/\['finance_draft','claim_docs_ready','job_complete'\]\.includes\(row\.stage\)/);
  assert.doesNotMatch(api,/row\.claim_ref===batchId/);
  assert.match(api,/claim_batches\?id=eq\./);
  assert.match(api,/Could not recover this claim batch/);
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const save=app.slice(app.indexOf('function saveBatchDocAttach('),app.indexOf('// Also store in batchSaved',app.indexOf('function saveBatchDocAttach(')));
  assert.match(save,/\(batch\?\.wos\|\|\[\]\)\.map\(wo=>DB\.jobs\[wo\]\)/);
  assert.doesNotMatch(save,/j\.claimRef===certNo/);
});

test('documents navigation exposes exact generated batches and recycle list is collapsed',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/id="n-documents"/);
  assert.match(html,/id="sc-documents"/);
  assert.match(app,/function renderDocuments\(\)/);
  assert.match(app,/viewBatchDoc/);
  assert.match(app,/Download BPC Excel/);
  assert.match(html,/id="a-recycle" style="display:none"/);
  assert.match(app,/function toggleRecycleBin\(\)/);
  assert.match(app,/const canView=!!saved/);
  assert.match(app,/visibleDocTypes=visibleDocTypes\.filter/);
  assert.match(app,/\(!hasUnsavedChanges&&!immediate\)/);
});
test('local claim batches persist through the authenticated server route',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','dev-server.cjs'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const api=fs.readFileSync(path.join(__dirname,'..','api','claims.js'),'utf8');
  assert.match(server,/pathname==='\/api\/claims'/);
  assert.match(server,/API_ROUTES_ENABLED:true/);
  assert.match(app,/action:'save_batch'/);
  assert.match(app,/if\(batchErr\)throw batchErr/);
  assert.match(api,/action==='save_batch'/);
  assert.match(api,/docs:batch\.docs\|\|\{\}/);
});
test('local recycle and restore use the authenticated work-order route',()=>{
  const server=fs.readFileSync(path.join(__dirname,'..','dev-server.cjs'),'utf8');
  assert.match(server,/pathname==='\/api\/work-orders'/);
  assert.match(server,/import\('\.\/api\/work-orders\.js'\)/);
  const api=fs.readFileSync(path.join(__dirname,'..','api','work-orders.js'),'utf8');
  assert.match(api,/authenticate\(req,\['admin'\]\)/);
  assert.match(api,/\['recycle','restore'\]\.includes\(action\)/);
});
test('recycling removes work-order involvement from claim batches',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const api=fs.readFileSync(path.join(__dirname,'..','api','work-orders.js'),'utf8');
  assert.match(app,/function removeWorkOrderFromClaimBatches\(wo\)/);
  assert.match(app,/batch\.wos=batch\.wos\.filter\(batchWO=>batchWO!==wo\)/);
  assert.match(app,/generateBatchDocHTML\(certNo,docType\)/);
  assert.match(app,/batch\.status='archived'/);
  assert.match(app,/Object\.keys\(DB\.recycleBin\|\|\{\}\)\.forEach/);
  assert.match(app,/filter\(batch=>\(batch\.wos\|\|\[\]\)\.length\)/);
  assert.match(api,/claim_batches\?select=id,wos/);
  assert.match(api,/body:\{wos:remaining\}/);
  assert.match(api,/claim_versions\?batch_id=eq\./);
});