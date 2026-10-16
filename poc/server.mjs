import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fault = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const equal = (a,b) => { const aa=Buffer.from(a), bb=Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa,bb); };
const MIME = { '.epub': 'application/epub+zip', '.pdf': 'application/pdf', '.zip': 'application/zip' };
export function makeServer({ port=3333, host='127.0.0.1', baseUrl, secret, filesDir = path.resolve('fixtures'), now=()=>Date.now() }={}) {
  if (!secret || secret.length < 24) throw new Error('POC_SIGNING_SECRET must contain at least 24 characters');
  const getOrigin = () => baseUrl ?? `http://${host}:${server.address()?.port ?? port}`;
  const allowed = new Set(['sample.epub','sample.pdf','sample.zip']);
  const makeToken=(name,expiry)=>createHmac('sha256',secret).update(`${name}:${expiry}`).digest('hex');
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,getOrigin());
      if(req.method==='GET' && url.pathname==='/healthz') return send(res,200,{status:'ok',mode:'poc'});
      if(req.method==='GET' && url.pathname.startsWith('/files/')) {
        const name=url.pathname.slice(7), expiry=Number(url.searchParams.get('exp')), sig=url.searchParams.get('sig')??'';
        if(!allowed.has(name) || !Number.isSafeInteger(expiry) || expiry < Math.floor(now()/1000) || expiry > Math.floor(now()/1000)+900 || !/^[a-f0-9]{64}$/.test(sig) || !equal(sig,makeToken(name,expiry))) return send(res,403,{error:'invalid or expired link'});
        const filename=path.resolve(filesDir,name);
        const info=await stat(filename);
        res.writeHead(200,{'content-type':MIME[path.extname(name)],'content-length':info.size,'content-disposition':`attachment; filename="${name}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});
        createReadStream(filename).pipe(res);return;
      }
      if(req.method!=='POST' || url.pathname!=='/mcp') return send(res,404,{error:'not found'});
      let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>100_000) return send(res,413,{error:'request too large'}); }
      let msg; try{msg=JSON.parse(raw);}catch{return send(res,400,fault(null,-32700,'Parse error'));}
      const {method,params={},id=null}=msg;
      if(method==='initialize') return send(res,200,reply(id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'github-artifact-fetcher-poc',version:'0.1.0-dev001'}}));
      if(method==='notifications/initialized') {res.writeHead(202);return res.end();}
      if(method==='ping') return send(res,200,reply(id,{}));
      if(method==='tools/list') return send(res,200,reply(id,{tools:[{name:'poc_fetch_fixture',description:'DEV-001 only: return an expiring MCP resource_link to a local test binary (NOT a ChatGPT file_id).',inputSchema:{type:'object',properties:{name:{type:'string',enum:[...allowed]}},required:['name'],additionalProperties:false}}]}));
      if(method==='tools/call' && params.name==='poc_fetch_fixture') {
        const name=params.arguments?.name;
        if(!allowed.has(name)) return send(res,200,reply(id,{isError:true,content:[{type:'text',text:'Unknown fixture'}]}));
        const bytes=await readFile(path.resolve(filesDir,name));
        const exp=Math.floor(now()/1000)+300;
        const link=`${getOrigin()}/files/${name}?exp=${exp}&sig=${makeToken(name,exp)}`;
        return send(res,200,reply(id,{content:[{type:'text',text:`Fixture ${name}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}. Resource link is temporary; no ChatGPT file_id is asserted.`},{type:'resource_link',uri:link,name,mimeType:MIME[path.extname(name)],size:bytes.length}],structuredContent:{file_name:name,mime_type:MIME[path.extname(name)],size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),download_url:link}}));
      }
      return send(res,200,fault(id,-32601,'Method not found'));
    } catch(err) {return send(res,500,{error:'internal error'});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  const port=Number(process.env.PORT || 3333),host=process.env.HOST || '127.0.0.1';
  const server=makeServer({port,host,baseUrl:process.env.PUBLIC_BASE_URL,secret:process.env.POC_SIGNING_SECRET,filesDir:path.resolve('fixtures')});
  server.listen(port,host,()=>console.log(`PoC listening at ${host}:${port} (fixtures only)`));
}
