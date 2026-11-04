import {WORLD_OBJECTS,createInitialState,migrateState} from "./world-data.js";
import {WorldRenderer} from "./world-renderer.js";
import {loadState,saveState,saveLocalSnapshot,exportState} from "./persistence.js";

let state=createInitialState(),selectedId=null,renderer=null,saveTimer=null,saveRevision=0,ollamaReady=false,activeTab="overview";
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
      return '<div class="task-card"><div class="task-main"><b>'+esc(t.title)+'</b><small>'+esc(objectName)+' · день '+t.dueDay+'</small>'+(t.stageId?'<label class="actual-hours">Фактически затрачено, ч <input data-task-actual-hours="'+esc(t.id)+'" type="number" min="0.5" step="0.5" '+((state.buildStages||[]).some(x=>x.id===t.stageId&&x.status==="done")?"disabled":"")+' value="'+(t.actualHours??"")+'" placeholder="Внести после работы"></label>':'')+'<div class="task-controls"><label>Исполнитель <select data-task-owner="'+esc(t.id)+'">'+peopleOptions(t.ownerId)+'</select></label><label>Статус <select data-task-status="'+esc(t.id)+'"><option value="planned" '+(t.status==="planned"?"selected":"")+'>Запланирована</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>В работе</option><option value="blocked" '+(t.status==="blocked"?"selected":"")+'>Заблокирована</option><option value="done" '+(t.status==="done"?"selected":"")+'>Завершена</option></select></label></div></div></div>';
    }).join("");
    $("calendar-list").innerHTML=[...state.tasks].sort((a,b)=>a.dueDay-b.dueDay).map(t=>'<div class="task-card"><div class="task-main"><b>День '+t.dueDay+': '+esc(t.title)+'</b><small>'+esc(state.objects.find(o=>o.id===t.objectId)?.name||"Общая задача")+'</small></div></div>').join("");
    document.querySelectorAll("[data-task-status]").forEach(el=>el.addEventListener("change",()=>{
      const t=state.tasks.find(x=>x.id===el.dataset.taskStatus);
      if(t){const stage=(state.buildStages||[]).find(x=>x.id===t.stageId);if(stage?.status==="done"&&el.value!=="done"){toast("Принятый этап нельзя откатить через статус задачи.");renderTasks();return;}if(el.value==="in_progress"&&(!t.ownerId||!state.characters.some(c=>c.id===t.ownerId))){toast("Перед началом работы назначь исполнителя.");renderTasks();return;}if(el.value==="done"&&(stage||t.source==="construction")&&t.status!=="in_progress"){toast("Строительную задачу можно завершить только после начала работы.");renderTasks();return;}if(el.value==="done"&&(stage||t.source==="construction")&&(!t.ownerId||!state.characters.some(c=>c.id===t.ownerId))){toast("Нельзя завершить строительную задачу без назначенного исполнителя.");renderTasks();return;}if(el.value==="in_progress"&&state.tasks.some(x=>x.id!==t.id&&x.ownerId===t.ownerId&&x.status==="in_progress")){toast("Этот участник уже выполняет другую задачу.");renderTasks();return;}t.status=el.value;t.updatedAt=new Date().toISOString();if(stage&&stage.status!=="done"){stage.status=el.value==="done"?"ready":el.value==="in_progress"?"in_progress":el.value==="blocked"?"blocked":"planned";stage.progress=el.value==="done"?90:el.value==="in_progress"?50:0;}scheduleSave();renderTasks();renderSelected();renderTab();}
    }));
    document.querySelectorAll("[data-task-actual-hours]").forEach(el=>el.addEventListener("change",()=>{const task=state.tasks.find(x=>x.id===el.dataset.taskActualHours);const hours=Number(el.value);if(!task||task.status!=="done"){toast("Фактические часы можно внести после завершения задачи.");renderTasks();return;}if(!Number.isFinite(hours)||hours<=0){toast("Укажи фактические часы больше нуля.");renderTasks();return;}task.actualHours=hours;task.updatedAt=new Date().toISOString();scheduleSave();}));
    document.querySelectorAll("[data-task-owner]").forEach(el=>el.addEventListener("change",()=>{
      const t=state.tasks.find(x=>x.id===el.dataset.taskOwner);
      if(t){const linkedStage=(state.buildStages||[]).find(x=>x.id===t.stageId);if(t.status==="done"||linkedStage?.status==="done"){toast("После завершения задачи исполнитель зафиксирован.");renderTasks();return;}const nextOwner=el.value||null;if(t.status==="in_progress"&&!nextOwner){toast("Нельзя снять исполнителя с активной задачи. Сначала приостанови работу.");renderTasks();return;}if(t.status==="in_progress"&&nextOwner&&state.tasks.some(x=>x.id!==t.id&&x.ownerId===nextOwner&&x.status==="in_progress")){toast("Этот участник уже выполняет другую задачу.");renderTasks();return;}t.ownerId=nextOwner;t.updatedAt=new Date().toISOString();scheduleSave();syncVisibleCharacters();renderSelected();}
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
  const stage=(state.buildStages||[]).find(s=>s.id===stageId);
  if(!stage||stage.taskId)return;
  if(!(state.objects||[]).some(o=>o.id===stage.objectId)){
    toast("Нельзя создать задачу: связанный объект не найден.");
    return;
  }
  const task={id:"task-"+crypto.randomUUID(),title:stage.title,objectId:stage.objectId,stageId:stage.id,source:"construction",ownerId:null,dueDay:state.meta.day+1,priority:"normal",status:"planned",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.tasks.push(task);stage.taskId=task.id;scheduleSave();renderTasks();renderSelected();renderTab();toast("Этап добавлен на общую доску задач.");
}
function selectObject(id){selectedId=id;renderSelected();renderTab();}
function processWarehouseForm(form){
  const action=form.elements.action.value,rawQty=String(form.elements.quantity.value??"").trim(),qty=Number(rawQty),budget=Number(state.economy?.budget);
  if(!["purchase","use","return"].includes(action)||!rawQty||!Number.isFinite(qty)||qty<=0||Math.round(qty*100)!==qty*100){toast("Укажи корректное количество (до двух знаков после запятой).");return;}
  if(!Number.isSafeInteger(budget)||budget<0){toast("Текущий бюджет некорректен. Операция отменена.");return;}
  let item=null,total=0,nextQuantity=0,nextBudget=budget,transaction=null,movement=null;
  if(action==="return"){
    const purchaseId=form.elements.purchaseMovement?.value,purchase=(state.movements||[]).find(m=>m.id===purchaseId&&m.source==="purchase"&&m.type==="in");
    if(!purchase){toast("Выбери исходную закупку для возврата.");return;}
    item=(state.warehouse||[]).find(x=>x.id===purchase.itemId);
    const purchased=Number(purchase.quantity),purchaseTotal=Number(purchase.total);
    if(!item||!Number.isFinite(purchased)||purchased<=0||!Number.isSafeInteger(purchaseTotal)||purchaseTotal<=0){toast("Исходная закупка не содержит корректных данных. Возврат невозможен.");return;}
    const alreadyReturned=(state.movements||[]).filter(m=>m.source==="purchase-return"&&m.purchaseMovementId===purchase.id).reduce((sum,m)=>sum+Number(m.quantity||0),0);
    const remaining=Math.round((purchased-alreadyReturned)*100)/100;
    if(qty>remaining){toast("Количество возврата превышает не возвращённый остаток закупки.");return;}
    const before=Math.round(alreadyReturned*100)/100,after=Math.round((before+qty)*100)/100;
    total=(after>=purchased?purchaseTotal:Math.round(purchaseTotal*after/purchased))-Math.round(purchaseTotal*before/purchased);
    if(!Number.isSafeInteger(total)||total<=0){toast("Сумма возврата меньше одного рубля. Объедини возврат с большей партией.");return;}
    const stock=Number(item.quantity);if(!Number.isFinite(stock)||stock<0){toast("Остаток материала повреждён. Возврат отменён.");return;}
    if(qty>stock){toast("Нельзя вернуть больше материала, чем фактически осталось на складе.");return;}
    nextQuantity=Math.round((stock-qty)*100)/100;nextBudget=budget+total;
    if(!Number.isFinite(nextQuantity)||nextQuantity<0||nextQuantity>stock||!Number.isSafeInteger(nextBudget)){toast("Возврат выводит остатки или бюджет за допустимый диапазон.");return;}
    transaction={id:"txn-"+crypto.randomUUID(),type:"income",description:"Возврат закупки: "+item.name,amount:total,createdAt:new Date().toISOString(),source:"warehouse-return",purchaseMovementId:purchase.id};
    movement={id:"mov-"+crypto.randomUUID(),itemId:item.id,itemName:item.name,type:"out",quantity:qty,unit:item.unit,total,createdAt:new Date().toISOString(),source:"purchase-return",purchaseMovementId:purchase.id,transactionId:transaction.id};
  }else{
    item=(state.warehouse||[]).find(x=>x.id===form.elements.item.value);const stock=Number(item?.quantity);
    if(!item||!Number.isFinite(stock)||stock<0){toast("Материал или его остаток не найден. Операция отменена.");return;}
    if(action==="purchase"){
      const rawPrice=String(form.elements.unitCost.value??"").trim(),price=Number(rawPrice);
      if(!rawPrice||!Number.isSafeInteger(price)||price<=0){toast("Цена за единицу должна быть целым числом рублей.");return;}
      total=Math.round(qty*price);if(!Number.isSafeInteger(total)||total<=0){toast("Итоговая стоимость закупки некорректна.");return;}
      if(total>budget){toast("Недостаточно средств. Неприкосновенный резерв не используется.");return;}
      nextQuantity=Math.round((stock+qty)*100)/100;nextBudget=budget-total;
      if(!Number.isFinite(nextQuantity)||nextQuantity<stock){toast("Количество после закупки выходит за допустимый диапазон.");return;}
      transaction={id:"txn-"+crypto.randomUUID(),type:"expense",description:"Закупка: "+item.name,amount:total,createdAt:new Date().toISOString(),source:"warehouse"};
      movement={id:"mov-"+crypto.randomUUID(),itemId:item.id,itemName:item.name,type:"in",quantity:qty,unit:item.unit,total,createdAt:new Date().toISOString(),source:"purchase",transactionId:transaction.id};
    }else{
      if(qty>stock){toast("Недостаточно материала на складе.");return;}
      nextQuantity=Math.round((stock-qty)*100)/100;
      movement={id:"mov-"+crypto.randomUUID(),itemId:item.id,itemName:item.name,type:"out",quantity:qty,unit:item.unit,total:0,createdAt:new Date().toISOString(),source:"manual-use"};
    }
  }
  item.quantity=nextQuantity;state.economy.budget=nextBudget;
  if(transaction)state.transactions=[transaction,...(state.transactions||[])];
  state.movements=[movement,...(state.movements||[])];
  scheduleSave();renderHeader();renderTab();toast(action==="purchase"?"Закупка проведена, склад и финансы обновлены.":action==="return"?"Возврат закупки проведён, склад и бюджет восстановлены.":"Материал списан со склада.");
}
function processFinanceForm(form){
  const type=form.elements.type.value;
  const rawAmount=String(form.elements.amount.value??"").trim();
  const amount=Number(rawAmount);
  const description=String(form.elements.description.value??"").trim();
  const budget=Number(state.economy?.budget);
  if(!["expense","income"].includes(type)||!rawAmount||!Number.isSafeInteger(amount)||amount<=0||!description){
    toast("Сумма должна быть целым положительным числом рублей. Проверь назначение.");return;
  }
  if(!Number.isSafeInteger(budget)||budget<0){toast("Текущий бюджет некорректен. Операция отменена.");return;}
  if(type==="expense"&&amount>budget){toast("Недостаточно средств. Неприкосновенный резерв защищён.");return;}
  const nextBudget=type==="expense"?budget-amount:budget+amount;
  if(!Number.isSafeInteger(nextBudget)||nextBudget<0){toast("Операция выводит бюджет за допустимый диапазон.");return;}
  const transaction={id:"txn-"+crypto.randomUUID(),type,description,amount,createdAt:new Date().toISOString(),source:"manual"};
  state.economy.budget=nextBudget;
  state.transactions=[transaction,...(state.transactions||[])];
  scheduleSave();renderHeader();renderTab();toast("Финансовая операция записана.");
}
function stageMaterialRow(stageId,req={},index=0,locked=false){return `<div class="stage-material-row"><label>Материал<select name="material"><option value="">Не выбран</option>${state.warehouse.map(r=>`<option value="${esc(r.id)}" ${req.itemId===r.id?"selected":""}>${esc(r.name)} (${esc(r.unit)})</option>`).join("")}</select></label><label>Количество<input name="quantity" type="number" min="0" step="0.01" value="${req.quantity||0}" placeholder="Количество"></label>${locked?"":`<button type="button" class="remove-material" data-remove-material="${esc(stageId)}" aria-label="Удалить материал">Удалить</button>`}</div>`;}
function saveStageConfig(form){const stage=state.buildStages.find(x=>x.id===form.dataset.stageConfig);if(!stage||stage.status==="done"){toast("Принятый этап нельзя редактировать.");return;}const materials=[];for(const row of form.querySelectorAll(".stage-material-row")){const itemId=row.querySelector('[name="material"]').value,raw=row.querySelector('[name="quantity"]').value,quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<0){toast("Проверь количество материалов.");return;}if(itemId&&quantity>0){const existing=materials.find(x=>x.itemId===itemId);if(existing)existing.quantity+=quantity;else materials.push({itemId,quantity});}else if(!itemId&&quantity>0){toast("Для каждой позиции с количеством выбери материал.");return;}}const cost=Number(form.elements.cost.value),hours=Number(form.elements.hours.value);if(!Number.isFinite(cost)||cost<0||!Number.isInteger(cost)||!Number.isFinite(hours)||hours<0){toast("Проверь стоимость и трудозатраты.");return;}stage.requiredMaterials=materials;stage.cost=cost;stage.workHours=hours;scheduleSave();renderTab();toast("Смета этапа сохранена.");}
function addStageMaterial(stageId){const form=document.querySelector('[data-stage-config="'+CSS.escape(stageId)+'"]');if(!form||form.dataset.locked==="true")return;const grid=form.querySelector(".stage-material-grid");const holder=document.createElement("div");holder.innerHTML=stageMaterialRow(stageId,{},grid.children.length,false);const row=holder.firstElementChild;row.querySelector("[data-remove-material]")?.addEventListener("click",()=>removeStageMaterial(row.querySelector("[data-remove-material]")));grid.append(row);}
function removeStageMaterial(button){const row=button.closest(".stage-material-row");if(row)row.remove();}

function acceptBuildStage(stageId){
  const stage=(state.buildStages||[]).find(x=>x.id===stageId);
  const task=stage&&(state.tasks||[]).find(t=>t.id===stage.taskId);
  const object=stage&&(state.objects||[]).find(o=>o.id===stage.objectId);
  if(!stage||!task||task.status!=="done"||!object||task.stageId!==stage.id||task.objectId!==stage.objectId||task.source!=="construction"){
    toast("Связанная задача или объект не соответствует строительному этапу.");
    return;
  }
  if(!Array.isArray(state.warehouse)||!Array.isArray(state.movements||[])||!Array.isArray(state.transactions||[])||!Array.isArray(object.history||[])||(object.state!=null&&(typeof object.state!=="object"||Array.isArray(object.state)))){
    toast("Структура склада, финансового журнала или истории объекта повреждена. Приёмка отменена.");
    return;
  }
  if(stage.status==="done"||stage.acceptedAt){
    toast("Этот этап уже принят.");
    return;
  }
  const assignedWorker=task.ownerId?(state.characters||[]).find(c=>c.id===task.ownerId):null;
  if(!assignedWorker){
    toast("Нельзя принять строительный этап без назначенного исполнителя.");
    return;
  }
  const actualHours=Number(task.actualHours);
  if(!Number.isFinite(actualHours)||actualHours<=0){
    toast("Перед приёмкой внеси фактически затраченные часы больше нуля в карточке задачи.");
    return;
  }

  // Aggregate duplicate rows before checking stock. Each row must not pass
  // independently against the same unchanged warehouse quantity.
  if(stage.requiredMaterials!=null&&!Array.isArray(stage.requiredMaterials)){
    toast("Смета содержит некорректный список материалов. Проверь этап.");
    return;
  }
  const aggregated=new Map();
  for(const req of (stage.requiredMaterials||[])){
    const itemId=String(req?.itemId||"");
    const quantity=Number(req?.quantity);
    if(!itemId||!Number.isFinite(quantity)||quantity<=0){
      toast("В смете есть некорректная позиция материала.");
      return;
    }
    aggregated.set(itemId,(aggregated.get(itemId)||0)+quantity);
  }
  const deductions=[];
  for(const [itemId,quantity] of aggregated){
    const item=(state.warehouse||[]).find(x=>x.id===itemId);
    if(!item||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<quantity){
      toast("Недостаточно материала: "+(item?.name||"неизвестный материал")+".");
      return;
    }
    deductions.push({item,quantity});
  }

  const cost=Number(stage.cost??0);
  const budget=Number(state.economy?.budget);
  if(!Number.isFinite(cost)||cost<0||!Number.isInteger(cost)||!Number.isFinite(budget)||cost>budget){
    toast("Недостаточно бюджета или некорректная стоимость. Резерв не используется.");
    return;
  }

  // Prepare ledger entries before mutating any part of the state.
  const now=new Date().toISOString();
  const movementRows=deductions.map(({item,quantity})=>({
    id:"mov-"+crypto.randomUUID(),itemId:item.id,itemName:item.name,
    type:"out",quantity,unit:item.unit,total:0,source:"construction",
    stageId:stage.id,createdAt:now
  }));
  const transaction=cost?{
    id:"txn-"+crypto.randomUUID(),type:"expense",
    description:"Работы: "+stage.title,amount:cost,
    source:"construction",stageId:stage.id,createdAt:now
  }:null;
  const historyEntry={
    date:now,event:"Принят этап: "+stage.title,cost,
    materials:Array.from(aggregated,([itemId,quantity])=>({itemId,quantity}))
  };
  const currentWorkedHours=Number(assignedWorker.workedHours??0);
  const currentCompletedTasks=Number(assignedWorker.completedTasks??0);
  if(!Number.isFinite(currentWorkedHours)||currentWorkedHours<0||!Number.isSafeInteger(currentCompletedTasks)||currentCompletedTasks<0||!Number.isFinite(currentWorkedHours+actualHours)||!Number.isSafeInteger(currentCompletedTasks+1)){
    toast("Учёт рабочего времени исполнителя повреждён. Приёмка отменена.");
    return;
  }
  const worker=assignedWorker;

  deductions.forEach(({item,quantity})=>{item.quantity=Number(item.quantity)-quantity;});
  state.movements=[...movementRows,...(state.movements||[])];
  if(transaction){
    state.economy.budget=budget-cost;
    state.transactions=[transaction,...(state.transactions||[])];
  }
  stage.status="done";
  stage.progress=100;
  stage.acceptedAt=now;
  stage.actualHours=actualHours;
  task.hoursRecorded=true;
  if(worker){
    worker.workedHours=(Number(worker.workedHours)||0)+actualHours;
    worker.completedTasks=(Number(worker.completedTasks)||0)+1;
  }
  object.state=object.state||{};
  object.state.condition="Работы выполнены";
  object.history=object.history||[];
  object.history.unshift(historyEntry);
  scheduleSave();
  renderHeader();
  renderTasks();
  renderSelected();
  renderTab();
  toast("Работы приняты. Материалы и расходы учтены.");
}
function renderTab(){
  const titles={overview:["Обзор территории","состояние хозяйства"],construction:["Строительство","объекты и состояние"],warehouse:["Склад","остатки и минимальные запасы"],people:["Люди","команда и роли"],garden:["Сад","зелёная зона"],projects:["Проекты","инициативы пространства"],guests:["Гости и события","приём и календарь"],finance:["Финансы","бюджет и резерв"],chronicle:["Хроника","история изменений"],calendar:["Календарь","планирование по игровым дням"],territory:["Территория","участки и размещение"],engineering:["Инженерия","вода, электричество и отопление"],experts:["Специалисты","внешние специалисты и приглашения"]};
  $("tab-title").textContent=titles[activeTab][0];$("tab-caption").textContent=titles[activeTab][1];
  let html="";
  const chronicleEvents=[
    ...(state.transactions||[]).map(t=>({date:t.createdAt,label:t.description,detail:(t.type==="income"?"Поступление":"Расход")+" · "+money(t.amount),id:t.id})),
    ...(state.movements||[]).filter(m=>!m.transactionId).map(m=>({date:m.createdAt,label:m.itemName,detail:(m.type==="in"?"Приход":"Списание")+" · "+m.quantity+" "+m.unit+(m.source==="construction"?" · строительство":""),id:m.id})),
    ...(state.tasks||[]).map(t=>({date:t.createdAt,label:"Задача: "+t.title,detail:"Создана · "+(t.status||"без статуса"),id:t.id})),
    ...(state.buildStages||[]).filter(s=>s.status==="done"&&s.acceptedAt).map(s=>({date:s.acceptedAt,label:"Принят этап: "+s.title,detail:"Строительство · "+money(s.cost||0),id:s.id}))
  ].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,60);
  if(activeTab==="overview")html=`<div class="tab-summary"><div class="summary-chip"><b>${state.objects.length}</b><small>объектов на карте</small></div><div class="summary-chip"><b>${state.tasks.length}</b><small>задач в работе</small></div><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>доступный бюджет</small></div><div class="summary-chip"><b>${state.warehouse.length}</b><small>категорий запасов</small></div></div><p>Выбери объект на карте или в списке. Все изменения сохраняются в общей модели мира.</p><div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)}</button>`).join("")}</div>`;
  if(activeTab==="construction")html=`<div class="object-list">${state.objects.map(o=>`<button class="object-chip ${o.id===selectedId?"active":""}" data-select-object="${o.id}">${o.icon} ${esc(o.name)} · ${esc(o.status)}</button>`).join("")}</div><div class="stage-list">${(state.buildStages||[]).map(s=>{const o=state.objects.find(x=>x.id===s.objectId),task=state.tasks.find(t=>t.id===s.taskId),reqs=s.requiredMaterials||[],locked=s.status==="done";return `<div class="stage-card"><div><b>${esc(s.title)}</b><small>${esc(o?.name||"Объект")} · ${s.workHours} ч · ${reqs.length} материалов · ${money(s.cost||0)} · ${s.progress}% · ${esc(s.status)}</small><div class="progress-track"><i style="width:${s.progress}%"></i></div><form class="stage-config" data-stage-config="${esc(s.id)}" data-locked="${locked}"><div class="stage-material-grid">${reqs.map((req,n)=>stageMaterialRow(s.id,req,n,locked)).join("")}</div>${locked?"":`<button type="button" class="secondary" data-add-material="${esc(s.id)}">＋ Добавить материал</button>`}<label>Стоимость работ, ₽ <input name="cost" type="number" min="0" step="1" value="${s.cost||0}" ${locked?"disabled":""}></label><label>Плановые трудозатраты, ч <input name="hours" type="number" min="0" step="0.5" value="${s.workHours||0}" ${locked?"disabled":""}></label>${locked?"<small>Принятый этап заблокирован для редактирования.</small>":`<button type="submit">Сохранить смету</button>`}</form></div><div class="stage-actions"><button data-stage-task="${esc(s.id)}" ${s.taskId?"disabled":""}>${s.taskId?"Задача создана":"Создать задачу"}</button>${task?.status==="done"&&s.status!=="done"?`<button data-stage-accept="${esc(s.id)}">Принять работы</button>`:""}</div></div>`}).join("")}</div><div class="actions"><button id="add-stage">＋ Новый этап для выбранного объекта</button></div><p>Смета поддерживает произвольное число позиций. Завершение задачи не списывает ресурсы: списание происходит только после приёмки.</p>`;
  if(activeTab==="warehouse")html=`<form id="warehouse-form" class="operation-form"><label>Материал <select name="item">${state.warehouse.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${r.quantity} ${esc(r.unit)}</option>`).join("")}</select></label><label>Операция <select name="action"><option value="purchase">Закупить</option><option value="use">Списать</option><option value="return">Вернуть закупку</option></select></label><label>Исходная закупка для возврата <select name="purchaseMovement"><option value="">Выбери закупку</option>${(state.movements||[]).filter(m=>m.source==="purchase"&&m.type==="in").map(m=>{const returned=(state.movements||[]).filter(x=>x.source==="purchase-return"&&x.purchaseMovementId===m.id).reduce((sum,x)=>sum+Number(x.quantity||0),0);const left=Math.round((Number(m.quantity)-returned)*100)/100;return left>0?`<option value="${esc(m.id)}">${esc(m.itemName)} · остаток ${left} ${esc(m.unit)} · ${money(m.total||0)}</option>`:"";}).join("")}</select></label><label>Количество <input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>Цена за единицу, ₽ <input name="unitCost" type="number" min="1" step="1" value="100"></label><button type="submit">Провести</button></form><div class="tab-summary">${state.warehouse.map(r=>{const minimum=Number(r.minimum)||0;return `<div class="summary-chip"><b>${r.quantity} ${esc(r.unit)}</b><small>${esc(r.name)} · минимум ${minimum} · ${r.quantity<minimum?"ниже минимума":"норма"}</small>${r.quantity<minimum?'<strong class="stock-warning">Нужно пополнить запас</strong>':""}</div>`;}).join("")}</div><h3>Движения склада</h3>${(state.movements||[]).slice(0,30).map(m=>`<div class="movement-row">${m.type==="in"?"＋":"−"} ${esc(m.itemName)} · ${m.quantity} ${esc(m.unit)} · ${esc(m.source||"операция")}</div>`).join("")||"<p>Операций пока нет.</p>"}`;
  if(activeTab==="people")html=`<div class="tab-summary">${state.characters.map(c=>`<div class="summary-chip"><b>${esc(c.name)}</b><small>${esc(c.role)} · энергия ${c.energy}% · принято задач: ${c.completedTasks||0} · учтено часов: ${c.workedHours||0}</small></div>`).join("")}</div><p>Учитываются только фактические часы по принятым строительным этапам. Незавершённые и непринятые задачи в статистику не попадают.</p>`;
  if(activeTab==="garden")html='<p>Сад и огород отмечены на карте как единый объект. Сезонные работы, посадки и уход будут добавляться через игровые задачи.</p>';
  if(activeTab==="projects")html='<p>Раздел проектов подготовлен как рабочее пространство для инициатив У Илем. Новые проекты интеллектуальный советник предлагает только по прямому запросу игрока.</p>';
  if(activeTab==="guests")html='<p>Календарь событий пока пуст. Гостевые сценарии и размещение будут подключены к общей модели задач и объектов.</p>';
  if(activeTab==="finance")html=`<div class="tab-summary"><div class="summary-chip"><b>${money(state.economy.budget)}</b><small>доступный бюджет</small></div><div class="summary-chip"><b>${money(state.economy.reserve)}</b><small>неприкосновенный резерв</small></div></div><form id="finance-form" class="operation-form"><label>Тип <select name="type"><option value="expense">Расход</option><option value="income">Поступление</option></select></label><label>Сумма, ₽ <input name="amount" type="number" min="1" step="1" required></label><label>Назначение <input name="description" maxlength="120" required></label><button type="submit">Записать</button></form><h3>Журнал операций</h3>${(state.transactions||[]).slice(0,30).map(t=>`<div class="movement-row">${t.type==="income"?"＋":"−"} ${esc(t.description)} · ${money(t.amount)}</div>`).join("")||"<p>Операций пока нет.</p>"}`;
  if(activeTab==="calendar")html=`<div class="tab-summary"><div class="summary-chip"><b>День ${state.meta.day}</b><small>текущий игровой день</small></div><div class="summary-chip"><b>${esc(state.meta.season)}</b><small>сезон</small></div></div><div class="object-list"><button class="object-chip" id="calendar-next-day">Следующий день →</button><button class="object-chip" id="calendar-next-month">Завершить месяц →</button></div><p>Календарь показывает сроки задач. Переход времени не выполняет работы автоматически.</p>`;
  if(activeTab==="territory")html=`<div class="object-list">${state.objects.map(o=>`<button class="object-chip" data-select-object="${o.id}">${o.icon} ${esc(o.name)} · ${esc(o.zone)}</button>`).join("")}</div><p>Участки и объекты территории. Размещение новых построек пока требует отдельной механики и подтверждения.</p>`;
  if(activeTab==="engineering")html='<div class="tab-summary"><div class="summary-chip"><b>Электричество</b><small>Подключение есть, параметры требуют обследования</small></div><div class="summary-chip"><b>Вода</b><small>Колодец, насос и разводка требуют инвентаризации</small></div><div class="summary-chip"><b>Стоки</b><small>Локальные решения, состояние не оценено</small></div><div class="summary-chip"><b>Отопление</b><small>Индивидуально по зданиям</small></div></div>';
  if(activeTab==="experts")html='<p>Каталог внешних специалистов: плотник, кровельщик, электрик, сантехник, агроном и специалисты по саду. Ставки и доступность не заданы, поэтому расходы не рассчитываются.</p>';
  if(activeTab==="chronicle")html=chronicleEvents.length?chronicleEvents.map(e=>`<div class="movement-row"><b>${esc(e.label)}</b><small>${esc(e.detail)} · ${e.date?new Date(e.date).toLocaleString("ru-RU"):"дата не указана"}</small></div>`).join(""):'<p>История хозяйственных событий пока пуста.</p>';
  $("tab-content").innerHTML=html;
  document.querySelectorAll("[data-select-object]").forEach(el=>el.addEventListener("click",()=>selectObject(el.dataset.selectObject)));
  document.querySelectorAll("[data-stage-task]").forEach(el=>el.addEventListener("click",()=>createTaskFromStage(el.dataset.stageTask)));
  document.querySelectorAll("[data-stage-config]").forEach(el=>el.addEventListener("submit",event=>{event.preventDefault();saveStageConfig(event.currentTarget);}));
  document.querySelectorAll("[data-add-material]").forEach(el=>el.addEventListener("click",()=>addStageMaterial(el.dataset.addMaterial)));
  document.querySelectorAll("[data-remove-material]").forEach(el=>el.addEventListener("click",()=>removeStageMaterial(el)));
  document.querySelectorAll("[data-stage-accept]").forEach(el=>el.addEventListener("click",()=>acceptBuildStage(el.dataset.stageAccept)));
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
  const revision=++saveRevision;
  $("save-state").textContent="Есть изменения…";clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    state.meta.lastSavedAt=new Date().toISOString();
    const result=await saveState(state);
    if(revision!==saveRevision)return;
    $("save-state").textContent=result.server?"Сохранено на сервере":result.conflict?"Конфликт сохранения":result.local?"Сохранена локальная копия":"Ошибка сохранения";
    $("server-status").textContent=result.server?"доступен":result.conflict?"серверная версия новее":result.error||"нет связи";
    $("local-status").textContent=result.local?"сохранено":result.localConflict?"есть более новая копия":"ошибка";
    if(result.conflict)toast("На сервере уже есть более новая версия. Не закрывай эту вкладку: сначала экспортируй текущие изменения и сверь версии.");
    else if(!result.ok)toast("Не удалось сохранить игру. Экспортируй сохранение перед выходом.");
  },450);
}
async function checkOllama(){
  try{const r=await fetch("/api/ollama/health");const d=await r.json();ollamaReady=!!(d.available&&d.modelAvailable);const label=ollamaReady?"Ollama · "+d.selectedModel+" готова":d.available?"Ollama доступна, подходящая модель не найдена":"Ollama не подключена";$("ollama-status").textContent=label;$("ollama-status-side").textContent=ollamaReady?d.selectedModel+" готова":d.available?"модель не найдена":"не подключена";}
  catch{ollamaReady=false;$("ollama-status").textContent="Ollama не подключена";$("ollama-status-side").textContent="не подключена";}
}
async function init(){
  const loaded=await loadState();
  const migration=migrateState(loaded.state||state);
  state=migration.state;
  if(migration.migrated)scheduleSave();

  renderHeader();renderTasks();renderSelected();renderTabs();
  $("local-status").textContent="готово";$("server-status").textContent=loaded.source==="server"?"загружено":"ожидание";
  if(loaded.source==="browser")scheduleSave();
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
  window.addEventListener("beforeunload",()=>{saveLocalSnapshot(state);});
  $("save-state").textContent=loaded.source==="server"?"Сохранение загружено":"Новая игра";
}
init().catch(error=>{console.error(error);toast("Ошибка запуска: "+error.message);});
