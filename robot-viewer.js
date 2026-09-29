/* Image-based reconstruction; proportions are illustrative, not manufacturing dimensions.
   Three.js is bundled locally so the viewer also works when index.html is opened directly. */
(() => {
  'use strict';
  const figure = document.querySelector('.robot-viewer');
  if (!figure) return;
  const stage = figure.querySelector('.robot-stage');
  const badge = figure.querySelector('.robot-badge');
  const fail = () => { figure.classList.remove('is-ready'); badge.textContent = 'REFERENCE IMAGE'; };
  if (!window.THREE) { fail(); return; }
  const T = window.THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' }); }
  catch { fail(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive 3D reconstruction of the robot arm. Drag to rotate, scroll or pinch to zoom. Arrow keys rotate, plus and minus zoom, R resets. Joint sliders change the pose.');
  stage.prepend(canvas);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 1, .1, 60);
  const target = new T.Vector3(-.42, 2.18, 0);
  const defaults = { yaw:.52, pitch:.16, distance:8.5, base:0, shoulder:-4, elbow:64, gripper:30 };
  let yaw=defaults.yaw, pitch=defaults.pitch, distance=defaults.distance, spinning=false, visible=true, frame=0, lastTime=0;
  const clamp = T.MathUtils.clamp;
  const rad = T.MathUtils.degToRad;
  scene.add(new T.HemisphereLight(0xfffcf3, 0x747e66, 2.4));
  const key = new T.DirectionalLight(0xfff8e9, 3.5);
  key.position.set(-3,7,6); key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera, {left:-5,right:5,top:6,bottom:-4,near:.1,far:25});
  key.shadow.normalBias=.025; key.shadow.bias=-.00015;
  scene.add(key);
  const rim = new T.DirectionalLight(0xe4ebf4, 2.5); rim.position.set(4,5,-4); scene.add(rim);
  const fill = new T.DirectionalLight(0xffffff, .7); fill.position.set(0,1,6); scene.add(fill);
  const plastic = new T.MeshStandardMaterial({color:0x434641,roughness:.62,metalness:.12});
  const edge = new T.MeshStandardMaterial({color:0x30342f,roughness:.65,metalness:.18});
  const servo = new T.MeshStandardMaterial({color:0x1c211d,roughness:.48,metalness:.2});
  const metal = new T.MeshStandardMaterial({color:0x93978d,roughness:.31,metalness:.8});
  const rubber = new T.MeshStandardMaterial({color:0x1b211b,roughness:.95});
  const wireRed = new T.MeshStandardMaterial({color:0xa33223,roughness:.55});
  const wireYellow = new T.MeshStandardMaterial({color:0xa69325,roughness:.55});
  const wireBlue = new T.MeshStandardMaterial({color:0x27364c,roughness:.55});
  function mesh(parent, geometry, material, x=0,y=0,z=0) {
    const object = new T.Mesh(geometry, material); object.position.set(x,y,z);
    object.castShadow=true; object.receiveShadow=true; parent.add(object); return object;
  }
  function box(parent,w,h,d,x,y,z,material=plastic) { return mesh(parent,new T.BoxGeometry(w,h,d),material,x,y,z); }
  function cylinder(parent,rt,rb,h,x,y,z,material=plastic,axis='y',segments=48) {
    const object=mesh(parent,new T.CylinderGeometry(rt,rb,h,segments),material,x,y,z);
    if(axis==='z') object.rotation.x=Math.PI/2;
    if(axis==='x') object.rotation.z=Math.PI/2;
    return object;
  }
  function bolt(parent,x,y,z,r=.043) {
    cylinder(parent,r,r,.027,x,y,z,metal,'z',6);
    cylinder(parent,r*.36,r*.36,.03,x,y,z+.01,servo,'z',6);
  }
  function plate(parent,length,radius,depth,z) {
    const s=new T.Shape(); s.moveTo(-radius,0); s.lineTo(-radius,length);
    s.absarc(0,length,radius,Math.PI,0,true); s.lineTo(radius,0); s.absarc(0,0,radius,0,-Math.PI,true);
    const g=new T.ExtrudeGeometry(s,{depth,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.025,bevelThickness:.02,curveSegments:16});
    return mesh(parent,g,plastic,0,0,z-depth/2);
  }
  function joint(parent,y,r=.28) {
    cylinder(parent,r,r,.74,0,y,0,edge,'z');
    for(const side of [-1,1]) {
      cylinder(parent,r*.8,r*.8,.07,0,y,side*.4,plastic,'z');
      cylinder(parent,r*.36,r*.36,.075,0,y,side*.445,servo,'z');
      cylinder(parent,r*.2,r*.2,.08,0,y,side*.458,metal,'z');
      for(let i=0;i<4;i++) { const a=i*Math.PI/2+.7; bolt(parent,Math.cos(a)*r*.64,y+Math.sin(a)*r*.64,side*.443,.029); }
    }
  }
  function wires(parent,points) {
    [wireRed,wireYellow,wireBlue].forEach((material,i)=>{
      const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0]+(i-1)*.035,p[1],p[2])));
      mesh(parent,new T.TubeGeometry(path,24,.014,6,false),material);
    });
  }
  const robot=new T.Group(); robot.name='Image reconstructed 4 DoF robot arm'; scene.add(robot);
  // Tapered printed base, fixing feet, recessed connector, and rotating turntable.
  cylinder(robot,.66,.83,.56,0,.36,0);
  cylinder(robot,.84,.84,.10,0,.1,0,edge);
  for(const angle of [Math.PI/4,3*Math.PI/4,5*Math.PI/4,7*Math.PI/4]) {
    const foot=box(robot,.31,.10,.35,Math.cos(angle)*.73,.08,Math.sin(angle)*.73,edge);
    foot.rotation.y=-angle;
    cylinder(robot,.047,.047,.035,Math.cos(angle)*.85,.15,Math.sin(angle)*.85,metal,'y',6);
  }
  cylinder(robot,.115,.115,.028,.27,.35,.765,servo,'z');
  cylinder(robot,.065,.065,.032,.27,.35,.784,edge,'z');
  const basePivot=new T.Group(); basePivot.position.y=.69; robot.add(basePivot);
  cylinder(basePivot,.75,.75,.12,0,0,0,edge);
  cylinder(basePivot,.8,.8,.11,0,.1,0,plastic);
  for(const z of [-.32,.32]) {
    plate(basePivot,.35,.25,.14,z).position.y=.2;
    box(basePivot,.63,.12,.19,0,.2,z);
  }
  const shoulder=new T.Group(); shoulder.position.y=.52; basePivot.add(shoulder);
  joint(shoulder,0,.26);
  // Twin side plates with the tall central housing and servo on the rear face.
  plate(shoulder,2.08,.28,.15,-.23); plate(shoulder,2.08,.28,.15,.23);
  box(shoulder,.48,1.84,.39,0,1.06,0);
  box(shoulder,.46,.38,.43,-.04,.17,-.4,servo);
  box(shoulder,.11,.09,.57,-.29,.17,-.4,edge);
  for(const y of [.30,1.87]) for(const x of [-.18,.18]) bolt(shoulder,x,y,.323);
  wires(shoulder,[[.08,.3,-.65],[.22,.75,-.4],[.2,1.65,-.39],[.12,2.12,-.4]]);
  const elbow=new T.Group(); elbow.position.y=2.08; shoulder.add(elbow);
  joint(elbow,0,.31);
  plate(elbow,1.65,.25,.14,-.22); plate(elbow,1.65,.25,.14,.22);
  box(elbow,.42,1.38,.34,0,.84,0);
  box(elbow,.43,.39,.44,0,.12,-.42,servo);
  for(const y of [.23,1.43]) for(const x of [-.16,.16]) bolt(elbow,x,y,.303);
  wires(elbow,[[.12,.06,-.65],[.18,.5,-.4],[.18,1.4,-.36],[.1,1.69,-.34]]);
  const wrist=new T.Group(); wrist.position.y=1.65; elbow.add(wrist);
  joint(wrist,0,.23);
  wrist.rotation.z=rad(112);
  box(wrist,.54,.32,.4,0,.19,0);
  box(wrist,.34,.36,.4,0,.23,-.28,servo);
  box(wrist,.65,.12,.47,0,.39,0,edge);
  wires(wrist,[[.13,.2,-.52],[.22,.33,-.4],[.24,.42,-.28]]);
  const fingers=[];
  for(const sign of [-1,1]) {
    const finger=new T.Group(); finger.position.set(sign*.2,.45,0); wrist.add(finger); fingers.push(finger);
    cylinder(finger,.105,.105,.42,0,0,0,plastic,'z'); bolt(finger,0,0,.24);
    const shape=new T.Shape();
    shape.moveTo(-.09,0);shape.lineTo(.09,0);shape.lineTo(.08,.39);shape.lineTo(.045,.61);shape.lineTo(-.08,.61);shape.lineTo(-.11,.4);shape.closePath();
    mesh(finger,new T.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:true,bevelSize:.02,bevelThickness:.018,bevelSegments:2,steps:1}),plastic,0,0,-.095);
    box(finger,.035,.26,.19,-sign*.075,.43,0,rubber);
    for(let i=0;i<4;i++) box(finger,.025,.025,.2,-sign*.085,.33+i*.065,0,edge);
  }
  const floor=mesh(scene,new T.PlaneGeometry(200,200),new T.ShadowMaterial({opacity:.15}),0,.014,0);
  floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  const grid=new T.GridHelper(5.5,22,0xa6ad9a,0xc9cebf);grid.position.y=.015;
  grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
  const sliders=[...figure.querySelectorAll('input[type=range]')];
  function pose() {
    const values=Object.fromEntries(sliders.map(input=>[input.name,Number(input.value)]));
    basePivot.rotation.y=rad(values.base);shoulder.rotation.z=rad(values.shoulder);elbow.rotation.z=rad(values.elbow);
    fingers[0].rotation.z=rad(values.gripper*.36);fingers[1].rotation.z=-rad(values.gripper*.36);
    sliders.forEach(input=>{ figure.querySelector('output[for="'+input.id+'"]').value=input.value+(input.name==='gripper'?'%':'°'); });
    schedule();
  }
  function draw(time=0) {
    frame=0;
    if(spinning && visible && !document.hidden && !figure.classList.contains('show-reference')) yaw+=Math.min((time-lastTime)/1000,.04)*.3;
    lastTime=time;
    camera.position.set(target.x+distance*Math.sin(yaw)*Math.cos(pitch),target.y+distance*Math.sin(pitch),target.z+distance*Math.cos(yaw)*Math.cos(pitch));
    camera.lookAt(target); renderer.render(scene,camera);
    if(spinning && visible && !document.hidden && !figure.classList.contains('show-reference')) schedule();
  }
  function schedule() { if(!frame) frame=requestAnimationFrame(draw); }
  function resize() { const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();schedule(); }
  function zoom(factor) { distance=clamp(distance*factor,5,13);schedule(); }
  function setSpin(value) { spinning=value;figure.querySelector('[data-robot-action=spin]').setAttribute('aria-pressed',String(value));lastTime=performance.now();schedule(); }
  function reset() { yaw=defaults.yaw;pitch=defaults.pitch;distance=defaults.distance;target.set(-.42,2.18,0);setSpin(false);sliders.forEach(input=>input.value=defaults[input.name]);pose(); }
  sliders.forEach(input=>input.addEventListener('input',pose));
  figure.querySelector('[data-robot-action=reset]').addEventListener('click',reset);
  figure.querySelector('[data-robot-action=spin]').addEventListener('click',()=>setSpin(!spinning));
  figure.querySelector('[data-robot-action=reference]').addEventListener('click',event=>{
    const reference=figure.classList.toggle('show-reference');event.currentTarget.setAttribute('aria-pressed',String(reference));
    event.currentTarget.textContent=reference?'View 3D':'Reference';sliders.forEach(input=>input.disabled=reference);
    badge.textContent=reference?'ORIGINAL RENDER':'INTERACTIVE 3D';if(reference)setSpin(false);schedule();
  });
  figure.querySelector('[data-robot-action=in]').addEventListener('click',()=>zoom(.9));
  figure.querySelector('[data-robot-action=out]').addEventListener('click',()=>zoom(1.1));
  // Pointer orbit and pan, including two-finger pinch. Rendering is on-demand.
  const pointers=new Map();let lastPinch=0;
  const pinchDistance=()=>{const p=[...pointers.values()];return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
  canvas.addEventListener('pointerdown',event=>{
    canvas.focus({preventScroll:true});setSpin(false);canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2)lastPinch=pinchDistance();
  });
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const next=pinchDistance();if(next>0&&lastPinch>0)zoom(lastPinch/next);lastPinch=next;}
    else if(event.shiftKey || event.buttons===2){
      const right=new T.Vector3().setFromMatrixColumn(camera.matrix,0),up=new T.Vector3().setFromMatrixColumn(camera.matrix,1);
      target.addScaledVector(right,-dx*distance*.0013);target.addScaledVector(up,dy*distance*.0013);
    } else {yaw-=dx*.009;pitch=clamp(pitch+dy*.007,-.2,1.2);}
    schedule();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>pointers.delete(event.pointerId));
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(clamp(event.deltaY,-100,100)*.0015));},{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','r','R'].includes(event.key))return;
    event.preventDefault();setSpin(false);
    if(event.key==='ArrowLeft')yaw-=.12;if(event.key==='ArrowRight')yaw+=.12;
    if(event.key==='ArrowUp')pitch=clamp(pitch+.08,-.2,1.2);if(event.key==='ArrowDown')pitch=clamp(pitch-.08,-.2,1.2);
    if(event.key==='+'||event.key==='=')zoom(.9);if(event.key==='-')zoom(1.1);if(event.key.toLowerCase()==='r')reset();schedule();
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setSpin(false);fail();});
  canvas.addEventListener('webglcontextrestored',()=>{figure.classList.add('is-ready');badge.textContent='INTERACTIVE 3D';resize();});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(stage);else window.addEventListener('resize',resize);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();}).observe(stage);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  figure.classList.add('is-ready');badge.textContent='INTERACTIVE 3D';pose();resize();
})();
