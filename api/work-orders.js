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
    await rest(config,'activity_log',{method:'POST',body:{wo,action:action==='recycle'?'Moved to recycle bin':'Restored from recycle bin',role:profile.role}});
    return res.status(200).json({job:rows[0]});
  }catch(error){return fail(res,error);}
}
