export const WORLD_MAP_CONFIG = Object.freeze({
  file: "U_Ilem_map_empty.png",
  blobSha: "201a8d9b569b0246a8aaa787be75fb80b495593a",
  exampleFile: "U_Ilem_map.png",
  exampleBlobSha: "f2a308f101daaab0d010f13d1127f331929ba2b0",
  worldWidth: 100,
  coordinateSystem: "normalized-image-uv",
  uvOrigin: "top-left",
  note: "Only U_Ilem_map_empty.png is a runtime background. U_Ilem_map.png is a visual reference only."
});

export const WORLD_OBJECTS = [
  {id:"house-main",name:"Главный дом",type:"house",zone:"Жилая зона",icon:"⌂",description:"Основной жилой дом и центр повседневной жизни У Илем.",status:"Требует обустройства",position:{x:.909,y:.774},dimensions:{w:13.8,d:9.2,h:7.0}},
  {id:"lighthouse",name:"Башня-маяк",type:"tower",zone:"Верхняя часть усадьбы",icon:"♜",description:"Деревянная водонапорная башня с обзорной площадкой и светом.",status:"Планируется",position:{x:.931,y:.521},dimensions:{w:2.8,d:2.8,h:8.2}},
  {id:"warehouse",name:"Общий склад",type:"warehouse",zone:"Хозяйственная зона",icon:"▤",description:"Центральное хранение материалов, инструментов и запасов.",status:"Планируется",position:{x:.825,y:.325},dimensions:{w:4.0,d:3.5,h:3.6}},
  {id:"greenhouse",name:"Теплица",type:"greenhouse",zone:"Огород",icon:"▱",description:"Защищённое пространство для выращивания рассады и культур.",status:"Планируется",position:{x:.356,y:.517},dimensions:{w:10.8,d:6.4,h:3.2}},
  {id:"gazebo",name:"Беседка",type:"gazebo",zone:"Общая зона",icon:"⌑",description:"Место встреч, отдыха и совместной работы.",status:"Планируется",position:{x:.681,y:.481},dimensions:{w:8.2,d:6.0,h:4.0}},
  {id:"firepit",name:"Костровая зона",type:"firepit",zone:"Общая зона",icon:"♨",description:"Открытый очаг и место вечерних встреч.",status:"Планируется",position:{x:.712,y:.569},dimensions:{w:4.8,d:3.6,h:2.2}},
  {id:"garden",name:"Сад и огород",type:"garden",zone:"Зелёная зона",icon:"♧",description:"Плодовые деревья, грядки и сезонный уход.",status:"Требует ухода",position:{x:.230,y:.622},dimensions:{w:14.0,d:10.0,h:3.2}},
  {id:"well",name:"Колодец",type:"well",zone:"Водоснабжение",icon:"◉",description:"Источник воды на первом этапе развития инфраструктуры.",status:"Действующий источник",position:{x:.547,y:.425},dimensions:{w:3.8,d:3.8,h:3.7}}
];

