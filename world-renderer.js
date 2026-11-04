import * as THREE from "./vendor/three.module.js";

export class WorldRenderer{
  constructor(canvas,viewport,onSelect,onReady){
    this.canvas=canvas;this.viewport=viewport;this.onSelect=onSelect;this.onReady=onReady;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x28372c);
    this.camera=new THREE.OrthographicCamera(-50,50,30,-30,.1,500);
    this.camera.position.set(0,100,0);this.camera.up.set(0,0,-1);this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.pickables=[];this.objectGroups=new Map();this.target=new THREE.Vector3(0,0,0);
    this.drag=null;this.mapAspect=1;this.mapWidth=100;this.mapHeight=70;
    this.addLights();this.loadMap();this.bindControls();this.resize();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);
    this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);
  }
  addLights(){
    this.scene.add(new THREE.HemisphereLight(0xf2f0dc,0x59634e,2.0));
    const sun=new THREE.DirectionalLight(0xffe5b9,2.4);sun.position.set(-25,55,-30);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;
    this.scene.add(sun);
  }
  loadMap(){
    const loader=new THREE.TextureLoader();
    loader.load("./U_Ilem_5_0_visual_base.png",texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
      const image=texture.image;this.mapAspect=image.width/image.height;this.mapHeight=this.mapWidth/this.mapAspect;
      const geometry=new THREE.PlaneGeometry(this.mapWidth,this.mapHeight);
      const material=new THREE.MeshBasicMaterial({map:texture});
      const plane=new THREE.Mesh(geometry,material);plane.rotation.x=-Math.PI/2;plane.position.y=-.08;plane.receiveShadow=true;plane.userData.isMap=true;
      this.scene.add(plane);this.fitCamera();document.getElementById("map-loading")?.classList.add("hidden");
      this.onReady?.({width:image.width,height:image.height,aspect:this.mapAspect});
    },undefined,error=>{
      const el=document.getElementById("map-loading");if(el)el.textContent="Не удалось загрузить утверждённую карту. Проверь наличие PNG рядом с index.html.";
      console.error("Map load failed",error);
    });
  }
  fitCamera(){
    const rect=this.viewport.getBoundingClientRect();const aspect=rect.width/Math.max(1,rect.height);
    const visibleHeight=Math.max(this.mapHeight,this.mapWidth/aspect);
    this.camera.left=-visibleHeight*aspect/2;this.camera.right=visibleHeight*aspect/2;
    this.camera.top=visibleHeight/2;this.camera.bottom=-visibleHeight/2;this.camera.zoom=1;
    this.camera.position.set(this.target.x,100,this.target.z);this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();
  }
  resize(){
    const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight);
    this.renderer.setSize(w,h,false);
    const aspect=w/h;const viewH=Math.max(this.mapHeight,this.mapWidth/aspect);
    this.camera.left=-viewH*aspect/2;this.camera.right=viewH*aspect/2;this.camera.top=viewH/2;this.camera.bottom=-viewH/2;
    this.camera.updateProjectionMatrix();
  }
  mapPoint(position){return new THREE.Vector3((position.x-.5)*this.mapWidth,.04,(position.y-.5)*this.mapHeight);}
  addObject(object){
    const group=new THREE.Group();group.position.copy(this.mapPoint(object.position));group.userData.objectId=object.id;
    this.buildModel(group,object);this.scene.add(group);this.objectGroups.set(object.id,group);
    group.traverse(node=>{if(node.isMesh){node.userData.objectId=object.id;this.pickables.push(node);node.castShadow=true;node.receiveShadow=true;}});
  }
  material(color,roughness=.9,transparent=false,opacity=1){return new THREE.MeshStandardMaterial({color,roughness,transparent,opacity});}
  box(parent,w,h,d,material,x=0,y=h/2,z=0){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  roof(parent,w,h,d,color){
    const geo=new THREE.ConeGeometry(Math.sqrt(w*w+d*d)/1.35, h,4);
    const mesh=new THREE.Mesh(geo,this.material(color));mesh.rotation.y=Math.PI/4;mesh.position.y=h/2;mesh.position.z=0;parent.add(mesh);return mesh;
  }
  buildModel(group,o){
    const wood=this.material(0x8c6744),darkWood=this.material(0x5b4733),roof=this.material(0x536b70),stone=this.material(0x77796c),glass=this.material(0x9eb9ad,.35,true,.42),leaf=this.material(0x536d48),warm=this.material(0xd1a65e);
    const {w,d,h}=o.dimensions;
    if(o.type==="house"){
      this.box(group,w,h*.62,d,wood,0,h*.31,0);this.roof(group,w*1.2,h*.55,d*1.2,roof);
      this.box(group,.9,1.7,.12,darkWood,0,.9,d/2+.07);
      for(const x of [-w*.28,w*.28])this.box(group,.8,.8,.1,this.material(0x9bb1a1),x,h*.35,d/2+.08);
      this.box(group,w*.75,.18,d*.7,darkWood,0,.2,-d*.65);
    }else if(o.type==="tower"){
      this.box(group,w*.62,h*.65,d*.62,wood,0,h*.32,0);
      this.box(group,w*.94,.45,d*.94,darkWood,0,h*.68,0);
      this.box(group,w*.84,.28,d*.84,roof,0,h*.78,0);
      this.roof(group,w*.88,h*.35,d*.88,roof);
      this.box(group,w*.9,.25,d*.9,warm,0,h*.9,0);
      const railMat=this.material(0x6b5138);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;const post=this.box(group,.12,.85,.12,railMat,Math.cos(a)*w*.48,h*.9,Math.sin(a)*d*.48);post.rotation.y=a;}
    }else if(o.type==="warehouse"){
      this.box(group,w,h*.7,d,wood,0,h*.35,0);this.roof(group,w*1.15,h*.45,d*1.15,0x66594a);
      this.box(group,1.5,1.8,.12,darkWood,0,.9,d/2+.08);
    }else if(o.type==="greenhouse"){
      this.box(group,w,.16,d,stone,0,.08,0);
      const frame=this.material(0x647a63);
      this.box(group,.14,h,d,frame,-w/2,.1,0);this.box(group,.14,h,d,frame,w/2,.1,0);
      this.box(group,w,.14,.14,frame,0,h,0);this.box(group,w,.14,.14,frame,0,h,-d/2);this.box(group,w,.14,.14,frame,0,h,d/2);
      const pane=new THREE.Mesh(new THREE.BoxGeometry(w-.2,h-.15,d-.2),glass);pane.position.y=h*.52;group.add(pane);
      const ridge=this.box(group,.12,.12,d,frame,0,h+.05,0);
    }else if(o.type==="gazebo"){
      this.box(group,w*.86,.25,d*.86,stone,0,.13,0);
      for(const x of [-w*.38,w*.38])for(const z of [-d*.38,d*.38])this.box(group,.18,h*.7,.18,wood,x,h*.35,z);
      const top=this.box(group,w,h*.16,d,roof,0,h*.75,0);
      this.roof(group,w*1.08,h*.38,d*1.08,0x6b5942);
    }else if(o.type==="firepit"){
      const ring=new THREE.Mesh(new THREE.CylinderGeometry(w*.46,w*.5,.35,16),stone);ring.position.y=.18;group.add(ring);
      const flame=new THREE.Mesh(new THREE.ConeGeometry(.62,1.35,7),warm);flame.position.y=1.05;group.add(flame);
      const glow=new THREE.PointLight(0xffa64e,2.2,9);glow.position.y=1.4;group.add(glow);
    }else if(o.type==="garden"){
      for(let i=0;i<4;i++){const row=this.box(group,w*.86,.12,.55,this.material(0x765a3b),0,.12,(i-1.5)*.95);}
      for(let i=0;i<7;i++){const x=(i-3)*.85;const trunk=this.box(group,.18,1.3,.18,darkWood,x,.65,-d*.55);const crown=new THREE.Mesh(new THREE.SphereGeometry(.95,8,7),leaf);crown.position.set(x,1.9,-d*.55);group.add(crown);}
    }else if(o.type==="well"){
      const base=new THREE.Mesh(new THREE.CylinderGeometry(w*.55,w*.6,.75,12),stone);base.position.y=.38;group.add(base);
      this.box(group,.14,1.8,.14,wood,-.8,1.25,0);this.box(group,.14,1.8,.14,wood,.8,1.25,0);this.box(group,2,.14,.14,darkWood,0,2.1,0);
      const roofMesh=this.box(group,2,.18,1.5,roof,0,2.35,0);
    }
    const marker=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.08,12),warm);marker.position.set(0,.08,0);marker.userData.objectId=o.id;group.add(marker);
  }
  addObjects(objects){objects.forEach(o=>this.addObject(o));}
  bindControls(){
    this.canvas.addEventListener("pointerdown",e=>{this.drag={x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,moved:false};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener("pointermove",e=>{
      if(!this.drag)return;const dx=e.clientX-this.drag.px,dy=e.clientY-this.drag.py;
      if(Math.abs(e.clientX-this.drag.x)+Math.abs(e.clientY-this.drag.y)>4)this.drag.moved=true;
      if(this.drag.moved){const units=(this.camera.top-this.camera.bottom)/this.camera.zoom;const scale=units/this.canvas.clientHeight;this.target.x-=dx*scale;this.target.z+=dy*scale;this.camera.position.set(this.target.x,100/this.camera.zoom,this.target.z);this.camera.lookAt(this.target);}
      this.drag.px=e.clientX;this.drag.py=e.clientY;
    });
    this.canvas.addEventListener("pointerup",e=>{if(this.drag&&!this.drag.moved)this.pick(e);this.drag=null;});
    this.canvas.addEventListener("wheel",e=>{e.preventDefault();this.setZoom(this.camera.zoom*(e.deltaY<0?1.12:.89));},{passive:false});
    this.canvas.addEventListener("pointercancel",()=>this.drag=null);
  }
  pick(event){
    const rect=this.canvas.getBoundingClientRect();this.pointer.x=((event.clientX-rect.left)/rect.width)*2-1;this.pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.pickables,true);
    if(hits.length){const id=hits[0].object.userData.objectId;if(id)this.onSelect?.(id);}
  }
  setZoom(value){this.camera.zoom=THREE.MathUtils.clamp(value,.65,2.8);this.camera.position.set(this.target.x,100/this.camera.zoom,this.target.z);this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();}
  zoomIn(){this.setZoom(this.camera.zoom*1.15)}zoomOut(){this.setZoom(this.camera.zoom/1.15)}
  reset(){this.target.set(0,0,0);this.camera.position.set(0,100,0);this.camera.zoom=1;this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();}
  focusObject(id){const g=this.objectGroups.get(id);if(!g)return;this.target.set(g.position.x,0,g.position.z);this.camera.position.set(this.target.x,100/this.camera.zoom,this.target.z);this.camera.lookAt(this.target);}
  animate(){this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.animate);}
}
