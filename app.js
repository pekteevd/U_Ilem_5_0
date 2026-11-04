import {WORLD_OBJECTS,createInitialState} from "./world-data.js";
import {WorldRenderer} from "./world-renderer.js";
import {loadState,saveState,exportState} from "./persistence.js";

let state=createInitialState(),selectedId=null,renderer=null,saveTimer=null;
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(n)+" ₽";
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400);}
function selectedObject(){return state.objects.find(o=>o.id===selectedId)||null;}
function renderHeader(){
  $("game-day").textContent=state.meta.day+" · "+state.meta.season;
  $("budget").textContent=money(state.economy.budget);$("reserve").textContent=money(state.economy.reserve);
}
function renderObjects(){
  $("object-list").innerHTML=state.objects.map(o=>`<div class="object-row ${o.id===selectedId?"active":""}" data-object="${o.id}"><span class="object-icon">${o.icon}</span><span>${escapeHtml(o.name)}<small>${escapeHtml(o.zone)}</small></span></div>`).join("");
  document.querySelectorAll("[data-object]").forEach(el=>el.addEventListener("click",()=>selectObject(el.dataset.object)));
}
function renderResources(){
  $("resource-list").innerHTML=state.warehouse.map(r=>`<div class="resource-row"><span>${escapeHtml(r.name)}</span><b>${r.quantity} ${escapeHtml(r.unit)}</b></div>`).join("");
}
function renderSelected(){
  const o=selectedObject();$("object-kind").textContent=o?o.zone:"не выбран";
  $("selected-object").innerHTML=o?`<div class="object-placeholder">${o.icon}</div><h2>${escapeHtml(o.name)}</h2><p>${escapeHtml(o.description)}</p><div class="object-meta"><div class="meta-cell"><small>Состояние</small><b>${escapeHtml(o.state.condition)}</b></div><div class="meta-cell"><small>Статус</small><b>${escapeHtml(o.status)}</b></div><div class="meta-cell"><small>Связанные задачи</small><b>${state.tasks.filter(t=>t.objectId===o.id).length}</b></div><div class="meta-cell"><small>Идентификатор</small><b>${o.id}</b></div></div>`:`<div class="object-placeholder">⌖</div><h2>Выбери объект на карте</h2><p>У каждого объекта будет собственное состояние, история, осмотры, этапы и связанные задачи.</p>`;
  $("object-actions").hidden=!o;$("task-hint").textContent=o?"Новая задача автоматически свяжется с объектом «"+o.name+"».":"Сначала выбери объект, чтобы связать задачу с ним.";
}
function renderTasks(){
  $("task-count").textContent=state.tasks.length;
  if(!state.tasks.length){$("task-list").innerHTML='<div class="empty-state">Пока нет задач. Выбери объект и добавь первую.</div>';$("calendar-list").innerHTML='<div class="empty-state">Запланированные задачи появятся здесь.</div>';return;}
  $("task-list").innerHTML=state.tasks.map(t=>`<div class="task-card"><div class="task-main"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(state.objects.find(o=>o.id===t.objectId)?.name||"Без объекта")} · день ${t.dueDay}</small></div><select data-task-status="${t.id}"><option value="planned" ${t.status==="planned"?"selected":""}>Запланирована</option><option value="in_progress" ${t.status==="in_progress"?"selected":""}>В работе</option><option value="blocked" ${t.status==="blocked"?"selected":""}>Заблокирована</option><option value="done" ${t.status==="done"?"selected":""}>Завершена</option></select></div>`).join("");
  $("calendar-list").innerHTML=[...state.tasks].sort((a,b)=>a.dueDay-b.dueDay).map(t=>`<div class="task-card"><div class="task-main"><b>День ${t.dueDay}: ${escapeHtml(t.title)}</b><small>${escapeHtml(state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача")}</small></div></div>`).join("");
  document.querySelectorAll("[data-task-status]").forEach(el=>el.addEventListener("change",()=>{const t=state.tasks.find(x=>x.id===el.dataset.taskStatus);if(t){t.status=el.value;t.updatedAt=new Date().toISOString();scheduleSave();renderTasks();}}));
}
function selectObject(id){selectedId=id;renderObjects();renderSelected();$("task-title").focus({preventScroll:true});}
function newTask(){
  const title=$("task-title").value.trim(),object=selectedObject(),dueDay=Math.max(1,Number($("task-due").value)||1);
  if(!title){toast("Введи название задачи.");$("task-title").focus();return;}
  const task={id:"task-"+crypto.randomUUID(),title,objectId:object?.id||null,source:"manual",ownerId:null,dueDay,priority:"normal",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.tasks.push(task);$("task-title").value="";renderTasks();renderSelected();scheduleSave();toast("Задача добавлена в общий список и календарь.");
}
function scheduleSave(){
  $("save-state").textContent="Есть изменения…";
  clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{state.meta.lastSavedAt=new Date().toISOString();const result=await saveState(state);$("save-state").textContent=result.server?"Сохранено":"Локальная копия";$("server-status").textContent=result.server?"доступен":"нет связи";$("local-status").textContent="сохранено";},450);
}
async function init(){
  const loaded=await loadState();if(loaded.state)state=loaded.state;
  renderHeader();renderObjects();renderResources();renderTasks();renderSelected();
  $("local-status").textContent="готово";$("server-status").textContent=loaded.source==="server"?"загружено":"ожидание";
  try{const r=await fetch("/api/ollama/health");const d=await r.json();$("ollama-status").textContent=d.available?(d.modelAvailable?"модель готова":"Ollama доступна"):"не подключена";}catch{$("ollama-status").textContent="не подключена";}
  renderer=new WorldRenderer($("world-canvas"),$("world-viewport"),selectObject,()=>{});
  renderer.addObjects(state.objects);
  $("zoom-in").addEventListener("click",()=>renderer.zoomIn());$("zoom-out").addEventListener("click",()=>renderer.zoomOut());$("reset-view").addEventListener("click",()=>renderer.reset());
  $("add-task").addEventListener("click",()=>{$("task-title").focus();$("task-title").scrollIntoView({behavior:"smooth",block:"center"});});
  $("create-task").addEventListener("click",newTask);$("task-title").addEventListener("keydown",e=>{if(e.key==="Enter")newTask();});
  $("focus-object").addEventListener("click",()=>{if(selectedId)renderer.focusObject(selectedId);});
  $("export-save").addEventListener?.("click",()=>exportState(state));
  window.addEventListener("beforeunload",()=>{try{localStorage.setItem("u_ilem_5_0_save_v1",JSON.stringify(state));}catch{}});
  $("save-state").textContent=loaded.source==="server"?"Сохранение загружено":"Новая игра";
}
init().catch(error=>{console.error(error);toast("Ошибка запуска: "+error.message);});
