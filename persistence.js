const LOCAL_KEY="u_ilem_5_0_save_v1";
export async function loadState(){
  try{
    const response=await fetch("/api/save",{cache:"no-store"});
    if(response.ok){
      const payload=await response.json();
      if(payload?.state?.schemaVersion===1)return {state:payload.state,source:"server"};
    }
  }catch(error){console.warn("Server save unavailable:",error);}
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    if(raw){const state=JSON.parse(raw);if(state?.schemaVersion===1)return {state,source:"browser"};}
  }catch(error){console.warn("Local save is damaged:",error);}
  return {state:null,source:"new"};
}
export async function saveState(state){
  const snapshot=JSON.stringify(state);
  localStorage.setItem(LOCAL_KEY,snapshot);
  try{
    const response=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:snapshot});
    if(!response.ok)throw new Error("HTTP "+response.status);
    return {ok:true,server:true};
  }catch(error){
    console.warn("Server save failed; local backup kept:",error);
    return {ok:true,server:false,error:error.message};
  }
}
export function exportState(state){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download="u-ilem-5-save.json";a.click();URL.revokeObjectURL(url);
}
