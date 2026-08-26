import {authenticate,rest,fail} from './_supabase.js';

const transitions={wo_received:'vo1_created',vo1_created:'linesman_notified',linesman_notified:'field_received',field_received:'gis_ready',gis_ready:'vo2_created',vo2_created:'works_valuation_created',works_valuation_created:'work_instruction_ready',work_instruction_ready:'final_gis_pending',final_gis_pending:'finance_draft',finance_draft:'claim_docs_ready',claim_docs_ready:'job_complete'};

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const {profile,config}=await authenticate(req,['admin','finance','md']);
    const {wo,to,notes=''}=req.body||{};
    if(!wo||!to)return res.status(400).json({error:'wo and to are required'});
    const rows=await rest(config,`jobs?wo=eq.${encodeURIComponent(wo)}&select=*`);
    const row=rows?.[0];if(!row||row.deleted_at)return res.status(404).json({error:'Active work order not found'});
    const devEmails=String(process.env.DEV_ROLE_SWITCH_EMAILS||'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean);
    if(to==='job_complete'&&profile.role!=='md'&&!devEmails.includes(String(profile.email||'').toLowerCase()))return res.status(403).json({error:'Only the Manager can record a job as complete'});
    if(to!=='job_complete'&&profile.role==='md')return res.status(403).json({error:'Manager access is read-only at this workflow stage'});
    if(transitions[row.stage]!==to)return res.status(409).json({error:`Invalid transition from ${row.stage} to ${to}`});
    if(to==='vo2_created'){
      const docs=await rest(config,`documents?wo=eq.${encodeURIComponent(wo)}&doc_type=in.(gis_report,gis_cert)&select=doc_type`);
      const types=new Set((docs||[]).map(d=>d.doc_type));
      if(!types.has('gis_report')||!types.has('gis_cert'))return res.status(422).json({error:'GIS Map and GIS Certificate are required before VO2'});
    }
    if(to==='finance_draft'){
      const docs=await rest(config,`documents?wo=eq.${encodeURIComponent(wo)}&doc_type=in.(final_gis_report,final_gis_cert)&select=doc_type`);
      const types=new Set((docs||[]).map(d=>d.doc_type));
      if(!types.has('final_gis_report')||!types.has('final_gis_cert'))return res.status(422).json({error:'Final GIS Map and Final GIS Certificate are required before Finance'});
    }
    const data={...(row.data||{}),workflowVersion:3,actions:{...(row.data?.actions||{}),[to]:{date:new Date().toISOString().slice(0,10),notes,by:profile.id}}};
    const updated=await rest(config,`jobs?wo=eq.${encodeURIComponent(wo)}&stage=eq.${encodeURIComponent(row.stage)}`,{method:'PATCH',body:{stage:to,workflow_version:3,data}});
    if(!updated?.length)return res.status(409).json({error:'Work order changed; reload and try again'});
    await rest(config,'activity_log',{method:'POST',body:{wo,action:`Workflow advanced to ${to}`,role:profile.role}});
    return res.status(200).json({job:updated[0]});
  }catch(error){return fail(res,error);}
}
