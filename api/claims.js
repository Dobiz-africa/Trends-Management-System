import {authenticate,rest,fail} from './_supabase.js';

function validateJobs(rows,batchId){
  const problems=[];
  rows.forEach(row=>{
    const job=row.data||{};
    if(row.deleted_at)problems.push(`WO ${row.wo} is recycled`);
    const isRevision=row.claim_ref===batchId&&['claim_docs_ready','job_complete'].includes(row.stage);
    if(row.stage!=='finance_draft'&&!isRevision)problems.push(`WO ${row.wo} is not ready for Finance and is not part of this completed claim`);
    if(!row.cust||!row.loc)problems.push(`WO ${row.wo} is missing customer or location`);
    if(!job.vo2?.items?.length)problems.push(`WO ${row.wo} has no VO2 items`);
  });
  return problems;
}

export default async function handler(req,res){
  if(!['POST','PATCH'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  try{
    const {profile,config}=await authenticate(req,['finance']);
    const {batchId,wos=[],fields={},action='save_draft',expectedVersion}=req.body||{};
    if(!batchId||!/^[A-Za-z0-9_-]{2,40}$/.test(batchId))return res.status(400).json({error:'Valid batchId is required'});
    if(action==='save_draft'){
      if(!Array.isArray(wos)||!wos.length)return res.status(400).json({error:'Select at least one work order'});
      const rows=await rest(config,`jobs?wo=in.(${wos.map(encodeURIComponent).join(',')})&select=*`);
      const problems=validateJobs(rows||[],batchId);
      if(problems.length)return res.status(422).json({error:'Draft validation failed',problems});
      await rest(config,'claim_batches?on_conflict=id',{method:'POST',body:{id:batchId,cert_no:batchId,wos,docs:{},scans:{}},prefer:'resolution=merge-duplicates,return=representation'});
      const drafts=await rest(config,`claim_versions?batch_id=eq.${encodeURIComponent(batchId)}&status=eq.draft&select=*`);
      let version=drafts?.[0]?.version;
      if(drafts?.length){
        if(expectedVersion&&expectedVersion!==version)return res.status(409).json({error:'Draft changed; reload before saving'});
        await rest(config,`claim_versions?id=eq.${drafts[0].id}`,{method:'PATCH',body:{wos,fields,validation:{valid:true,problems:[]},updated_at:new Date().toISOString()}});
      }else{
        const versions=await rest(config,`claim_versions?batch_id=eq.${encodeURIComponent(batchId)}&select=version&order=version.desc&limit=1`);
        version=(versions?.[0]?.version||0)+1;
        await rest(config,'claim_versions',{method:'POST',body:{batch_id:batchId,version,status:'draft',wos,fields,validation:{valid:true,problems:[]},created_by:profile.id}});
      }
      return res.status(200).json({batchId,version,status:'draft'});
    }
    if(action==='finalize'){
      const drafts=await rest(config,`claim_versions?batch_id=eq.${encodeURIComponent(batchId)}&status=eq.draft&select=*`);
      const draft=drafts?.[0];if(!draft)return res.status(404).json({error:'Draft not found'});
      if(expectedVersion&&expectedVersion!==draft.version)return res.status(409).json({error:'Draft changed; reload before finalizing'});
      const rows=await rest(config,`jobs?wo=in.(${draft.wos.map(encodeURIComponent).join(',')})&select=*`);
      const problems=validateJobs(rows||[],batchId);
      if(problems.length)return res.status(422).json({error:'Finalization validation failed',problems});
      await rest(config,`claim_versions?id=eq.${draft.id}&status=eq.draft`,{method:'PATCH',body:{status:'finalized',finalized_by:profile.id,finalized_at:new Date().toISOString(),validation:{valid:true,problems:[]}}});
      for(const row of rows){
        await rest(config,`jobs?wo=eq.${encodeURIComponent(row.wo)}&stage=eq.finance_draft`,{method:'PATCH',body:{stage:'claim_docs_ready',claim_ref:batchId}});
      }
      return res.status(200).json({batchId,version:draft.version,status:'finalized'});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(error){return fail(res,error);}
}
