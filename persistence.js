const LOCAL_KEY="u_ilem_5_0_save_v1";
let saveQueue=Promise.resolve();
let saveConflict=false;

function valid(state){
  return !!state&&state.schemaVersion===1&&Array.isArray(state.objects)&&Array.isArray(state.tasks)&&!!state.economy;
}

function unpack(payload){
  if(!payload||typeof payload!=="object")return null;
  const state=payload.state||payload;
  if(!valid(state))return null;
  const savedAt=payload.state&&typeof payload.savedAt==="string"?payload.savedAt:(state.meta?.lastSavedAt||null);
  const time=savedAt?Date.parse(savedAt):0;
  return {state,savedAt,time:Number.isFinite(time)?time:0};
}

export async function loadState(){
  let serverSave=null,localSave=null;
  try{
    const response=await fetch("/api/save",{cache:"no-store"});
    if(response.ok)serverSave=unpack(await response.json());
  }catch(error){console.warn("Server save unavailable:",error);}
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    if(raw)localSave=unpack(JSON.parse(raw));
  }catch(error){console.warn("Local save unavailable:",error);}
  if(serverSave&&localSave){
    // Prefer the newest known snapshot. This recovers a newer browser copy if the
    // server was unavailable during the last save.
    return serverSave.time>=localSave.time
      ?{state:serverSave.state,source:"server"}
      :{state:localSave.state,source:"browser"};
  }
  if(serverSave)return {state:serverSave.state,source:"server"};
  if(localSave)return {state:localSave.state,source:"browser"};
  return {state:null,source:"new"};
}

export async function saveState(state){
  if(saveConflict)return {ok:false,server:false,local:false,conflict:true,error:"stale_save_rejected"};
  if(!valid(state))return {ok:false,server:false,local:false,error:"invalid_state_schema"};
  const savedAt=new Date().toISOString();
  if(state.meta)state.meta.lastSavedAt=savedAt;
  const snapshot=JSON.stringify(state);
  let local=false;
  try{localStorage.setItem(LOCAL_KEY,JSON.stringify({state,savedAt}));local=true;}
  catch(error){console.warn("Local save failed:",error);}
  const request=saveQueue.catch(()=>{}).then(async()=>{
    const response=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:snapshot});
    if(!response.ok){
      let details={};
      try{details=await response.json();}catch{}
      const error=new Error(details.error||("HTTP "+response.status));
      error.status=response.status;error.details=details;
      throw error;
    }
    const result=await response.json();
    return result;
  });
  saveQueue=request;
  try{await request;return {ok:true,server:true,local,savedAt};}
  catch(error){
    console.warn("Server save failed:",error);
    if(error.status===409)saveConflict=true;
    return {ok:local,server:false,local,conflict:error.status===409,error:error.message,serverSavedAt:error.details?.savedAt||null,savedAt};
  }
}

export function exportState(state){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="u-ilem-5-save.json";a.click();URL.revokeObjectURL(url);
}