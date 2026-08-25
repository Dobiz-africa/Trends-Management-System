const jsonHeaders={'Content-Type':'application/json'};

export function env(){
  const url=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)throw new Error('Supabase server environment is incomplete');
  return{url,anon,service};
}

export async function authenticate(req,allowedRoles=[]){
  const {url,anon,service}=env();
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw Object.assign(new Error('Missing authentication token'),{status:401});
  const userResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
  const user=await userResponse.json();
  if(!userResponse.ok||!user.id)throw Object.assign(new Error('Invalid session'),{status:401});
  const profileResponse=await fetch(`${url}/rest/v1/users?id=eq.${user.id}&select=id,email,full_name,role,is_admin,is_active`,{
    headers:{apikey:service,Authorization:`Bearer ${service}`}
  });
  const profile=(await profileResponse.json())?.[0];
  if(!profile?.is_active)throw Object.assign(new Error('Inactive user'),{status:403});
  if(allowedRoles.length&&!allowedRoles.includes(profile.role)&&!profile.is_admin){
    throw Object.assign(new Error('Insufficient permissions'),{status:403});
  }
  return{token,user,profile,config:{url,anon,service}};
}

export async function rest(config,path,{method='GET',body,prefer='return=representation'}={}){
  const response=await fetch(`${config.url}/rest/v1/${path}`,{
    method,headers:{apikey:config.service,Authorization:`Bearer ${config.service}`,...jsonHeaders,Prefer:prefer},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw Object.assign(new Error(data?.message||data?.error||'Database request failed'),{status:response.status});
  return data;
}

export function fail(res,error){
  console.error(JSON.stringify({level:'error',message:error.message,status:error.status||500,at:new Date().toISOString()}));
  return res.status(error.status||500).json({error:error.message||'Server error'});
}
