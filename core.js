(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TrendsCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const WORKFLOW_VERSION=3;
  const STAGES=['wo_received','vo1_created','linesman_notified','field_received','gis_ready','vo2_created','works_valuation_created','work_instruction_ready','final_gis_pending','finance_draft','claim_docs_ready','job_complete'];
  const TRANSITIONS=Object.freeze(Object.fromEntries(STAGES.map((stage,index)=>[stage,index<STAGES.length-1?STAGES[index+1]:null])));
  const LEGACY_STAGE_MAP=Object.freeze({gis_notified_early:'field_received',gis_complete_early:'gis_ready',teams_notified:'work_instruction_ready',work_complete:'work_instruction_ready',gis_notified:'final_gis_pending',gis_complete:'final_gis_pending'});
  const migrateWorkflow=job=>{if(!job)return job;if(LEGACY_STAGE_MAP[job.stage]){job.legacyStage=job.stage;job.stage=LEGACY_STAGE_MAP[job.stage];}job.workflowVersion=WORKFLOW_VERSION;return job;};
  const hasGISPrerequisites=job=>!!(job?.scans?.gis_report&&job?.scans?.gis_cert);
  const hasFinalGISPrerequisites=job=>!!(job?.scans?.final_gis_report&&job?.scans?.final_gis_cert);
  const canTransition=(job,to)=>!!job&&TRANSITIONS[job.stage]===to&&(to!=='vo2_created'||hasGISPrerequisites(job))&&(to!=='finance_draft'||hasFinalGISPrerequisites(job));
  function numWords(n){
    const ones=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
    const under1000=value=>{let v=value,out=[];if(v>=100){out.push(ones[Math.floor(v/100)]+' hundred');v%=100;}if(v>=20)out.push(tens[Math.floor(v/10)]+(v%10?'-'+ones[v%10]:''));else if(v>0)out.push(ones[v]);return out.join(' ');};
    const integer=Math.max(0,Math.floor(Number(n)||0));let rest=integer,parts=[];
    [[1e9,'billion'],[1e6,'million'],[1e3,'thousand']].forEach(([size,label])=>{if(rest>=size){parts.push(under1000(Math.floor(rest/size))+' '+label);rest%=size;}});
    if(rest)parts.push(under1000(rest));else if(!parts.length)parts.push(ones[0]);const thebe=Math.round(((Number(n)||0)-integer)*100)%100;
    return `${parts.join(' ')} pula${thebe?' and '+under1000(thebe)+' thebe':''} only`.replace(/^./,c=>c.toUpperCase());
  }
  function validateClaimJobs(jobs){
    const problems=[];(jobs||[]).forEach(job=>{if(!job.cust||!job.loc)problems.push(`WO ${job.wo}: customer and location are required`);if(!hasGISPrerequisites(job))problems.push(`WO ${job.wo}: pre-VO2 GIS Map and Certificate are required`);if(!hasFinalGISPrerequisites(job))problems.push(`WO ${job.wo}: final GIS Map and Certificate are required`);if(!job.vo2?.items?.length)problems.push(`WO ${job.wo}: VO2 requires at least one item`);});return problems;
  }
  return{WORKFLOW_VERSION,STAGES,TRANSITIONS,LEGACY_STAGE_MAP,migrateWorkflow,hasGISPrerequisites,hasFinalGISPrerequisites,canTransition,numWords,validateClaimJobs};
});
