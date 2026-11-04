import * as THREE from "./vendor/three.module.js";
import {WORLD_MAP_CONFIG} from "./world-data.js";

export class WorldRenderer{
  constructor(canvas,viewport,onSelect,onReady){
    this.canvas=canvas;this.viewport=viewport;this.onSelect=onSelect;this.onReady=onReady;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x28372c);
    this.camera=new THREE.OrthographicCamera(-50,50,30,-30,.1,600);
    this.camera.position.set(0,100,70);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.pickables=[];this.objectGroups=new Map();this.characterGroups=new Map();this.target=new THREE.Vector3(0,0,0);
    this.drag=null;this.cameraHeight=100;this.cameraDepth=70;this.cameraLength=Math.hypot(this.cameraHeight,this.cameraDepth);this.cameraUpY=this.cameraDepth/this.cameraLength;this.cameraUpZ=-this.cameraHeight/this.cameraLength;this.mapAspect=1;this.mapWidth=WORLD_MAP_CONFIG.worldWidth;this.mapHeight=this.mapWidth;this.mapReady=false;this.pendingObjects=[];this.pendingCharacters=null;this.flameEffects=[];
    this.addLights();this.loadMap();this.bindControls();this.resize();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);
    this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);
  }
  addLights(){
    this.scene.add(new THREE.HemisphereLight(0xfff3df,0x70563f,2.1));
    const sun=new THREE.DirectionalLight(0xffe5bd,2.6);sun.position.set(-35,65,-35);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;
    sun.shadow.bias=-.00025;this.scene.add(sun);
    const fill=new THREE.DirectionalLight(0xffe3c2,.95);fill.position.set(35,42,58);this.scene.add(fill);
  }
  loadMap(){
    const loader=new THREE.TextureLoader();
    loader.load("./"+WORLD_MAP_CONFIG.file,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      const image=texture.image;this.mapAspect=image.width/image.height;this.mapHeight=this.mapWidth/this.mapAspect/Math.abs(this.cameraUpZ);
      const geometry=new THREE.PlaneGeometry(this.mapWidth,this.mapHeight);
      const material=new THREE.MeshBasicMaterial({map:texture});
      const plane=new THREE.Mesh(geometry,material);plane.rotation.x=-Math.PI/2;plane.position.y=-.12;plane.receiveShadow=true;plane.userData.isMap=true;
      this.scene.add(plane);this.fitCamera();this.mapReady=true;
      const pendingObjects=this.pendingObjects.splice(0);
      pendingObjects.forEach(object=>this.addObject(object));
      if(this.pendingCharacters){
        const [characters,tasks,objects]=this.pendingCharacters;
        this.pendingCharacters=null;
        this.syncCharacters(characters,tasks,objects);
      }
      document.getElementById("map-loading")?.classList.add("hidden");
      this.onReady?.({width:image.width,height:image.height,aspect:this.mapAspect,worldWidth:this.mapWidth,worldHeight:this.mapHeight,source:WORLD_MAP_CONFIG.file});
    },undefined,error=>{
      const el=document.getElementById("map-loading");if(el)el.textContent="Не удалось загрузить утверждённую карту. Проверь наличие PNG рядом с index.html.";
      console.error("Map load failed",error);
    });
  }
  fitCamera(){
    const rect=this.viewport.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height);
    const visibleHeight=Math.max(this.mapHeight*Math.abs(this.cameraUpZ)*1.12,this.mapWidth/aspect*1.12);
    this.camera.left=-visibleHeight*aspect/2;this.camera.right=visibleHeight*aspect/2;
    this.camera.top=visibleHeight/2;this.camera.bottom=-visibleHeight/2;this.camera.zoom=1;
    this.camera.position.set(this.target.x,this.cameraHeight,this.target.z+this.cameraDepth);this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();
  }
  resize(){
    const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight);
    this.renderer.setSize(w,h,false);
    const aspect=w/h,viewH=Math.max(this.mapHeight*Math.abs(this.cameraUpZ)*1.12,this.mapWidth/aspect*1.12);
    this.camera.left=-viewH*aspect/2;this.camera.right=viewH*aspect/2;this.camera.top=viewH/2;this.camera.bottom=-viewH/2;
    this.camera.updateProjectionMatrix();
  }
  mapPoint(position){
    const u=Number(position?.x),v=Number(position?.y);
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)throw new RangeError("Позиция объекта должна быть нормализована в пределах карты 0..1.");
    return new THREE.Vector3((u-.5)*this.mapWidth,.04,(v-.5)*this.mapHeight);
  }
  material(color,roughness=.88,transparent=false,opacity=1){return new THREE.MeshStandardMaterial({color,roughness,transparent,opacity,depthWrite:!transparent});}
  box(parent,w,h,d,mat,x=0,y=h/2,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  roof(parent,w,h,d,color){const geo=new THREE.ConeGeometry(Math.sqrt(w*w+d*d)/1.35,h,4);const mesh=new THREE.Mesh(geo,this.material(color));mesh.rotation.y=Math.PI/4;mesh.position.y=h/2;parent.add(mesh);return mesh;}
  gableFace(parent,w,h,z,mat,y=0){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute([-w/2,0,z,w/2,0,z,0,h,z],3));
    geo.setIndex([0,1,2]);geo.computeVertexNormals();
    const faceMat=mat.clone();faceMat.side=THREE.DoubleSide;
    const face=new THREE.Mesh(geo,faceMat);face.position.y=y;parent.add(face);
    const back=face.clone();back.position.z=-2*z;parent.add(back);
  }

  beamBetween(parent,a,b,width,material){
    const start=a.isVector3?a:new THREE.Vector3(a.x,a.y,a.z);
    const end=b.isVector3?b:new THREE.Vector3(b.x,b.y,b.z);
    const direction=new THREE.Vector3().subVectors(end,start);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(width*.82,width,direction.length(),7),material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    parent.add(mesh);
    return mesh;
  }
  addWindow(parent,x,y,z,width,height,frame,glass){
    this.box(parent,width+.18,height+.16,.14,frame,x,y,z);
    this.box(parent,width,height,.065,glass,x,y,z+.075);
    this.box(parent,.055,height,.075,frame,x,y,z+.12);
    this.box(parent,width,.055,.075,frame,x,y,z+.12);
    this.box(parent,.055,height,.075,frame,x+width*.5,y,z+.12);
    this.box(parent,.055,height,.075,frame,x-width*.5,y,z+.12);
    this.box(parent,width,.045,.075,frame,x,y,z+.12);
  }
  addGableRoof(parent,w,d,eaveY,rise,roofMaterial,overhang=.5){
    const half=(w+overhang*2)/2,depth=d+overhang*2;
    const angle=Math.atan2(rise,half),length=Math.hypot(half,rise);
    const left=this.box(parent,length,.22,depth,roofMaterial,-half/2,eaveY+rise/2,0);
    left.rotation.z=angle;
    const right=this.box(parent,length,.22,depth,roofMaterial,half/2,eaveY+rise/2,0);
    right.rotation.z=-angle;
    this.box(parent,.2,.24,depth,roofMaterial,0,eaveY+rise,0);
    this.box(parent,.16,.18,depth,roofMaterial,0,eaveY-.02,0);
  }
  addBench(parent,x,z,rotation=0,woodMaterial=null,darkMaterial=null,scale=1){
    const bench=new THREE.Group();
    const wood=woodMaterial||this.material(0x8b6743);
    const dark=darkMaterial||this.material(0x51402e);
    this.box(bench,2.15*scale,.16*scale,.48*scale,wood,0,.62*scale,0);
    this.box(bench,2.15*scale,.78*scale,.14*scale,wood,0,1.02*scale,-.18*scale);
    for(const px of [-.88,.88]){
      this.box(bench,.13*scale,.62*scale,.13*scale,dark,px*scale,.31*scale,0);
      this.box(bench,.13*scale,.72*scale,.13*scale,dark,px*scale,1.0*scale,-.16*scale);
    }
    bench.position.set(x,0,z);bench.rotation.y=rotation;parent.add(bench);
    return bench;
  }
  addTree(parent,x,z,scale=1,fruit=false){
    const tree=new THREE.Group();
    const bark=this.material(0x60452f),leafA=this.material(0x526f43),leafB=this.material(0x6d864d),fruitMat=this.material(0xc36f43);
    const trunkH=1.5*scale;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.15*scale,.23*scale,trunkH,7),bark);
    trunk.position.y=trunkH/2;tree.add(trunk);
    this.beamBetween(tree,{x:0,y:trunkH*.72,z:0},{x:-.52*scale,y:trunkH+ .55*scale,z:.05*scale},.09*scale,bark);
    this.beamBetween(tree,{x:0,y:trunkH*.78,z:0},{x:.5*scale,y:trunkH+.6*scale,z:-.04*scale},.09*scale,bark);
    const crownA=new THREE.Mesh(new THREE.SphereGeometry(.92*scale,9,7),leafA);
    crownA.position.set(0,trunkH+1.05*scale,0);tree.add(crownA);
    const crownB=new THREE.Mesh(new THREE.SphereGeometry(.66*scale,8,7),leafB);
    crownB.position.set(-.46*scale,trunkH+.8*scale,.2*scale);tree.add(crownB);
    const crownC=new THREE.Mesh(new THREE.SphereGeometry(.62*scale,8,7),leafB);
    crownC.position.set(.45*scale,trunkH+.82*scale,-.18*scale);tree.add(crownC);
    if(fruit){
      for(const [fx,fy,fz] of [[-.42,.95,.62],[.38,1.22,.48],[.58,.72,-.18],[-.2,1.42,-.48]]){
        const item=new THREE.Mesh(new THREE.SphereGeometry(.11*scale,7,6),fruitMat);
        item.position.set(fx*scale,trunkH+fy*scale,fz*scale);tree.add(item);
      }
    }
    tree.position.set(x,0,z);parent.add(tree);
    return tree;
  }
  addGardenFence(parent,w,d,material){
    const halfW=w/2,halfD=d/2,spacing=1.65;
    for(let x=-halfW;x<=halfW+.01;x+=spacing){
      for(const z of [-halfD,halfD])this.box(parent,.13,.8,.13,material,x,.4,z);
    }
    for(let z=-halfD;z<=halfD+.01;z+=spacing){
      for(const x of [-halfW,halfW])this.box(parent,.13,.8,.13,material,x,.4,z);
    }
    for(const y of [.28,.62]){
      this.box(parent,w,.09,.09,material,0,y,-halfD);
      this.box(parent,w,.09,.09,material,0,y,halfD);
      this.box(parent,.09,.09,d,material,-halfW,y,0);
      this.box(parent,.09,.09,d,material,halfW,y,0);
    }
  }

  addFacadeBattens(parent,w,h,z,material,spacing=.82,baseY=0){
    const count=Math.max(3,Math.floor(w/spacing));
    for(let i=0;i<=count;i++){
      const x=-w/2+(w/count)*i;
      this.box(parent,.055,h*.94,.075,material,x,baseY+h*.5,z);
    }
    this.box(parent,w+.12,.12,.1,material,0,baseY+h*.96,z);
    this.box(parent,w+.12,.12,.1,material,0,baseY+h*.04,z);
  }
  addRoofRibs(parent,w,d,eaveY,rise,material,overhang=.5){
    const half=(w+overhang*2)/2,depth=d+overhang*2;
    const angle=Math.atan2(rise,half),length=Math.hypot(half,rise);
    const count=Math.max(5,Math.floor(d/1.15));
    for(let i=0;i<=count;i++){
      const z=-depth/2+(depth/count)*i;
      const left=this.box(parent,length,.075,.09,material,-half/2,eaveY+rise/2,z);
      left.rotation.z=angle;
      const right=this.box(parent,length,.075,.09,material,half/2,eaveY+rise/2,z);
      right.rotation.z=-angle;
    }
  }
  buildHouse(group,o,wood,darkWood,roof,stone,glass,warm){
    const {w,d,h}=o.dimensions,baseH=.42,wallH=h*.66,eaveY=baseH+wallH;
    this.box(group,w+.56,baseH,d+.56,stone,0,baseH/2,0);
    this.box(group,w+.2,.16,d+.2,darkWood,0,baseH+.08,0);
    this.box(group,w,wallH,d,wood,0,baseH+wallH/2,0);
    for(let y=baseH+.32;y<eaveY-.08;y+=.42){
      this.box(group,w+.08,.055,.08,darkWood,0,y,d/2+.035);
      this.box(group,w+.08,.055,.08,darkWood,0,y,-d/2-.035);
    }
    this.gableFace(group,w,wallH*.34,d/2+.045,wood,eaveY);
    this.gableFace(group,w,wallH*.34,-d/2-.045,wood,eaveY);
    const frontFaceZ=d/2+.09,backFaceZ=-d/2-.09,sideX=w/2+.055;
    const siding=this.material(0x795a3c),trim=this.material(0x4d3929);
    this.addFacadeBattens(group,w,wallH,frontFaceZ,siding,.78,baseH);
    this.addFacadeBattens(group,w,wallH,backFaceZ,siding,.78,baseH);
    for(const x of [-sideX,sideX]){
      for(let z=-d/2+.18;z<=d/2-.1;z+=.78)this.box(group,.075,wallH*.94,.055, siding,x,baseH+wallH/2,z);
      this.box(group,.11,.12,d+.12,trim,x,baseH+wallH*.96,0);
    }
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])this.box(group,.16,wallH+.2,.16,trim,x,baseH+wallH/2,z);
    const frontZ=d/2+.15;
    this.addWindow(group,-w*.29,baseH+wallH*.57,frontZ,w*.19,wallH*.27,darkWood,glass);
    this.addWindow(group,w*.29,baseH+wallH*.57,frontZ,w*.19,wallH*.27,darkWood,glass);
    this.addWindow(group,-w*.29,baseH+wallH*.57,-frontZ,w*.19,wallH*.27,darkWood,glass);
    this.addWindow(group,w*.29,baseH+wallH*.57,-frontZ,w*.19,wallH*.27,darkWood,glass);
    this.box(group,w*.21,wallH*.66,.16,darkWood,0,baseH+wallH*.33,frontZ+.035);
    this.box(group,w*.18,.08,.07,wood,0,baseH+wallH*.66,frontZ+.12);
    this.box(group,w*.18,.08,.07,wood,0,baseH,frontZ+.12);
    this.box(group,.07,wallH*.66,.07,wood,-w*.105,baseH+wallH*.33,frontZ+.12);
    this.box(group,.07,wallH*.66,.07,wood,w*.105,baseH+wallH*.33,frontZ+.12);
    this.box(group,w*.12,.08,.055,warm,w*.045,baseH+wallH*.48,frontZ+.13);
    this.addGableRoof(group,w,d,eaveY,wallH*.42,roof,.55);
    this.addRoofRibs(group,w,d,eaveY,wallH*.42,darkWood,.55);
    const roofRise=wallH*.42,roofHalf=(w+.55*2)/2;
    const chimneyRoofY=eaveY+roofRise*(1-(w*.28)/roofHalf);
    const chimneyTop=chimneyRoofY+.68;
    this.box(group,.46,1.12,.46,stone,w*.28,chimneyTop-.56,-d*.22);
    this.box(group,.58,.14,.58,darkWood,w*.28,chimneyTop+.06,-d*.22);
    const porchZ=d*.68;
    this.box(group,w*.76,.18,d*.48,darkWood,0,.54,porchZ);
    for(const x of [-w*.32,w*.32]){
      this.box(group,.14,1.2,.14,wood,x,1.14,porchZ+d*.2);
      this.box(group,.12,.82,.12,darkWood,x,1.05,porchZ+d*.2);
    }
    this.box(group,w*.8,.12,.14,wood,0,1.72,porchZ+d*.2);
    this.box(group,w*.46,.14,.55,stone,0,.17,d*.98);
    for(let step=0;step<3;step++)this.box(group,w*.5,.12,.42,stone,0,.08+step*.12,d*.98+step*.38);
    const lamp=this.material(0xe1b65f,.45,true,.82);
    this.box(group,.22,.3,.16,lamp,w*.34,baseH+wallH*.48,frontZ+.16);
  }
  buildModel(group,o){
    const wood=this.material(0x94704a),darkWood=this.material(0x5a4430),roof=this.material(0x52666a),stone=this.material(0x777a70),glass=this.material(0xa6c4b5,.28,true,.34),leaf=this.material(0x59764a),warm=this.material(0xd9a85e),soil=this.material(0x5b402c);
    const {w,d,h}=o.dimensions;
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(Math.max(w,d)*.78,32),new THREE.MeshBasicMaterial({color:0x10170f,transparent:true,opacity:.19,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.006;group.add(shadow);

    if(o.type==="house"){
      this.buildHouse(group,o,wood,darkWood,roof,stone,glass,warm);
    }else if(o.type==="tower"){
      const plinth=new THREE.Mesh(new THREE.CylinderGeometry(w*.58,w*.64,.5,10),stone);plinth.position.y=.25;group.add(plinth);
      const legMat=this.material(0x694b32),braceMat=this.material(0x523d2c);
      const half=w*.34,topY=h*.62;
      for(const x of [-half,half])for(const z of [-half,half]){
        this.beamBetween(group,{x:x*1.2,y:.48,z:z*1.2},{x,y:topY,z},.17,legMat);
        this.box(group,.2,.18,.2,darkWood,x,.58,z);
      }
      for(const y of [1.25,topY*.48]){
        for(const z of [-half,half])this.beamBetween(group,{x:-half,y:y*.72,z},{x:half,y:y*.72,z},.075,braceMat);
        for(const x of [-half,half])this.beamBetween(group,{x,y:y*.72,z:-half},{x,y:y*.72,z:half},.075,braceMat);
      }
      const radius=w*.39,tankH=h*.32,tankY=topY-tankH*.18;
      const tank=new THREE.Mesh(new THREE.CylinderGeometry(radius*.92,radius,tankH,14),wood);tank.position.y=tankY;group.add(tank);
      for(let i=0;i<16;i++){
        const a=i*Math.PI*2/16;
        const slat=this.box(group,.085,tankH*.94,.09,darkWood,Math.cos(a)*radius*.91,tankY,Math.sin(a)*radius*.91);
        slat.rotation.y=-a;
      }
      for(const y of [tankY-tankH*.43,tankY+tankH*.43]){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*.97,.09,6,24),darkWood);ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring);
      }
      const deckY=topY+.14;
      const deck=new THREE.Mesh(new THREE.CylinderGeometry(w*.66,w*.66,.22,12),darkWood);deck.position.y=deckY;group.add(deck);
      const railMat=this.material(0x755638);
      for(let i=0;i<16;i++){
        const a=i*Math.PI*2/16,x=Math.cos(a)*w*.63,z=Math.sin(a)*w*.63;
        this.box(group,.09,.78,.09,railMat,x,deckY+.49,z);
      }
      const rail=new THREE.Mesh(new THREE.TorusGeometry(w*.63,.055,5,32),wood);rail.rotation.x=Math.PI/2;rail.position.y=deckY+.85;group.add(rail);
      const roofCap=new THREE.Mesh(new THREE.ConeGeometry(w*.62,h*.19,8),roof);roofCap.position.y=deckY+1.12;group.add(roofCap);
      for(const x of [-w*.12,w*.12]){
        this.beamBetween(group,{x,y:.72,z:w*.43},{x,y:topY-.18,z:w*.43},.045,braceMat);
      }
      for(let y=.75;y<topY-.25;y+=.44){
        this.box(group,.62,.075,.075,wood,-w*.08,y,w*.42);
      }
      this.box(group,.9,.11,.12,darkWood,0,topY*.55,w*.46);
      const lampGlass=this.material(0xf0c56c,.25,true,.85);
      const beacon=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),lampGlass);beacon.position.set(0,deckY+1.92,0);group.add(beacon);
      const glow=new THREE.PointLight(0xffc66e,2.1,17);glow.position.copy(beacon.position);group.add(glow);
      const beam=new THREE.Mesh(new THREE.ConeGeometry(2.4,6.5,20,1,true),new THREE.MeshBasicMaterial({color:0xffd88b,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}));
      beam.position.set(0,deckY-2.0,0);beam.rotation.x=Math.PI;group.add(beam);
    }else if(o.type==="warehouse"){
      this.box(group,w+.5,.35,d+.5,stone,0,.18,0);
      this.box(group,w,.18,d,darkWood,0,.43,0);
      const wallH=h*.66,eaveY=.52+wallH;
      this.box(group,w,wallH,d,wood,0,.52+wallH/2,0);
      this.gableFace(group,w,wallH*.38,d/2+.025,wood,eaveY);
      this.gableFace(group,w,wallH*.38,-d/2-.025,wood,eaveY);
      const siding=this.material(0x795a3c);
      this.addFacadeBattens(group,w,wallH,d/2+.07,siding,.62,.52);
      this.addFacadeBattens(group,w,wallH,-d/2-.07,siding,.62,.52);
      this.addGableRoof(group,w,d,eaveY,wallH*.42,roof,.45);
      this.addRoofRibs(group,w,d,eaveY,wallH*.42,darkWood,.45);
      const doorZ=d/2+.1;
      for(const x of [-w*.22,w*.22]){
        this.box(group,w*.34,1.95,.16,darkWood,x,1.5,doorZ);
        for(let y=.65;y<2.45;y+=.32)this.box(group,w*.3,.045,.19,wood,x,y,doorZ+.095);
      }
      this.box(group,.16,2.05,.2,wood,0,1.48,doorZ+.04);
      this.addWindow(group,w*.34,wallH*.58,-doorZ,w*.16,.52,darkWood,glass);
      for(const x of [-w*.42,w*.42])this.box(group,.13,wallH*.8,.13,darkWood,x,.52+wallH*.4,d/2+.09);
      for(const x of [-w*.27,w*.27]){
        const crate=new THREE.Mesh(new THREE.BoxGeometry(.8,.62,.7),wood);crate.position.set(x,.82,d*.18);group.add(crate);
        for(let y=.58;y<1.1;y+=.22)this.box(group,.84,.035,.73,darkWood,x,y,d*.18);
      }
    }else if(o.type==="greenhouse"){
      const frame=this.material(0x526b58),ridgeY=h*.88,halfW=w*.48;
      const slopeRise=h*.30,angle=Math.atan2(slopeRise,halfW),slopeLen=Math.hypot(halfW,slopeRise);
      this.box(group,w+.24,.2,d+.24,stone,0,.1,0);
      // Four transparent wall planes. Each is a separate thin surface, not a solid glass block.
      this.box(group,w-.12,h*.52,.055,glass,0,h*.28,d*.49);
      this.box(group,w-.12,h*.52,.055,glass,0,h*.28,-d*.49);
      this.box(group,.055,h*.52,d-.12,glass,halfW,h*.28,0);
      this.box(group,.055,h*.52,d-.12,glass,-halfW,h*.28,0);
      // Two roof panes run along the greenhouse length and meet at the ridge.
      const leftPane=this.box(group,slopeLen,.055,d-.14,glass,-halfW*.5,h*.73,0);leftPane.rotation.z=angle;
      const rightPane=this.box(group,slopeLen,.055,d-.14,glass,halfW*.5,h*.73,0);rightPane.rotation.z=-angle;
      // Transverse ribs are repeated down the length (Z), each following the gable profile.
      for(let i=0;i<=4;i++){
        const z=-d*.46+i*d*.23;
        this.beamBetween(group,{x:-halfW,y:.18,z},{x:-halfW,y:h*.58,z},.075,frame);
        this.beamBetween(group,{x:halfW,y:.18,z},{x:halfW,y:h*.58,z},.075,frame);
        this.beamBetween(group,{x:-halfW,y:h*.58,z},{x:0,y:ridgeY,z},.095,frame);
        this.beamBetween(group,{x:0,y:ridgeY,z},{x:halfW,y:h*.58,z},.095,frame);
        this.box(group,.09,.09,.09,frame,0,ridgeY,z);
      }
      this.box(group,.13,.13,d,frame,0,ridgeY,0);
      this.box(group,.1,.1,d,frame,-halfW,h*.58,0);
      this.box(group,.1,.1,d,frame,halfW,h*.58,0);
      // Gabled transparent end faces.
      this.gableFace(group,w-.12,h*.30,d*.49,glass,h*.58);
      this.gableFace(group,w-.12,h*.30,-d*.49,glass,h*.58);
      // Entrance door and three interior planting beds.
      this.box(group,w*.2,h*.62,.09,darkWood,0,h*.34,d*.5+.055);
      this.box(group,w*.15,h*.57,.045,glass,0,h*.34,d*.5+.11);
      const plantScale=w/6.2;
      for(let row=0;row<3;row++){
        const z=(row-1)*.78*plantScale;
        this.box(group,w*.68,.15*plantScale,.34*plantScale,soil,0,.22*plantScale,z);
        for(let i=0;i<7;i++){
          const plant=new THREE.Mesh(new THREE.SphereGeometry(.12*plantScale,7,6),leaf);
          plant.position.set((i-3)*.48*plantScale,.48*plantScale,z);group.add(plant);
        }
      }
    }else if(o.type==="gazebo"){
      const gazeboScale=Math.min(w,d)/4.4;
      const platformRadius=Math.min(w,d)*.47;
      const platform=new THREE.Mesh(new THREE.CylinderGeometry(platformRadius*.96,platformRadius,.32*gazeboScale,6),stone);platform.position.y=.16*gazeboScale;group.add(platform);
      const postMat=this.material(0x805d3c),railMat=this.material(0x654a32);
      const postRadius=Math.min(w,d)*.37,benchScale=gazeboScale;
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3,x=Math.cos(a)*postRadius,z=Math.sin(a)*postRadius;
        this.box(group,.2*benchScale,h*.7,.2*benchScale,postMat,x,h*.35,z);
        const rail=new THREE.Mesh(new THREE.BoxGeometry(postRadius*.98,.12*benchScale,.12*benchScale),railMat);
        rail.position.set(Math.cos(a+Math.PI/6)*postRadius*.88,.82*benchScale,Math.sin(a+Math.PI/6)*postRadius*.88);
        rail.rotation.y=-(a+Math.PI/6);group.add(rail);
      }
      const canopyRadius=Math.min(w,d)*.56;
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(canopyRadius,h*.34,6),roof);canopy.position.y=h*.85;group.add(canopy);
      const eave=new THREE.Mesh(new THREE.CylinderGeometry(canopyRadius*.98,canopyRadius*.98,.18*benchScale,6),darkWood);eave.position.y=h*.68;group.add(eave);
      this.addBench(group,-.2*benchScale,.05*benchScale,0,wood,darkWood,benchScale);
      this.addBench(group,.35*benchScale,-.78*benchScale,Math.PI*.5,wood,darkWood,benchScale);
    }else if(o.type==="firepit"){
      const fireScale=w/3.4;
      const ground=new THREE.Mesh(new THREE.CircleGeometry(w*.72,24),new THREE.MeshStandardMaterial({color:0x88765b,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=.025;group.add(ground);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(w*.36,.32*fireScale,8,24),stone);ring.rotation.x=Math.PI/2;ring.position.y=.34;group.add(ring);
      const bed=new THREE.Mesh(new THREE.CylinderGeometry(w*.31,w*.32,.18*fireScale,18),soil);bed.position.y=.22*fireScale;group.add(bed);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.31*fireScale,0),stone);
        rock.position.set(Math.cos(a)*w*.36,.38*fireScale,Math.sin(a)*w*.36);rock.scale.set(1,.72,.9);group.add(rock);
      }
      const logMat=this.material(0x65462d),ember=this.material(0xe78a38,.45,true,.9);
      const log1=this.box(group,1.75*fireScale,.24*fireScale,.23*fireScale,logMat,0,.45*fireScale,0);log1.rotation.y=.42;
      const log2=this.box(group,1.65*fireScale,.22*fireScale,.22*fireScale,logMat,0,.58*fireScale,0);log2.rotation.y=-.6;
      const flameA=new THREE.Mesh(new THREE.ConeGeometry(.58*fireScale,1.55*fireScale,7),warm);flameA.position.y=1.35*fireScale;group.add(flameA);
      const flameB=new THREE.Mesh(new THREE.ConeGeometry(.34*fireScale,1.05*fireScale,6),ember);flameB.position.set(.18*fireScale,1.25*fireScale,.08*fireScale);group.add(flameB);
      const flameC=new THREE.Mesh(new THREE.ConeGeometry(.25*fireScale,.82*fireScale,6),warm);flameC.position.set(-.18*fireScale,1.06*fireScale,-.08*fireScale);group.add(flameC);
      const fireLight=new THREE.PointLight(0xff8a3d,2.4,12*fireScale);fireLight.position.y=1.35*fireScale;group.add(fireLight);
      this.flameEffects.push({flames:[flameA,flameB,flameC],light:fireLight,phase:this.flameEffects.length*.83});
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        this.addBench(group,Math.cos(a)*w*.38,Math.sin(a)*w*.38,a+Math.PI/2,wood,darkWood,.42*fireScale);
      }
    }else if(o.type==="garden"){
      this.addGardenFence(group,w*.94,d*.94,darkWood);
      const gardenScale=w/7,gardenDepthScale=d/5;
      for(let row=0;row<4;row++){
        const z=(row-1.5)*.95*gardenDepthScale;
        this.box(group,w*.72,.16*gardenScale,.62*gardenDepthScale,wood,0,.16*gardenScale,z);
        this.box(group,w*.66,.12*gardenScale,.5*gardenDepthScale,soil,0,.26*gardenScale,z);
        for(let i=0;i<9;i++){
          const x=(i-4)*.48*gardenScale;
          const stem=this.box(group,.045*gardenScale,.42*gardenScale,.045*gardenScale,leaf,x,.5*gardenScale,z);
          stem.rotation.z=(i%2?-.1:.1);
          const crown=new THREE.Mesh(new THREE.SphereGeometry(.16*gardenScale,7,6),leaf);crown.position.set(x,.76*gardenScale,z);group.add(crown);
        }
      }
      const orchard=[[-w*.34,-d*.34,.85],[-w*.12,-d*.35,.72],[w*.18,-d*.34,.8],[w*.34,d*.28,.82]];
      const treeScale=w/7;
      orchard.forEach(([x,z,s],i)=>this.addTree(group,x,z,s*treeScale,i%2===0));
      this.box(group,w*.12,.55*gardenScale,.12*gardenScale,darkWood,w*.42,.28*gardenScale,-d*.42);
    }else if(o.type==="well"){
      const radius=Math.min(w,d)*.43;
      const base=new THREE.Mesh(new THREE.CylinderGeometry(radius*.94,radius,.55,12),stone);
      base.position.y=.275;group.add(base);
      const lip=new THREE.Mesh(new THREE.TorusGeometry(radius*.84,.10,6,20),darkWood);
      lip.rotation.x=Math.PI/2;lip.position.y=.58;group.add(lip);
      const postX=w*.36,postHeight=h*.55,postBase=.58,postTop=postBase+postHeight;
      for(const x of [-postX,postX])this.box(group,.14,postHeight,.14,wood,x,postBase+postHeight/2,0);
      this.beamBetween(group,{x:-postX,y:postTop,z:0},{x:postX,y:postTop,z:0},.085,darkWood);
      const rollerY=postTop-.18;
      const roller=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,w*.92,10),darkWood);
      roller.rotation.z=Math.PI/2;roller.position.set(0,rollerY,0);group.add(roller);
      const crank=new THREE.Mesh(new THREE.TorusGeometry(.29,.05,6,12),wood);
      crank.position.set(postX+.16,rollerY,0);crank.rotation.y=Math.PI/2;group.add(crank);
      this.beamBetween(group,{x:postX+.16,y:rollerY,z:0},{x:postX+.16,y:rollerY-.42,z:0},.06,wood);
      this.beamBetween(group,{x:0,y:rollerY-.1,z:0},{x:0,y:.9,z:0},.022,darkWood);
      const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.16,.12,.27,9,1,true),darkWood);
      bucket.position.set(0,.78,0);group.add(bucket);
      this.addGableRoof(group,w*.98,d*.98,postTop+.04,h*.16,roof,.08);
    }
    const marker=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.08,12),warm);
    marker.position.set(0,.09,0);marker.userData.objectId=o.id;group.add(marker);
  }
  addObject(object){
    if(!this.mapReady){this.pendingObjects.push(object);return;}
    const group=new THREE.Group();group.position.copy(this.mapPoint(object.position));group.userData.objectId=object.id;
    this.buildModel(group,object);this.scene.add(group);this.objectGroups.set(object.id,group);
    group.traverse(node=>{if(node.isMesh){node.userData.objectId=object.id;this.pickables.push(node);node.castShadow=true;node.receiveShadow=true;}});
  }
  addObjects(objects){objects.forEach(o=>this.addObject(o));}
  syncCharacters(characters,tasks,objects){
    if(!this.mapReady){this.pendingCharacters=[characters,tasks,objects];return;}
    for(const group of this.characterGroups?.values?.()||[])this.scene.remove(group);
    this.characterGroups=new Map();
    const active=(tasks||[]).filter(t=>t.status==="in_progress"&&t.ownerId&&t.objectId);
    const used=new Map();
    active.forEach(task=>{
      if(this.characterGroups.has(task.ownerId))return;
      const person=(characters||[]).find(c=>c.id===task.ownerId);
      const object=(objects||[]).find(o=>o.id===task.objectId);
      if(!person||!object)return;
      const count=used.get(object.id)||0;used.set(object.id,count+1);
      const group=this.createWorker(person,task,object,count);
      this.scene.add(group);this.characterGroups.set(person.id,group);
    });
  }
  createWorker(person,task,object,index){
    const palettes={
      dmitry:{coat:0x53634a,trousers:0x3b4438,hair:0x3a2b22,skin:0xd7aa83,accent:0xb18b54},
      tatiana:{coat:0x9b7655,trousers:0x59664b,hair:0xe4c276,skin:0xe6b995,accent:0xd9c7a0},
      alexey:{coat:0x536b78,trousers:0x454a42,hair:0x62442f,skin:0xd6a57e,accent:0x9caa9d},
      sergey:{coat:0x8a6842,trousers:0x424b3b,hair:0x51402e,skin:0xc99570,accent:0xc0a06b}
    };
    const p=palettes[person.id]||palettes.sergey;
    const mat=c=>this.material(c,.92);
    const group=new THREE.Group();group.userData.characterId=person.id;group.userData.taskId=task.id;
    const point=this.mapPoint(object.position);
    const side=index%2===0?-1:1;
    group.position.set(point.x+side*(object.dimensions.w*.5+1.1),.02,point.z+object.dimensions.d*.5+1.15+Math.floor(index/2)*1.1);
    group.rotation.y=side===-1?-.28:.28;
    const skin=mat(p.skin),coat=mat(p.coat),trousers=mat(p.trousers),hair=mat(p.hair),boots=mat(0x332b22),accent=mat(p.accent);
    const limb=(x1,y1,z1,x2,y2,z2,r,m)=>{
      const a=new THREE.Vector3(x1,y1,z1),b=new THREE.Vector3(x2,y2,z2),delta=new THREE.Vector3().subVectors(b,a);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*.82,r,delta.length(),7),m);
      mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);return mesh;
    };
    // Static, readable working silhouette. No walk cycle or locomotion.
    this.box(group,.58,.66,.34,coat,0,1.08,0);
    this.box(group,.38,.14,.36,accent,0,1.43,0);
    limb(-.17,.79,0,-.22,.22,.02,.105,trousers);
    limb(.17,.79,0,.22,.22,.02,.105,trousers);
    this.box(group,.22,.12,.34,boots,-.22,.08,.05);
    this.box(group,.22,.12,.34,boots,.22,.08,.05);
    const work=/сад|гряд|полив|посад|теплиц|урожай/i.test(task.title);
    const inspect=/осмотр|провер|оцен|инвентар/i.test(task.title);
    const raised=work||/ремонт|стро|кров|монтаж|почин/i.test(task.title);
    limb(-.28,1.32,0,-.48,raised?1.48:1.17,.08,.085,coat);
    limb(.28,1.32,0,.49,raised?1.5:1.14,.08,.085,coat);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.23,12,10),skin);head.position.set(0,1.68,0);group.add(head);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.235,12,7,0,Math.PI*2,0,Math.PI*.55),hair);cap.position.set(0,1.77,-.015);group.add(cap);
    if(person.id==="tatiana"){
      const bun=new THREE.Mesh(new THREE.SphereGeometry(.13,9,7),hair);bun.position.set(.17,1.65,-.12);group.add(bun);
      limb(.19,1.65,-.1,.22,1.3,-.12,.055,hair);
    }else{
      const beard=new THREE.Mesh(new THREE.SphereGeometry(.12,9,6),hair);beard.scale.set(1,.55,.65);beard.position.set(0,1.53,.12);group.add(beard);
    }
    const eyeMat=mat(0x332a24);
    this.box(group,.045,.045,.025,eyeMat,-.075,1.69,.215);
    this.box(group,.045,.045,.025,eyeMat,.075,1.69,.215);
    // Tool is a static visual cue, selected from the actual task title.
    if(work){
      const can=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.23,8),accent);can.position.set(.54,1.03,.1);group.add(can);
      const handle=new THREE.Mesh(new THREE.TorusGeometry(.09,.025,5,10,Math.PI),accent);handle.position.set(.54,1.16,.1);group.add(handle);
    }else if(inspect){
      this.box(group,.22,.28,.035,accent,.5,1.12,.1);
    }else{
      limb(.49,1.49,.08,.64,1.02,.13,.035,boots);
      const tool=this.box(group,.055,.5,.055,accent,.64,1.22,.13);tool.rotation.z=-.2;
    }
    // Nameplate is a label, not an animated UI element.
    const label=document.createElement("canvas");label.width=256;label.height=64;
    const ctx=label.getContext("2d");ctx.fillStyle="rgba(31,43,32,.88)";ctx.beginPath();ctx.roundRect(4,4,248,56,14);ctx.fill();
    ctx.fillStyle="#f5ecd8";ctx.font="bold 28px Georgia";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(person.name,128,33);
    const texture=new THREE.CanvasTexture(label);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
    sprite.scale.set(2.3,.58,1);sprite.position.set(0,2.35,0);group.add(sprite);
    group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    return group;
  }

  bindControls(){
    this.canvas.addEventListener("pointerdown",e=>{this.drag={x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,moved:false};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener("pointermove",e=>{
      if(!this.drag)return;const dx=e.clientX-this.drag.px,dy=e.clientY-this.drag.py;
      if(Math.abs(e.clientX-this.drag.x)+Math.abs(e.clientY-this.drag.y)>4)this.drag.moved=true;
      if(this.drag.moved){const units=(this.camera.top-this.camera.bottom)/this.camera.zoom,scale=units/this.canvas.clientHeight;this.target.x-=dx*scale;this.target.z+=dy*scale/Math.abs(this.cameraUpZ);this.camera.position.set(this.target.x,this.cameraHeight/this.camera.zoom,this.target.z+this.cameraDepth/this.camera.zoom);this.camera.lookAt(this.target);}
      this.drag.px=e.clientX;this.drag.py=e.clientY;
    });
    this.canvas.addEventListener("pointerup",e=>{if(this.drag&&!this.drag.moved)this.pick(e);this.drag=null;});
    this.canvas.addEventListener("wheel",e=>{e.preventDefault();this.setZoom(this.camera.zoom*(e.deltaY<0?1.12:.89));},{passive:false});
    this.canvas.addEventListener("pointercancel",()=>this.drag=null);
  }
  pick(event){
    const rect=this.canvas.getBoundingClientRect();this.pointer.x=((event.clientX-rect.left)/rect.width)*2-1;this.pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects(this.pickables,true);
    if(hits.length){const id=hits[0].object.userData.objectId;if(id)this.onSelect?.(id);}
  }
  setZoom(value){this.camera.zoom=THREE.MathUtils.clamp(value,.65,2.8);this.camera.position.set(this.target.x,this.cameraHeight/this.camera.zoom,this.target.z+this.cameraDepth/this.camera.zoom);this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();}
  zoomIn(){this.setZoom(this.camera.zoom*1.15)}zoomOut(){this.setZoom(this.camera.zoom/1.15)}
  reset(){this.target.set(0,0,0);this.fitCamera();}
  focusObject(id){const g=this.objectGroups.get(id);if(!g)return;this.target.set(g.position.x,0,g.position.z);this.camera.position.set(this.target.x,this.cameraHeight/this.camera.zoom,this.target.z+this.cameraDepth/this.camera.zoom);this.camera.lookAt(this.target);}
  animate(){
    const time=performance.now()*.001;
    for(const effect of this.flameEffects){
      const pulse=1+Math.sin(time*8+effect.phase)*.075;
      effect.flames[0].scale.set(pulse,1+Math.sin(time*10+effect.phase)*.09,pulse);
      effect.flames[1].scale.y=1+Math.sin(time*11+effect.phase+1)*.13;
      effect.flames[2].scale.y=1+Math.sin(time*9+effect.phase+2)*.1;
      effect.flames[1].rotation.y=time*.7;
      effect.flames[2].rotation.y=-time*.55;
      effect.light.intensity=2.15+Math.sin(time*12+effect.phase)*.28;
    }
    this.renderer.render(this.scene,this.camera);
    requestAnimationFrame(this.animate);
  }
}
