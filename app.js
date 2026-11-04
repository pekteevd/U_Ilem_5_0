import {WORLD_OBJECTS,createInitialState} from "./world-data.js";
import {WorldRenderer} from "./world-renderer.js";
import {loadState,saveState,exportState} from "./persistence.js";

let state=createInitialState(),selectedId=null,renderer=null,saveTimer=null,ollamaReady=false,activeTab="overview";
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(n)+" ₽";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400);}
function selectedObject(){return state.objects.find(o=>o.id===selectedId)||null;}
function renderHeader(){
  $("game-day").textContent=state.meta.day+" · "+state.meta.season;
  $("budget").textContent=money(state.economy.budget);$("reserve").textContent=money(state.economy.reserve);
  $("header-task-count").textContent=state.tasks.filter(t=>t.status!=="done").length;
  $("stock-count").textContent=state.warehouse.length+" категорий";
  $("team-count").textContent=state.characters.length+" участника";
  $("dateLine").textContent="День "+state.meta.day+" · "+state.meta.season;
  $("weatherLabel").textContent=(state.meta.season==="Весна"?"🌱":state.meta.season==="Лето"?"☀":state.meta.season==="Осень"?"🍂":"❄")+" "+state.meta.season+" · сезонный режим";
  $("seasonText").textContent=state.meta.season+" · сезонные работы и состояние территории";
  $("weatherDetail").innerHTML='<div class="tile"><small>Текущий сезон</small><b>'+esc(state.meta.season)+'</b></div><p class="muted">Моделирование погоды и её влияния на работы ещё не подключено.</p>';
}
function renderCommunityAndLog(){
  $("community").innerHTML=state.characters.map(c=>'<div class="row"><span>'+esc(c.name)+' · '+esc(c.role)+'</span><b>Энергия '+c.energy+'%</b></div>').join("")||'<div class="empty-state">Участники пока не добавлены.</div>';
  const events=state.tasks.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,8);
  $("log").innerHTML=events.length?events.map(t=>'<div class="row">'+esc(t.title)+' · '+esc(t.status)+'</div>').join(""):'<div class="empty-state">Событий пока нет. Здесь появится история задач и изменений хозяйства.</div>';
}
function renderSelected(){
  const o=selectedObject();$("object-kind").textContent=o?o.zone:"не выбран";
  $("selected-object").innerHTML=o?`<div class="object-placeholder">${o.icon}</div><h2>${esc(o.name)}</h2><p>${esc(o.description)}</p><div class="object-meta"><div class="meta-cell"><small>Состояние</small><b>${esc(o.state.condition)}</b></div><div class="meta-cell"><small>Статус</small><b>${esc(o.status)}</b></div><div class="meta-cell"><small>Связанные задачи</small><b>${state.tasks.filter(t=>t.objectId===o.id).length}</b></div><div class="meta-cell"><small>Идентификатор</small><b>${o.id}</b></div></div>`:`<div class="object-placeholder">⌖</div><h2>Выбери объект на карте</h2><p>У объекта есть собственное состояние, история, осмотры, этапы и связанные задачи.</p>`;
  $("object-actions").hidden=!o;
  $("task-hint").textContent=o?"Новая задача будет связана с объектом «"+o.name+"».":"Выбери объект на карте, чтобы связать задачу с ним. Ручное добавление не требует Ollama.";
}
function renderTasks(){
  renderHeader();renderCommunityAndLog();
  $("task-count").textContent=state.tasks.length;
  $("header-task-count").textContent=state.tasks.length;
  if(!state.tasks.length){$("task-list").innerHTML='<div class="empty-state">Пока нет задач. Выбери объект и добавь первую.</div>';$("calendar-list").innerHTML='<div class="empty-state">Запланированные задачи появятся здесь.</div>';return;}
  $("task-list").innerHTML=state.tasks.map(t=>`<div class="task-card"><div class="task-main"><b>${esc(t.title)}</b><small>${esc(state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача")} · день ${t.dueDay}</small></div><select data-task-status="${t.id}"><option value="planned" ${t.status==="planned"?"selected":""}>Запланирована</option><option value="in_progress" ${t.status==="in_progress"?"selected":""}>В работе</option><option value="blocked" ${t.status==="blocked"?"selected":""}>Заблокирована</option><option value="done" ${t.status==="done"?"selected":""}>Завершена</option></select></div>`).join("");
  $("calendar-list").innerHTML=[...state.tasks].sort((a,b)=>a.dueDay-b.dueDay).map(t=>`<div class="task-card"><div class="task-main"><b>День ${t.dueDay}: ${esc(t.title)}</b><small>${esc(state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача")}</small></div></div>`).join("");
  document.querySelectorAll("[data-task-status]").forEach(el=>el.addEventListener("change",()=>{const t=state.tasks.find(x=>x.id===el.dataset.taskStatus);if(t){t.status=el.value;t.updatedAt=new Date().toISOString();scheduleSave();renderTasks();}}));
}
function selectObject(id){selectedId=id;renderSelected();renderTab();}
function renderTab(){
  const titles={overview:["Обзор территории","состояние хозяйства"],construction:["Строительство","объекты и состояние"],warehouse:["Склад","остатки и минимальные запасы"],people:["Люди","команда и роли"],garden:["Сад","зелёная зона"],projects:["Проекты","инициативы пространства"],guests:["Гости и события","приём и календарь"],finance:["Финансы","бюджет и резерв"],chronicle:["Хроника","история изменений"]};
  $("tab-title").textContent=titles[activeTab][0];$("tab-caption").textContent=titles[activeTab][1];
  let html="";
  if(activeTab==="overview")html=`<div class="tab-summary"><div class="summary-chip"><b>${state.objects.length}</b><small>объектов на карте</small></div><div class="summary-chip"><b>${state.tasks.length}</b><small>задач в работе</small></div><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>доступный бюджет</small></div><div class="summary-chip"><b>${state.warehouse.length}</b><small>категорий запасов</small></div></div><p>Выбери объект на карте или в списке. Все изменения сохраняются в общей модели мира.</p><div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)}</button>`).join("")}</div>`;
  if(activeTab==="construction")html=`<div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)} · ${esc(o.status)}</button>`).join("")}</div><p>Строительные этапы, осмотры и дефекты будут привязываться к выбранному объекту. Пока доступно создание связанных задач.</p>`;
  if(activeTab==="warehouse")html=`<div class="tab-summary">${state.warehouse.map(r=>`<div class="summary-chip"><b>${r.quantity} ${esc(r.unit)}</b><small>${esc(r.name)} · минимум ${r.minimum}</small></div>`).join("")}</div>`;
  if(activeTab==="people")html=`<div class="tab-summary">${state.characters.map(c=>`<div class="summary-chip"><b>${esc(c.name)}</b><small>${esc(c.role)} · энергия ${c.energy}%</small></div>`).join("")}</div>`;
  if(activeTab==="garden")html='<p>Сад и огород отмечены на карте как единый объект. Сезонные работы, посадки и уход будут добавляться через игровые задачи.</p>';
  if(activeTab==="projects")html='<p>Раздел проектов подготовлен как рабочее пространство для инициатив У Илем. Новые проекты интеллектуальный советник предлагает только по прямому запросу игрока.</p>';
  if(activeTab==="guests")html='<p>Календарь событий пока пуст. Гостевые сценарии и размещение будут подключены к общей модели задач и объектов.</p>';
  if(activeTab==="finance")html=`<div class="tab-summary"><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>бюджет</small></div><div class="summary-chip"><b>${money(state.economy.reserve)}</b><small>неприкосновенный резерв</small></div></div><p>Финансовые операции пока не выполняются автоматически. Любые расходы в дальнейшем потребуют подтверждения игрока.</p>`;
  if(activeTab==="chronicle")html=state.tasks.length?state.tasks.slice().reverse().map(t=>`<div class="summary-chip"><b>${esc(t.title)}</b><small>день ${t.dueDay} · ${esc(t.status)}</small></div>`).join(""):'<p>История хозяйственных событий пока пуста.</p>';
  $("tab-content").innerHTML=html;
  document.querySelectorAll("[data-select-object]").forEach(el=>el.addEventListener("click",()=>selectObject(el.dataset.selectObject)));
}
function renderTabs(){
  document.querySelectorAll("[data-tab]").forEach(el=>el.classList.toggle("active",el.dataset.tab===activeTab));
  renderTab();
}
function addChatMessage(role,name,message,kind=""){
  const row=document.createElement("div");row.className="chat-message "+kind;
  const who=document.createElement("b");who.textContent=name;
  const body=document.createElement("p");body.textContent=message;
  row.append(who,body);$("chat-messages").append(row);$("chat-messages").scrollTop=$("chat-messages").scrollHeight;
}
function newTask(){
  const title=$("task-title").value.trim(),object=selectedObject(),dueDay=Math.max(1,Number($("task-due").value)||1);
  if(!title){toast("Введи название задачи.");$("task-title").focus();return;}
  const task={id:"task-"+crypto.randomUUID(),title,objectId:object?.id||null,source:"manual",ownerId:null,dueDay,priority:"normal",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.tasks.push(task);$("task-title").value="";renderTasks();renderSelected();scheduleSave();toast("Задача добавлена без обращения к Ollama.");
}
async function sendChat(){
  const input=$("chat-input"),message=input.value.trim();if(!message)return;
  if(!ollamaReady){addChatMessage("system","Система","Ollama или модель qwen3:4b недоступна. Командный запрос не отправлен.", "error-message");return;}
  input.value="";addChatMessage("user","Игрок",message,"user-message");
  $("send-chat").disabled=true;$("chat-hint").textContent="Советник анализирует поручение…";
  try{
    const response=await fetch("/api/ollama/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,context:{day:state.meta.day,season:state.meta.season,budget:state.economy.budget,reserve:state.economy.reserve,warehouse:state.warehouse,objects:state.objects.map(o=>({id:o.id,name:o.name,status:o.status,condition:o.state.condition})),tasks:state.tasks.map(t=>({title:t.title,status:t.status,dueDay:t.dueDay,objectId:t.objectId}))}})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Ошибка Ollama");
    addChatMessage("assistant","Интеллектуальный советник",data.message||"Модель вернула пустой ответ.");
  }catch(error){addChatMessage("assistant","Система","Не удалось получить ответ Ollama: "+error.message,"error-message");}
  finally{$("send-chat").disabled=false;$("chat-hint").textContent="Советник анализирует данные игры, но не создаёт задачи, не меняет объекты и не тратит деньги.";input.focus();}
}
function scheduleSave(){
  $("save-state").textContent="Есть изменения…";clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{state.meta.lastSavedAt=new Date().toISOString();const result=await saveState(state);$("save-state").textContent=result.server?"Сохранено":"Локальная копия";$("server-status").textContent=result.server?"доступен":"нет связи";$("local-status").textContent="сохранено";},450);
}
async function checkOllama(){
  try{const r=await fetch("/api/ollama/health");const d=await r.json();ollamaReady=!!(d.available&&d.modelAvailable);const label=ollamaReady?"Ollama · qwen3:4b готова":d.available?"Ollama доступна, qwen3:4b не найдена":"Ollama не подключена";$("ollama-status").textContent=label;$("ollama-status-side").textContent=ollamaReady?"qwen3:4b готова":d.available?"модель не найдена":"не подключена";}
  catch{ollamaReady=false;$("ollama-status").textContent="Ollama не подключена";$("ollama-status-side").textContent="не подключена";}
}
async function init(){
  const loaded=await loadState();if(loaded.state)state=loaded.state;
  renderHeader();renderTasks();renderSelected();renderTabs();
  $("local-status").textContent="готово";$("server-status").textContent=loaded.source==="server"?"загружено":"ожидание";
  await checkOllama();
  renderer=new WorldRenderer($("world-canvas"),$("world-viewport"),selectObject,()=>{});renderer.addObjects(state.objects);
  $("zoom-in").addEventListener("click",()=>renderer.zoomIn());$("zoom-out").addEventListener("click",()=>renderer.zoomOut());$("reset-view").addEventListener("click",()=>renderer.reset());
  $("add-task").addEventListener("click",()=>{$("task-title").focus();$("task-title").scrollIntoView({behavior:"smooth",block:"center"});});
  $("create-task").addEventListener("click",newTask);$("task-title").addEventListener("keydown",e=>{if(e.key==="Enter")newTask();});
  $("focus-object").addEventListener("click",()=>{if(selectedId)renderer.focusObject(selectedId);});
  $("export-save").addEventListener("click",()=>exportState(state));
  document.querySelectorAll("[data-tab]").forEach(el=>el.addEventListener("click",()=>{activeTab=el.dataset.tab;renderTabs();}));
  $("send-chat").addEventListener("click",sendChat);$("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}});
  window.addEventListener("beforeunload",()=>{try{localStorage.setItem("u_ilem_5_0_save_v1",JSON.stringify(state));}catch{}});
  $("save-state").textContent=loaded.source==="server"?"Сохранение загружено":"Новая игра";
}
init().catch(error=>{console.error(error);toast("Ошибка запуска: "+error.message);});
