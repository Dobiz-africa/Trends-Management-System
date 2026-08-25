import crypto from 'node:crypto';
import {env,rest,fail} from './_supabase.js';

function verify(raw,headers,secret){
  if(!secret)return false;
  const id=headers['svix-id'],timestamp=headers['svix-timestamp'];
  const signatures=String(headers['svix-signature']||'').split(' ').map(v=>v.replace(/^v1,/,''));
  if(!id||!timestamp||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  const key=Buffer.from(secret.replace(/^whsec_/,''),'base64');
  const expected=crypto.createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return signatures.some(signature=>signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)));
}

export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');
    if(!verify(raw,req.headers,process.env.RESEND_WEBHOOK_SECRET))return res.status(401).json({error:'Invalid webhook signature'});
    const event=JSON.parse(raw);const providerId=event.data?.email_id;
    const statuses={'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.suppressed':'suppressed'};
    if(providerId&&statuses[event.type])await rest(env(),`notification_deliveries?provider_id=eq.${encodeURIComponent(providerId)}`,{method:'PATCH',body:{status:statuses[event.type],updated_at:new Date().toISOString()}});
    return res.status(200).json({received:true});
  }catch(error){return fail(res,error);}
}
