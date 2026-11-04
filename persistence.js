const LOCAL_KEY="u_ilem_5_0_save_v1";
let saveQueue=Promise.resolve();

function valid(state){
  return !!state&&state.schemaVersion===1&&Array.isArray(state.objects)&&Array.isArray(state.tasks)&&!!state.economy;
}

export async function loadState(){
  try{
    const response=await fetch("/api/save",{cache:"no-store"});
    if(response.ok){
      const payload=await response.json();
      const state=payload?.state||payload;
      if(valid(state))return {state,source:"server"};
    }
  }catch(error){console.warn("Server save unavailable:",error);}
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    if(raw){const state=JSON.parse(raw);if(valid(state))return {state,source:"browser"};}
  }catch(error){console.warn("Local save unavailable:",error);}
  return {state:null,source:"new"};
}

export async function saveState(state){
  if(!valid(state))return {ok:false,server:false,local:false,error:"invalid_state_schema"};
  const snapshot=JSON.stringify(state);
  let local=false;
  try{localStorage.setItem(LOCAL_KEY,snapshot);local=true;}
  catch(error){console.warn("Local save failed:",error);}
  const request=saveQueue.catch(()=>{}).then(async()=>{
    const response=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:snapshot});
    if(!response.ok)throw new Error("HTTP "+response.status);
  });
  saveQueue=request;
  try{await request;return {ok:true,server:true,local};}
  catch(error){console.warn("Server save failed:",error);return {ok:local,server:false,local,error:error.message};}
}

export function exportState(state){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="u-ilem-5-save.json";a.click();URL.revokeObjectURL(url);
}