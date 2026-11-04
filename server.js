const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=__dirname,DATA=path.join(ROOT,"data"),SAVE=path.join(DATA,"savegame.json"),PORT=4175,HOST="127.0.0.1";
fs.mkdirSync(DATA,{recursive:true});
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".txt":"text/plain; charset=utf-8"};
function send(res,status,body,type="application/json; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body);}
function safePath(urlPath){const decoded=decodeURIComponent(urlPath.split("?")[0]);const resolved=path.resolve(ROOT,"."+decoded);return resolved===ROOT||resolved.startsWith(ROOT+path.sep)?resolved:null;}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://"+HOST);
  if(url.pathname==="/api/health"){return send(res,200,JSON.stringify({ok:true,project:"У Илем 5.0"}));}
  if(url.pathname==="/api/save"&&req.method==="GET"){
    if(!fs.existsSync(SAVE))return send(res,404,JSON.stringify({error:"save_not_found"}));
    return send(res,200,fs.readFileSync(SAVE,"utf8"));
  }
  if(url.pathname==="/api/save"&&req.method==="POST"){
    let body="";req.on("data",chunk=>{body+=chunk;if(body.length>5_000_000){req.destroy();}});
    req.on("end",()=>{
      try{
        const state=JSON.parse(body);
        if(state?.schemaVersion!==1||!Array.isArray(state.objects)||!Array.isArray(state.tasks)||!state.economy)throw new Error("invalid_state_schema");
        const temp=SAVE+".tmp";fs.writeFileSync(temp,JSON.stringify({state,savedAt:new Date().toISOString()}),"utf8");
        if(fs.existsSync(SAVE))fs.copyFileSync(SAVE,SAVE+".bak");fs.renameSync(temp,SAVE);
        send(res,200,JSON.stringify({ok:true,savedAt:new Date().toISOString()}));
      }catch(error){send(res,400,JSON.stringify({error:error.message}));}
    });return;
  }
  if(url.pathname==="/api/ollama/health"){
    try{const r=await fetch("http://127.0.0.1:11434/api/tags",{signal:AbortSignal.timeout(1800)});if(!r.ok)throw new Error("ollama_http_"+r.status);const data=await r.json();const models=(data.models||[]).map(x=>x.name);return send(res,200,JSON.stringify({available:true,models,modelAvailable:models.some(x=>x.startsWith("qwen3:4b"))}));}
    catch{return send(res,200,JSON.stringify({available:false,modelAvailable:false}));}
  }
  if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,JSON.stringify({error:"method_not_allowed"}));
  let file=safePath(url.pathname==="/"?"/index.html":url.pathname);if(!file)return send(res,403,"Forbidden","text/plain");
  try{const stat=fs.statSync(file);if(stat.isDirectory())file=path.join(file,"index.html");const ext=path.extname(file).toLowerCase();const content=fs.readFileSync(file);res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Content-Length":content.length,"Cache-Control":ext===".png"?"public, max-age=86400":"no-cache","X-Content-Type-Options":"nosniff"});return req.method==="HEAD"?res.end():res.end(content);}
  catch{return send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,HOST,()=>console.log("У Илем 5.0: http://"+HOST+":"+PORT));