export function createInitialState(){
  return {
    schemaVersion:1,
    meta:{project:"У Илем 5.0",createdAt:new Date().toISOString(),lastSavedAt:null,day:1,season:"Весна",worldMapVersion:4},
    economy:{budget:2000000,reserve:500000,currency:"RUB"},
    warehouse:[
      {id:"boards",name:"Доски",unit:"шт.",quantity:120,minimum:20},
      {id:"timber",name:"Брус и лес",unit:"м³",quantity:4,minimum:1},
      {id:"materials",name:"Стройматериалы",unit:"компл.",quantity:35,minimum:8},
      {id:"tools",name:"Инструменты",unit:"компл.",quantity:8,minimum:2},
      {id:"food",name:"Продукты",unit:"компл.",quantity:14,minimum:3},
      {id:"fuel",name:"Топливо",unit:"л",quantity:80,minimum:20},
      {id:"seeds",name:"Семена",unit:"пак.",quantity:12,minimum:3}
    ],
    objects:WORLD_OBJECTS.map(o=>({...o,state:{condition:o.status==="Действующий источник"?"Работает":"Не оценено"},history:[]})),
    characters:[
      {id:"dmitry",name:"Дмитрий",role:"Координатор",energy:100,skills:{construction:2,woodwork:2,ecology:1}},
      {id:"tatiana",name:"Татьяна",role:"Участник команды",energy:100,skills:{hospitality:2,ecology:1}},
      {id:"alexey",name:"Алексей",role:"Мастерские и техника",energy:100,skills:{construction:2,woodwork:2,mechanics:2}},
      {id:"sergey",name:"Сергей",role:"Хозяйство и помощь",energy:100,skills:{construction:1,maintenance:2,logistics:1}}
    ],
    buildStages:WORLD_OBJECTS.map(o=>({id:"stage-"+o.id,objectId:o.id,title:"Первичный осмотр и оценка состояния",description:"Зафиксировать фактическое состояние объекта без предположений о дефектах.",status:"planned",progress:0,workHours:2,cost:0,requiredMaterials:[],taskId:null})),
    tasks:[],
    movements:[],
    transactions:[],
    settings:{autosave:true,dayLengthMinutes:20}
  };
}


export function migrateState(saved){
  if(!saved||typeof saved!=="object")return {state:createInitialState(),migrated:false};
  const state=saved,defaults=createInitialState();
  const savedWorldMapVersion=Number(state.meta?.worldMapVersion)||0;
  let migrated=false;
  const fill=(target,key,value)=>{
    if(target[key]===undefined||(target[key]===null&&value!==null)){target[key]=value;migrated=true;}
  };
  if(!state.meta||typeof state.meta!=="object"){state.meta={...defaults.meta};migrated=true;}
  else ["project","createdAt","lastSavedAt","day","season","worldMapVersion"].forEach(key=>fill(state.meta,key,defaults.meta[key]));
  if(!state.economy||typeof state.economy!=="object"){state.economy={...defaults.economy};migrated=true;}
  else ["budget","reserve","currency"].forEach(key=>fill(state.economy,key,defaults.economy[key]));
  if(!Array.isArray(state.warehouse)){state.warehouse=defaults.warehouse.map(item=>({...item}));migrated=true;}
  else state.warehouse.forEach(item=>{
    if(!item||typeof item!=="object")return;
    const standard=defaults.warehouse.find(entry=>entry.id===item.id);
    fill(item,"minimum",standard?.minimum??0);
    if(standard){fill(item,"name",standard.name);fill(item,"unit",standard.unit);}
  });
  ["objects","tasks","movements","transactions"].forEach(key=>{
    if(!Array.isArray(state[key])){state[key]=[];migrated=true;}
  });
  if(savedWorldMapVersion<4){
    const previousObjects=state.objects;
    const knownIds=new Set(defaults.objects.map(object=>object.id));
    state.objects=defaults.objects.map(base=>{
      const existing=previousObjects.find(object=>object&&object.id===base.id);
      if(!existing)return {...base,position:{...base.position},dimensions:{...base.dimensions},state:{...base.state},history:[]};
      return {
        ...base,
        ...existing,
        type:base.type,
        zone:base.zone,
        position:{...base.position},
        dimensions:{...base.dimensions}
      };
    }).concat(previousObjects.filter(object=>object&& !knownIds.has(object.id)));
    state.meta.worldMapVersion=4;
    migrated=true;
  }
  if(!Array.isArray(state.buildStages)){state.buildStages=defaults.buildStages;migrated=true;}
  if(!Array.isArray(state.characters)){state.characters=defaults.characters;migrated=true;}
  else defaults.characters.forEach(person=>{
    if(!state.characters.some(existing=>existing&&existing.id===person.id)){state.characters.push({...person});migrated=true;}
  });
  if(!state.settings||typeof state.settings!=="object"){state.settings={...defaults.settings};migrated=true;}
  else Object.keys(defaults.settings).forEach(key=>fill(state.settings,key,defaults.settings[key]));
  return {state,migrated};
}
