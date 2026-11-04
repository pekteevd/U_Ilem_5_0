export const WORLD_OBJECTS = [
  {id:"house-main",name:"Главный дом",type:"house",zone:"Жилая зона",icon:"⌂",description:"Основной жилой дом и центр повседневной жизни У Илем.",status:"Требует обустройства",position:{x:.48,y:.49},dimensions:{w:5.8,d:4.8,h:3.6}},
  {id:"lighthouse",name:"Башня-маяк",type:"tower",zone:"Верхняя часть усадьбы",icon:"♜",description:"Деревянная водонапорная башня с обзорной площадкой и светом.",status:"Планируется",position:{x:.76,y:.28},dimensions:{w:2.6,d:2.6,h:8.2}},
  {id:"warehouse",name:"Общий склад",type:"warehouse",zone:"Хозяйственная зона",icon:"▤",description:"Центральное хранение материалов, инструментов и запасов.",status:"Планируется",position:{x:.79,y:.41},dimensions:{w:4.1,d:3.6,h:2.8}},
  {id:"greenhouse",name:"Теплица",type:"greenhouse",zone:"Огород",icon:"▱",description:"Защищённое пространство для выращивания рассады и культур.",status:"Планируется",position:{x:.29,y:.66},dimensions:{w:6.2,d:3.2,h:2.4}},
  {id:"gazebo",name:"Беседка",type:"gazebo",zone:"Общая зона",icon:"⌑",description:"Место встреч, отдыха и совместной работы.",status:"Планируется",position:{x:.61,y:.66},dimensions:{w:4.4,d:4.2,h:3.3}},
  {id:"firepit",name:"Костровая зона",type:"firepit",zone:"Общая зона",icon:"♨",description:"Открытый очаг и место вечерних встреч.",status:"Планируется",position:{x:.69,y:.78},dimensions:{w:3.4,d:3.4,h:.45}},
  {id:"garden",name:"Сад и огород",type:"garden",zone:"Зелёная зона",icon:"♧",description:"Плодовые деревья, грядки и сезонный уход.",status:"Требует ухода",position:{x:.36,y:.78},dimensions:{w:7,d:5,h:.35}},
  {id:"well",name:"Колодец",type:"well",zone:"Водоснабжение",icon:"◉",description:"Источник воды на первом этапе развития инфраструктуры.",status:"Действующий источник",position:{x:.43,y:.58},dimensions:{w:1.8,d:1.8,h:1.25}}
];

export function createInitialState(){
  return {
    schemaVersion:1,
    meta:{project:"У Илем 5.0",createdAt:new Date().toISOString(),lastSavedAt:null,day:1,season:"Весна"},
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

// Save migration helpers are maintained alongside the canonical world schema.
