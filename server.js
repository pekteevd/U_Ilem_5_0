const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=__dirname,DATA=path.join(ROOT,"data"),SAVE=path.join(DATA,"savegame.json"),SAVE_BACKUP=SAVE+".bak",PORT=4175,HOST="127.0.0.1";
const OLLAMA_MODELS=["qwen3:4b","qwen3:1.7b"];
let saveWriteQueue=Promise.resolve();
fs.mkdirSync(DATA,{recursive:true});
const MIME={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".txt":"text/plain; charset=utf-8"};
function send(res,status,body,type="application/json; charset=utf-8"){res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body);}
function safePath(urlPath){const decoded=decodeURIComponent(urlPath.split("?")[0]);const resolved=path.resolve(ROOT,"."+decoded);return resolved===ROOT||resolved.startsWith(ROOT+path.sep)?resolved:null;}
function readBody(req,limit=120000){return new Promise((resolve,reject)=>{let body="";req.on("data",chunk=>{body+=chunk;if(body.length>limit){reject(new Error("request_too_large"));req.destroy();}});req.on("end",()=>resolve(body));req.on("error",reject);});}
function validSavePayload(payload){const state=payload?.state||payload;return !!state&&state.schemaVersion===1&&Array.isArray(state.objects)&&Array.isArray(state.tasks)&&!!state.economy;}
function readValidSave(file){try{if(!fs.existsSync(file))return null;const raw=fs.readFileSync(file,"utf8"),payload=JSON.parse(raw);return validSavePayload(payload)?{raw,payload,state:payload.state||payload}:null;}catch{return null;}}
function compareSaveVersions(incomingState,current){
  const incomingTime=Date.parse(incomingState.meta?.lastSavedAt||"");
  if(!Number.isFinite(incomingTime))return {accept:false,reason:"invalid_save_timestamp"};
  if(!current)return {accept:true};
  const currentTime=Date.parse(current.state.meta?.lastSavedAt||"");
  if(!Number.isFinite(currentTime))return {accept:true};
  const savedAt=current.payload.savedAt||current.state.meta.lastSavedAt;
  if(incomingTime<currentTime)return {accept:false,reason:"stale_save_rejected",savedAt};
  if(incomingTime===currentTime){
    if(JSON.stringify(incomingState)===JSON.stringify(current.state))return {accept:true,idempotent:true,savedAt};
    return {accept:false,reason:"stale_save_rejected",savedAt};
  }
  return {accept:true};
}
async function ollamaHealth(){
  const r=await fetch("http://127.0.0.1:11434/api/tags",{signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error("ollama_http_"+r.status);
  const data=await r.json(),models=(data.models||[]).map(x=>x.name);
  const selectedModel=OLLAMA_MODELS.find(wanted=>models.some(x=>x===wanted||x.startsWith(wanted+":")))||null;
  return {available:true,models,modelAvailable:!!selectedModel,selectedModel,primaryModel:OLLAMA_MODELS[0],fallbackModel:OLLAMA_MODELS[1]};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://"+HOST);
  if(url.pathname==="/api/health")return send(res,200,JSON.stringify({ok:true,project:"У Илем 5.0"}));
  if(url.pathname==="/api/save"&&req.method==="GET"){
    const primary=readValidSave(SAVE);
    if(primary)return send(res,200,primary.raw);
    const backup=readValidSave(SAVE_BACKUP);
    if(backup){
      try{
        fs.copyFileSync(SAVE_BACKUP,SAVE);
      }catch(error){console.error("Save backup recovery could not replace the primary file:",error);}
      return send(res,200,backup.raw);
    }
    if(!fs.existsSync(SAVE)&&!fs.existsSync(SAVE_BACKUP))return send(res,404,JSON.stringify({error:"save_not_found"}));
    return send(res,500,JSON.stringify({error:"save_and_backup_invalid"}));
  }
  if(url.pathname==="/api/save"&&req.method==="POST"){
    let state;
    try{
      const body=await readBody(req,5_000_000);
      state=JSON.parse(body);
      if(!validSavePayload(state))throw new Error("invalid_state_schema");
      if(!Number.isFinite(Date.parse(state.meta?.lastSavedAt||"")))throw new Error("invalid_save_timestamp");
    }catch(error){
      return send(res,error.message==="request_too_large"?413:400,JSON.stringify({error:error.message}));
    }

    // Serialize comparison, backup rotation and replacement as one operation.
    const persist=saveWriteQueue.catch(()=>{}).then(()=>{
      const current=readValidSave(SAVE)||readValidSave(SAVE_BACKUP);
      const versionCheck=compareSaveVersions(state,current);
      if(!versionCheck.accept){
        const error=new Error(versionCheck.reason);
        error.savedAt=versionCheck.savedAt||null;
        throw error;
      }
      if(versionCheck.idempotent)return {ok:true,savedAt:versionCheck.savedAt,idempotent:true};
      const savedAt=new Date().toISOString();
      const temp=SAVE+".tmp";
      fs.writeFileSync(temp,JSON.stringify({state,savedAt}),"utf8");
      if(readValidSave(SAVE))fs.copyFileSync(SAVE,SAVE_BACKUP);
      else if(!readValidSave(SAVE_BACKUP)&&fs.existsSync(SAVE))console.warn("Existing save is invalid; no damaged backup was created.");
      fs.renameSync(temp,SAVE);
      return {ok:true,savedAt};
    });
    saveWriteQueue=persist;
    try{
      return send(res,200,JSON.stringify(await persist));
    }catch(error){
      if(error.message==="stale_save_rejected")return send(res,409,JSON.stringify({error:error.message,savedAt:error.savedAt||null}));
      console.error("Save write failed:",error);
      return send(res,500,JSON.stringify({error:"save_write_failed"}));
    }
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
      if(!health.modelAvailable)return send(res,503,JSON.stringify({error:"В Ollama не найдена ни основная qwen3:4b, ни резервная qwen3:1.7b. Загрузите одну из моделей и повторите запрос."}));
      const context=JSON.stringify(payload.context||{}).slice(0,18000);
      const system="Ты интеллектуальный советник игры «У Илем». Отвечай по-русски, кратко и предметно. Анализируй только факты из переданного состояния. Явно разделяй факты, предположения и рекомендации. Не выдумывай повреждения, запасы, навыки, сроки или события. Если данных недостаточно, прямо скажи об этом. Можешь оценивать поручение, риски, ресурсы, бюджет, сроки и предлагать варианты исполнителей и плана. Ты не имеешь права создавать задачи, назначать людей, менять состояние объектов, совершать покупки или тратить деньги. Не утверждай, что совершил игровые действия. Новые проекты предлагай только если игрок прямо об этом просит. Все игровые изменения требуют отдельного подтверждения игрока. Текущее состояние игры в JSON: "+context;
      const response=await fetch("http://127.0.0.1:11434/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:health.selectedModel,stream:false,keep_alive:"5m",messages:[{role:"system",content:system},{role:"user",content:message}],options:{num_ctx:4096,temperature:0.25}}),signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error("ollama_http_"+response.status);
      const data=await response.json(),answer=String(data.message?.content||"").replace(/<think>[\s\S]*?<\/think>/g,"").trim();
      if(!answer)throw new Error("Модель вернула пустой ответ.");
      return send(res,200,JSON.stringify({ok:true,model:health.selectedModel,message:answer}));
    }catch(error){return send(res,502,JSON.stringify({error:error.name==="TimeoutError"?"Ollama не ответила за отведённое время.":error.message}));}
  }
  if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,JSON.stringify({error:"method_not_allowed"}));
  let file=safePath(url.pathname==="/"?"/index.html":url.pathname);if(!file)return send(res,403,"Forbidden","text/plain");
  try{const stat=fs.statSync(file);if(stat.isDirectory())file=path.join(file,"index.html");const ext=path.extname(file).toLowerCase();const content=fs.readFileSync(file);res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Content-Length":content.length,"Cache-Control":ext===".png"?"public, max-age=86400":"no-cache","X-Content-Type-Options":"nosniff"});return req.method==="HEAD"?res.end():res.end(content);}
  catch{return send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,HOST,()=>console.log("У Илем 5.0: http://"+HOST+":"+PORT));
