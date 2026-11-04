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
  $("header-task-count").textContent=state.tasks.filter(t=>t.status!=="done").length;
  if(!state.tasks.length){
    $("task-list").innerHTML='<div class="empty-state">Пока нет задач. Выбери объект и добавь первую.</div>';
    $("calendar-list").innerHTML='<div class="empty-state">Запланированные задачи появятся здесь.</div>';
  }else{
    const peopleOptions=ownerId=>'<option value="">Не назначен</option>'+state.characters.map(c=>'<option value="'+esc(c.id)+'" '+(ownerId===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join("");
    $("task-list").innerHTML=state.tasks.map(t=>{
      const objectName=state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача";
      return '<div class="task-card"><div class="task-main"><b>'+esc(t.title)+'</b><small>'+esc(objectName)+' · день '+t.dueDay+'</small><div class="task-controls"><label>Исполнитель <select data-task-owner="'+esc(t.id)+'">'+peopleOptions(t.ownerId)+'</select></label><label>Статус <select data-task-status="'+esc(t.id)+'"><option value="planned" '+(t.status==="planned"?"selected":"")+'>Запланирована</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>В работе</option><option value="blocked" '+(t.status==="blocked"?"selected":"")+'>Заблокирована</option><option value="done" '+(t.status==="done"?"selected":"")+'>Завершена</option></select></label></div></div></div>';
    }).join("");
    $("calendar-list").innerHTML=[...state.tasks].sort((a,b)=>a.dueDay-b.dueDay).map(t=>'<div class="task-card"><div class="task-main"><b>День '+t.dueDay+': '+esc(t.title)+'</b><small>'+esc(state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача")+'</small></div></div>').join("");
    document.querySelectorAll("[data-task-status]").forEach(el=>el.addEventListener("change",()=>{
      const t=state.tasks.find(x=>x.id===el.dataset.taskStatus);
      if(t){if(el.value==="in_progress"&&t.ownerId&&state.tasks.some(x=>x.id!==t.id&&x.ownerId===t.ownerId&&x.status==="in_progress")){toast("Этот участник уже выполняет другую задачу.");renderTasks();return;}t.status=el.value;t.updatedAt=new Date().toISOString();const stage=(state.buildStages||[]).find(x=>x.id===t.stageId);if(stage){stage.status=el.value==="done"?"done":el.value==="in_progress"?"in_progress":el.value==="blocked"?"blocked":"planned";stage.progress=el.value==="done"?100:el.value==="in_progress"?50:0;}scheduleSave();renderTasks();renderSelected();renderTab();}
    }));
    document.querySelectorAll("[data-task-owner]").forEach(el=>el.addEventListener("change",()=>{
      const t=state.tasks.find(x=>x.id===el.dataset.taskOwner);
      if(t){const nextOwner=el.value||null;if(t.status==="in_progress"&&nextOwner&&state.tasks.some(x=>x.id!==t.id&&x.ownerId===nextOwner&&x.status==="in_progress")){toast("Этот участник уже выполняет другую задачу.");renderTasks();return;}t.ownerId=nextOwner;t.updatedAt=new Date().toISOString();scheduleSave();syncVisibleCharacters();renderSelected();}
    }));
  }
  syncVisibleCharacters();
}
function syncVisibleCharacters(){
  if(renderer?.syncCharacters)renderer.syncCharacters(state.characters,state.tasks,state.objects);
}
function addStageForSelected(){
  const o=selectedObject();if(!o){toast("Выбери объект на карте перед добавлением этапа.");return;}
  const title=window.prompt("Название этапа работ", "Новый этап: "+o.name);if(!title||!title.trim())return;
  const stage={id:"stage-"+crypto.randomUUID(),objectId:o.id,title:title.trim(),description:"Уточнить состав и результат работ.",status:"planned",progress:0,workHours:4,cost:0,requiredMaterials:[],taskId:null};
  state.buildStages=state.buildStages||[];state.buildStages.push(stage);scheduleSave();renderSelected();renderTab();toast("Этап добавлен.");
}
function createTaskFromStage(stageId){
  const stage=(state.buildStages||[]).find(s=>s.id===stageId);if(!stage||stage.taskId)return;
  const task={id:"task-"+crypto.randomUUID(),title:stage.title,objectId:stage.objectId,stageId:stage.id,source:"construction",ownerId:null,dueDay:state.meta.day+1,priority:"normal",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.tasks.push(task);stage.taskId=task.id;scheduleSave();renderTasks();renderSelected();renderTab();toast("Этап добавлен на общую доску задач.");
}
function selectObject(id){selectedId=id;renderSelected();renderTab();}
function processWarehouseForm(form){const item=state.warehouse.find(x=>x.id===form.elements.item.value),action=form.elements.action.value,qty=Number(form.elements.quantity.value),price=Number(form.elements.unitCost.value)||0;if(!item||!Number.isFinite(qty)||qty<=0){toast("Укажи корректное количество.");return;}let total=0;if(action==="purchase"){total=Math.round(qty*price);if(price<=0){toast("Укажи цену закупки.");return;}if(total>state.economy.budget){toast("Недостаточно средств. Резерв не затрагивается.");return;}item.quantity+=qty;state.economy.budget-=total;state.transactions.unshift({id:"txn-"+crypto.randomUUID(),type:"expense",description:"Закупка: "+item.name,amount:total,createdAt:new Date().toISOString()});}else{if(qty>item.quantity){toast("Недостаточно материала на складе.");return;}item.quantity-=qty;}state.movements.unshift({id:"mov-"+crypto.randomUUID(),itemId:item.id,itemName:item.name,type:action==="purchase"?"in":"out",quantity:qty,unit:item.unit,total,createdAt:new Date().toISOString()});scheduleSave();renderHeader();renderTab();toast("Операция склада проведена.");}
function processFinanceForm(form){const type=form.elements.type.value,amount=Math.round(Number(form.elements.amount.value)),description=form.elements.description.value.trim();if(!Number.isFinite(amount)||amount<=0||!description){toast("Проверь сумму и назначение.");return;}if(type==="expense"&&amount>state.economy.budget){toast("Недостаточно средств. Резерв защищён.");return;}if(type==="expense")state.economy.budget-=amount;else state.economy.budget+=amount;state.transactions.unshift({id:"txn-"+crypto.randomUUID(),type,description,amount,createdAt:new Date().toISOString(),source:"manual"});scheduleSave();renderHeader();renderTab();toast("Финансовая операция записана.");}
function renderTab(){
  const titles={overview:["Обзор территории","состояние хозяйства"],construction:["Строительство","объекты и состояние"],warehouse:["Склад","остатки и минимальные запасы"],people:["Люди","команда и роли"],garden:["Сад","зелёная зона"],projects:["Проекты","инициативы пространства"],guests:["Гости и события","приём и календарь"],finance:["Финансы","бюджет и резерв"],chronicle:["Хроника","история изменений"],calendar:["Календарь","планирование по игровым дням"],territory:["Территория","участки и размещение"],engineering:["Инженерия","вода, электричество и отопление"],experts:["Специалисты","внешние специалисты и приглашения"]};
  $("tab-title").textContent=titles[activeTab][0];$("tab-caption").textContent=titles[activeTab][1];
  let html="";
  if(activeTab==="overview")html=`<div class="tab-summary"><div class="summary-chip"><b>${state.objects.length}</b><small>объектов на карте</small></div><div class="summary-chip"><b>${state.tasks.length}</b><small>задач в работе</small></div><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>доступный бюджет</small></div><div class="summary-chip"><b>${state.warehouse.length}</b><small>категорий запасов</small></div></div><p>Выбери объект на карте или в списке. Все изменения сохраняются в общей модели мира.</p><div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)}</button>`).join("")}</div>`;
  if(activeTab==="construction")html=`<div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)} · ${esc(o.status)}</button>`).join("")}</div><div class="stage-list">${(state.buildStages||[]).map(s=>{const o=state.objects.find(x=>x.id===s.objectId);return `<div class="stage-card"><div><b>${esc(s.title)}</b><small>${esc(o?.name||"Объект")} · ${s.workHours} ч · ${s.progress}%</small><div class="progress-track"><i style="width:${s.progress}%"></i></div></div><button data-stage-task="${esc(s.id)}" ${s.taskId?"disabled":""}>${s.taskId?"Задача создана":"Создать задачу"}</button></div>`}).join("")}</div><div class="actions"><button id="add-stage">＋ Новый этап для выбранного объекта</button></div><p>Этапы связаны с объектами и общей доской задач. Осмотр не предполагает заранее наличие дефектов.</p>`;
  if(activeTab==="warehouse")html=`<form id="warehouse-form" class="operation-form"><label>Материал <select name="item">${state.warehouse.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${r.quantity} ${esc(r.unit)}</option>`).join("")}</select></label><label>Операция <select name="action"><option value="purchase">Закупить</option><option value="use">Списать</option></select></label><label>Количество <input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>Цена за единицу, ₽ <input name="unitCost" type="number" min="0" step="1" value="100"></label><button type="submit">Провести</button></form><div class="tab-summary">${state.warehouse.map(r=>`<div class="summary-chip"><b>${r.quantity} ${esc(r.unit)}</b><small>${esc(r.name)} · минимум ${r.minimum} · ${r.quantity<r.minimum?"ниже минимума":"норма"}</small></div>`).join("")}</div><h3>Движения склада</h3>${(state.movements||[]).slice(0,12).map(m=>`<div class="movement-row">${m.type==="in"?"＋":"−"} ${esc(m.itemName)} · ${m.quantity} ${esc(m.unit)}</div>`).join("")||"<p>Операций пока нет.</p>"}`;
  if(activeTab==="people")html=`<div class="tab-summary">${state.characters.map(c=>`<div class="summary-chip"><b>${esc(c.name)}</b><small>${esc(c.role)} · энергия ${c.energy}%</small></div>`).join("")}</div>`;
  if(activeTab==="garden")html='<p>Сад и огород отмечены на карте как единый объект. Сезонные работы, посадки и уход будут добавляться через игровые задачи.</p>';
  if(activeTab==="projects")html='<p>Раздел проектов подготовлен как рабочее пространство для инициатив У Илем. Новые проекты интеллектуальный советник предлагает только по прямому запросу игрока.</p>';
  if(activeTab==="guests")html='<p>Календарь событий пока пуст. Гостевые сценарии и размещение будут подключены к общей модели задач и объектов.</p>';
  if(activeTab==="finance")html=`<div class="tab-summary"><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>доступный бюджет</small></div><div class="summary-chip"><b>${money(state.economy.reserve)}</b><small>неприкосновенный резерв</small></div></div><form id="finance-form" class="operation-form"><label>Тип <select name="type"><option value="expense">Расход</option><option value="income">Поступление</option></select></label><label>Сумма, ₽ <input name="amount" type="number" min="1" step="1" required></label><label>Назначение <input name="description" maxlength="120" required></label><button type="submit">Записать</button></form><h3>Журнал операций</h3>${(state.transactions||[]).slice(0,30).map(t=>`<div class="movement-row">${t.type==="income"?"＋":"−"} ${esc(t.description)} · ${money(t.amount)}</div>`).join("")||"<p>Операций пока нет.</p>"}`;
  if(activeTab==="calendar")html=`<div class="tab-summary"><div class="summary-chip"><b>День ${state.meta.day}</b><small>текущий игровой день</small></div><div class="summary-chip"><b>${esc(state.meta.season)}</b><small>сезон</small></div></div><div class="object-list"><button class="object-chip" id="calendar-next-day">Следующий день →</button><button class="object-chip" id="calendar-next-month">Завершить месяц →</button></div><p>Календарь показывает сроки задач. Переход времени не выполняет работы автоматически.</p>`;
  if(activeTab==="territory")html=`<div class="object-list">${state.objects.map(o=>`<button class="object-chip" data-select-object="${o.id}">${o.icon} ${esc(o.name)} · ${esc(o.zone)}</button>`).join("")}</div><p>Участки и объекты территории. Размещение новых построек пока требует отдельной механики и подтверждения.</p>`;
  if(activeTab==="engineering")html='<div class="tab-summary"><div class="summary-chip"><b>Электричество</b><small>Подключение есть, параметры требуют обследования</small></div><div class="summary-chip"><b>Вода</b><small>Колодец, насос и разводка требуют инвентаризации</small></div><div class="summary-chip"><b>Стоки</b><small>Локальные решения, состояние не оценено</small></div><div class="summary-chip"><b>Отопление</b><small>Индивидуально по зданиям</small></div></div>';
  if(activeTab==="experts")html='<p>Каталог внешних специалистов: плотник, кровельщик, электрик, сантехник, агроном и специалисты по саду. Ставки и доступность не заданы, поэтому расходы не рассчитываются.</p>';
  if(activeTab==="chronicle")html=state.tasks.length?state.tasks.slice().reverse().map(t=>`<div class="summary-chip"><b>${esc(t.title)}</b><small>день ${t.dueDay} · ${esc(t.status)}</small></div>`).join(""):'<p>История хозяйственных событий пока пуста.</p>';
  $("tab-content").innerHTML=html;
  document.querySelectorAll("[data-select-object]").forEach(el=>el.addEventListener("click",()=>selectObject(el.dataset.selectObject)));
  document.querySelectorAll("[data-stage-task]").forEach(el=>el.addEventListener("click",()=>createTaskFromStage(el.dataset.stageTask)));
  $("add-stage")?.addEventListener("click",addStageForSelected);
  $("warehouse-form")?.addEventListener("submit",event=>{event.preventDefault();processWarehouseForm(event.currentTarget);});
  $("finance-form")?.addEventListener("submit",event=>{event.preventDefault();processFinanceForm(event.currentTarget);});
  $("calendar-next-day")?.addEventListener("click",()=>{state.meta.day++;scheduleSave();renderHeader();renderTab();});
  $("calendar-next-month")?.addEventListener("click",()=>{state.meta.day+=30;const seasons=["Весна","Лето","Осень","Зима"];const i=seasons.indexOf(state.meta.season);state.meta.season=seasons[(i+1)%4];scheduleSave();renderHeader();renderTab();});

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
  const task={id:"task-"+crypto.randomUUID(),title,objectId:object?.id||null,source:"manual",ownerId:null,dueDay,priority:"normal",status:"planned",workAction:"general",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
  try{const r=await fetch("/api/ollama/health");const d=await r.json();ollamaReady=!!(d.available&&d.modelAvailable);const label=ollamaReady?"Ollama · "+d.selectedModel+" готова":d.available?"Ollama доступна, подходящая модель не найдена":"Ollama не подключена";$("ollama-status").textContent=label;$("ollama-status-side").textContent=ollamaReady?d.selectedModel+" готова":d.available?"модель не найдена":"не подключена";}
  catch{ollamaReady=false;$("ollama-status").textContent="Ollama не подключена";$("ollama-status-side").textContent="не подключена";}
}
async function init(){
  const loaded=await loadState();if(loaded.state)state=loaded.state;
  if(!Array.isArray(state.buildStages))state.buildStages=createInitialState().buildStages;
  if(!Array.isArray(state.movements))state.movements=[];
  if(!Array.isArray(state.transactions))state.transactions=[];
  // Preserve saved character data, but restore canonical team members missing from older saves.
  const defaults=createInitialState().characters;
  const saved=Array.isArray(state.characters)?state.characters:[];
  state.characters=[...saved];
  for(const person of defaults){if(!state.characters.some(x=>x.id===person.id))state.characters.push({...person});}

  renderHeader();renderTasks();renderSelected();renderTabs();
  $("local-status").textContent="готово";$("server-status").textContent=loaded.source==="server"?"загружено":"ожидание";
  await checkOllama();
  // Ollama may be started after the game. Recheck periodically and recover without a page reload.
  setInterval(checkOllama,12000);

  renderer=new WorldRenderer($("world-canvas"),$("world-viewport"),selectObject,()=>{});renderer.addObjects(state.objects);syncVisibleCharacters();
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
