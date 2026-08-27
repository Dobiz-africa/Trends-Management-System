const crypto=require('node:crypto');

const allowedRoles=['admin','linesman','finance','md'];
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function rest(config,path,{method='GET',body,prefer='return=representation'}={}){
  const response=await fetch(`${config.url}/rest/v1/${path}`,{method,headers:{apikey:config.service,Authorization:`Bearer ${config.service}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw Object.assign(new Error(data?.message||data?.error||'Database request failed'),{status:response.status});
  return data;
}

async function authenticate(headers){
  const config={url:process.env.SUPABASE_URL,anon:process.env.SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY};
  if(!config.url||!config.anon||!config.service)throw Object.assign(new Error('Supabase server environment is incomplete'),{status:500});
  const token=String(headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw Object.assign(new Error('Missing authentication token'),{status:401});
  const userResponse=await fetch(`${config.url}/auth/v1/user`,{headers:{apikey:config.anon,Authorization:`Bearer ${token}`}});
  const user=await userResponse.json();
  if(!userResponse.ok||!user.id)throw Object.assign(new Error('Invalid session'),{status:401});
  const profiles=await rest(config,`users?id=eq.${user.id}&select=id,email,full_name,role,is_admin,is_active`);
  const profile=profiles?.[0];
  if(!profile?.is_active)throw Object.assign(new Error('Inactive user'),{status:403});
  if(!allowedRoles.includes(profile.role)&&!profile.is_admin)throw Object.assign(new Error('Insufficient permissions'),{status:403});
  return config;
}

async function handleNotification({headers,body}){
  const config=await authenticate(headers);
  const {roles,message,wo='',customer='',event='workflow'}=body||{};
  const targets=[...new Set((Array.isArray(roles)?roles:[roles]).filter(role=>allowedRoles.includes(role)))];
  if(!targets.length||!String(message||'').trim())throw Object.assign(new Error('Valid roles and message are required'),{status:400});
  const id=crypto.randomUUID();
  await rest(config,'notifications',{method:'POST',body:targets.map(role=>({id:`${id}_${role}`,role,msg:String(message),wo:wo||null,is_read:false}))});
  let recipients=await rest(config,`users?role=in.(${targets.map(encodeURIComponent).join(',')})&is_active=eq.true&select=id,email,full_name,role`);
  const testEmail=String(process.env.NOTIFICATION_TEST_EMAIL||'').trim().toLowerCase();
  const testOnly=String(process.env.NOTIFICATION_TEST_ONLY||'').trim().toLowerCase()==='true';
  if(testEmail&&(testOnly||!recipients.some(recipient=>String(recipient.email||'').toLowerCase()===testEmail))){
    const testProfiles=await rest(config,`users?email=eq.${encodeURIComponent(testEmail)}&is_active=eq.true&select=id,email,full_name,role`);
    const testRecipient=testProfiles?.[0]||{id:null,email:testEmail,full_name:'',role:'test'};
    recipients=testOnly?[{...testRecipient,isTestCopy:true}]:[...recipients,{...testRecipient,isTestCopy:true}];
  }
  const deliveries=[];
  for(const recipient of recipients||[]){
    if(!recipient.email)continue;
    const key=crypto.createHash('sha256').update(`${event}|${wo}|${recipient.id||recipient.email}|${message}`).digest('hex');
    const existing=await rest(config,`notification_deliveries?idempotency_key=eq.${key}&select=id,status`);
    if(existing?.length){deliveries.push(existing[0]);continue;}
    const delivery=(await rest(config,'notification_deliveries',{method:'POST',body:{notification_id:`${id}_${recipient.isTestCopy?'test':recipient.role}`,recipient_id:recipient.id,recipient_email:recipient.email,idempotency_key:key,status:'queued',attempts:0}}))?.[0];
    if(!process.env.RESEND_API_KEY){deliveries.push({...delivery,status:'queued',last_error:'RESEND_API_KEY is not configured'});continue;}
    try{
      const appUrl=(process.env.APP_URL||'http://127.0.0.1:4173').trim();
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.NOTIFICATION_FROM||'TrendsDesk Test <onboarding@resend.dev>',to:[recipient.email],subject:wo?`TrendsDesk action required — WO ${wo}`:'TrendsDesk notification',html:`<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="color:#075ca8">TrendsDesk</h2><p>Hello,</p>${recipient.isTestCopy?`<p style="color:#667085;font-size:12px"><strong>Test copy:</strong> intended for ${escapeHtml(targets.join(', '))}.</p>`:''}<p>${escapeHtml(message)}</p>${customer?`<p><strong>Customer:</strong> ${escapeHtml(customer)}</p>`:''}${wo?`<p><a href="${appUrl}/?wo=${encodeURIComponent(wo)}">Open work order</a></p>`:''}</div>`})});
      const result=await response.json().catch(()=>({}));
      const status=response.ok?'sent':'failed',lastError=response.ok?null:(result.message||result.error||`Resend returned HTTP ${response.status}`);
      await rest(config,`notification_deliveries?id=eq.${delivery.id}`,{method:'PATCH',body:{provider_id:result.id||null,status,attempts:1,last_error:lastError,updated_at:new Date().toISOString()}});
      deliveries.push({...delivery,status,provider_id:result.id||null,last_error:lastError});
    }catch(error){
      const lastError=error.message||'Could not reach Resend';
      await rest(config,`notification_deliveries?id=eq.${delivery.id}`,{method:'PATCH',body:{status:'failed',attempts:1,last_error:lastError,updated_at:new Date().toISOString()}});
      deliveries.push({...delivery,status:'failed',last_error:lastError});
    }
  }
  return{notificationId:id,recipientCount:(recipients||[]).length,deliveries};
}

module.exports={handleNotification};
