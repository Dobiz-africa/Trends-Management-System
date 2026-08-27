import crypto from 'node:crypto';
import {authenticate,rest,fail} from './_supabase.js';

const allowedRoles=['admin','linesman','finance','md'];
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const {profile,config}=await authenticate(req,allowedRoles);
    const {roles,message,wo='',customer='',event='workflow'}=req.body||{};
    const targets=[...new Set((Array.isArray(roles)?roles:[roles]).filter(role=>allowedRoles.includes(role)))];
    if(!targets.length||!String(message||'').trim())return res.status(400).json({error:'Valid roles and message are required'});
    const id=crypto.randomUUID();
    await rest(config,'notifications',{method:'POST',body:targets.map(role=>({id:`${id}_${role}`,role,msg:String(message),wo:wo||null,is_read:false}))});
    const roleFilter=targets.map(encodeURIComponent).join(',');
    let recipients=await rest(config,`users?role=in.(${roleFilter})&is_active=eq.true&select=id,email,full_name,role`);
    const testEmail=String(process.env.NOTIFICATION_TEST_EMAIL||'').trim().toLowerCase();
    const testOnly=String(process.env.NOTIFICATION_TEST_ONLY||'').trim().toLowerCase()==='true';
    if(testEmail&&(testOnly||!recipients.some(recipient=>String(recipient.email||'').toLowerCase()===testEmail))){
      const testProfiles=await rest(config,`users?email=eq.${encodeURIComponent(testEmail)}&is_active=eq.true&select=id,email,full_name,role`);
      const testRecipient=testProfiles?.[0]||{id:null,email:testEmail,full_name:'',role:'test'};
      recipients=testOnly?[{...testRecipient,isTestCopy:true}]:[...recipients,{...testRecipient,isTestCopy:true}];
    }
    const baseUrl=(process.env.APP_URL||'https://claims.trendsengineering.com').trim();
    const from=process.env.NOTIFICATION_FROM||'TrendsDesk <notifications@claims.trendsengineering.com>';
    const queued=[];
    for(const recipient of recipients||[]){
      if(!recipient.email)continue;
      const key=crypto.createHash('sha256').update(`${event}|${wo}|${recipient.id||recipient.email}|${message}`).digest('hex');
      const existing=await rest(config,`notification_deliveries?idempotency_key=eq.${key}&select=id,status`);
      if(existing?.length){queued.push(existing[0]);continue;}
      const notificationId=`${id}_${recipient.isTestCopy?'test':recipient.role}`;
      const delivery=(await rest(config,'notification_deliveries',{method:'POST',body:{notification_id:notificationId,recipient_id:recipient.id,recipient_email:recipient.email,idempotency_key:key,status:'queued',attempts:0}}))?.[0];
      if(!process.env.RESEND_API_KEY){queued.push({...delivery,status:'queued',last_error:'RESEND_API_KEY is not configured'});continue;}
      try{
        const emailResponse=await fetch('https://api.resend.com/emails',{
          method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},
          body:JSON.stringify({from,to:[recipient.email],subject:wo?`TrendsDesk action required — WO ${wo}`:'TrendsDesk notification',html:`<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="color:#075ca8">TrendsDesk</h2><p>Hello,</p>${recipient.isTestCopy?`<p style="color:#667085;font-size:12px"><strong>Test copy:</strong> intended for ${escapeHtml(targets.join(', '))}.</p>`:''}<p>${escapeHtml(message)}</p>${customer?`<p><strong>Customer:</strong> ${escapeHtml(customer)}</p>`:''}${wo?`<p><a href="${baseUrl}/?wo=${encodeURIComponent(wo)}" style="background:#f58220;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Open work order</a></p>`:''}<p style="color:#667085;font-size:12px">${recipient.isTestCopy?'This is a TrendsDesk notification testing copy.':`This automated message was sent to the ${escapeHtml(recipient.role)} role.`}</p></div>`})
        });
        const result=await emailResponse.json().catch(()=>({}));
        const status=emailResponse.ok?'sent':'failed';
        const lastError=emailResponse.ok?null:(result.message||result.error||`Resend returned HTTP ${emailResponse.status}`);
        await rest(config,`notification_deliveries?id=eq.${delivery.id}`,{method:'PATCH',body:{provider_id:result.id||null,status,attempts:1,last_error:lastError,updated_at:new Date().toISOString()}});
        queued.push({...delivery,provider_id:result.id||null,status,last_error:lastError});
      }catch(sendError){
        const lastError=sendError?.message||'Could not reach Resend';
        await rest(config,`notification_deliveries?id=eq.${delivery.id}`,{method:'PATCH',body:{status:'failed',attempts:1,last_error:lastError,updated_at:new Date().toISOString()}});
        queued.push({...delivery,status:'failed',last_error:lastError});
      }
    }
    return res.status(202).json({notificationId:id,recipientCount:(recipients||[]).length,deliveries:queued});
  }catch(error){return fail(res,error);}
}
