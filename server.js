const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=__dirname,DATA=path.join(ROOT,"data"),SAVE=path.join(DATA,"savegame.json"),PORT=4175,HOST="127.0.0.1";
const OLLAMA_MODEL="qwen3:4b";
fs.mkdirSync(DATA,{recursive:true});
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".txt":"text/plain; charset=utf-8"};
function send(res,status,body,type="application/json; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body);}
function safePath(urlPath){const decoded=decodeURIComponent(urlPath.split("?")[0]);const resolved=path.resolve(ROOT,"."+decoded);return resolved===ROOT||resolved.startsWith(ROOT+path.sep)?resolved:null;}
function readBody(req,limit=120000){return new Promise((resolve,reject)=>{let body="";req.on("data",chunk=>{body+=chunk;if(body.length>limit){reject(new Error("request_too_large"));req.destroy();}});req.on("end",()=>resolve(body));req.on("error",reject);});}
async function ollamaHealth(){
  const r=await fetch("http://127.0.0.1:11434/api/tags",{signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error("ollama_http_"+r.status);
  const data=await r.json(),models=(data.models||[]).map(x=>x.name);
  return {available:true,models,modelAvailable:models.some(x=>x===OLLAMA_MODEL||x.startsWith(OLLAMA_MODEL+":"))};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://"+HOST);
  if(url.pathname==="/api/health")return send(res,200,JSON.stringify({ok:true,project:"У Илем 5.0"}));
  if(url.pathname==="/api/save"&&req.method==="GET"){
    if(!fs.existsSync(SAVE))return send(res,404,JSON.stringify({error:"save_not_found"}));
    return send(res,200,fs.readFileSync(SAVE,"utf8"));
  }
  if(url.pathname==="/api/save"&&req.method==="POST"){
    try{
      const body=await readBody(req,5_000_000),state=JSON.parse(body);
      if(state?.schemaVersion!==1||!Array.isArray(state.objects)||!Array.isArray(state.tasks)||!state.economy)throw new Error("invalid_state_schema");
      const temp=SAVE+".tmp";fs.writeFileSync(temp,JSON.stringify({state,savedAt:new Date().toISOString()}),"utf8");
      if(fs.existsSync(SAVE))fs.copyFileSync(SAVE,SAVE+".bak");fs.renameSync(temp,SAVE);
      return send(res,200,JSON.stringify({ok:true,savedAt:new Date().toISOString()}));
    }catch(error){return send(res,error.message==="request_too_large"?413:400,JSON.stringify({error:error.message}));}
  }
  if(url.pathname==="/api/ollama/health"){
    try{return send(res,200,JSON.stringify(await ollamaHealth()));}
    catch{return send(res,200,JSON.stringify({available:false,modelAvailable:false,models:[]}));}
  }
  if(url.pathname==="/api/ollama/chat"&&req.method==="POST"){
    try{
      const payload=JSON.parse(await readBody(req,120000)),message=String(payload.message||"").trim();
      if(!message)return send(res,400,JSON.stringify({error:"empty_message"}));
      if(message.length>6000)return send(res,413,JSON.stringify({error:"message_too_long"}));
      const health=await ollamaHealth();
      if(!health.modelAvailable)return send(res,503,JSON.stringify({error:"Модель qwen3:4b не найдена в Ollama. Загрузите её локально и повторите запрос."}));
      const context=JSON.stringify(payload.context||{}).slice(0,18000);
      const system="Ты интеллектуальный советник игры «У Илем». Отвечай по-русски, кратко и предметно. Анализируй только факты из переданного состояния. Явно разделяй факты, предположения и рекомендации. Не выдумывай повреждения, запасы, навыки, сроки или события. Если данных недостаточно, прямо скажи об этом. Можешь оценивать поручение, риски, ресурсы, бюджет, сроки и предлагать варианты исполнителей и плана. Ты не имеешь права создавать задачи, назначать людей, менять состояние объектов, совершать покупки или тратить деньги. Не утверждай, что совершил игровые действия. Новые проекты предлагай только если игрок прямо об этом просит. Все игровые изменения требуют отдельного подтверждения игрока. Текущее состояние игры в JSON: "+context;
      const response=await fetch("http://127.0.0.1:11434/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:OLLAMA_MODEL,stream:false,keep_alive:"5m",messages:[{role:"system",content:system},{role:"user",content:message}],options:{num_ctx:4096,temperature:0.25}}),signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error("ollama_http_"+response.status);
      const data=await response.json(),answer=String(data.message?.content||"").replace(/<think>[\s\S]*?<\/think>/g,"").trim();
      if(!answer)throw new Error("Модель вернула пустой ответ.");
      return send(res,200,JSON.stringify({ok:true,model:OLLAMA_MODEL,message:answer}));
    }catch(error){return send(res,502,JSON.stringify({error:error.name==="TimeoutError"?"Ollama не ответила за отведённое время.":error.message}));}
  }
  if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,JSON.stringify({error:"method_not_allowed"}));
  let file=safePath(url.pathname==="/"?"/index.html":url.pathname);if(!file)return send(res,403,"Forbidden","text/plain");
  try{const stat=fs.statSync(file);if(stat.isDirectory())file=path.join(file,"index.html");const ext=path.extname(file).toLowerCase();const content=fs.readFileSync(file);res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Content-Length":content.length,"Cache-Control":ext===".png"?"public, max-age=86400":"no-cache","X-Content-Type-Options":"nosniff"});return req.method==="HEAD"?res.end():res.end(content);}
  catch{return send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,HOST,()=>console.log("У Илем 5.0: http://"+HOST+":"+PORT));
