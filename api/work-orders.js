import {authenticate,rest,fail} from './_supabase.js';

export default async function handler(req,res){
  if(req.method!=='PATCH')return res.status(405).json({error:'Method not allowed'});
  try{
    const {profile,config}=await authenticate(req,['admin']);
    const {wo,action}=req.body||{};
    if(!wo||!['recycle','restore'].includes(action))return res.status(400).json({error:'Invalid request'});
    const body=action==='recycle'?{deleted_at:new Date().toISOString(),deleted_by:profile.id,deletion_reason:null}:{deleted_at:null,deleted_by:null,deletion_reason:null};
    const rows=await rest(config,`jobs?wo=eq.${encodeURIComponent(wo)}`,{method:'PATCH',body});
    if(!rows?.length)return res.status(404).json({error:'Work order not found'});
    if(action==='recycle'){
      const batches=await rest(config,'claim_batches?select=id,wos');
      for(const batch of batches||[]){
        if(!Array.isArray(batch.wos)||!batch.wos.includes(wo))continue;
        const remaining=batch.wos.filter(batchWO=>batchWO!==wo);
        await rest(config,'claim_batches?id=eq.'+encodeURIComponent(batch.id),{method:'PATCH',body:{wos:remaining}});
        const versions=await rest(config,'claim_versions?batch_id=eq.'+encodeURIComponent(batch.id)+'&select=id,wos');
        for(const version of versions||[]){
          await rest(config,'claim_versions?id=eq.'+encodeURIComponent(version.id),{method:'PATCH',body:{wos:(version.wos||[]).filter(batchWO=>batchWO!==wo)}});
        }
      }
    }
    await rest(config,'activity_log',{method:'POST',body:{wo,action:action==='recycle'?'Moved to recycle bin':'Restored from recycle bin',role:profile.role}});
    return res.status(200).json({job:rows[0]});
  }catch(error){return fail(res,error);}
}
