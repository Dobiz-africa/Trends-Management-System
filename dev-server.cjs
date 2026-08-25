const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {handleNotification}=require('./api/notifications-local.cjs');

const root=__dirname;
const port=Number(process.env.PORT||4173);
const inheritedEnvKeys=new Set(Object.keys(process.env));

function loadEnv(filename){
  const file=path.join(root,filename);
  if(!fs.existsSync(file))return;
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const index=line.indexOf('=');if(index<1)continue;
    const key=line.slice(0,index).trim();
    let value=line.slice(index+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    // Match standard dotenv precedence: later entries and .env.local override
    // earlier file values, but never replace variables inherited from the OS.
    if(!inheritedEnvKeys.has(key))process.env[key]=value;
  }
}
loadEnv('.env');
loadEnv('.env.local');

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpeg':'image/jpeg','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf'};

const sendJson=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const readJson=req=>new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'));}catch(error){reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});req.on('error',reject);});

const server=http.createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://localhost');
  if(requestUrl.pathname==='/api/config'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    return res.end(JSON.stringify({SUPABASE_URL:process.env.SUPABASE_URL||'',SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY||'',SCANS_BUCKET:process.env.SCANS_BUCKET||'claimdesk-scans',API_ROUTES_ENABLED:false,EMAIL_ROUTES_ENABLED:true}));
  }
  if(requestUrl.pathname==='/api/notifications'){
    if(req.method!=='POST')return sendJson(res,405,{error:'Method not allowed'});
    try{return sendJson(res,202,await handleNotification({headers:req.headers,body:await readJson(req)}));}
    catch(error){console.error('Local notification failed:',error.message);return sendJson(res,error.status||500,{error:error.message||'Server error'});}
  }
  if(requestUrl.pathname.startsWith('/api/')){
    res.writeHead(501,{'Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({error:'Use `vercel dev` to exercise serverless API routes locally.'}));
  }
  const relative=requestUrl.pathname==='/'?'index.html':decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
});

server.listen(port,'127.0.0.1',()=>{
  const configured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY);
  console.log(`TrendsDesk local server: http://127.0.0.1:${port}`);
  console.log(configured?'Test Supabase configuration loaded.':'Add SUPABASE_URL and SUPABASE_ANON_KEY to .env.local, then restart.');
});
