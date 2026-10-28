(() => {
"use strict";
const $=id=>document.getElementById(id);
const DB_NAME="weightControlDB", DB_VERSION=3;
const DAILY_STORE="dailyRecords", VISIT_STORE="outpatientRecords", PHOTO_STORE="mealPhotos";
const SETTINGS_KEY="weightControlSettings";
const LAST_BACKUP_KEY="weightControlLastFullBackup";
const WEIGHT_REDUCTION_METHOD_KEY="weightControlWeightReductionMethodV22";
const WEIGHT_REWARD_KEY="weightControlWeightRewardV25";
const WEIGHT_REWARD_TIME_KEY="weightControlWeightRewardTimeV25";
let selectedWeightReductionMethod=localStorage.getItem(WEIGHT_REDUCTION_METHOD_KEY)||"latest";
let selectedRewardTime=localStorage.getItem(WEIGHT_REWARD_TIME_KEY)||"morning";
const PHOTO_RETENTION_KEY="weightControlPhotoRetentionV12";
const DEFAULT_PHOTO_RETENTION="365";
const MEALS=["breakfast","lunch","dinner","snack"];
const MEAL_LABELS={breakfast:"朝食",lunch:"昼食",dinner:"夕食",snack:"間食"};
const MAX_PHOTOS_PER_MEAL=6;
const MEAL_REVIEW_SELECTION_KEY="weightControlMealReviewSelectionsV14";
const MEAL_REVIEW_DAYS=30;
const photoObjectUrls=new Map();
const photoEditorState={
  rec:null,img:null,rotation:0,zoom:1,offsetX:0,offsetY:0,aspect:"original",
  pointers:new Map(),lastSingle:null,lastPinch:null
};
const VISIT_FIELD_SETTINGS_KEY="weightControlVisitFieldSettingsV10";
const DEFAULT_VISIT_FIELDS=["weight","bp","hba1c"];
const VISIT_FIELD_LABELS={
  weight:"体重",waist:"腹囲",bp:"血圧",hba1c:"HbA1c",ga:"グリコアルブミン",medication:"薬剤",diet:"食事",exercise:"運動",
  glucose:"血糖",hb:"血色素量 Hb",tc:"総コレステロール",tg:"中性脂肪",hdl:"HDL-C",ldl:"LDL-C",
  ast:"AST",alt:"ALT",ggt:"γ-GTP",ua:"尿酸",cr:"クレアチニン",egfr:"eGFR",protein:"尿蛋白",note:"フリーコメント"
};
const ALL_VISIT_FIELDS=Object.keys(VISIT_FIELD_LABELS).filter(k=>k!=="note"); // フリーコメントは常時表示
let visitTemporaryFields=new Set();
let visitShowAllTemporary=false;
const DAILY_MEASURE_SETTINGS_KEY="weightControlDailyMeasureSettingsV11";
const DEFAULT_DAILY_MEASURE_FIELDS=["weight"];
const DAILY_MEASURE_LABELS={weight:"体重",bodyFat:"体脂肪率",muscleMass:"筋肉量",smbg:"血糖自己測定",bp:"血圧",bowel:"排便あり"};
const ALL_DAILY_MEASURE_FIELDS=["weight","bodyFat","muscleMass","smbg","bp"];
const SMBG_KEYS=["bgBeforeBreakfast","bgAfterBreakfast","bgBeforeLunch","bgAfterLunch","bgBeforeDinner","bgAfterDinner","bgBedtime"];
const SMBG_LABELS={bgBeforeBreakfast:"朝食前",bgAfterBreakfast:"朝食後",bgBeforeLunch:"昼食前",bgAfterLunch:"昼食後",bgBeforeDinner:"夕食前",bgAfterDinner:"夕食後",bgBedtime:"眠前"};
const SMBG_SHORT_LABELS={bgBeforeBreakfast:"朝前",bgAfterBreakfast:"朝後",bgBeforeLunch:"昼前",bgAfterLunch:"昼後",bgBeforeDinner:"夕前",bgAfterDinner:"夕後",bgBedtime:"眠前"};
const SMBG_COLORS={bgBeforeBreakfast:"#2f6f65",bgAfterBreakfast:"#4e82a8",bgBeforeLunch:"#7b6aa6",bgAfterLunch:"#a46c93",bgBeforeDinner:"#b06d47",bgAfterDinner:"#c48f3f",bgBedtime:"#53666f"};
const SMBG_CHART_MODE_KEY="weightControlSmbgChartModeV28";
const BP_CHART_MODE_KEY="weightControlBpChartModeV35";
const EYE_RECORDS_KEY="weightControlEyeRecordsV35";
const MEDICATION_PERIODS_KEY="weightControlMedicationPeriodsV54";
let dailyMeasureTemporaryFields=new Set();
let dailyMeasureShowAllTemporary=false;
let db=null,useFallback=false,selectedPeriod=14,selectedVisitPeriod=365,selectedSmbgPeriod=14,selectedBpPeriod=14,selectedChartMode="continuous";
const VISIT_CHART_MODE_KEY="weightControlVisitChartModeV19";
let selectedVisitChartMode=localStorage.getItem(VISIT_CHART_MODE_KEY)||"separate";
let selectedSmbgChartMode=localStorage.getItem(SMBG_CHART_MODE_KEY)||"sameTime";
let selectedBpChartMode=localStorage.getItem(BP_CHART_MODE_KEY)||"continuous";
let dailyAutoSaveTimer=null, visitAutoSaveTimer=null, isLoadingDaily=false, isLoadingVisit=false;
const DAILY_DRAFT_KEY="weightControlDailyDraftV4";
const VISIT_DRAFT_KEY="weightControlVisitDraftV4";

const todayISO=()=>{
  const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`
};
const monthISO=()=>todayISO().slice(0,7);
const numOrNull=v=>{
  if(v===""||v===null||v===undefined)return null;
  const n=Number(v);return Number.isFinite(n)?n:null
};
const escapeHtml=str=>String(str??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const loadSettings=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")}catch(e){return {}}};
const saveSettings=obj=>localStorage.setItem(SETTINGS_KEY,JSON.stringify(obj));

const hasMeaningfulDailyData=r=>{
  if(!r)return false;
  return r.bowelMovement===true ||
         [r.weightMorning,r.weightEvening,r.bodyFatMorning,r.bodyFatEvening,r.muscleMassMorning,r.muscleMassEvening,r.bpMorningSbp,r.bpMorningDbp,r.bpEveningSbp,r.bpEveningDbp,r.bodyFat,r.muscleMass,r.steps,...SMBG_KEYS.map(k=>r[k])].some(v=>v!==null&&v!==undefined) ||
         [r.breakfast,r.lunch,r.dinner,r.snack,r.note].some(v=>String(v||"").trim()!=="");
};
const hasMeaningfulVisitData=r=>{
  if(!r)return false;
  const numericKeys=["weight","waist","sbp","dbp","glucose","hba1c","ga","hb","tc","tg","hdl","ldl","ast","alt","ggt","ua","cr","egfr"];
  return numericKeys.some(k=>r[k]!==null&&r[k]!==undefined) ||
         [r.medication,r.diet,r.exercise,r.protein,r.note].some(v=>String(v||"").trim()!=="");
};
function saveDraftSync(key,obj){
  try{localStorage.setItem(key,JSON.stringify(obj))}catch(e){}
}
function clearDraftSync(key){
  try{localStorage.removeItem(key)}catch(e){}
}
function loadDraftSync(key){
  try{return JSON.parse(localStorage.getItem(key)||"null")}catch(e){return null}
}
function setSaveStatus(id,text,kind=""){
  const el=$(id); if(!el)return;
  el.textContent=text;
  el.style.color=kind==="ok"?"#2f6f65":kind==="warn"?"#a56a16":"#687673";
}


async function initDB(){
  if(!("indexedDB" in window)){useFallback=true;return}
  try{
    db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains(DAILY_STORE))d.createObjectStore(DAILY_STORE,{keyPath:"date"});
        if(!d.objectStoreNames.contains(VISIT_STORE))d.createObjectStore(VISIT_STORE,{keyPath:"date"});
        if(!d.objectStoreNames.contains(PHOTO_STORE)){
          const s=d.createObjectStore(PHOTO_STORE,{keyPath:"id"});
          s.createIndex("date","date",{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
    })
  }catch(e){useFallback=true}
}
function fallbackKey(store){return store===DAILY_STORE?"weightControlRecords":"weightControlVisits"}
function fallbackAll(store){try{return JSON.parse(localStorage.getItem(fallbackKey(store))||"[]")}catch(e){return []}}
function fallbackSave(store,arr){localStorage.setItem(fallbackKey(store),JSON.stringify(arr))}
async function putItem(store,rec){
  if(useFallback){
    const arr=fallbackAll(store).filter(r=>r.date!==rec.date);arr.push(rec);fallbackSave(store,arr);return
  }
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(rec);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}
async function deleteItem(store,date){
  if(useFallback){fallbackSave(store,fallbackAll(store).filter(r=>r.date!==date));return}
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(date);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}
async function getItem(store,date){
  if(useFallback)return fallbackAll(store).find(r=>r.date===date)||null;
  return await new Promise((resolve,reject)=>{
    const req=db.transaction(store).objectStore(store).get(date);
    req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)
  })
}
async function getAll(store){
  if(useFallback)return fallbackAll(store).sort((a,b)=>a.date.localeCompare(b.date));
  return await new Promise((resolve,reject)=>{
    const req=db.transaction(store).objectStore(store).getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>a.date.localeCompare(b.date)));
    req.onerror=()=>reject(req.error)
  })
}
async function clearStore(store){
  if(useFallback){fallbackSave(store,[]);return}
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}


/* 食事写真：IndexedDB専用（localStorage fallbackでは写真保存しない） */
const legacyPhotoId=(date,meal)=>`${date}:${meal}`;
function newPhotoId(date,meal,seq=0){
  return `${date}:${meal}:${Date.now()}:${seq}:${Math.random().toString(36).slice(2,8)}`
}
function photoStorageAvailable(){return !useFallback && db && db.objectStoreNames.contains(PHOTO_STORE)}
async function putMealPhoto(rec){
  if(!photoStorageAvailable())throw new Error("この閲覧環境では写真保存用ストレージを利用できません。Safari/PWAでお試しください。");
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PHOTO_STORE,"readwrite");tx.objectStore(PHOTO_STORE).put(rec);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}
async function getAllMealPhotos(){
  if(!photoStorageAvailable())return [];
  return await new Promise((resolve,reject)=>{
    const req=db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)
  })
}
async function getMealPhotos(date,meal){
  const all=await getAllMealPhotos();
  return all.filter(p=>p.date===date&&p.meal===meal).sort((a,b)=>{
    const ta=String(a.createdAt||""),tb=String(b.createdAt||"");
    return ta.localeCompare(tb)||String(a.id).localeCompare(String(b.id))
  })
}
async function getMealPhotoById(id){
  if(!photoStorageAvailable())return null;
  return await new Promise((resolve,reject)=>{
    const req=db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error)
  })
}
async function deleteMealPhotoById(id){
  if(!photoStorageAvailable())return;
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PHOTO_STORE,"readwrite");tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}
async function deleteMealPhotosForMeal(date,meal){
  const photos=await getMealPhotos(date,meal);
  for(const p of photos)await deleteMealPhotoById(p.id);
}
async function deleteMealPhotosForDate(date){
  if(!photoStorageAvailable())return;
  const all=await getAllMealPhotos();
  for(const p of all)if(p.date===date)await deleteMealPhotoById(p.id);
}
async function clearMealPhotos(){
  if(!photoStorageAvailable())return;
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PHOTO_STORE,"readwrite");tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)
  })
}
function revokePhotoUrl(key){
  const u=photoObjectUrls.get(key);if(u){URL.revokeObjectURL(u);photoObjectUrls.delete(key)}
}
function revokePhotoUrlsPrefix(prefix){
  for(const [key,u] of [...photoObjectUrls.entries()]){
    if(key.startsWith(prefix)){URL.revokeObjectURL(u);photoObjectUrls.delete(key)}
  }
}
function formatBytes(n){
  if(!Number.isFinite(n))return "—";
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(1)} MB`;
  return `${(n/1024/1024/1024).toFixed(2)} GB`
}
async function loadImageFromFile(file){
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("画像を読み込めませんでした"))};
    img.src=url
  })
}
function canvasBlob(canvas,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("画像を圧縮できませんでした")),"image/jpeg",quality))
}
async function compressMealPhoto(file){
  if(!file||!file.type.startsWith("image/"))throw new Error("画像ファイルを選択してください");
  const img=await loadImageFromFile(file);
  let maxSide=1280,quality=.78,blob=null,lastW=0,lastH=0;
  for(let attempt=0;attempt<7;attempt++){
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));lastW=w;lastH=h;
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    canvas.getContext("2d",{alpha:false}).drawImage(img,0,0,w,h);
    blob=await canvasBlob(canvas,quality);
    if(blob.size<=350*1024)return {blob,width:w,height:h};
    if(quality>.54)quality-=.08; else maxSide=Math.round(maxSide*.82)
  }

  return {blob,width:lastW,height:lastH}
}

/* 食事写真編集：保存済みBlobをCanvas上で回転・移動・拡大し、白枠内だけをJPEGとして上書きする */
function photoEditorRotatedSize(){
  const img=photoEditorState.img;if(!img)return {w:1,h:1};
  const w=img.naturalWidth||img.width||1,h=img.naturalHeight||img.height||1;
  return Math.abs(photoEditorState.rotation)%180===90?{w:h,h:w}:{w,h}
}
function photoEditorAspectRatio(){
  if(photoEditorState.aspect==="1:1")return 1;
  if(photoEditorState.aspect==="4:3")return 4/3;
  if(photoEditorState.aspect==="3:4")return 3/4;
  const s=photoEditorRotatedSize();
  return s.w/Math.max(1,s.h)
}
function photoEditorCropRect(){
  const canvas=$("photoEditorCanvas"),margin=34;
  const maxW=canvas.width-margin*2,maxH=canvas.height-margin*2;
  const ratio=photoEditorAspectRatio();
  let w=maxW,h=w/ratio;
  if(h>maxH){h=maxH;w=h*ratio}
  return {x:(canvas.width-w)/2,y:(canvas.height-h)/2,w,h,cx:canvas.width/2,cy:canvas.height/2}
}
function photoEditorBaseScale(){
  const crop=photoEditorCropRect(),s=photoEditorRotatedSize();
  return Math.max(crop.w/s.w,crop.h/s.h)
}
function clampPhotoEditorView(){
  if(!photoEditorState.img)return;
  photoEditorState.zoom=Math.max(1,Math.min(4,Number(photoEditorState.zoom)||1));
  const crop=photoEditorCropRect(),s=photoEditorRotatedSize();
  const scale=photoEditorBaseScale()*photoEditorState.zoom;
  const maxX=Math.max(0,(s.w*scale-crop.w)/2);
  const maxY=Math.max(0,(s.h*scale-crop.h)/2);
  photoEditorState.offsetX=Math.max(-maxX,Math.min(maxX,photoEditorState.offsetX));
  photoEditorState.offsetY=Math.max(-maxY,Math.min(maxY,photoEditorState.offsetY));
}
function renderPhotoEditor(){
  const canvas=$("photoEditorCanvas"),img=photoEditorState.img;if(!canvas||!img)return;
  clampPhotoEditorView();
  const ctx=canvas.getContext("2d",{alpha:false}),crop=photoEditorCropRect();
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  const scale=photoEditorBaseScale()*photoEditorState.zoom;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#111";ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.save();
  ctx.translate(crop.cx+photoEditorState.offsetX,crop.cy+photoEditorState.offsetY);
  ctx.rotate(photoEditorState.rotation*Math.PI/180);
  ctx.scale(scale,scale);
  ctx.drawImage(img,-w/2,-h/2,w,h);
  ctx.restore();

  // Crop outside darkening
  ctx.fillStyle="rgba(0,0,0,.58)";
  ctx.fillRect(0,0,canvas.width,crop.y);
  ctx.fillRect(0,crop.y+crop.h,canvas.width,canvas.height-(crop.y+crop.h));
  ctx.fillRect(0,crop.y,crop.x,crop.h);
  ctx.fillRect(crop.x+crop.w,crop.y,canvas.width-(crop.x+crop.w),crop.h);

  // Crop frame + thirds grid
  ctx.strokeStyle="rgba(255,255,255,.97)";ctx.lineWidth=3;
  ctx.strokeRect(crop.x,crop.y,crop.w,crop.h);
  ctx.strokeStyle="rgba(255,255,255,.45)";ctx.lineWidth=1;
  for(const p of [1/3,2/3]){
    ctx.beginPath();ctx.moveTo(crop.x+crop.w*p,crop.y);ctx.lineTo(crop.x+crop.w*p,crop.y+crop.h);ctx.stroke();
    ctx.beginPath();ctx.moveTo(crop.x,crop.y+crop.h*p);ctx.lineTo(crop.x+crop.w,crop.y+crop.h*p);ctx.stroke()
  }
  if($("photoEditorZoom"))$("photoEditorZoom").value=String(photoEditorState.zoom);
}
function resetPhotoEditorView(resetAspect=false){
  photoEditorState.rotation=0;
  photoEditorState.zoom=1;
  photoEditorState.offsetX=0;
  photoEditorState.offsetY=0;
  if(resetAspect)photoEditorState.aspect="original";
  photoEditorState.pointers.clear();photoEditorState.lastSingle=null;photoEditorState.lastPinch=null;
  document.querySelectorAll("#photoEditorAspectButtons button").forEach(b=>b.classList.toggle("active",b.dataset.aspect===photoEditorState.aspect));
  renderPhotoEditor()
}
async function openPhotoEditor(rec,caption=""){
  if(!rec?.blob)return;
  closePhotoModal();
  photoEditorState.rec=rec;
  photoEditorState.img=null;
  photoEditorState.rotation=0;photoEditorState.zoom=1;photoEditorState.offsetX=0;photoEditorState.offsetY=0;photoEditorState.aspect="original";
  photoEditorState.pointers.clear();photoEditorState.lastSingle=null;photoEditorState.lastPinch=null;
  $("photoEditorCaption").textContent=caption||`${rec.date||""} ${MEAL_LABELS[rec.meal]||""}`;
  $("photoEditorStatus").textContent="画像を読み込んでいます…";
  $("photoEditor").classList.add("open");$("photoEditor").setAttribute("aria-hidden","false");document.body.classList.add("photo-editor-open");
  document.querySelectorAll("#photoEditorAspectButtons button").forEach(b=>b.classList.toggle("active",b.dataset.aspect==="original"));
  try{
    photoEditorState.img=await loadImageFromFile(rec.blob);
    $("photoEditorStatus").textContent="";
    renderPhotoEditor()
  }catch(e){
    $("photoEditorStatus").textContent="画像を編集画面に読み込めませんでした："+e.message
  }
}
function closePhotoEditor(){
  $("photoEditor").classList.remove("open");$("photoEditor").setAttribute("aria-hidden","true");document.body.classList.remove("photo-editor-open");
  photoEditorState.rec=null;photoEditorState.img=null;photoEditorState.pointers.clear();photoEditorState.lastSingle=null;photoEditorState.lastPinch=null;
  $("photoEditorStatus").textContent=""
}
function rotatePhotoEditor(delta){
  if(!photoEditorState.img)return;
  photoEditorState.rotation=(photoEditorState.rotation+delta+360)%360;
  photoEditorState.zoom=1;photoEditorState.offsetX=0;photoEditorState.offsetY=0;
  renderPhotoEditor()
}
function photoEditorCanvasPoint(e){
  const canvas=$("photoEditorCanvas"),r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/Math.max(1,r.width),y:(e.clientY-r.top)*canvas.height/Math.max(1,r.height)}
}
function photoEditorPinchInfo(){
  const pts=[...photoEditorState.pointers.values()];
  if(pts.length<2)return null;
  const a=pts[0],b=pts[1],dx=b.x-a.x,dy=b.y-a.y;
  return {dist:Math.max(1,Math.hypot(dx,dy)),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
}
function setupPhotoEditorGestures(){
  const canvas=$("photoEditorCanvas");if(!canvas)return;
  canvas.addEventListener("pointerdown",e=>{
    if(!photoEditorState.img)return;
    e.preventDefault();
    try{canvas.setPointerCapture(e.pointerId)}catch(_){}
    const p=photoEditorCanvasPoint(e);photoEditorState.pointers.set(e.pointerId,p);
    if(photoEditorState.pointers.size===1){photoEditorState.lastSingle=p;photoEditorState.lastPinch=null}
    else if(photoEditorState.pointers.size>=2){photoEditorState.lastPinch=photoEditorPinchInfo();photoEditorState.lastSingle=null}
  });
  canvas.addEventListener("pointermove",e=>{
    if(!photoEditorState.img||!photoEditorState.pointers.has(e.pointerId))return;
    e.preventDefault();
    const p=photoEditorCanvasPoint(e);photoEditorState.pointers.set(e.pointerId,p);
    if(photoEditorState.pointers.size===1){
      const last=photoEditorState.lastSingle;
      if(last){photoEditorState.offsetX+=p.x-last.x;photoEditorState.offsetY+=p.y-last.y}
      photoEditorState.lastSingle=p
    }else{
      const now=photoEditorPinchInfo(),last=photoEditorState.lastPinch;
      if(now&&last){
        photoEditorState.zoom=Math.max(1,Math.min(4,photoEditorState.zoom*(now.dist/Math.max(1,last.dist))));
        photoEditorState.offsetX+=now.mid.x-last.mid.x;
        photoEditorState.offsetY+=now.mid.y-last.mid.y
      }
      photoEditorState.lastPinch=now;photoEditorState.lastSingle=null
    }
    renderPhotoEditor()
  });
  const end=e=>{
    photoEditorState.pointers.delete(e.pointerId);
    if(photoEditorState.pointers.size===1){
      photoEditorState.lastSingle=[...photoEditorState.pointers.values()][0];photoEditorState.lastPinch=null
    }else if(photoEditorState.pointers.size>=2){
      photoEditorState.lastPinch=photoEditorPinchInfo();photoEditorState.lastSingle=null
    }else{
      photoEditorState.lastSingle=null;photoEditorState.lastPinch=null
    }
  };
  canvas.addEventListener("pointerup",end);
  canvas.addEventListener("pointercancel",end)
}
async function encodeEditedMealCanvas(canvas){
  let working=canvas,quality=.84,blob=null;
  for(let i=0;i<7;i++){
    blob=await canvasBlob(working,quality);
    if(blob.size<=350*1024)return {blob,width:working.width,height:working.height};
    if(quality>.58){quality-=.07;continue}
    const nw=Math.max(320,Math.round(working.width*.84)),nh=Math.max(240,Math.round(working.height*.84));
    if(nw===working.width&&nh===working.height)break;
    const smaller=document.createElement("canvas");smaller.width=nw;smaller.height=nh;
    smaller.getContext("2d",{alpha:false}).drawImage(working,0,0,nw,nh);
    working=smaller;quality=.72
  }
  return {blob,width:working.width,height:working.height}
}
async function buildEditedMealPhoto(){
  const img=photoEditorState.img;if(!img)throw new Error("編集画像がありません");
  clampPhotoEditorView();
  const crop=photoEditorCropRect(),ratio=crop.w/crop.h;
  const displayScale=photoEditorBaseScale()*photoEditorState.zoom;
  const sourceLong=Math.max(crop.w/displayScale,crop.h/displayScale);
  const longSide=Math.max(320,Math.min(1280,Math.round(sourceLong)));
  let outW,outH;
  if(ratio>=1){outW=longSide;outH=Math.max(1,Math.round(outW/ratio))}
  else{outH=longSide;outW=Math.max(1,Math.round(outH*ratio))}
  const canvas=document.createElement("canvas");canvas.width=outW;canvas.height=outH;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,outW,outH);
  const fx=outW/crop.w,fy=outH/crop.h;
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  ctx.save();
  ctx.translate((crop.cx+photoEditorState.offsetX-crop.x)*fx,(crop.cy+photoEditorState.offsetY-crop.y)*fy);
  ctx.rotate(photoEditorState.rotation*Math.PI/180);
  ctx.scale(displayScale*fx,displayScale*fy);
  ctx.drawImage(img,-w/2,-h/2,w,h);
  ctx.restore();
  return encodeEditedMealCanvas(canvas)
}
async function savePhotoEditor(){
  const rec=photoEditorState.rec;if(!rec||!photoEditorState.img)return;
  try{
    setSaveStatus("photoEditorStatus","編集した写真を保存しています…","");
    const {blob,width,height}=await buildEditedMealPhoto();
    const updated={...rec,blob,mime:"image/jpeg",size:blob.size,width,height,updatedAt:new Date().toISOString()};
    await putMealPhoto(updated); // 同じidへputするため、旧Blobは置き換わり元画像は残らない
    const date=updated.date,meal=updated.meal;
    closePhotoEditor();
    revokePhotoUrlsPrefix(`current:${meal}:`);
    await renderMealPhotoPreview(date,meal);
    await refreshStorageUsage();
    setSaveStatus("saveStatus",`${MEAL_LABELS[meal]}の写真を編集して上書き保存しました ✓（${width}×${height}px・${formatBytes(blob.size)}）`,"ok")
  }catch(e){
    setSaveStatus("photoEditorStatus","編集した写真を保存できませんでした："+e.message,"warn")
  }
}
function updateMealPhotoAddUI(meal,count){
  const label=document.querySelector(`.photo-add-label[data-meal="${meal}"]`);
  const countEl=$(`photoCount_${meal}`);
  const input=$(`photo_${meal}`);
  if(countEl)countEl.textContent=`${count} / ${MAX_PHOTOS_PER_MEAL}枚`;
  if(label)label.textContent=count===0?"📷 写真を撮る／選ぶ":count<MAX_PHOTOS_PER_MEAL?"＋ もう1枚追加":"写真は6枚までです";
  if(input)input.disabled=count>=MAX_PHOTOS_PER_MEAL
}
async function renderMealPhotoPreview(date,meal){
  const box=$(`preview_${meal}`);
  revokePhotoUrlsPrefix(`current:${meal}:`);
  box.innerHTML="";
  const photos=await getMealPhotos(date,meal);
  photos.forEach((rec,i)=>{
    const card=document.createElement("div");card.className="meal-photo-card";
    const img=document.createElement("img");
    const key=`current:${meal}:${rec.id}`,u=URL.createObjectURL(rec.blob);photoObjectUrls.set(key,u);
    img.src=u;img.alt=`${MEAL_LABELS[meal]} 写真${i+1}`;
    img.onclick=()=>openPhotoModal(rec.blob,`${date} ${MEAL_LABELS[meal]} 写真${i+1}/${photos.length}`);
    const meta=document.createElement("div");meta.className="meal-photo-card-meta";
    meta.innerHTML=`<strong>写真 ${i+1}</strong><br>${formatBytes(rec.size||rec.blob.size)}・${rec.width||"?"}×${rec.height||"?"} px`;
    const actions=document.createElement("div");actions.className="meal-photo-card-actions";
    const edit=document.createElement("button");edit.type="button";edit.className="small secondary photo-edit-one";edit.textContent="✂️ 写真を編集";
    edit.onclick=()=>openPhotoEditor(rec,`${date} ${MEAL_LABELS[meal]} 写真${i+1}/${photos.length}`);
    const del=document.createElement("button");del.type="button";del.className="small danger photo-delete-one";del.textContent="この写真を削除";
    del.onclick=async()=>{
      if(!confirm(`${MEAL_LABELS[meal]}の写真${i+1}を削除しますか？`))return;
      await deleteMealPhotoById(rec.id);
      await syncDailyRecordPhotoMarker(date);
      await renderMealPhotoPreview(date,meal);
      await refreshStorageUsage();
      setSaveStatus("saveStatus",`${MEAL_LABELS[meal]}の写真を1枚削除しました。`,"ok")
    };
    actions.append(edit,del);
    card.append(img,meta,actions);box.appendChild(card)
  });
  updateMealPhotoAddUI(meal,photos.length)
}
async function loadMealPhotosForDate(date){
  for(const meal of MEALS)await renderMealPhotoPreview(date,meal)
}
async function countMealPhotosForDate(date){
  if(!photoStorageAvailable())return 0;
  const all=await getAllMealPhotos();
  return all.filter(p=>p.date===date).length
}
async function syncDailyRecordPhotoMarker(date){
  const count=await countMealPhotosForDate(date);
  let rec=await getItem(DAILY_STORE,date);
  if(count>0){
    if(!rec)rec={date,weightMorning:null,weightEvening:null,bodyFat:null,muscleMass:null,steps:null,breakfast:"",lunch:"",dinner:"",snack:"",note:"",updatedAt:new Date().toISOString()};
    rec.mealPhotoCount=count;rec.updatedAt=new Date().toISOString();await putItem(DAILY_STORE,rec)
  }else if(rec){
    delete rec.mealPhotoCount;
    if(hasMeaningfulDailyData(rec)){rec.updatedAt=new Date().toISOString();await putItem(DAILY_STORE,rec)}else await deleteItem(DAILY_STORE,date)
  }
}
function openPhotoModal(blob,caption){
  revokePhotoUrl("modal");const u=URL.createObjectURL(blob);photoObjectUrls.set("modal",u);
  $("photoModalImg").src=u;$("photoModalCaption").textContent=caption||"";$("photoModal").classList.add("open")
}
function closePhotoModal(){
  $("photoModal").classList.remove("open");$("photoModalImg").removeAttribute("src");revokePhotoUrl("modal")
}

async function handleMealPhotosSelected(meal,fileList){
  const files=[...(fileList||[])].filter(f=>f&&f.type?.startsWith("image/"));
  if(!files.length)return;
  const date=$("date").value;if(!date){setSaveStatus("saveStatus","先に日付を入力してください。","warn");return}
  if(!photoStorageAvailable()){setSaveStatus("saveStatus","この閲覧環境では写真保存が利用できません。Safari/PWAでお試しください。","warn");return}
  const existing=await getMealPhotos(date,meal);
  const available=Math.max(0,MAX_PHOTOS_PER_MEAL-existing.length);
  if(available===0){setSaveStatus("saveStatus",`${MEAL_LABELS[meal]}の写真は最大${MAX_PHOTOS_PER_MEAL}枚です。`,"warn");return}
  const selected=files.slice(0,available);
  setSaveStatus("saveStatus",`${MEAL_LABELS[meal]}の写真${selected.length}枚を圧縮しています…`,"");
  let saved=0,totalBytes=0;
  try{
    for(let i=0;i<selected.length;i++){
      const {blob,width,height}=await compressMealPhoto(selected[i]);
      await putMealPhoto({
        id:newPhotoId(date,meal,i),date,meal,blob,mime:"image/jpeg",size:blob.size,width,height,
        createdAt:new Date(Date.now()+i).toISOString()
      });
      saved++;totalBytes+=blob.size
    }
    await syncDailyRecordPhotoMarker(date);
    await renderMealPhotoPreview(date,meal);
    await cleanupExpiredPhotos(false);
    await refreshStorageUsage();
    const omitted=files.length-selected.length;
    setSaveStatus("saveStatus",`${MEAL_LABELS[meal]}の写真を${saved}枚保存しました ✓（合計${formatBytes(totalBytes)}）${omitted?`。上限6枚のため${omitted}枚は追加していません。`:""}`,omitted?"warn":"ok")
  }catch(e){
    await syncDailyRecordPhotoMarker(date);
    await renderMealPhotoPreview(date,meal);
    await refreshStorageUsage();
    setSaveStatus("saveStatus",`写真の保存中にエラーがありました。${saved?`${saved}枚は保存済みです。`:""} ${e.message}`,"warn")
  }
}
function getPhotoRetention(){try{return localStorage.getItem(PHOTO_RETENTION_KEY)||DEFAULT_PHOTO_RETENTION}catch(e){return DEFAULT_PHOTO_RETENTION}}
function setPhotoRetention(v){try{localStorage.setItem(PHOTO_RETENTION_KEY,v)}catch(e){}}
async function cleanupExpiredPhotos(showStatus=true){
  if(!photoStorageAvailable())return 0;
  const retention=getPhotoRetention();if(retention==="never")return 0;
  const days=Number(retention);if(!Number.isFinite(days)||days<=0)return 0;
  const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-days);
  const cutoffISO=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,"0")}-${String(cutoff.getDate()).padStart(2,"0")}`;
  const all=await getAllMealPhotos();let removed=0;const affected=new Set();
  for(const p of all){
    if(p.date<cutoffISO){await deleteMealPhotoById(p.id);affected.add(p.date);removed++}
  }
  for(const date of affected)await syncDailyRecordPhotoMarker(date);
  if(showStatus)setSaveStatus("photoSettingsStatus",removed?`${removed}枚の期限切れ写真を削除しました。`:"削除対象の写真はありません。","ok");
  if(removed)await loadMealPhotosForDate($("date").value);
  return removed
}
async function refreshStorageUsage(){
  const countEl=$("photoStorageCount"),photoSizeEl=$("photoStorageSize"),appEl=$("appStorageSize"),msg=$("storageMessage"),bar=$("storageBar");
  if(!photoStorageAvailable()){
    photoSizeEl.textContent="利用不可";countEl.textContent="";appEl.textContent="—";msg.textContent="この閲覧環境では写真保存用IndexedDBを利用できません。Safari/PWAでの利用を推奨します。";bar.className="storage-bar";bar.firstElementChild.style.width="0%";return
  }
  const photos=await getAllMealPhotos(),bytes=photos.reduce((s,p)=>s+(p.size||p.blob?.size||0),0);
  photoSizeEl.textContent=formatBytes(bytes);countEl.textContent=`（${photos.length}枚）`;
  let est=null;try{if(navigator.storage?.estimate)est=await navigator.storage.estimate()}catch(e){}
  if(est&&Number.isFinite(est.usage)&&Number.isFinite(est.quota)&&est.quota>0){
    const pct=Math.min(100,est.usage/est.quota*100);appEl.textContent=`${formatBytes(est.usage)} / ${formatBytes(est.quota)}（約${pct.toFixed(1)}%）`;
    bar.firstElementChild.style.width=`${pct}%`;bar.className="storage-bar"+(pct>=85?" danger":pct>=70?" warn":"");
    msg.textContent=pct>=85?"保存容量がかなり増えています。古い写真の削除や保存期間の短縮を検討してください。":pct>=70?"保存容量が増えています。写真保存期間を確認してください。":"現在の使用量は大きくありません。";
  }else{
    appEl.textContent="ブラウザから取得できません";bar.firstElementChild.style.width="0%";bar.className="storage-bar";msg.textContent="写真容量は上記で確認できます。アプリ全体の上限はこの環境では取得できません。"
  }
}
async function renderHistoryPhotos(date,container){
  if(!photoStorageAvailable())return;
  const all=await getAllMealPhotos();
  const order=new Map(MEALS.map((m,i)=>[m,i]));
  const photos=all.filter(p=>p.date===date).sort((a,b)=>{
    const mo=(order.get(a.meal)??99)-(order.get(b.meal)??99);
    if(mo!==0)return mo;
    return String(a.createdAt||"").localeCompare(String(b.createdAt||""))||String(a.id).localeCompare(String(b.id))
  });
  if(!photos.length)return;
  const row=document.createElement("div");row.className="history-photo-row";
  const mealCounts={};
  for(const p of photos){
    mealCounts[p.meal]=(mealCounts[p.meal]||0)+1
  }
  const mealSeen={};
  for(const p of photos){
    mealSeen[p.meal]=(mealSeen[p.meal]||0)+1;
    const wrap=document.createElement("div");wrap.className="history-photo-thumb";
    const img=document.createElement("img"),u=URL.createObjectURL(p.blob);
    img.src=u;img.onload=()=>setTimeout(()=>URL.revokeObjectURL(u),250);
    const n=mealSeen[p.meal],total=mealCounts[p.meal];
    img.alt=`${MEAL_LABELS[p.meal]} 写真${n}`;
    img.style.cursor="zoom-in";
    img.onclick=()=>openPhotoModal(p.blob,`${date} ${MEAL_LABELS[p.meal]} 写真${n}/${total}`);
    const label=document.createElement("span");
    label.textContent=total>1?`${MEAL_LABELS[p.meal]}${n}`:MEAL_LABELS[p.meal];
    wrap.append(img,label);row.appendChild(wrap)
  }
  container.appendChild(row)
}



/* 過去30日の食事レビュー（AI評価なし） */
function loadMealReviewSelections(){
  try{
    const x=JSON.parse(localStorage.getItem(MEAL_REVIEW_SELECTION_KEY)||"null");
    if(x&&typeof x==="object")return {good:x.good||null,improve:x.improve||null}
  }catch(e){}
  return {good:null,improve:null}
}
function saveMealReviewSelections(x){
  try{localStorage.setItem(MEAL_REVIEW_SELECTION_KEY,JSON.stringify({good:x.good||null,improve:x.improve||null}))}catch(e){}
}
function mealReviewKey(x){return x&&x.date&&x.meal?`${x.date}|${x.meal}`:""}
function reviewCutoffISO(){
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-(MEAL_REVIEW_DAYS-1));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}
function mealTextFromRecord(rec,meal){
  if(!rec)return "";
  return String(rec[meal]||"").trim()
}
async function getMealReviewGroups(){
  if(!photoStorageAvailable())return [];
  const cutoff=reviewCutoffISO(),today=todayISO(),photos=await getAllMealPhotos();
  const recent=photos.filter(p=>p.date>=cutoff&&p.date<=today);
  const map=new Map();
  recent.forEach(p=>{
    const key=`${p.date}|${p.meal}`;
    if(!map.has(key))map.set(key,{date:p.date,meal:p.meal,photos:[]});
    map.get(key).photos.push(p)
  });
  const daily=await getAll(DAILY_STORE),dailyMap=new Map(daily.map(r=>[r.date,r]));
  const mealOrder=new Map(MEALS.map((m,i)=>[m,i]));
  const groups=[...map.values()];
  groups.forEach(g=>{
    g.photos.sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))||String(a.id).localeCompare(String(b.id)));
    g.text=mealTextFromRecord(dailyMap.get(g.date),g.meal)
  });
  groups.sort((a,b)=>b.date.localeCompare(a.date)||(mealOrder.get(a.meal)??99)-(mealOrder.get(b.meal)??99));
  return groups
}
function clearReviewObjectUrls(){revokePhotoUrlsPrefix("review:");revokePhotoUrlsPrefix("reviewSelected:")}
function reviewPhotoImg(rec,key,caption){
  const img=document.createElement("img"),u=URL.createObjectURL(rec.blob);
  photoObjectUrls.set(key,u);img.src=u;img.alt=caption;img.onclick=()=>openPhotoModal(rec.blob,caption);return img
}
function renderSelectedMeal(container,kind,selected,group){
  container.className="";
  container.innerHTML="";
  if(!selected||!group){
    container.className="review-empty";
    container.textContent=selected?"選択した食事が30日の範囲外、または写真が削除されています。":"まだ選択されていません。";
    return
  }
  const title=document.createElement("div");title.className="review-meal-date";
  title.textContent=`${group.date}　${MEAL_LABELS[group.meal]}`;
  container.appendChild(title);
  if(group.text){
    const t=document.createElement("div");t.className="review-meal-text";t.textContent=group.text;container.appendChild(t)
  }
  const photos=document.createElement("div");photos.className="review-selected-photos";
  group.photos.forEach((p,i)=>photos.appendChild(reviewPhotoImg(p,`reviewSelected:${kind}:${p.id}`,`${group.date} ${MEAL_LABELS[group.meal]} 写真${i+1}/${group.photos.length}`)));
  container.appendChild(photos);
  const note=document.createElement("div");note.className="review-note";
  note.textContent=`写真 ${group.photos.length}枚`;
  container.appendChild(note);
  const clear=document.createElement("button");clear.type="button";clear.className="ghost small";clear.style.marginTop="7px";
  clear.textContent="この選択を解除";
  clear.onclick=async()=>{
    const s=loadMealReviewSelections();s[kind]=null;saveMealReviewSelections(s);await renderMealReview()
  };
  container.appendChild(clear)
}
async function selectReviewMeal(kind,date,meal){
  const s=loadMealReviewSelections(),chosen={date,meal};
  if(kind==="good"){
    s.good=chosen;
    if(mealReviewKey(s.improve)===mealReviewKey(chosen))s.improve=null
  }else{
    s.improve=chosen;
    if(mealReviewKey(s.good)===mealReviewKey(chosen))s.good=null
  }
  saveMealReviewSelections(s);
  setSaveStatus("mealReviewStatus",kind==="good"?"「良い食事の例」を選択しました。":"「改善を考える食事の例」を選択しました。","ok");
  await renderMealReview()
}
async function renderMealReview(){
  const list=$("mealReviewList");
  clearReviewObjectUrls();
  if(!photoStorageAvailable()){
    $("reviewGoodSelected").className="review-empty";$("reviewGoodSelected").textContent="この閲覧環境では写真を読み込めません。";
    $("reviewImproveSelected").className="review-empty";$("reviewImproveSelected").textContent="この閲覧環境では写真を読み込めません。";
    list.innerHTML='<div class="review-empty">食事写真のレビューはSafari/PWAなど、写真保存用IndexedDBを利用できる環境で使用してください。</div>';
    return
  }
  const groups=await getMealReviewGroups(),byKey=new Map(groups.map(g=>[`${g.date}|${g.meal}`,g])),sel=loadMealReviewSelections();
  renderSelectedMeal($("reviewGoodSelected"),"good",sel.good,byKey.get(mealReviewKey(sel.good)));
  renderSelectedMeal($("reviewImproveSelected"),"improve",sel.improve,byKey.get(mealReviewKey(sel.improve)));

  list.innerHTML="";
  if(!groups.length){
    list.innerHTML='<div class="review-empty">過去30日間に食事写真がありません。</div>';
    $("mealReviewStatus").textContent=`対象期間：${reviewCutoffISO()} ～ ${todayISO()}`;
    return
  }
  const goodKey=mealReviewKey(sel.good),improveKey=mealReviewKey(sel.improve);
  groups.forEach(group=>{
    const key=`${group.date}|${group.meal}`,card=document.createElement("div");
    card.className="review-meal-card"+(key===goodKey?" is-good":"")+(key===improveKey?" is-improve":"");
    const head=document.createElement("div");head.className="review-meal-head";
    const d=document.createElement("div");d.className="review-meal-date";d.textContent=`${group.date}　${MEAL_LABELS[group.meal]}`;
    const n=document.createElement("span");n.className="badge";n.textContent=`写真${group.photos.length}枚`;
    head.append(d,n);card.appendChild(head);
    if(group.text){const t=document.createElement("div");t.className="review-meal-text";t.textContent=group.text;card.appendChild(t)}
    const thumbs=document.createElement("div");thumbs.className="review-thumbs";
    group.photos.slice(0,3).forEach((p,i)=>{
      const wrap=document.createElement("div");wrap.className="review-thumb";
      wrap.appendChild(reviewPhotoImg(p,`review:${key}:${p.id}`,`${group.date} ${MEAL_LABELS[group.meal]} 写真${i+1}/${group.photos.length}`));
      if(i===2&&group.photos.length>3){const more=document.createElement("span");more.className="review-more";more.textContent=`+${group.photos.length-3}`;wrap.appendChild(more)}
      thumbs.appendChild(wrap)
    });
    card.appendChild(thumbs);
    const actions=document.createElement("div");actions.className="review-actions";
    const good=document.createElement("button");good.type="button";good.className="review-good-btn";
    good.textContent=key===goodKey?"◎ 良い食事に選択中":"◎ 良い食事の例";
    good.onclick=()=>selectReviewMeal("good",group.date,group.meal);
    const improve=document.createElement("button");improve.type="button";improve.className="review-improve-btn";
    improve.textContent=key===improveKey?"△ 改善例に選択中":"△ 改善を考える食事";
    improve.onclick=()=>selectReviewMeal("improve",group.date,group.meal);
    actions.append(good,improve);card.appendChild(actions);list.appendChild(card)
  });
  $("mealReviewStatus").textContent=`対象期間：${reviewCutoffISO()} ～ ${todayISO()}　写真のある食事 ${groups.length}食`;
}

/* 日常記録：身体測定項目の表示設定 */
function loadDailyMeasureSettings(){
  try{
    const x=JSON.parse(localStorage.getItem(DAILY_MEASURE_SETTINGS_KEY)||"null");
    if(Array.isArray(x)){
      const clean=x.filter(k=>ALL_DAILY_MEASURE_FIELDS.includes(k));
      return [...new Set(["weight",...clean])];
    }
  }catch(e){}
  return [...DEFAULT_DAILY_MEASURE_FIELDS]
}
function saveDailyMeasureSettings(fields){
  const clean=[...new Set(["weight",...fields])].filter(k=>ALL_DAILY_MEASURE_FIELDS.includes(k));
  localStorage.setItem(DAILY_MEASURE_SETTINGS_KEY,JSON.stringify(clean));
}
function currentVisibleDailyMeasureFields(){
  if(dailyMeasureShowAllTemporary)return new Set(ALL_DAILY_MEASURE_FIELDS);
  return new Set([...loadDailyMeasureSettings(),...dailyMeasureTemporaryFields,"weight"])
}
function updateDailyMeasureSummary(){
  const base=loadDailyMeasureSettings();
  const extra=[...dailyMeasureTemporaryFields].filter(x=>!base.includes(x));
  let txt=base.map(k=>DAILY_MEASURE_LABELS[k]).join("・");
  if(dailyMeasureShowAllTemporary)txt="体重・体脂肪率・筋肉量・血糖自己測定・血圧（今回のみ全表示）";
  else if(extra.length)txt+=` ＋ 今回のみ：${extra.map(k=>DAILY_MEASURE_LABELS[k]).join("・")}`;
  $("dailyMeasureSummary").textContent=txt;
}
function applyDailyMeasureVisibility(){
  const visible=currentVisibleDailyMeasureFields();
  document.querySelectorAll("[data-daily-measure-field]").forEach(el=>{
    el.classList.toggle("daily-measure-hidden",!visible.has(el.dataset.dailyMeasureField));
  });
  updateDailyMeasureSummary();
}
function syncDailyMeasureSettingCheckboxes(){
  const selected=new Set(loadDailyMeasureSettings());
  document.querySelectorAll(".daily-measure-perm-option").forEach(cb=>cb.checked=selected.has(cb.value));
}
function renderDailyMeasureTempOptions(){
  const permanent=new Set(loadDailyMeasureSettings());
  const box=$("dailyMeasureTempOptions");
  box.innerHTML="";
  const options=["bodyFat","muscleMass","smbg","bp"].filter(k=>!permanent.has(k));
  options.push("bowel"); // 排便は「今回だけ追加」専用
  options.forEach(k=>{
    const lab=document.createElement("label");
    lab.className="field-picker-option";
    lab.innerHTML=`<input type="checkbox" class="daily-measure-temp-option" value="${k}" ${dailyMeasureTemporaryFields.has(k)?"checked":""}>${DAILY_MEASURE_LABELS[k]}`;
    box.appendChild(lab);
  });
}
function resetDailyMeasureTemporaryDisplay(){
  dailyMeasureTemporaryFields.clear();
  dailyMeasureShowAllTemporary=false;
  $("dailyMeasureTempPanel").style.display="none";
  applyDailyMeasureVisibility();
}
function includeRecordedDailyMeasureFields(rec){
  if(!rec)return;
  if([rec.bodyFatMorning,rec.bodyFatEvening,rec.bodyFat].some(v=>v!==null&&v!==undefined))dailyMeasureTemporaryFields.add("bodyFat");
  if([rec.muscleMassMorning,rec.muscleMassEvening,rec.muscleMass].some(v=>v!==null&&v!==undefined))dailyMeasureTemporaryFields.add("muscleMass");
  if(SMBG_KEYS.some(k=>rec[k]!==null&&rec[k]!==undefined))dailyMeasureTemporaryFields.add("smbg");
  if([rec.bpMorningSbp,rec.bpMorningDbp,rec.bpEveningSbp,rec.bpEveningDbp].some(v=>v!==null&&v!==undefined))dailyMeasureTemporaryFields.add("bp");
  if(rec.bowelMovement===true)dailyMeasureTemporaryFields.add("bowel");
  applyDailyMeasureVisibility();
}


/* 日常記録 */
let loadedLegacyBodyFat=null,loadedLegacyMuscleMass=null,currentBowelMovement=false;
function dailyFormToRecord(){
  return{
    date:$("date").value,weightMorning:numOrNull($("weightMorning").value),weightEvening:numOrNull($("weightEvening").value),
    bodyFatMorning:numOrNull($("bodyFatMorning").value),bodyFatEvening:numOrNull($("bodyFatEvening").value),
    muscleMassMorning:numOrNull($("muscleMassMorning").value),muscleMassEvening:numOrNull($("muscleMassEvening").value),
    bgBeforeBreakfast:numOrNull($("bgBeforeBreakfast").value),bgAfterBreakfast:numOrNull($("bgAfterBreakfast").value),
    bgBeforeLunch:numOrNull($("bgBeforeLunch").value),bgAfterLunch:numOrNull($("bgAfterLunch").value),
    bgBeforeDinner:numOrNull($("bgBeforeDinner").value),bgAfterDinner:numOrNull($("bgAfterDinner").value),bgBedtime:numOrNull($("bgBedtime").value),
    bpMorningSbp:numOrNull($("bpMorningSbp").value),bpMorningDbp:numOrNull($("bpMorningDbp").value),
    bpEveningSbp:numOrNull($("bpEveningSbp").value),bpEveningDbp:numOrNull($("bpEveningDbp").value),
    bowelMovement:currentBowelMovement===true,
    // v22以前の時間帯未指定データは削除せず保持
    bodyFat:loadedLegacyBodyFat,muscleMass:loadedLegacyMuscleMass,
    steps:numOrNull($("steps").value),breakfast:$("breakfast").value.trim(),lunch:$("lunch").value.trim(),
    dinner:$("dinner").value.trim(),snack:$("snack").value.trim(),note:$("note").value.trim(),updatedAt:new Date().toISOString()
  }
}
function setDailyForm(rec){
  $("date").value=rec?.date||todayISO();$("weightMorning").value=rec?.weightMorning??"";
  $("weightEvening").value=rec?.weightEvening??"";
  $("bodyFatMorning").value=rec?.bodyFatMorning??"";$("bodyFatEvening").value=rec?.bodyFatEvening??"";
  $("muscleMassMorning").value=rec?.muscleMassMorning??"";$("muscleMassEvening").value=rec?.muscleMassEvening??"";
  SMBG_KEYS.forEach(k=>$(k).value=rec?.[k]??"");
  $("bpMorningSbp").value=rec?.bpMorningSbp??"";$("bpMorningDbp").value=rec?.bpMorningDbp??"";
  $("bpEveningSbp").value=rec?.bpEveningSbp??"";$("bpEveningDbp").value=rec?.bpEveningDbp??"";
  currentBowelMovement=rec?.bowelMovement===true;
  loadedLegacyBodyFat=rec?.bodyFat??null;loadedLegacyMuscleMass=rec?.muscleMass??null;
  const legacy=[];
  if(loadedLegacyBodyFat!==null)legacy.push(`旧形式の体脂肪率 ${Number(loadedLegacyBodyFat).toFixed(1)}%`);
  if(loadedLegacyMuscleMass!==null)legacy.push(`旧形式の筋肉量 ${Number(loadedLegacyMuscleMass).toFixed(1)} kg`);
  $("legacyBodyMeasureNote").style.display=legacy.length?"block":"none";
  $("legacyBodyMeasureNote").textContent=legacy.length?`${legacy.join("、")} は測定時間帯が未指定のため、朝・夜へ自動的に割り当てず保存しています。`:"";
  $("steps").value=rec?.steps??"";
  $("breakfast").value=rec?.breakfast??"";$("lunch").value=rec?.lunch??"";
  $("dinner").value=rec?.dinner??"";$("snack").value=rec?.snack??"";$("note").value=rec?.note??""
}
async function loadDate(date){
  isLoadingDaily=true;
  const rec=await getItem(DAILY_STORE,date);
  const draft=loadDraftSync(DAILY_DRAFT_KEY);
  if(draft && draft.date===date && hasMeaningfulDailyData(draft)){
    setDailyForm(draft);
    includeRecordedDailyMeasureFields(draft);
    await loadMealPhotosForDate(date);
    setSaveStatus("saveStatus","前回閉じる直前の入力内容を復元しました。自動保存します。","warn");
    isLoadingDaily=false;
    scheduleDailyAutoSave(50);
    return;
  }
  setDailyForm(rec||{date});
  includeRecordedDailyMeasureFields(rec||{date});
  await loadMealPhotosForDate(date);
  setSaveStatus("saveStatus",rec?"保存済みの記録を読み込みました。":"自動保存が有効です。入力すると自動的に保存されます。",rec?"ok":"");
  isLoadingDaily=false;
}
async function saveCurrent(auto=false){
  const rec=dailyFormToRecord();
  if(!rec.date){
    setSaveStatus("saveStatus","日付を入力してください。","warn");return
  }
  // 入力がすべて空なら、日付を開いただけでは空レコードを作らない
  if(!hasMeaningfulDailyData(rec)){
    clearDraftSync(DAILY_DRAFT_KEY);
    if(!auto)setSaveStatus("saveStatus","入力内容がありません。","");
    return
  }
  setSaveStatus("saveStatus",auto?"保存中…":"保存しています…","");
  await putItem(DAILY_STORE,rec);
  clearDraftSync(DAILY_DRAFT_KEY);
  setSaveStatus("saveStatus","保存済み ✓","ok");
  if(!auto)await refreshAll(); else {await refreshSummary();await refreshWeightReward(); if($("view-chart").classList.contains("active")){await drawHomeChart();await drawSmbgChart()}}
}
function scheduleDailyAutoSave(delay=700){
  if(isLoadingDaily)return;
  const rec=dailyFormToRecord();
  saveDraftSync(DAILY_DRAFT_KEY,rec); // 閉じる直前でも同期的に退避
  clearTimeout(dailyAutoSaveTimer);
  setSaveStatus("saveStatus","入力中…","");
  dailyAutoSaveTimer=setTimeout(()=>saveCurrent(true),delay);
}
const getDailyWeight=rec=>rec.weightMorning??rec.weightEvening??null;


/* 外来記録の表示項目設定 */
function loadVisitFieldSettings(){
  try{
    const x=JSON.parse(localStorage.getItem(VISIT_FIELD_SETTINGS_KEY)||"null");
    if(Array.isArray(x)&&x.length)return x.filter(k=>ALL_VISIT_FIELDS.includes(k));
  }catch(e){}
  return [...DEFAULT_VISIT_FIELDS]
}
function saveVisitFieldSettings(fields){
  const clean=[...new Set(fields)].filter(k=>ALL_VISIT_FIELDS.includes(k));
  localStorage.setItem(VISIT_FIELD_SETTINGS_KEY,JSON.stringify(clean.length?clean:DEFAULT_VISIT_FIELDS));
}
function currentVisibleVisitFields(){
  if(visitShowAllTemporary)return new Set(ALL_VISIT_FIELDS);
  return new Set([...loadVisitFieldSettings(),...visitTemporaryFields])
}
function updateVisitFieldSummary(){
  const base=loadVisitFieldSettings();
  const extra=[...visitTemporaryFields].filter(x=>!base.includes(x));
  let txt=base.map(k=>VISIT_FIELD_LABELS[k]).join("・");
  if(visitShowAllTemporary)txt="すべての項目（今回のみ）";
  else if(extra.length)txt+=` ＋ 今回のみ：${extra.map(k=>VISIT_FIELD_LABELS[k]).join("・")}`;
  $("visitFieldSummary").textContent=txt||"なし";
}
function applyVisitFieldVisibility(){
  const visible=currentVisibleVisitFields();
  document.querySelectorAll("[data-visit-field]").forEach(el=>{
    el.classList.toggle("visit-field-hidden",!visible.has(el.dataset.visitField));
  });
  const sectionMap={
    treatment:["medication","diet","exercise"],
    metabolic:["bp","glucose","hba1c","ga","hb"],
    lipid:["tc","tg","hdl","ldl"],
    organ:["ast","alt","ggt","ua","cr","egfr","protein"],
    note:["note"]
  };
  document.querySelectorAll("[data-visit-section]").forEach(el=>{
    const keys=sectionMap[el.dataset.visitSection]||[];
    el.classList.toggle("visit-field-hidden",!keys.some(k=>visible.has(k)));
  });
  updateVisitFieldSummary();

  // eGFRを表示項目として選んだ時だけ、eGFRスロープも表示する
  const egfrCard=$("egfrSlopeCard");
  if(egfrCard){
    const showEgfr=visible.has("egfr");
    egfrCard.style.display=showEgfr?"block":"none";
    if(showEgfr)drawEgfrSlope()
  }
  const gaCard=$("gaChartsCard");
  if(gaCard){
    const showGa=visible.has("ga");
    gaCard.style.display=showGa?"block":"none";
    if(showGa)drawGaCharts()
  }
}
function syncPermanentVisitFieldCheckboxes(){
  const selected=new Set(loadVisitFieldSettings());
  document.querySelectorAll(".visit-perm-option").forEach(cb=>cb.checked=selected.has(cb.value));
}
function renderTemporaryVisitOptions(){
  const permanent=new Set(loadVisitFieldSettings());
  const box=$("visitTempOptions");
  box.innerHTML="";
  ALL_VISIT_FIELDS.filter(k=>!permanent.has(k)).forEach(k=>{
    const lab=document.createElement("label");
    lab.className="field-picker-option";
    lab.innerHTML=`<input type="checkbox" class="visit-temp-option" value="${k}" ${visitTemporaryFields.has(k)?"checked":""}>${VISIT_FIELD_LABELS[k]}`;
    box.appendChild(lab);
  });
  if(!box.children.length)box.innerHTML='<div class="note">普段の表示項目ですべて選択されています。</div>';
}
function resetVisitTemporaryDisplay(){
  visitTemporaryFields.clear();
  visitShowAllTemporary=false;
  $("visitTempAddPanel").style.display="none";
  applyVisitFieldVisibility();
}


/* 外来の薬剤使用期間 */
function loadMedicationPeriods(){
  try{
    const x=JSON.parse(localStorage.getItem(MEDICATION_PERIODS_KEY)||"[]");
    return Array.isArray(x)?x.filter(p=>p&&p.id&&p.name&&p.startDate):[]
  }catch(e){return []}
}
function saveMedicationPeriods(periods){
  localStorage.setItem(MEDICATION_PERIODS_KEY,JSON.stringify(periods))
}
function medicationPeriodId(){
  return `med-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
}
function visitDateOrToday(){
  return $("visitDate")?.value||todayISO()
}
function medicationColor(name){
  const colors=["#5f83a6","#b47a45","#698c68","#9a6f9b","#4f8f8b","#b45f6a","#8a7d48","#6f77a9"];
  let h=0;for(const ch of String(name||""))h=(h*31+ch.charCodeAt(0))>>>0;
  return colors[h%colors.length]
}
async function refreshMedicationVisuals(){
  renderMedicationManager();
  if($("view-outpatient")?.classList.contains("active"))await drawVisitCharts()
}
function addMedicationPeriod(){
  const name=$("medPeriodName").value.trim(),start=$("medPeriodStart").value||visitDateOrToday();
  if(!name){setSaveStatus("medicationPeriodStatus","薬剤名を入力してください。","warn");return}
  if(!start){setSaveStatus("medicationPeriodStatus","開始日を入力してください。","warn");return}
  const arr=loadMedicationPeriods();
  arr.push({id:medicationPeriodId(),name,startDate:start,endDate:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  saveMedicationPeriods(arr);
  $("medPeriodName").value="";
  $("medPeriodStart").value=visitDateOrToday();
  setSaveStatus("medicationPeriodStatus",`${name} を ${start.replaceAll("-","/")} から「使用中」として登録しました。`,"ok");
  refreshMedicationVisuals()
}
function stopMedicationPeriod(id,date){
  const arr=loadMedicationPeriods(),p=arr.find(x=>x.id===id);if(!p)return;
  const end=date||visitDateOrToday();
  if(!end){setSaveStatus("medicationPeriodStatus","中止日を入力してください。","warn");return}
  if(end<p.startDate){setSaveStatus("medicationPeriodStatus","中止日は開始日以降にしてください。","warn");return}
  p.endDate=end;p.updatedAt=new Date().toISOString();
  saveMedicationPeriods(arr);
  setSaveStatus("medicationPeriodStatus",`${p.name} の中止日を ${end.replaceAll("-","/")} として記録しました。`,"ok");
  refreshMedicationVisuals()
}
function deleteMedicationPeriod(id){
  const arr=loadMedicationPeriods(),p=arr.find(x=>x.id===id);if(!p)return;
  if(!confirm(`${p.name}（${p.startDate}${p.endDate?`〜${p.endDate}`:"〜使用中"}）の薬剤経過を削除しますか？`))return;
  saveMedicationPeriods(arr.filter(x=>x.id!==id));
  setSaveStatus("medicationPeriodStatus","薬剤経過を削除しました。","ok");
  refreshMedicationVisuals()
}
function renderMedicationManager(){
  const activeBox=$("activeMedicationPeriods"),historyBox=$("medicationPeriodHistory");
  if(!activeBox||!historyBox)return;
  if($("medPeriodStart")&&!$("medPeriodStart").value)$("medPeriodStart").value=visitDateOrToday();
  const arr=loadMedicationPeriods().sort((a,b)=>b.startDate.localeCompare(a.startDate));
  const active=arr.filter(p=>!p.endDate);

  activeBox.innerHTML=active.length?"":'<div class="note">現在「使用中」として登録されている薬剤はありません。</div>';
  active.forEach(p=>{
    const el=document.createElement("div");el.className="med-period-item";
    const defaultEnd=visitDateOrToday()<p.startDate?p.startDate:visitDateOrToday();
    el.innerHTML=`<div><div class="med-period-name">${escapeHtml(p.name)}</div><div class="med-period-dates">開始 ${escapeHtml(p.startDate.replaceAll("-","/"))}　→　使用中</div></div>
      <div class="med-period-stop"><input type="date" class="stop-date" min="${escapeHtml(p.startDate)}" value="${escapeHtml(defaultEnd)}"><button type="button" class="small danger stop">中止</button></div>`;
    el.querySelector(".stop").onclick=()=>stopMedicationPeriod(p.id,el.querySelector(".stop-date").value);
    activeBox.appendChild(el)
  });

  historyBox.innerHTML=arr.length?"":'<div class="note">薬剤経過の記録はまだありません。</div>';
  arr.forEach(p=>{
    const el=document.createElement("div");el.className="med-period-item";
    el.innerHTML=`<div><div class="med-period-name">${escapeHtml(p.name)}</div><div class="med-period-dates">${escapeHtml(p.startDate.replaceAll("-","/"))} → ${p.endDate?escapeHtml(p.endDate.replaceAll("-","/")):"使用中"}</div></div>
      <div><button type="button" class="ghost small del">削除</button></div>`;
    el.querySelector(".del").onclick=()=>deleteMedicationPeriod(p.id);
    historyBox.appendChild(el)
  })
}
function renderMedicationTimeline(container,records){
  if(!container)return;
  const dates=(records||[]).filter(r=>r&&r.date).map(r=>r.date).sort();
  if(!dates.length){
    container.innerHTML='<div class="med-timeline-title">薬剤使用期間</div><div class="med-timeline-note">このグラフの期間を決めるデータがありません。</div>';
    return
  }
  let startMs=parseLocalDate(dates[0]).getTime(),endMs=parseLocalDate(dates[dates.length-1]).getTime();
  if(endMs<=startMs){startMs-=15*86400000;endMs+=15*86400000}
  const range=endMs-startMs;
  const periods=loadMedicationPeriods()
    .filter(p=>{
      const ps=parseLocalDate(p.startDate).getTime(),pe=p.endDate?parseLocalDate(p.endDate).getTime():Infinity;
      return ps<=endMs&&pe>=startMs
    })
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name,"ja"));
  if(!periods.length){
    container.innerHTML='<div class="med-timeline-title">薬剤使用期間</div><div class="med-timeline-note">この期間に重なる薬剤経過の登録はありません。</div>';
    return
  }
  const rows=periods.map(p=>{
    const rawStart=parseLocalDate(p.startDate).getTime();
    const rawEnd=p.endDate?parseLocalDate(p.endDate).getTime():endMs;
    const s=Math.max(startMs,rawStart),e=Math.min(endMs,rawEnd);
    const left=Math.max(0,Math.min(100,(s-startMs)/range*100));
    const right=Math.max(left,Math.min(100,(e-startMs)/range*100));
    const width=Math.max(.8,right-left);
    const color=medicationColor(p.name);
    const status=p.endDate?`${p.startDate.replaceAll("-","/")}〜${p.endDate.replaceAll("-","/")}`:`${p.startDate.replaceAll("-","/")}〜使用中`;
    return `<div class="med-timeline-row">
      <div class="med-timeline-label">${escapeHtml(p.name)}<small>${escapeHtml(status)}</small></div>
      <div class="med-timeline-track" title="${escapeHtml(p.name)} ${escapeHtml(status)}">
        <span class="med-timeline-bar" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${color}"></span>
        <span class="med-timeline-dot" style="left:${left.toFixed(2)}%;background:${color}"></span>
        ${p.endDate?`<span class="med-timeline-dot" style="left:${right.toFixed(2)}%;background:${color}"></span>`:`<span class="med-timeline-arrow" style="left:${right.toFixed(2)}%;color:${color}">▶</span>`}
      </div>
    </div>`
  }).join("");
  container.innerHTML=`<div class="med-timeline-title">薬剤使用期間</div>
    <div class="med-timeline-note">外来の「薬剤経過」で登録した開始日〜中止日を、グラフの横軸期間に合わせて表示します。▶ はグラフ右端時点で使用中です。</div>
    ${rows}
    <div class="med-timeline-axis"><span>${dates[0].replaceAll("-","/")}</span><span>${dates[dates.length-1].replaceAll("-","/")}</span></div>`
}

/* 外来記録 */
const visitIds=["visitWeight","visitWaist","visitSBP","visitDBP","visitGlucose","visitHbA1c","visitGA","visitHb","visitTC","visitTG","visitHDL","visitLDL","visitAST","visitALT","visitGGT","visitUA","visitCr","visitEGFR"];
function calculateABSI(weightKg,waistCm,heightCm){
  const w=Number(weightKg),wc=Number(waistCm)/100,h=Number(heightCm)/100;
  if(!Number.isFinite(w)||!Number.isFinite(wc)||!Number.isFinite(h)||w<=0||wc<=0||h<=0)return null;
  const bmi=w/(h*h);
  return wc/(Math.pow(bmi,2/3)*Math.sqrt(h))
}
const ABSI_NHANES_REFERENCE=[[18,0.07702,0.00378,0.07775,0.00408],[19,0.07711,0.00378,0.07765,0.00411],[20,0.07728,0.00377,0.07757,0.00414],[21,0.0775,0.00377,0.0775,0.00416],[22,0.07777,0.00377,0.07744,0.00419],[23,0.07804,0.00376,0.0774,0.00422],[24,0.07831,0.00376,0.07737,0.00424],[25,0.07858,0.00376,0.07735,0.00427],[26,0.07882,0.00375,0.07734,0.00429],[27,0.07904,0.00375,0.07735,0.00432],[28,0.07922,0.00374,0.07736,0.00435],[29,0.07938,0.00374,0.07739,0.00437],[30,0.07951,0.00374,0.07743,0.0044],[31,0.07963,0.00373,0.07747,0.00442],[32,0.07975,0.00373,0.07752,0.00445],[33,0.07988,0.00373,0.07759,0.00447],[34,0.08,0.00372,0.07766,0.0045],[35,0.08013,0.00372,0.07773,0.00452],[36,0.08027,0.00371,0.07782,0.00454],[37,0.08042,0.00371,0.0779,0.00457],[38,0.08057,0.00371,0.078,0.00459],[39,0.08072,0.0037,0.0781,0.00462],[40,0.08087,0.0037,0.0782,0.00464],[41,0.08102,0.0037,0.07831,0.00466],[42,0.08117,0.00369,0.07842,0.00469],[43,0.08132,0.00369,0.07854,0.00471],[44,0.08148,0.00368,0.07866,0.00473],[45,0.08165,0.00368,0.07879,0.00476],[46,0.08183,0.00368,0.07892,0.00478],[47,0.08201,0.00367,0.07905,0.0048],[48,0.08221,0.00367,0.07919,0.00483],[49,0.0824,0.00367,0.07933,0.00485],[50,0.0826,0.00366,0.07947,0.00487],[51,0.08279,0.00366,0.07962,0.00489],[52,0.08297,0.00365,0.07977,0.00492],[53,0.08315,0.00365,0.07992,0.00494],[54,0.08334,0.00365,0.08007,0.00496],[55,0.08352,0.00364,0.08023,0.00498],[56,0.08369,0.00364,0.08039,0.00501],[57,0.08386,0.00364,0.08055,0.00503],[58,0.08403,0.00363,0.08072,0.00505],[59,0.08419,0.00363,0.08088,0.00507],[60,0.08436,0.00362,0.08105,0.00509],[61,0.08454,0.00362,0.08122,0.00511],[62,0.08471,0.00362,0.08139,0.00514],[63,0.08489,0.00361,0.08156,0.00516],[64,0.08506,0.00361,0.08174,0.00518],[65,0.08522,0.0036,0.08191,0.0052],[66,0.08537,0.0036,0.08208,0.00522],[67,0.08551,0.0036,0.08226,0.00524],[68,0.08565,0.00359,0.08243,0.00526],[69,0.08578,0.00359,0.08261,0.00528],[70,0.08591,0.00359,0.08278,0.0053],[71,0.08604,0.00358,0.08296,0.00533],[72,0.08616,0.00358,0.08313,0.00535],[73,0.08629,0.00357,0.0833,0.00537],[74,0.08641,0.00357,0.08346,0.00539],[75,0.08653,0.00357,0.08363,0.00541],[76,0.08665,0.00356,0.0838,0.00543],[77,0.08675,0.00356,0.08396,0.00545],[78,0.08685,0.00355,0.08412,0.00547],[79,0.08695,0.00355,0.08428,0.00549],[80,0.08705,0.00355,0.08444,0.00551],[81,0.08714,0.00354,0.0846,0.00553],[82,0.08723,0.00354,0.08476,0.00555],[83,0.08732,0.00354,0.08492,0.00557],[84,0.08742,0.00353,0.08508,0.00559],[85,0.08811,0.00356,0.08533,0.00528]];
function getABSIReference(age,sex){
  const a=Math.round(Number(age));
  if(!Number.isFinite(a)||a<18||!["male","female"].includes(sex))return null;
  const refAge=Math.min(85,a),row=ABSI_NHANES_REFERENCE.find(r=>r[0]===refAge);
  if(!row)return null;
  return sex==="male"?{age:refAge,mean:row[1],sd:row[2],sexLabel:"男性"}:{age:refAge,mean:row[3],sd:row[4],sexLabel:"女性"}
}
function classifyABSIZ(z){
  if(z<-.868)return {key:"very-low",label:"かなり低い領域"};
  if(z<-.272)return {key:"low",label:"低い領域"};
  if(z<.230)return {key:"average",label:"平均的な領域"};
  if(z<=.798)return {key:"high",label:"高い領域"};
  return {key:"very-high",label:"かなり高い領域"}
}
function updateVisitABSIZ(absi){
  const panel=$("visitAbsiZPanel"),result=$("visitAbsiZResult");
  if(!panel||!result)return;
  if(absi===null||absi===undefined||!Number.isFinite(Number(absi))){panel.style.display="none";result.style.display="none";return}
  panel.style.display="block";
  const age=numOrNull($("visitAbsiAge").value),sex=$("visitAbsiSex").value;
  if(!age||!sex){result.style.display="none";return}
  if(age<18){result.style.display="block";result.className="absi-z-result";result.innerHTML="<strong>18歳未満はこのツールではz-score評価を行いません。</strong>";return}
  const ref=getABSIReference(age,sex); if(!ref){result.style.display="none";return}
  const z=(Number(absi)-ref.mean)/ref.sd,cat=classifyABSIZ(z),ageText=age>=85?"85歳以上":Math.round(age)+"歳";
  result.style.display="block"; result.className="absi-z-result "+cat.key;
  result.innerHTML='<div>ABSI z-score <span class="absi-z-score">'+(z>=0?"+":"")+z.toFixed(2)+'</span>　｜　<strong>'+cat.label+'</strong></div>'+
    '<div style="margin-top:4px">'+ageText+'・'+ref.sexLabel+'のNHANES基準と比較した標準化値です。z=0が同年齢・同性の平均、正の値ほど平均より高く、負の値ほど低いことを示します。高いz-scoreは、同年齢・同性の集団の中でも腹囲が体格に対して相対的に大きいことを意味します。</div>'+
    '<div class="note" style="margin-top:4px"><strong>リスクの見方：</strong>ABSIが高い集団ほど、高血圧、2型糖尿病、心血管疾患、全死亡リスクが高いことが報告されています。ただし、このz-scoreから個人の発症確率を直接計算することはできません。</div>'+
    '<div class="note" style="margin-top:4px">区分はABSI z-scoreの5群区分（&lt;−0.868 / −0.868〜−0.272 / −0.272〜0.229 / 0.230〜0.798 / &gt;0.798）に基づく参考表示です。NHANES 1999–2004の米国集団を基準としており、日本人の診断基準ではありません。個々のリスク判定ではなく参考値として使用してください。</div>'
}
function updateVisitABSI(){
  const box=$("visitAbsiBox"),panel=$("visitAbsiZPanel");if(!box)return;
  const w=numOrNull($("visitWeight").value),wc=numOrNull($("visitWaist").value),h=numOrNull(loadSettings().height);
  if(!h){box.innerHTML="ABSI：<strong>身長が未設定です。</strong> 設定画面で身長を入力してください。";if(panel)panel.style.display="none";return}
  if(!w||!wc){box.textContent="ABSI：体重・腹囲と、設定画面の身長を入力すると自動計算します。";if(panel)panel.style.display="none";return}
  const bmi=w/((h/100)**2),absi=calculateABSI(w,wc,h);
  const age=numOrNull($("visitAbsiAge")?.value),sex=$("visitAbsiSex")?.value||"",hasStandardization=!!(age&&sex&&age>=18);
  const absiExplanation='<div class="note" style="margin-top:5px"><strong>ABSIとは：</strong>A Body Shape Index の略で、身長と体重（BMI）に対して腹囲がどの程度大きいかをみる体型指標です。BMIだけでは分かりにくい体型の違いを、腹囲を加えて補助的に評価します。</div><div class="note" style="margin-top:4px"><strong>ABSIが高いと：</strong>同じBMI・身長の人と比べて、腹囲が相対的に大きいことを示します。研究では、高いABSIは高血圧、2型糖尿病、心血管疾患、全死亡リスクが高いことと関連しています。ただし、ABSIだけで病気を診断したり、個人の発症確率を決めたりするものではありません。</div>';
  box.innerHTML=hasStandardization
    ?'<div>BMI '+bmi.toFixed(1)+' kg/m²　｜　ABSI <strong>'+absi.toFixed(4)+'</strong></div>'+absiExplanation+'<div class="note" style="margin-top:4px">ABSI = 腹囲(m) ÷ [BMI^(2/3) × 身長(m)^(1/2)]</div>'
    :'<div>BMI '+bmi.toFixed(1)+' kg/m²　｜　ABSI <strong>'+absi.toFixed(4)+'</strong></div>'+absiExplanation+'<div class="note" style="margin-top:5px"><strong>解釈：</strong>値が高いほど、体格に対して腹囲が相対的に大きいことを示します。年齢・性別を入力しない場合は、raw ABSIを経時変化を見る参考値として使用します。</div><div class="note" style="margin-top:4px"><strong>注意：</strong>ABSIは年齢・性別で基準値が異なるため、raw ABSIに一律の「正常／高値」のカットオフはありません。このツールでは診断区分を付けず、経時変化をみる参考値として表示します。</div><div class="note" style="margin-top:4px">ABSI = 腹囲(m) ÷ [BMI^(2/3) × 身長(m)^(1/2)]</div>';
  updateVisitABSIZ(absi)
}
function visitFormToRecord(){
  const r={date:$("visitDate").value,medication:$("visitMedication").value.trim(),diet:$("visitDiet").value.trim(),
    exercise:$("visitExercise").value.trim(),protein:$("visitProtein").value.trim(),note:$("visitNote").value.trim(),
    absiAge:numOrNull($("visitAbsiAge").value),absiSex:$("visitAbsiSex").value,
    updatedAt:new Date().toISOString()};
  const map={visitWeight:"weight",visitWaist:"waist",visitSBP:"sbp",visitDBP:"dbp",visitGlucose:"glucose",visitHbA1c:"hba1c",visitGA:"ga",visitHb:"hb",
    visitTC:"tc",visitTG:"tg",visitHDL:"hdl",visitLDL:"ldl",visitAST:"ast",visitALT:"alt",visitGGT:"ggt",
    visitUA:"ua",visitCr:"cr",visitEGFR:"egfr"};
  Object.entries(map).forEach(([id,key])=>r[key]=numOrNull($(id).value));return r
}
function setVisitForm(r){
  $("visitDate").value=r?.date||todayISO();$("visitMedication").value=r?.medication??"";
  $("visitDiet").value=r?.diet??"";$("visitExercise").value=r?.exercise??"";$("visitProtein").value=r?.protein??"";
  $("visitNote").value=r?.note??"";
  const map={visitWeight:"weight",visitWaist:"waist",visitSBP:"sbp",visitDBP:"dbp",visitGlucose:"glucose",visitHbA1c:"hba1c",visitGA:"ga",visitHb:"hb",
    visitTC:"tc",visitTG:"tg",visitHDL:"hdl",visitLDL:"ldl",visitAST:"ast",visitALT:"alt",visitGGT:"ggt",
    visitUA:"ua",visitCr:"cr",visitEGFR:"egfr"};
  Object.entries(map).forEach(([id,key])=>$(id).value=r?.[key]??"");
  $("visitAbsiAge").value=r?.absiAge??"";
  $("visitAbsiSex").value=r?.absiSex??"";
  updateVisitABSI()
}
async function loadVisit(date){
  isLoadingVisit=true;
  const r=await getItem(VISIT_STORE,date);
  const draft=loadDraftSync(VISIT_DRAFT_KEY);
  if(draft && draft.date===date && hasMeaningfulVisitData(draft)){
    setVisitForm(draft);
    applyVisitFieldVisibility();
    setSaveStatus("visitStatus","前回閉じる直前の入力内容を復元しました。自動保存します。","warn");
    isLoadingVisit=false;
    scheduleVisitAutoSave(50);
    return;
  }
  setVisitForm(r||{date});
  applyVisitFieldVisibility();
  setSaveStatus("visitStatus",r?"保存済みの外来記録を読み込みました。":"自動保存が有効です。入力すると自動的に保存されます。",r?"ok":"");
  isLoadingVisit=false;
}
async function saveVisit(auto=false){
  const r=visitFormToRecord();
  if(!r.date){
    setSaveStatus("visitStatus","受診日を入力してください。","warn");return
  }
  if(!hasMeaningfulVisitData(r)){
    clearDraftSync(VISIT_DRAFT_KEY);
    if(!auto)setSaveStatus("visitStatus","入力内容がありません。","");
    return
  }
  setSaveStatus("visitStatus",auto?"保存中…":"保存しています…","");
  await putItem(VISIT_STORE,r);
  clearDraftSync(VISIT_DRAFT_KEY);
  setSaveStatus("visitStatus","保存済み ✓","ok");
  if(!auto)await refreshAll(); else {await refreshSummary(); if($("view-outpatient").classList.contains("active")){await drawVisitCharts();await renderVisits()}}
}
function scheduleVisitAutoSave(delay=700){
  if(isLoadingVisit)return;
  const r=visitFormToRecord();
  saveDraftSync(VISIT_DRAFT_KEY,r);
  clearTimeout(visitAutoSaveTimer);
  setSaveStatus("visitStatus","入力中…","");
  visitAutoSaveTimer=setTimeout(()=>saveVisit(true),delay);
}

/* サマリー：自宅体重は朝・夜を混ぜずに評価 */
function medianNumber(values){
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2
}
function parseLocalDate(iso){
  const [y,m,d]=iso.split("-").map(Number);
  return new Date(y,m-1,d,12,0,0)
}
function homeWeightStats(daily,key,method=selectedWeightReductionMethod,configuredStart=null){
  const rows=daily
    .filter(r=>r[key]!==null&&r[key]!==undefined&&Number.isFinite(Number(r[key])))
    .map(r=>({date:r.date,w:Number(r[key])}))
    .sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length)return null;

  const firstRecord=rows[0],latest=rows[rows.length-1];
  const startValue=configuredStart!==null&&configuredStart!==undefined?Number(configuredStart):firstRecord.w;
  const startSource=configuredStart!==null&&configuredStart!==undefined?"settings":"record";
  const first={date:firstRecord.date,w:startValue};
  const end=parseLocalDate(latest.date),startWindow=new Date(end);
  startWindow.setDate(startWindow.getDate()-6);
  const recent=rows.filter(r=>{
    const d=parseLocalDate(r.date);return d>=startWindow&&d<=end
  });
  const recentMedian=medianNumber(recent.map(r=>r.w));
  const current=method==="latest"?latest.w:recentMedian;
  const canCompare=current!==null && (startSource==="settings" ? rows.length>=1 : (rows.length>=2 && latest.date!==firstRecord.date));
  const diff=canCompare?current-first.w:null;
  const pct=canCompare?diff/first.w*100:null;
  return {first,firstRecord,latest,recent,recentMedian,current,diff,pct,canCompare,method,startSource}
}
function updateWeightReductionMethodUI(){
  if(!["latest","median7"].includes(selectedWeightReductionMethod))selectedWeightReductionMethod="median7";
  document.querySelectorAll("#weightReductionMethodButtons button").forEach(b=>{
    b.classList.toggle("active",b.dataset.method===selectedWeightReductionMethod)
  });
  const isLatest=selectedWeightReductionMethod==="latest";
  $("morningCurrentWeightLabel").textContent=isLatest?"最新体重":"最新7日中央値";
  $("eveningCurrentWeightLabel").textContent=isLatest?"最新体重":"最新7日中央値";
  $("weightReductionMethodNote").textContent=isLatest
    ?"同じ時間帯で最後に測定した1回の体重を、体重減少率の計算に使用します。"
    :"一時的な水分変動などの影響を受けにくくするため、最新測定日を含む直近7日間の中央値を使用します。"
}
function setHomeWeightSummary(prefix,stats,label){
  const startEl=$(`${prefix}StartWeight`),recentEl=$(`${prefix}RecentWeight`),pctEl=$(`${prefix}ChangePct`),meta=$(`${prefix}WeightMeta`);
  if(!stats){
    startEl.textContent="—";recentEl.textContent="—";pctEl.textContent="—";
    meta.textContent=`${label}の記録がありません。`;return
  }
  startEl.textContent=`${stats.first.w.toFixed(1)} kg`;
  recentEl.textContent=stats.current===null?"—":`${stats.current.toFixed(1)} kg`;
  const startLabel=stats.startSource==="settings"?"設定した開始値":`最初の記録 ${stats.firstRecord.date.replaceAll("-","/")}`;
  if(stats.canCompare){
    pctEl.textContent=(stats.pct>0?"+":"")+stats.pct.toFixed(1)+"%";
    const diffText=(stats.diff>0?"+":"")+stats.diff.toFixed(1)+" kg";
    if(stats.method==="latest"){
      meta.textContent=`${startLabel} → 最新 ${stats.latest.date.replaceAll("-","/")} ${stats.latest.w.toFixed(1)} kg。変化 ${diffText}。`
    }else{
      meta.textContent=`${startLabel} → 最新測定 ${stats.latest.date.replaceAll("-","/")}。最新測定日を含む7日間 ${stats.recent.length}回の中央値。変化 ${diffText}。`
    }
  }else{
    pctEl.textContent="—";
    meta.textContent=stats.startSource==="settings"?`${startLabel}。現在体重の記録が必要です。`:`${startLabel}。同じ時間帯の比較には2回以上・別日の記録が必要です。`
  }
}
function renderGeneralWeightSafety(height,morning,evening){
  const box=$("generalWeightSafety");box.innerHTML="";
  if(!height)return;

  const items=[];
  [
    ["朝",morning],
    ["夜",evening]
  ].forEach(([label,stats])=>{
    if(!stats||stats.current===null)return;
    const bmi=stats.current/((height/100)**2);
    const lossPct=stats.canCompare?Math.max(0,-stats.pct):null;
    if(bmi<18.5){
      items.push({
        level:"red",label,bmi,lossPct,
        text:"BMIが18.5未満になっています。意図しない体重減少、食事量の低下、筋力低下などがないか確認し、担当医・医療スタッフに相談してください。"
      })
    }else if(bmi<20 && lossPct!==null && lossPct>=3){
      items.push({
        level:"yellow",label,bmi,lossPct,
        text:"BMIが20未満で、開始時から3%以上体重が減少しています。減量をさらに進める前に、現在の目標体重が適切か担当医・医療スタッフと確認してください。"
      })
    }
  });

  if(!items.length)return;
  const reds=items.filter(x=>x.level==="red"),yellows=items.filter(x=>x.level==="yellow");
  const chosen=reds.length?reds:yellows;
  const cls=reds.length?"reward-warning":"reward-caution";
  const title=reds.length?"⚠️ 体重減少について確認が必要です":"⚠️ 体重が減少しています";
  const lines=chosen.map(x=>{
    const loss=x.lossPct===null?"":`、開始時から −${x.lossPct.toFixed(1)}%`;
    return `<strong>${x.label}：BMI ${x.bmi.toFixed(1)}${loss}</strong><br>${x.text}`
  }).join("<br><br>");
  box.innerHTML=`<div class="${cls}"><strong>${title}</strong><br>${lines}</div>`
}
async function refreshSummary(){
  updateWeightReductionMethodUI();
  const daily=await getAll(DAILY_STORE),s=loadSettings(),height=numOrNull(s.height);
  const morning=homeWeightStats(daily,"weightMorning",selectedWeightReductionMethod,numOrNull(s.startWeightMorning));
  const evening=homeWeightStats(daily,"weightEvening",selectedWeightReductionMethod,numOrNull(s.startWeightEvening));
  setHomeWeightSummary("morning",morning,"朝");
  setHomeWeightSummary("evening",evening,"夜");
  renderGeneralWeightSafety(height,morning,evening)
}

function loadWeightRewardProgress(){
  try{
    const x=JSON.parse(localStorage.getItem(WEIGHT_REWARD_KEY)||"{}");
    return {morning:Math.max(0,Math.min(30,Number(x.morning)||0)),evening:Math.max(0,Math.min(30,Number(x.evening)||0))}
  }catch(e){return {morning:0,evening:0}}
}
function saveWeightRewardProgress(x){
  const clean={morning:Math.max(0,Math.min(30,Math.floor(Number(x.morning)||0))),evening:Math.max(0,Math.min(30,Math.floor(Number(x.evening)||0)))};
  localStorage.setItem(WEIGHT_REWARD_KEY,JSON.stringify(clean))
}
function rewardMilestoneIcon(p){
  const special={3:"🥉",5:"🥈",10:"🥇",15:"⭐",20:"🏆",25:"👑",30:"💎"};
  return special[p]||"●"
}
function renderRewardMedals(unlocked){
  const box=$("rewardMedals");box.innerHTML="";
  const specials=new Set([3,5,10,15,20,25,30]);
  for(let p=1;p<=30;p++){
    const earned=p<=unlocked,el=document.createElement("div");
    el.className=`reward-medal ${earned?"earned":""} ${specials.has(p)?"special":""}`;
    el.setAttribute("aria-label",`${p}% ${earned?"獲得済み":"未獲得"}`);
    el.innerHTML=`<div class="reward-icon">${earned?rewardMilestoneIcon(p):"○"}</div><div class="reward-pct">${p}%</div>`;
    box.appendChild(el)
  }
}
function rewardTimeLabel(t){return t==="evening"?"夜":"朝"}
async function refreshWeightReward(){
  if(!["morning","evening"].includes(selectedRewardTime))selectedRewardTime="morning";
  const daily=await getAll(DAILY_STORE),s=loadSettings(),height=numOrNull(s.height);
  const morning=homeWeightStats(daily,"weightMorning",selectedWeightReductionMethod,numOrNull(s.startWeightMorning));
  const evening=homeWeightStats(daily,"weightEvening",selectedWeightReductionMethod,numOrNull(s.startWeightEvening));

  // 選択系列に記録がなく反対側に記録がある場合のみ自動で切り替える
  if(selectedRewardTime==="morning"&&!morning&&evening)selectedRewardTime="evening";
  else if(selectedRewardTime==="evening"&&!evening&&morning)selectedRewardTime="morning";
  localStorage.setItem(WEIGHT_REWARD_TIME_KEY,selectedRewardTime);
  document.querySelectorAll("#rewardTimeButtons button").forEach(b=>b.classList.toggle("active",b.dataset.time===selectedRewardTime));

  const stats=selectedRewardTime==="morning"?morning:evening;
  const progress=loadWeightRewardProgress();
  let unlocked=progress[selectedRewardTime]||0;
  $("rewardSafety").innerHTML="";

  if(!height){
    $("rewardHeadline").textContent="身長を設定してください";
    $("rewardDetail").textContent="開始時BMIが25以上かを確認するため、設定画面で身長を入力してください。";
    $("rewardProgressBar").style.width="0%";renderRewardMedals(unlocked);return
  }
  if(!stats){
    $("rewardHeadline").textContent=`${rewardTimeLabel(selectedRewardTime)}の体重記録がありません`;
    $("rewardDetail").textContent="同じ時間帯の体重を記録するとメダル判定が始まります。";
    $("rewardProgressBar").style.width="0%";renderRewardMedals(unlocked);return
  }

  const startBMI=stats.first.w/((height/100)**2);
  if(startBMI<25){
    $("rewardHeadline").textContent="減量メダルの対象外です";
    $("rewardDetail").textContent=`${rewardTimeLabel(selectedRewardTime)}の開始時BMIは ${startBMI.toFixed(1)} です。開始時BMI 25以上の場合にメダル判定を行います。`;
    $("rewardProgressBar").style.width="0%";renderRewardMedals(unlocked);return
  }
  if(!stats.canCompare||stats.current===null){
    $("rewardHeadline").textContent="現在体重の記録を待っています";
    $("rewardDetail").textContent=`開始時BMI ${startBMI.toFixed(1)}。同じ時間帯の現在体重が入力されると減量率を判定します。`;
    $("rewardProgressBar").style.width="0%";renderRewardMedals(unlocked);return
  }

  const currentBMI=stats.current/((height/100)**2);
  const lossPct=Math.max(0,-stats.pct);
  const currentLevel=Math.max(0,Math.min(30,Math.floor(lossPct+1e-9)));

  // BMI 18.5未満では新規メダルを増やさない
  if(currentBMI>=18.5 && currentLevel>unlocked){
    unlocked=currentLevel;progress[selectedRewardTime]=unlocked;saveWeightRewardProgress(progress)
  }

  if(currentBMI<18.5){
    $("rewardSafety").innerHTML=`<div class="reward-warning"><strong>⚠️ 現在BMI ${currentBMI.toFixed(1)}：18.5未満です。</strong><br>低体重に相当するため、これ以上の減量を目標にせず、体重や栄養状態について担当医・医療スタッフに相談してください。新しい減量メダルの獲得は停止しています。</div>`;
  }else if(currentBMI<20){
    $("rewardSafety").innerHTML=`<div class="reward-caution"><strong>⚠️ 現在BMI ${currentBMI.toFixed(1)}：20未満になりました。</strong><br>減量をさらに進める前に、現在の目標体重が適切か担当医・医療スタッフと確認してください。年齢や病状によって望ましい体重範囲は異なります。</div>`;
  }

  $("rewardHeadline").textContent=lossPct>0?`現在 −${lossPct.toFixed(1)}% ／ メダル ${unlocked}枚`:`現在の減量率 0% ／ メダル ${unlocked}枚`;
  const methodLabel=selectedWeightReductionMethod==="latest"?"最新体重":"直近7日中央値";
  $("rewardDetail").textContent=`${rewardTimeLabel(selectedRewardTime)}・${methodLabel}で判定　開始BMI ${startBMI.toFixed(1)} → 現在BMI ${currentBMI.toFixed(1)}。${unlocked<30&&currentBMI>=18.5?`次は ${Math.max(unlocked+1,1)}% メダル。`:""}`;
  $("rewardProgressBar").style.width=`${Math.min(100,lossPct/30*100)}%`;
  renderRewardMedals(unlocked)
}

function dateRangeFilter(records,days){
  if(days==="all")return records;
  const end=new Date(todayISO()+"T12:00:00"),start=new Date(end);start.setDate(start.getDate()-(Number(days)-1));
  return records.filter(r=>{const d=new Date(r.date+"T12:00:00");return d>=start&&d<=end})
}

/* 外来グラフ用：
   「1年／3年／5年」は今日を終点にせず、保存されている最新の受診日を終点にする。
   これにより、試験入力などで今日より後の日付を入力した場合も、
   1か月後・2か月後のデータをグラフと薬剤タイムラインに反映できる。 */
function visitDateRangeFilter(records,days){
  const rows=(records||[]).filter(r=>r&&r.date).sort((a,b)=>a.date.localeCompare(b.date));
  if(days==="all"||!rows.length)return rows;
  const latest=rows[rows.length-1].date;
  const end=new Date(latest+"T12:00:00"),start=new Date(end);
  start.setDate(start.getDate()-(Number(days)-1));
  return rows.filter(r=>{
    const d=new Date(r.date+"T12:00:00");
    return d>=start&&d<=end
  })
}

/* SVGグラフ */
function svgEl(name,attrs={},text=""){
  const ns="http://www.w3.org/2000/svg",e=document.createElementNS(ns,name);
  Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;return e
}

function weightAxisBounds(values){
  if(!values.length)return {min:0,max:2};
  let low=Math.min(...values),high=Math.max(...values);
  const spread=high-low;
  const pad=Math.max(1,spread*.18);
  let min=Math.floor(low-pad),max=Math.ceil(high+pad);
  if(max-min<2){min-=1;max+=1}
  return {min,max}
}
function clearPointValueTooltip(svg){
  svg.querySelectorAll(".point-value-tooltip,.weight-point-value").forEach(el=>el.remove())
}
function showPointValueTooltip(svg,x,y,valueText,date,label=""){
  clearPointValueTooltip(svg);
  const W=720;
  const main=String(valueText||"");
  const sub=[String(date||"").slice(5).replace("-","/"),String(label||"")].filter(Boolean).join(" ");
  const boxW=Math.max(126,Math.min(196,Math.max(main.length*10+30,sub.length*7+28)));
  const boxH=45;
  let bx=Math.max(4,Math.min(W-boxW-4,x-boxW/2));
  let by=y-boxH-14;
  if(by<4)by=y+14;
  const g=svgEl("g",{class:"point-value-tooltip","aria-hidden":"true","pointer-events":"none"});
  g.appendChild(svgEl("rect",{x:bx,y:by,width:boxW,height:boxH,rx:"9",fill:"#ffffff",stroke:"#40524e","stroke-width":"1.5"}));
  g.appendChild(svgEl("text",{x:bx+boxW/2,y:by+20,"text-anchor":"middle",fill:"#263a35","font-size":"16","font-weight":"900"},main));
  g.appendChild(svgEl("text",{x:bx+boxW/2,y:by+36,"text-anchor":"middle",fill:"#667571","font-size":"11","font-weight":"700"},sub));
  svg.appendChild(g)
}
function makePointInteractive(svg,c,x,y,valueText,date,label="",ariaText=""){
  const accessible=ariaText||`${date} ${label} ${valueText}`;
  c.setAttribute("role","button");
  c.setAttribute("tabindex","0");
  c.setAttribute("aria-label",accessible);
  c.style.cursor="pointer";
  // 見える点は小さいまま、タップ判定は広めにする。
  const hit=svgEl("circle",{cx:x,cy:y,r:"14",fill:"transparent",role:"button",tabindex:"0","aria-label":accessible});
  hit.style.cursor="pointer";
  const activate=()=>showPointValueTooltip(svg,x,y,valueText,date,label);
  hit.addEventListener("click",activate);c.addEventListener("click",activate);
  hit.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate()}});
  c.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate()}});
  svg.appendChild(hit)
}
function makeWeightPointInteractive(svg,c,x,y,value,date,label="体重"){
  const text=`${Number(value).toFixed(1)} kg`;
  makePointInteractive(svg,c,x,y,text,date,label,`${date} ${label} ${text}`)
}
function graphSeriesLabel(key){
  const map={
    hba1c:"HbA1c",
    ga:"GA",
    estimatedHbA1c:"推定HbA1c",
    weight:"体重",
    weightMorning:"朝体重",
    weightEvening:"夜体重"
  };
  return map[key]||key
}

function drawHbA1cBackgroundBands(svg,yFor,yMin,yMax,L,R,W){
  const bands=[
    {lo:yMin,hi:Math.min(6,yMax),fill:"#c9e2f7"},
    {lo:Math.max(6,yMin),hi:Math.min(7,yMax),fill:"#eaf4ff"},
    {lo:Math.max(7,yMin),hi:Math.min(8,yMax),fill:"#fff6d8"},
    {lo:Math.max(8,yMin),hi:Math.min(10,yMax),fill:"#fdeaea"},
    {lo:Math.max(10,yMin),hi:yMax,fill:"#f2bcbc"}
  ];
  bands.forEach(b=>{
    if(b.hi<=b.lo)return;
    const yTop=yFor(b.hi),yBottom=yFor(b.lo);
    svg.appendChild(svgEl("rect",{
      x:L,y:yTop,width:W-L-R,height:Math.max(0,yBottom-yTop),fill:b.fill
    }))
  })
}


function openHomeEventPopup(date,text){
  const overlay=$("homeEventOverlay");if(!overlay)return;
  $("homeEventDate").textContent=`${String(date).replaceAll("-","/")} の出来事`;
  $("homeEventText").textContent=String(text||"");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false")
}
function closeHomeEventPopup(){
  const overlay=$("homeEventOverlay");if(!overlay)return;
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden","true")
}
function addHomeEventMarker(svg,x,y,date,text){
  const g=svgEl("g",{role:"button",tabindex:"0","aria-label":`${date} 出来事を表示`});
  g.style.cursor="pointer";
  const hit=svgEl("circle",{cx:x,cy:y,r:"14",fill:"transparent"});
  const diamond=svgEl("polygon",{points:`${x},${y-7} ${x+7},${y} ${x},${y+7} ${x-7},${y}`,fill:"#b34f3b",stroke:"#fff","stroke-width":"1.5"});
  const title=svgEl("title",{},`${date} 出来事：${String(text).replace(/\s+/g," ").slice(0,80)}`);
  g.appendChild(hit);g.appendChild(diamond);g.appendChild(title);
  const activate=()=>openHomeEventPopup(date,text);
  g.addEventListener("click",activate);
  g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate()}});
  svg.appendChild(g)
}

function drawSimpleLineChart(svg,records,series,unit,height=330,target=null,dateMarkerKey=null,backgroundType=null,eventKey=null){
  svg.innerHTML="";
  const values=[];
  records.forEach(r=>series.forEach(s=>{const v=r[s.key];if(v!==null&&v!==undefined)values.push(Number(v))}));
  const eventRows=eventKey?records.filter(r=>String(r[eventKey]||"").trim()!==""):[];
  if(!values.length){
    svg.appendChild(svgEl("text",{x:360,y:height/2-18,"text-anchor":"middle",fill:"#788783","font-size":"20"},unit==="kg"?"この期間に体重記録がありません":"この期間に記録がありません"));
    if(eventRows.length){
      const W=720,H=height,L=58,R=18,B=48,dates=[...new Set(records.map(r=>r.date))];
      const xFor=date=>dates.length===1?(L+W-R)/2:L+dates.indexOf(date)/Math.max(1,dates.length-1)*(W-L-R);
      eventRows.forEach(r=>addHomeEventMarker(svg,xFor(r.date),height/2+25,r.date,r[eventKey]));
      const ticks=Math.min(6,dates.length);
      for(let i=0;i<ticks;i++){const idx=Math.round(i*(dates.length-1)/Math.max(1,ticks-1)),d=dates[idx];svg.appendChild(svgEl("text",{x:xFor(d),y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"14","font-weight":"800"},d.slice(5).replace("-","/")))}
    }
    return
  }
  const W=720,H=height,L=58,R=18,T=20,B=48;
  let min,max;
  if(unit==="kg"){
    const axis=weightAxisBounds(values);min=axis.min;max=axis.max
  }else{
    const rawMin=Math.min(...values),rawMax=Math.max(...values),pad=Math.max(unit==="%"?.3:1,(rawMax-rawMin)*.18);
    min=rawMin-pad;max=rawMax+pad;if(max-min<(unit==="%"?1:2)){min-=.5;max+=.5}
  }
  if(backgroundType==="hba1c"){
    // HbA1cの5領域（<6, 6-7, 7-8, 8-10, >=10）が分かるよう表示範囲を確保
    min=Math.min(min,5.5);
    max=Math.max(max,10.5)
  }
  const dates=[...new Set(records.map(r=>r.date))];
  const xFor=date=>dates.length===1?(L+W-R)/2:L+dates.indexOf(date)/(dates.length-1)*(W-L-R);
  const yFor=v=>T+(max-v)/(max-min)*(H-T-B);
  if(backgroundType==="hba1c")drawHbA1cBackgroundBands(svg,yFor,min,max,L,R,W);
  if(unit==="kg"){
    // 体重は常に整数kg位置（例 65.0 kg）に1 kg刻みで横線を引く。
    for(let v=Math.ceil(min);v<=Math.floor(max);v+=1){
      const y=yFor(v);
      svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#d7e1de","stroke-width":"1"}));
      svg.appendChild(svgEl("text",{x:L-8,y:y+5,"text-anchor":"end",fill:"#40524e","font-size":"14","font-weight":"800"},v.toFixed(1)))
    }
  }else{
    for(let i=0;i<=5;i++){
      const v=min+(max-min)*i/5,y=yFor(v);
      svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#dfe7e4","stroke-width":"1"}));
      svg.appendChild(svgEl("text",{x:L-8,y:y+4,"text-anchor":"end",fill:"#40524e","font-size":"14","font-weight":"700"},v.toFixed(1)))
    }
  }
  svg.appendChild(svgEl("text",{x:18,y:18,fill:"#40524e","font-size":"14","font-weight":unit==="kg"?"800":"700"},unit));
  const tickCount=Math.min(6,dates.length);
  for(let i=0;i<tickCount;i++){
    const idx=Math.round(i*(dates.length-1)/Math.max(1,tickCount-1)),d=dates[idx],x=xFor(d);
    svg.appendChild(svgEl("text",{x,y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"14","font-weight":unit==="kg"?"800":"700"},d.slice(5).replace("-","/")))
  }
  if(dateMarkerKey){
    records.filter(r=>r[dateMarkerKey]===true).forEach(r=>{
      const x=xFor(r.date);
      const mark=svgEl("text",{x,y:H-B+14,"text-anchor":"middle",fill:"#8d5a3b","font-size":"18","font-weight":"900"},"＊");
      mark.appendChild(svgEl("title",{},`${r.date} 排便あり`));
      svg.appendChild(mark)
    })
  }
  if(eventKey){
    records.filter(r=>String(r[eventKey]||"").trim()!=="").forEach(r=>{
      addHomeEventMarker(svg,xFor(r.date),H-B-11,r.date,r[eventKey])
    })
  }
  series.forEach(s=>{
    let prev=null;
    records.forEach(r=>{
      const v=r[s.key];
      if(v===null||v===undefined){prev=null;return}
      const p={x:xFor(r.date),y:yFor(Number(v))};
      if(prev)svg.appendChild(svgEl("line",{x1:prev.x,y1:prev.y,x2:p.x,y2:p.y,stroke:s.color,"stroke-width":"3","stroke-linecap":"round","stroke-dasharray":s.dash||""}));
      const c=svgEl("circle",{cx:p.x,cy:p.y,r:unit==="kg"?"5.0":"4.2",fill:s.color,stroke:unit==="kg"?"#fff":"none","stroke-width":unit==="kg"?"1.4":"0"});
      const pointLabel=graphSeriesLabel(s.key);
      const decimals=unit==="kg"||unit==="%"?1:0;
      const valueText=`${Number(v).toFixed(decimals)}${unit?` ${unit}`:""}`;
      c.appendChild(svgEl("title",{},`${r.date} ${pointLabel} ${valueText}`));svg.appendChild(c);
      if(unit==="kg"){
        makeWeightPointInteractive(svg,c,p.x,p.y,Number(v),r.date,s.key==="weightMorning"?"朝":s.key==="weightEvening"?"夜":"体重")
      }else{
        makePointInteractive(svg,c,p.x,p.y,valueText,r.date,pointLabel,`${r.date} ${pointLabel} ${valueText}`)
      }
      prev=p
    })
  });
  if(target!==null&&target>=min&&target<=max){
    const y=yFor(target);svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#765a98","stroke-width":"2","stroke-dasharray":"4 5"}));
    svg.appendChild(svgEl("text",{x:W-R-4,y:y-5,"text-anchor":"end",fill:"#765a98","font-size":unit==="kg"?"13":"12","font-weight":unit==="kg"?"800":"500"},`目標 ${target.toFixed(1)} ${unit}`))
  }
}
async function drawHomeChart(){
  const all=dateRangeFilter(await getAll(DAILY_STORE),selectedPeriod);
  const target=numOrNull(loadSettings().targetWeight);

  if(selectedChartMode==="continuous"){
    drawContinuousHomeChart($("weightChart"),all,target);
    $("homeChartLegend").innerHTML=
      '<span><i style="background:#2f6f65;height:8px;width:8px;border-radius:50%"></i>朝の点</span>'+
      '<span><i style="background:#d07c39;height:8px;width:8px;border-radius:50%"></i>夜の点</span>'+
      '<span><i style="background:#40524e"></i>連続線</span>'+
      '<span><i class="bowel-legend-star">＊</i>排便あり</span>'+
      '<span><i class="event-legend-diamond">◆</i>出来事（タップ）</span>';
    $("chartModeNote").textContent="朝→夜→翌朝→翌夜…の順に、測定した各点を1本の線で結びます。未測定の時点がある場合はそこで線を切ります。";
    return;
  }

  const series=[];
  if($("showMorning").checked)series.push({key:"weightMorning",color:"#2f6f65"});
  if($("showEvening").checked)series.push({key:"weightEvening",color:"#d07c39",dash:"7 5"});
  drawSimpleLineChart($("weightChart"),all,series,"kg",390,target,"bowelMovement",null,"note");
  $("homeChartLegend").innerHTML=
    '<span><i style="background:#2f6f65"></i>朝</span>'+
    '<span><i style="background:#d07c39"></i>夜</span>'+
    '<span><i class="bowel-legend-star">＊</i>排便あり</span>'+
    '<span><i class="event-legend-diamond">◆</i>出来事（タップ）</span>';
  $("chartModeNote").textContent="朝体重と夜体重を、それぞれ別の折れ線として表示します。";
}

function drawContinuousHomeChart(svg,records,target=null){
  svg.innerHTML="";

  // 1日を「朝」「夜」の2時点に分けて、時系列の1本の並びにする
  const points=[];
  records.forEach(r=>{
    points.push({date:r.date,part:"朝",value:r.weightMorning,color:"#2f6f65"});
    points.push({date:r.date,part:"夜",value:r.weightEvening,color:"#d07c39"});
  });

  const values=points.filter(p=>p.value!==null&&p.value!==undefined).map(p=>Number(p.value));
  const eventRows=records.filter(r=>String(r.note||"").trim()!=="");
  if(!values.length){
    svg.appendChild(svgEl("text",{x:360,y:170,"text-anchor":"middle",fill:"#788783","font-size":"20"},"この期間に体重記録がありません"));
    if(eventRows.length){
      const W=720,H=390,L=58,R=18;
      const xForDate=date=>{
        const di=records.findIndex(r=>r.date===date);
        if(di<0)return L;
        const n=Math.max(1,records.length*2-1);
        return L+(di*2+.5)/n*(W-L-R)
      };
      eventRows.forEach(r=>addHomeEventMarker(svg,xForDate(r.date),215,r.date,r.note));
      const step=Math.max(1,Math.ceil(records.length/6));
      records.forEach((r,di)=>{if(di%step!==0&&di!==records.length-1)return;svg.appendChild(svgEl("text",{x:xForDate(r.date),y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"14","font-weight":"800"},r.date.slice(5).replace("-","/")))})
    }
    return;
  }

  const W=720,H=390,L=58,R=18,T=20,B=64;
  const weightAxis=weightAxisBounds(values);
  let min=weightAxis.min,max=weightAxis.max;

  const xFor=i=>points.length===1?(L+W-R)/2:L+i/Math.max(1,points.length-1)*(W-L-R);
  const yFor=v=>T+(max-v)/(max-min)*(H-T-B);

  // 横罫線・縦軸：1 kg刻み、整数kg位置に固定
  for(let v=Math.ceil(min);v<=Math.floor(max);v+=1){
    const y=yFor(v);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#d7e1de","stroke-width":"1"}));
    svg.appendChild(svgEl("text",{x:L-8,y:y+5,"text-anchor":"end",fill:"#40524e","font-size":"14","font-weight":"800"},v.toFixed(1)));
  }
  svg.appendChild(svgEl("text",{x:18,y:18,fill:"#40524e","font-size":"14","font-weight":"800"},"kg"));

  // 日付ラベルは1日1回、朝と夜の中間に表示
  const dayCount=records.length;
  const maxDateLabels=selectedPeriod===14?7:6;
  const step=Math.max(1,Math.ceil(dayCount/maxDateLabels));
  records.forEach((r,di)=>{
    if(di%step!==0 && di!==dayCount-1)return;
    const idxMorning=di*2,idxEvening=di*2+1;
    const x=(xFor(idxMorning)+xFor(idxEvening))/2;
    svg.appendChild(svgEl("text",{x,y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"14","font-weight":"800"},r.date.slice(5).replace("-","/")));
  });

  // 朝/夜の小ラベル。14日表示など短期だけ表示する
  if(points.length<=60){
    points.forEach((p,i)=>{
      svg.appendChild(svgEl("text",{x:xFor(i),y:H-39,"text-anchor":"middle",fill:"#6d7d78","font-size":"10.5","font-weight":"700"},p.part));
    });
  }

  // 排便があった日は、朝・夜の中間位置に「＊」を表示
  records.forEach((r,di)=>{
    if(r.bowelMovement!==true)return;
    const x=(xFor(di*2)+xFor(di*2+1))/2;
    const mark=svgEl("text",{x,y:H-B+15,"text-anchor":"middle",fill:"#8d5a3b","font-size":"18","font-weight":"900"},"＊");
    mark.appendChild(svgEl("title",{},`${r.date} 排便あり`));
    svg.appendChild(mark)
  });

  // 出来事・体調などがある日は「◆」。タップすると内容を表示
  records.forEach((r,di)=>{
    if(String(r.note||"").trim()==="")return;
    const x=(xFor(di*2)+xFor(di*2+1))/2;
    addHomeEventMarker(svg,x,H-B-11,r.date,r.note)
  });

  // 未測定時点をまたいでは結ばない
  let prev=null;
  points.forEach((p,i)=>{
    if(p.value===null||p.value===undefined){
      prev=null;
      return;
    }
    const x=xFor(i),y=yFor(Number(p.value));
    if(prev){
      svg.appendChild(svgEl("line",{
        x1:prev.x,y1:prev.y,x2:x,y2:y,
        stroke:"#40524e","stroke-width":"3","stroke-linecap":"round"
      }));
    }
    const c=svgEl("circle",{cx:x,cy:y,r:"5.0",fill:p.color,stroke:"#ffffff","stroke-width":"1.5"});
    c.appendChild(svgEl("title",{},`${p.date} ${p.part} ${Number(p.value).toFixed(1)} kg`));
    svg.appendChild(c);
    makeWeightPointInteractive(svg,c,x,y,Number(p.value),p.date,p.part);
    prev={x,y};
  });

  if(target!==null&&target>=min&&target<=max){
    const y=yFor(target);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#765a98","stroke-width":"2","stroke-dasharray":"4 5"}));
    svg.appendChild(svgEl("text",{x:W-R-4,y:y-5,"text-anchor":"end",fill:"#765a98","font-size":"13","font-weight":"800"},`目標 ${target.toFixed(1)} kg`));
  }
}

function updateSmbgChartModeUI(){
  if(!["sameTime","continuous"].includes(selectedSmbgChartMode))selectedSmbgChartMode="sameTime";
  document.querySelectorAll("#smbgChartModeButtons button").forEach(b=>b.classList.toggle("active",b.dataset.mode===selectedSmbgChartMode));
  $("smbgChartModeNote").textContent=selectedSmbgChartMode==="sameTime"
    ?"朝食前、朝食後、昼食前、昼食後、夕食前、夕食後、眠前ごとに、同じ時間帯の値を日付順に線で結びます。"
    :"1日の測定順（朝食前→朝食後→昼食前→昼食後→夕食前→夕食後→眠前）に点を並べ、測定していない時間帯がある場合はそこで線を切ります。";
}
function drawSmbgBackground(svg,yFor,yMin,yMax,L,R,W){
  const bands=[
    {lo:yMin,hi:Math.min(54,yMax),fill:"#f3b4b4"},
    {lo:Math.max(54,yMin),hi:Math.min(70,yMax),fill:"#fdeaea"},
    {lo:Math.max(70,yMin),hi:Math.min(181,yMax),fill:"#e9f7ee"},
    {lo:Math.max(181,yMin),hi:Math.min(250,yMax),fill:"#fff7d6"},
    {lo:Math.max(250,yMin),hi:yMax,fill:"#efd77d"}
  ];
  bands.forEach(b=>{
    if(b.hi<=b.lo)return;
    const yTop=yFor(b.hi),yBottom=yFor(b.lo);
    svg.appendChild(svgEl("rect",{x:L,y:yTop,width:W-L-R,height:Math.max(0,yBottom-yTop),fill:b.fill}))
  })
}

function renderSmbgAverages(records){
  const box=$("smbgAverageGrid");if(!box)return;
  box.innerHTML=SMBG_KEYS.map(k=>{
    const values=records
      .map(r=>r[k])
      .filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)))
      .map(Number);
    if(!values.length){
      return `<div class="smbg-average-card"><div class="smbg-average-label">${SMBG_LABELS[k]}</div><div class="smbg-average-value">—</div><div class="smbg-average-n">記録なし</div></div>`
    }
    const mean=values.reduce((a,b)=>a+b,0)/values.length;
    return `<div class="smbg-average-card"><div class="smbg-average-label">${SMBG_LABELS[k]}</div><div class="smbg-average-value">${mean.toFixed(0)} <span class="smbg-average-unit">mg/dL</span></div><div class="smbg-average-n">${values.length}回の平均</div></div>`
  }).join("")
}



function renderSmbgRangePercentages(records){
  const grid=$("smbgRangeGrid"),totalBox=$("smbgRangeTotal");
  if(!grid||!totalBox)return;

  const values=[];
  records.forEach(r=>SMBG_KEYS.forEach(k=>{
    const v=r[k];
    if(v!==null&&v!==undefined&&Number.isFinite(Number(v)))values.push(Number(v))
  }));

  const total=values.length;
  const tbr=values.filter(v=>v<70).length;
  const tir=values.filter(v=>v>=70&&v<=180).length;
  const tar=values.filter(v=>v>180).length;
  const pct=n=>total?100*n/total:0;

  const defs=[
    {cls:"tbr",label:"TBR",def:"70 mg/dL未満",n:tbr},
    {cls:"tir",label:"TIR",def:"70〜180 mg/dL",n:tir},
    {cls:"tar",label:"TAR",def:"180 mg/dL超",n:tar}
  ];

  grid.innerHTML=defs.map(x=>`
    <div class="smbg-range-card ${x.cls}">
      <div class="smbg-range-label">${x.label}</div>
      <div class="smbg-range-value">${total?pct(x.n).toFixed(1):"—"}${total?"%":""}</div>
      <div class="smbg-range-def">${x.def}</div>
      <div class="smbg-range-n">${total?`${x.n} / ${total}回`:"記録なし"}</div>
    </div>
  `).join("");

  totalBox.textContent=total
    ?`表示期間内の血糖自己測定 ${total}回を集計しています。TBR＋TIR＋TAR＝100%です。`
    :"表示期間内に血糖自己測定の記録がありません。";
}

function renderSmbgLowCounts(records){
  const grid=$("smbgLowGrid"),totalBox=$("smbgLowTotal");
  if(!grid||!totalBox)return;

  let totalLow=0,totalMeasurements=0;
  const rows=SMBG_KEYS.map(k=>{
    const values=records
      .map(r=>r[k])
      .filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)))
      .map(Number);
    const lowCount=values.filter(v=>v<70).length;
    totalLow+=lowCount;
    totalMeasurements+=values.length;
    return {key:k,label:SMBG_LABELS[k],lowCount,n:values.length}
  });

  totalBox.innerHTML=totalMeasurements
    ?`表示期間内の血糖70 mg/dL未満：<strong>${totalLow}回</strong>　<span style="color:#7a8884">（血糖測定 ${totalMeasurements}回）</span>`
    :`表示期間内に血糖自己測定の記録がありません。`;

  grid.innerHTML=rows.map(x=>`
    <div class="smbg-low-card${x.lowCount>0?" has-low":""}">
      <div class="smbg-low-label">${x.label}</div>
      <div class="smbg-low-value">${x.lowCount}回</div>
      <div class="smbg-low-n">${x.n?`測定 ${x.n}回`:"測定なし"}</div>
    </div>
  `).join("")
}

async function drawSmbgChart(){
  updateSmbgChartModeUI();
  const svg=$("smbgChart");
  const records=dateRangeFilter(await getAll(DAILY_STORE),selectedSmbgPeriod).sort((a,b)=>a.date.localeCompare(b.date));
  renderSmbgAverages(records);
  renderSmbgRangePercentages(records);
  renderSmbgLowCounts(records);
  svg.innerHTML="";
  const vals=[];
  records.forEach(r=>SMBG_KEYS.forEach(k=>{if(r[k]!==null&&r[k]!==undefined)vals.push(Number(r[k]))}));
  $("smbgSeriesLegend").innerHTML=SMBG_KEYS.map(k=>`<span><i style="background:${SMBG_COLORS[k]}"></i>${SMBG_LABELS[k]}</span>`).join("");
  if(!vals.length){
    svg.appendChild(svgEl("text",{x:360,y:205,"text-anchor":"middle",fill:"#788783","font-size":"20"},"この期間に血糖自己測定の記録がありません"));
    return
  }
  const W=720,H=410,L=58,R=18,T=22,B=62;
  let yMin=Math.max(0,Math.min(40,Math.floor((Math.min(...vals)-20)/10)*10));
  let yMax=Math.max(300,Math.ceil((Math.max(...vals)+20)/10)*10);
  if(yMax-yMin<180)yMax=yMin+180;
  const yFor=v=>T+(yMax-v)/(yMax-yMin)*(H-T-B);
  drawSmbgBackground(svg,yFor,yMin,yMax,L,R,W);

  const ticks=[];
  const tickStart=Math.ceil(yMin/50)*50;
  for(let v=tickStart;v<=yMax;v+=50)ticks.push(v);
  [54,70,180,250].forEach(v=>{if(v>=yMin&&v<=yMax&&!ticks.includes(v))ticks.push(v)});
  ticks.sort((a,b)=>a-b);
  ticks.forEach(v=>{
    const y=yFor(v);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:[54,70,180,250].includes(v)?"#aebdb8":"#d8e1de","stroke-width":[54,70,180,250].includes(v)?"1.4":"1"}));
    svg.appendChild(svgEl("text",{x:L-8,y:y+4,"text-anchor":"end",fill:"#40524e","font-size":"13","font-weight":"700"},String(v)))
  });
  svg.appendChild(svgEl("text",{x:16,y:18,fill:"#40524e","font-size":"13","font-weight":"700"},"mg/dL"));

  if(selectedSmbgChartMode==="sameTime"){
    const dates=[...new Set(records.map(r=>r.date))];
    const xFor=date=>dates.length===1?(L+W-R)/2:L+dates.indexOf(date)/Math.max(1,dates.length-1)*(W-L-R);
    const tickCount=Math.min(7,dates.length);
    for(let i=0;i<tickCount;i++){
      const di=Math.round(i*(dates.length-1)/Math.max(1,tickCount-1)),d=dates[di],x=xFor(d);
      svg.appendChild(svgEl("text",{x,y:H-22,"text-anchor":"middle",fill:"#40524e","font-size":"13","font-weight":"700"},d.slice(5).replace("-","/")))
    }
    SMBG_KEYS.forEach(k=>{
      let prev=null;
      records.forEach(r=>{
        const v=r[k];
        if(v===null||v===undefined)return;
        const p={x:xFor(r.date),y:yFor(Number(v))};
        if(prev)svg.appendChild(svgEl("line",{x1:prev.x,y1:prev.y,x2:p.x,y2:p.y,stroke:SMBG_COLORS[k],"stroke-width":"2.4","stroke-linecap":"round"}));
        const c=svgEl("circle",{cx:p.x,cy:p.y,r:"4",fill:SMBG_COLORS[k],stroke:"#fff","stroke-width":"1.3"});
        const valueText=`${Number(v).toFixed(0)} mg/dL`;
        c.appendChild(svgEl("title",{},`${r.date} ${SMBG_LABELS[k]} ${valueText}`));
        svg.appendChild(c);
        makePointInteractive(svg,c,p.x,p.y,valueText,r.date,SMBG_LABELS[k],`${r.date} ${SMBG_LABELS[k]} ${valueText}`);
        prev=p
      })
    })
  }else{
    const points=[];
    records.forEach(r=>SMBG_KEYS.forEach(k=>points.push({date:r.date,key:k,value:r[k]??null})));
    const xFor=i=>points.length<=1?(L+W-R)/2:L+i/Math.max(1,points.length-1)*(W-L-R);
    const dayCount=records.length,maxLabels=records.length<=14?7:6;
    const step=Math.max(1,Math.ceil(dayCount/maxLabels));
    records.forEach((r,di)=>{
      if(di%step!==0 && di!==dayCount-1)return;
      const start=di*SMBG_KEYS.length,end=start+SMBG_KEYS.length-1;
      const x=(xFor(start)+xFor(end))/2;
      svg.appendChild(svgEl("text",{x,y:H-22,"text-anchor":"middle",fill:"#40524e","font-size":"13","font-weight":"700"},r.date.slice(5).replace("-","/")))
    });
    if(points.length<=70){
      points.forEach((p,i)=>{
        svg.appendChild(svgEl("text",{x:xFor(i),y:H-40,"text-anchor":"middle",fill:"#53645f","font-size":"10.5","font-weight":"700"},SMBG_SHORT_LABELS[p.key]))
      })
    }
    let prev=null;
    points.forEach((p,i)=>{
      if(p.value===null||p.value===undefined){prev=null;return}
      const x=xFor(i),y=yFor(Number(p.value));
      if(prev)svg.appendChild(svgEl("line",{x1:prev.x,y1:prev.y,x2:x,y2:y,stroke:"#40524e","stroke-width":"2.4","stroke-linecap":"round"}));
      const c=svgEl("circle",{cx:x,cy:y,r:"4",fill:SMBG_COLORS[p.key],stroke:"#fff","stroke-width":"1.3"});
      const valueText=`${Number(p.value).toFixed(0)} mg/dL`;
      c.appendChild(svgEl("title",{},`${p.date} ${SMBG_LABELS[p.key]} ${valueText}`));
      svg.appendChild(c);
      makePointInteractive(svg,c,x,y,valueText,p.date,SMBG_LABELS[p.key],`${p.date} ${SMBG_LABELS[p.key]} ${valueText}`);
      prev={x,y}
    })
  }
}


function updateBpChartModeUI(){
  if(["morning","evening"].includes(selectedBpChartMode)){
    selectedBpChartMode="separate";
    localStorage.setItem(BP_CHART_MODE_KEY,selectedBpChartMode)
  }
  if(!["continuous","separate"].includes(selectedBpChartMode))selectedBpChartMode="continuous";
  document.querySelectorAll("#bpChartModeButtons button").forEach(b=>b.classList.toggle("active",b.dataset.mode===selectedBpChartMode));
  const note={
    continuous:"収縮期と拡張期をそれぞれ、朝→夜→翌朝→翌夜…の順に結びます。",
    separate:"朝の収縮期・拡張期と、夜の収縮期・拡張期を、それぞれ別の線で日付順に結びます。実線が朝、破線が夜です。"
  };
  $("bpChartModeNote").textContent=note[selectedBpChartMode];
  if(selectedBpChartMode==="continuous"){
    $("bpChartLegend").innerHTML=
      '<span><i style="background:#2f6f65"></i>収縮期</span>'+
      '<span><i style="background:#b06d47"></i>拡張期</span>'+
      '<span><i style="background:#263a35;height:4px"></i>家庭血圧の目標目安 125/75</span>'+
      '<span>朝→夜→翌朝を連続</span>';
  }else{
    $("bpChartLegend").innerHTML=
      '<span><i style="background:#2f6f65"></i>収縮期</span>'+
      '<span><i style="background:#b06d47"></i>拡張期</span>'+
      '<span><i style="background:#263a35;height:4px"></i>家庭血圧の目標目安 125/75</span>'+
      '<span><i style="background:#40524e"></i>朝＝実線</span>'+
      '<span><i style="background:#40524e;height:0;border-top:3px dashed #40524e"></i>夜＝破線</span>';
  }
}
function meanOfRecordKey(records,key){
  const v=records.map(r=>r[key]).filter(x=>x!==null&&x!==undefined&&Number.isFinite(Number(x))).map(Number);
  return {mean:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,n:v.length}
}
function renderBpAverages(records){
  const box=$("bpAverageGrid");if(!box)return;
  const defs=[
    ["朝 収縮期","bpMorningSbp"],["朝 拡張期","bpMorningDbp"],
    ["夜 収縮期","bpEveningSbp"],["夜 拡張期","bpEveningDbp"]
  ];
  box.innerHTML=defs.map(([label,key])=>{
    const s=meanOfRecordKey(records,key);
    return `<div class="bp-average-card"><div class="bp-average-label">${label}</div><div class="bp-average-value">${s.mean===null?"—":s.mean.toFixed(0)}${s.mean===null?"":' <span class="bp-average-unit">mmHg</span>'}</div><div class="bp-average-n">${s.n?s.n+"回の平均":"記録なし"}</div></div>`
  }).join("")
}
async function drawBpChart(){
  updateBpChartModeUI();
  const svg=$("bpChart");if(!svg)return;
  const records=dateRangeFilter(await getAll(DAILY_STORE),selectedBpPeriod).sort((a,b)=>a.date.localeCompare(b.date));
  renderBpAverages(records);
  svg.innerHTML="";
  const keys=["bpMorningSbp","bpMorningDbp","bpEveningSbp","bpEveningDbp"];
  const values=[];records.forEach(r=>keys.forEach(k=>{if(r[k]!==null&&r[k]!==undefined)values.push(Number(r[k]))}));
  if(!values.length){svg.appendChild(svgEl("text",{x:360,y:205,"text-anchor":"middle",fill:"#788783","font-size":"20"},"この期間に自宅血圧の記録がありません"));return}
  const W=720,H=410,L=58,R=18,T=22,B=62;
  const HOME_BP_TARGET_SBP=125,HOME_BP_TARGET_DBP=75;
  let yMin=Math.max(20,Math.floor((Math.min(...values)-15)/10)*10),yMax=Math.ceil((Math.max(...values)+15)/10)*10;
  yMin=Math.min(yMin,HOME_BP_TARGET_DBP-10);
  yMax=Math.max(yMax,HOME_BP_TARGET_SBP+15);
  if(yMax-yMin<80){const mid=(yMin+yMax)/2;yMin=Math.max(20,Math.floor((mid-40)/10)*10);yMax=Math.ceil((mid+40)/10)*10}
  const yFor=v=>T+(yMax-v)/(yMax-yMin)*(H-T-B);
  const tickStart=Math.ceil(yMin/20)*20;
  for(let v=tickStart;v<=yMax;v+=20){const y=yFor(v);svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#d8e1de","stroke-width":"1"}));svg.appendChild(svgEl("text",{x:L-8,y:y+4,"text-anchor":"end",fill:"#40524e","font-size":"13","font-weight":"700"},String(v)))}
  svg.appendChild(svgEl("text",{x:16,y:18,fill:"#40524e","font-size":"13","font-weight":"700"},"mmHg"));

  // JSH2025の家庭血圧降圧目標（一般的な目安）を太く濃い基準線で表示
  [
    {v:HOME_BP_TARGET_SBP,label:"収縮期 125"},
    {v:HOME_BP_TARGET_DBP,label:"拡張期 75"}
  ].forEach(t=>{
    if(t.v<yMin||t.v>yMax)return;
    const y=yFor(t.v);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#263a35","stroke-width":"3.8","stroke-linecap":"round",opacity:".92"}));
    svg.appendChild(svgEl("text",{x:W-R-5,y:y-6,"text-anchor":"end",fill:"#263a35","font-size":"13","font-weight":"900"},t.label))
  });

  const drawLine=(points,color,label,dash="")=>{let prev=null;points.forEach(p=>{if(p.value===null||p.value===undefined){prev=null;return}const x=p.x,y=yFor(Number(p.value));if(prev)svg.appendChild(svgEl("line",{x1:prev.x,y1:prev.y,x2:x,y2:y,stroke:color,"stroke-width":"2.8","stroke-linecap":"round","stroke-dasharray":dash}));const c=svgEl("circle",{cx:x,cy:y,r:"4.2",fill:color,stroke:"#fff","stroke-width":"1.3"});const valueText=`${Number(p.value).toFixed(0)} mmHg`;const pointLabel=[p.part||"",label].filter(Boolean).join(" ");c.appendChild(svgEl("title",{},`${p.date} ${pointLabel} ${valueText}`));svg.appendChild(c);makePointInteractive(svg,c,x,y,valueText,p.date,pointLabel,`${p.date} ${pointLabel} ${valueText}`);prev={x,y}})};
  if(selectedBpChartMode==="continuous"){
    const slots=[];records.forEach(r=>{slots.push({date:r.date,part:"朝",sbp:r.bpMorningSbp,dbp:r.bpMorningDbp});slots.push({date:r.date,part:"夜",sbp:r.bpEveningSbp,dbp:r.bpEveningDbp})});
    const xFor=i=>slots.length<=1?(L+W-R)/2:L+i/Math.max(1,slots.length-1)*(W-L-R);
    const maxLabels=records.length<=14?7:6,step=Math.max(1,Math.ceil(records.length/maxLabels));
    records.forEach((r,di)=>{if(di%step!==0&&di!==records.length-1)return;const x=(xFor(di*2)+xFor(di*2+1))/2;svg.appendChild(svgEl("text",{x,y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"13","font-weight":"700"},r.date.slice(5).replace("-","/")))});
    if(slots.length<=60)slots.forEach((p,i)=>svg.appendChild(svgEl("text",{x:xFor(i),y:H-39,"text-anchor":"middle",fill:"#53645f","font-size":"10.5","font-weight":"700"},p.part)));
    drawLine(slots.map((p,i)=>({date:p.date,part:p.part,value:p.sbp,x:xFor(i)})),"#2f6f65","収縮期");
    drawLine(slots.map((p,i)=>({date:p.date,part:p.part,value:p.dbp,x:xFor(i)})),"#b06d47","拡張期");
  }else{
    const dates=[...new Set(records.map(r=>r.date))],xFor=date=>dates.length===1?(L+W-R)/2:L+dates.indexOf(date)/Math.max(1,dates.length-1)*(W-L-R);
    const ticks=Math.min(7,dates.length);
    for(let i=0;i<ticks;i++){
      const di=Math.round(i*(dates.length-1)/Math.max(1,ticks-1)),d=dates[di];
      svg.appendChild(svgEl("text",{x:xFor(d),y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"13","font-weight":"700"},d.slice(5).replace("-","/")))
    }
    drawLine(records.map(r=>({date:r.date,part:"朝",value:r.bpMorningSbp,x:xFor(r.date)})),"#2f6f65","収縮期");
    drawLine(records.map(r=>({date:r.date,part:"夜",value:r.bpEveningSbp,x:xFor(r.date)})),"#2f6f65","収縮期","7 5");
    drawLine(records.map(r=>({date:r.date,part:"朝",value:r.bpMorningDbp,x:xFor(r.date)})),"#b06d47","拡張期");
    drawLine(records.map(r=>({date:r.date,part:"夜",value:r.bpEveningDbp,x:xFor(r.date)})),"#b06d47","拡張期","7 5");
  }
}

function niceVisitAxis(values,unit){
  if(!values.length)return null;
  let min=Math.min(...values),max=Math.max(...values),range=max-min;
  const minRange=unit==="%"?1.2:4;
  if(range<minRange){
    const mid=(min+max)/2;
    min=mid-minRange/2;max=mid+minRange/2;range=minRange
  }
  const pad=Math.max(unit==="%"?.35:1.2,range*.20);
  min-=pad;max+=pad;
  if(unit==="%"){
    min=Math.max(3,Math.floor(min*2)/2);
    max=Math.ceil(max*2)/2;
    if(max-min<1.5)max=min+1.5
  }else{
    min=Math.floor(min);max=Math.ceil(max);
    if(max-min<4){min-=1;max+=1}
  }
  return {min,max}
}
function visitMedian(values){
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2
}
function visitMedianY(values,axis,H,T,B){
  const m=visitMedian(values);if(m===null||!axis)return null;
  return T+(axis.max-m)/(axis.max-axis.min)*(H-T-B)
}
function separateVisitDualAxes(weightValues,a1cValues,wAxis,aAxis,H,T,B){
  if(!weightValues.length||!a1cValues.length)return {wAxis,aAxis};
  const wy=visitMedianY(weightValues,wAxis,H,T,B),ay=visitMedianY(a1cValues,aAxis,H,T,B);
  const plot=H-T-B;
  if(Math.abs(wy-ay)>=plot*.18)return {wAxis,aAxis};

  // 線形性を保ったまま軸の上下余白を変えて、2系列を少し離して表示する。
  const wm=visitMedian(weightValues),am=visitMedian(a1cValues);
  const wr=wAxis.max-wAxis.min,ar=aAxis.max-aAxis.min;
  const targetW=.38,targetA=.64; // 上からの位置
  const wMin=wm-(1-targetW)*wr,wMax=wm+targetW*wr;
  const aMin=am-(1-targetA)*ar,aMax=am+targetA*ar;
  if(wMax>wMin)wAxis={min:Math.floor(wMin),max:Math.ceil(wMax)};
  if(aMax>aMin){
    aAxis={min:Math.max(3,Math.floor(aMin*2)/2),max:Math.ceil(aMax*2)/2};
    if(aAxis.max-aAxis.min<1.5)aAxis.max=aAxis.min+1.5
  }
  return {wAxis,aAxis}
}
function drawVisitCombinedChart(svg,records,targetWeight=null){
  svg.innerHTML="";
  const wVals=records.map(r=>r.weight).filter(v=>v!==null&&v!==undefined).map(Number);
  const aVals=records.map(r=>r.hba1c).filter(v=>v!==null&&v!==undefined).map(Number);
  if(!wVals.length&&!aVals.length){
    svg.appendChild(svgEl("text",{x:360,y:185,"text-anchor":"middle",fill:"#788783","font-size":"20"},"この期間に体重・HbA1c記録がありません"));
    return
  }

  const W=720,H=370,L=64,R=66,T=25,B=54;
  let wAxis=niceVisitAxis(wVals,"kg"),aAxis=niceVisitAxis(aVals,"%");
  if(wAxis&&aAxis){
    const sep=separateVisitDualAxes(wVals,aVals,wAxis,aAxis,H,T,B);
    wAxis=sep.wAxis;aAxis=sep.aAxis
  }
  if(aAxis){
    // HbA1cの5領域が見えるよう右軸範囲を確保
    aAxis={min:Math.min(aAxis.min,5.5),max:Math.max(aAxis.max,10.5)}
  }

  const dates=[...new Set(records.map(r=>r.date))];
  const xFor=date=>dates.length===1?(L+W-R)/2:L+dates.indexOf(date)/Math.max(1,dates.length-1)*(W-L-R);
  const yW=v=>T+(wAxis.max-v)/(wAxis.max-wAxis.min)*(H-T-B);
  const yA=v=>T+(aAxis.max-v)/(aAxis.max-aAxis.min)*(H-T-B);

  // 同一グラフでも背景色は右軸HbA1cの7%・8%境界に従う
  if(aAxis)drawHbA1cBackgroundBands(svg,yA,aAxis.min,aAxis.max,L,R,W);

  if(wAxis){
    for(let v=Math.ceil(wAxis.min);v<=Math.floor(wAxis.max);v+=1){
      const y=yW(v);
      svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#d7e1de","stroke-width":"1"}));
      svg.appendChild(svgEl("text",{x:L-9,y:y+5,"text-anchor":"end",fill:"#2f6f65","font-size":"14","font-weight":"800"},v.toFixed(1)))
    }
  }
  if(aAxis){
    for(let i=0;i<=5;i++){
      const y=T+(H-T-B)*i/5;
      const v=aAxis.max-(aAxis.max-aAxis.min)*i/5;
      svg.appendChild(svgEl("text",{x:W-R+9,y:y+4,"text-anchor":"start",fill:"#765a98","font-size":"14","font-weight":"800"},v.toFixed(1)))
    }
  }

  svg.appendChild(svgEl("text",{x:15,y:18,fill:"#2f6f65","font-size":"14","font-weight":"800"},"体重 kg"));
  svg.appendChild(svgEl("text",{x:W-15,y:18,"text-anchor":"end",fill:"#765a98","font-size":"14","font-weight":"800"},"HbA1c %"));

  const tickCount=Math.min(6,dates.length);
  for(let i=0;i<tickCount;i++){
    const idx=Math.round(i*(dates.length-1)/Math.max(1,tickCount-1)),d=dates[idx],x=xFor(d);
    svg.appendChild(svgEl("text",{x,y:H-20,"text-anchor":"middle",fill:"#40524e","font-size":"14","font-weight":"800"},d.slice(5).replace("-","/")))
  }

  function drawSeries(key,axis,yFor,color,dash,label,unit){
    if(!axis)return;
    let prev=null;
    records.forEach(r=>{
      const v=r[key];
      if(v===null||v===undefined){prev=null;return}
      const p={x:xFor(r.date),y:yFor(Number(v))};
      if(prev)svg.appendChild(svgEl("line",{x1:prev.x,y1:prev.y,x2:p.x,y2:p.y,stroke:color,"stroke-width":"3","stroke-linecap":"round","stroke-dasharray":dash||""}));
      const c=svgEl("circle",{cx:p.x,cy:p.y,r:unit==="kg"?"5.0":"4.3",fill:color,stroke:"#fff","stroke-width":"1.4"});
      const valueText=`${Number(v).toFixed(1)} ${unit}`;
      c.appendChild(svgEl("title",{},`${r.date} ${label} ${valueText}`));
      svg.appendChild(c);
      if(unit==="kg"){
        makeWeightPointInteractive(svg,c,p.x,p.y,Number(v),r.date,label)
      }else{
        makePointInteractive(svg,c,p.x,p.y,valueText,r.date,label,`${r.date} ${label} ${valueText}`)
      }
      prev=p
    })
  }

  drawSeries("weight",wAxis,yW,"#2f6f65","","体重","kg");
  drawSeries("hba1c",aAxis,yA,"#765a98","8 5","HbA1c","%");

  if(wAxis&&targetWeight!==null&&targetWeight>=wAxis.min&&targetWeight<=wAxis.max){
    const y=yW(targetWeight);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#8a9894","stroke-width":"1.5","stroke-dasharray":"4 5"}));
    svg.appendChild(svgEl("text",{x:L+4,y:y-5,fill:"#40524e","font-size":"13","font-weight":"700"},`目標体重 ${targetWeight.toFixed(1)} kg`))
  }
}

function gaToEstimatedHbA1c(ga){
  const v=Number(ga);return Number.isFinite(v)?0.216*v+2.978:null
}
async function drawGaCharts(){
  const card=$("gaChartsCard");if(!card||card.style.display==="none")return;
  const all=await getAll(VISIT_STORE);
  {
    const records=visitDateRangeFilter(all,selectedVisitPeriod);
    const gaRows=records.filter(r=>r.ga!==null&&r.ga!==undefined&&Number.isFinite(Number(r.ga)));
    drawSimpleLineChart($("visitGAChart"),gaRows,[{key:"ga",color:"#4e82a8"}],"%",330,null);
    const estimated=gaRows.map(r=>({...r,estimatedHbA1c:gaToEstimatedHbA1c(r.ga)}));
    drawSimpleLineChart($("visitGAEstimatedHbA1cChart"),estimated,[{key:"estimatedHbA1c",color:"#765a98"}],"%",330,null,null,"hba1c");
    renderMedicationTimeline($("gaMedicationTimeline"),gaRows)
  }
}

function egfrLinearRegression(points){
  const n=points.length;
  const tMean=points.reduce((s,p)=>s+p.t,0)/n;
  const yMean=points.reduce((s,p)=>s+p.y,0)/n;
  let num=0,den=0;
  points.forEach(p=>{num+=(p.t-tMean)*(p.y-yMean);den+=(p.t-tMean)**2});
  const slope=den===0?0:num/den;
  const intercept=yMean-slope*tMean;
  let ssTot=0,ssRes=0;
  points.forEach(p=>{
    const pred=slope*p.t+intercept;
    ssRes+=(p.y-pred)**2;
    ssTot+=(p.y-yMean)**2
  });
  const r2=ssTot===0?1:1-ssRes/ssTot;
  return {slope,intercept,r2}
}
function classifyEgfrSlope(slopeYear){
  const decline=-slopeYear;
  if(decline<3)return {key:"stable",label:"安定"};
  if(decline<5)return {key:"watch",label:"経過観察"};
  return {key:"rapid",label:"急速進行"}
}
function egfrSpanText(days){
  if(days<60)return `${days}日`;
  const months=days/30.4375;
  if(months<18)return `${months.toFixed(1)}か月`;
  return `${(days/365.25).toFixed(1)}年`
}
function drawEgfrSlopeSvg(svg,valid,reg){
  svg.innerHTML="";
  if(valid.length<2){
    svg.appendChild(svgEl("text",{x:360,y:180,"text-anchor":"middle",fill:"#788783","font-size":"18"},"eGFRを2回以上入力してください"));
    return
  }
  const W=720,H=360,L=62,R=22,T=22,B=58;
  const firstMs=parseLocalDate(valid[0].date).getTime();
  const lastMs=parseLocalDate(valid[valid.length-1].date).getTime();
  const spanMs=Math.max(1,lastMs-firstMs);
  const xForMs=ms=>valid.length===1?(L+W-R)/2:L+(ms-firstMs)/spanMs*(W-L-R);

  const predictedFirst=reg.intercept;
  const lastYears=(lastMs-firstMs)/(1000*60*60*24*365.25);
  const predictedLast=reg.slope*lastYears+reg.intercept;
  const yValues=[...valid.map(v=>v.egfr),predictedFirst,predictedLast];
  let yMin=Math.max(0,Math.floor((Math.min(...yValues)-8)/10)*10);
  let yMax=Math.ceil((Math.max(...yValues)+8)/10)*10;
  if(yMax-yMin<30){const mid=(yMin+yMax)/2;yMin=Math.max(0,Math.floor((mid-15)/5)*5);yMax=Math.ceil((mid+15)/5)*5}
  const yFor=v=>T+(yMax-v)/(yMax-yMin)*(H-T-B);

  for(let i=0;i<=5;i++){
    const v=yMin+(yMax-yMin)*i/5,y=yFor(v);
    svg.appendChild(svgEl("line",{x1:L,y1:y,x2:W-R,y2:y,stroke:"#e1e8e6","stroke-width":"1"}));
    svg.appendChild(svgEl("text",{x:L-8,y:y+4,"text-anchor":"end",fill:"#40524e","font-size":"13","font-weight":"700"},v.toFixed(0)))
  }
  svg.appendChild(svgEl("text",{x:16,y:17,fill:"#40524e","font-size":"13","font-weight":"700"},"eGFR"));

  const tickCount=Math.min(6,valid.length);
  for(let i=0;i<tickCount;i++){
    const idx=Math.round(i*(valid.length-1)/Math.max(1,tickCount-1));
    const r=valid[idx],x=xForMs(parseLocalDate(r.date).getTime());
    svg.appendChild(svgEl("text",{x,y:H-22,"text-anchor":"middle",fill:"#40524e","font-size":"13","font-weight":"700"},r.date.slice(2).replaceAll("-","/")))
  }

  const x1=xForMs(firstMs),y1=yFor(predictedFirst),x2=xForMs(lastMs),y2=yFor(predictedLast);
  svg.appendChild(svgEl("line",{x1,y1,x2,y2,stroke:"#b3402f","stroke-width":"2.5","stroke-dasharray":"7 5","stroke-linecap":"round"}));

  valid.forEach(r=>{
    const x=xForMs(parseLocalDate(r.date).getTime()),y=yFor(r.egfr);
    const c=svgEl("circle",{cx:x,cy:y,r:"5",fill:"#2f6f65",stroke:"#fff","stroke-width":"1.5"});
    const valueText=r.egfr.toFixed(1);
    c.appendChild(svgEl("title",{},`${r.date} eGFR ${valueText}`));
    svg.appendChild(c);
    makePointInteractive(svg,c,x,y,valueText,r.date,"eGFR",`${r.date} eGFR ${valueText}`)
  })
}
async function drawEgfrSlope(){
  const card=$("egfrSlopeCard");if(!card||card.style.display==="none")return;
  const all=await getAll(VISIT_STORE);
  const valid=all
    .filter(r=>r.date && r.egfr!==null && r.egfr!==undefined && Number.isFinite(Number(r.egfr)))
    .map(r=>({date:r.date,egfr:Number(r.egfr)}))
    .sort((a,b)=>a.date.localeCompare(b.date));

  const slopeYearEl=$("egfrSlopeYear"),slopeMonthEl=$("egfrSlopeMonth"),r2El=$("egfrSlopeR2"),dataEl=$("egfrSlopeData");
  const result=$("egfrSlopeResult"),svg=$("egfrSlopeChart");
  renderMedicationTimeline($("egfrMedicationTimeline"),valid);

  if(valid.length<2){
    slopeYearEl.textContent="データ不足";slopeMonthEl.textContent="—";r2El.textContent="—";
    dataEl.textContent=valid.length?`${valid.length}点`:"0点";
    result.className="egfr-result na";
    result.innerHTML=valid.length===1
      ?`現在は1点のみです。<strong>2点以上でスロープを算出</strong>します。通常の評価には3点以上、かつ6か月以上の観察を推奨します。`
      :`eGFRの記録がありません。外来記録でeGFRを入力すると自動的に集計します。`;
    drawEgfrSlopeSvg(svg,valid,null);
    return
  }

  const t0=parseLocalDate(valid[0].date).getTime();
  const points=valid.map(v=>({
    t:(parseLocalDate(v.date).getTime()-t0)/(1000*60*60*24*365.25),
    y:v.egfr
  }));
  const reg=egfrLinearRegression(points);
  const slopeYear=reg.slope,slopeMonth=slopeYear/12;
  const spanDays=Math.round((parseLocalDate(valid[valid.length-1].date)-parseLocalDate(valid[0].date))/(1000*60*60*24));
  const isReference=valid.length<3 || spanDays<180;
  const status=classifyEgfrSlope(slopeYear);

  slopeYearEl.textContent=`${slopeYear>=0?"+":""}${slopeYear.toFixed(2)}`;
  slopeMonthEl.textContent=`${slopeMonth>=0?"+":""}${slopeMonth.toFixed(3)}`;
  r2El.textContent=reg.r2.toFixed(3);
  dataEl.textContent=`${valid.length}点・${egfrSpanText(spanDays)}`;

  result.className=`egfr-result ${status.key}${isReference?" reference":""}`;
  if(isReference){
    const reasons=[];
    if(valid.length<3)reasons.push(`${valid.length}点のみ`);
    if(spanDays<180)reasons.push(`観察期間${egfrSpanText(spanDays)}`);
    result.innerHTML=`<strong>参考値：${status.label}相当</strong>　年間スロープ ${slopeYear>=0?"+":""}${slopeYear.toFixed(2)} mL/min/1.73m²/年。<br>${reasons.join("、")}のため、現時点の判定は参考値です。3点以上かつ6か月以上のデータがそろうと通常判定として表示します。`
  }else{
    result.innerHTML=`<strong>判定目安：${status.label}</strong>　年間スロープ ${slopeYear>=0?"+":""}${slopeYear.toFixed(2)} mL/min/1.73m²/年。`
  }
  drawEgfrSlopeSvg(svg,valid,reg)
}

function applyVisitChartModeUI(){
  const combined=selectedVisitChartMode==="combined";
  $("visitSeparateCharts").style.display=combined?"none":"grid";
  $("visitCombinedChartWrap").style.display=combined?"block":"none";
  $("visitChartSeparateBtn").classList.toggle("active",!combined);
  $("visitChartCombinedBtn").classList.toggle("active",combined)
}
async function drawVisitCharts(){
  const r=visitDateRangeFilter(await getAll(VISIT_STORE),selectedVisitPeriod);
  renderVisitEyeInfo();
  if($("egfrSlopeCard")?.style.display!=="none")await drawEgfrSlope();
  if($("gaChartsCard")?.style.display!=="none")await drawGaCharts();
  applyVisitChartModeUI();
  if(selectedVisitChartMode==="combined"){
    drawVisitCombinedChart($("visitCombinedChart"),r,numOrNull(loadSettings().targetWeight))
  }else{
    drawSimpleLineChart($("visitWeightChart"),r,[{key:"weight",color:"#2f6f65"}],"kg",330,numOrNull(loadSettings().targetWeight));
    drawSimpleLineChart($("visitHbA1cChart"),r,[{key:"hba1c",color:"#765a98"}],"%",330,null,null,"hba1c")
  }
  renderMedicationTimeline($("visitMedicationTimeline"),r)
}

/* 履歴 */
async function renderHistory(){
  const month=$("historyMonth").value||monthISO();
  const records=(await getAll(DAILY_STORE)).filter(r=>r.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date));
  const box=$("historyList");box.innerHTML="";
  if(!records.length){box.innerHTML='<div class="empty">この月の日常記録はありません</div>';return}
  for(const r of records){
    const w1=r.weightMorning!==null&&r.weightMorning!==undefined?`朝体重 ${Number(r.weightMorning).toFixed(1)} kg`:"",w2=r.weightEvening!==null&&r.weightEvening!==undefined?`夜体重 ${Number(r.weightEvening).toFixed(1)} kg`:"";
    const bf1=r.bodyFatMorning!==null&&r.bodyFatMorning!==undefined?`朝体脂肪 ${Number(r.bodyFatMorning).toFixed(1)}%`:"",bf2=r.bodyFatEvening!==null&&r.bodyFatEvening!==undefined?`夜体脂肪 ${Number(r.bodyFatEvening).toFixed(1)}%`:"";
    const mm1=r.muscleMassMorning!==null&&r.muscleMassMorning!==undefined?`朝筋肉量 ${Number(r.muscleMassMorning).toFixed(1)} kg`:"",mm2=r.muscleMassEvening!==null&&r.muscleMassEvening!==undefined?`夜筋肉量 ${Number(r.muscleMassEvening).toFixed(1)} kg`:"";
    const legacyBody=r.bodyFat!==null&&r.bodyFat!==undefined?`体脂肪率 ${Number(r.bodyFat).toFixed(1)}%（時間帯未指定）`:"";
    const legacyMuscle=r.muscleMass!==null&&r.muscleMass!==undefined?`筋肉量 ${Number(r.muscleMass).toFixed(1)} kg（時間帯未指定）`:"";
    const bgText=SMBG_KEYS.filter(k=>r[k]!==null&&r[k]!==undefined).map(k=>`${SMBG_SHORT_LABELS[k]} ${Number(r[k]).toFixed(0)}`).join(" / ");
    const bpMorning=(r.bpMorningSbp!==null&&r.bpMorningSbp!==undefined)||(r.bpMorningDbp!==null&&r.bpMorningDbp!==undefined)?`朝血圧 ${r.bpMorningSbp??"—"}/${r.bpMorningDbp??"—"}`:"";
    const bpEvening=(r.bpEveningSbp!==null&&r.bpEveningSbp!==undefined)||(r.bpEveningDbp!==null&&r.bpEveningDbp!==undefined)?`夜血圧 ${r.bpEveningSbp??"—"}/${r.bpEveningDbp??"—"}`:"";
    const bowel=r.bowelMovement===true?"排便あり":"";
    const meals=[r.breakfast,r.lunch,r.dinner,r.snack].filter(Boolean).join(" / ");
    const el=document.createElement("div");el.className="history-item";
    el.innerHTML=`<div class="history-top"><div><div class="history-date">${escapeHtml(r.date.replaceAll("-","/"))}</div>
    <div class="history-weight">${escapeHtml([w1,w2,bf1,bf2,mm1,mm2,legacyBody,legacyMuscle,bgText?`血糖 ${bgText} mg/dL`:"",bpMorning,bpEvening,bowel].filter(Boolean).join("　")||"自宅測定記録なし")}</div></div>
    <div class="row"><button class="small secondary edit">編集</button><button class="small danger del">削除</button></div></div>
    <div class="history-meals">${escapeHtml(meals||r.note||"")}</div>`;
    el.querySelector(".edit").onclick=async()=>{showView("record");await loadDate(r.date);window.scrollTo({top:0,behavior:"smooth"})};
    el.querySelector(".del").onclick=async()=>{if(confirm(`${r.date} の日常記録を削除しますか？
この日の食事写真も削除します。`)){await deleteItem(DAILY_STORE,r.date);await deleteMealPhotosForDate(r.date);await refreshAll();await refreshStorageUsage()}};
    box.appendChild(el);
    await renderHistoryPhotos(r.date,el)
  }
}
function labChip(name,value,unit=""){
  if(value===null||value===undefined||value==="")return "";
  return `<div class="lab-chip"><div class="n">${escapeHtml(name)}</div><div class="x">${escapeHtml(value)}${unit?` <span style="font-size:10px;font-weight:500">${escapeHtml(unit)}</span>`:""}</div></div>`
}
async function renderVisits(){
  const records=(await getAll(VISIT_STORE)).sort((a,b)=>b.date.localeCompare(a.date)),box=$("visitList");box.innerHTML="";
  if(!records.length){box.innerHTML='<div class="empty">外来記録はまだありません</div>';return}
  records.forEach(r=>{
    const absi=calculateABSI(r.weight,r.waist,loadSettings().height);
    const absiRef=absi!==null&&r.absiAge&&r.absiSex?getABSIReference(r.absiAge,r.absiSex):null;
    const absiZ=absiRef?(absi-absiRef.mean)/absiRef.sd:null;
    const labs=[
      labChip("体重",r.weight!==null&&r.weight!==undefined?Number(r.weight).toFixed(1):null,"kg"),
      labChip("腹囲",r.waist!==null&&r.waist!==undefined?Number(r.waist).toFixed(1):null,"cm"),
      labChip("ABSI",absi!==null?absi.toFixed(4):null,""),
      labChip("ABSI z",absiZ!==null?(absiZ>=0?"+":"")+absiZ.toFixed(2):null,""),
      labChip("HbA1c",r.hba1c!==null&&r.hba1c!==undefined?Number(r.hba1c).toFixed(1):null,"%"),
      labChip("GA",r.ga!==null&&r.ga!==undefined?Number(r.ga).toFixed(1):null,"%"),
      labChip("血圧",(r.sbp!==null||r.dbp!==null)?`${r.sbp??"—"}/${r.dbp??"—"}`:null,"mmHg"),labChip("血糖",r.glucose,"mg/dL"),
      labChip("LDL-C",r.ldl,"mg/dL"),labChip("TG",r.tg,"mg/dL"),labChip("尿酸",r.ua,"mg/dL"),labChip("eGFR",r.egfr,"")
    ].join("");
    const el=document.createElement("div");el.className="visit-item";
    el.innerHTML=`<div class="history-top"><div><div class="history-date">${escapeHtml(r.date.replaceAll("-","/"))}</div>
      <div class="visit-sub">${escapeHtml(r.medication||r.note||"")}</div></div>
      <div class="row"><button class="small secondary edit">編集</button><button class="small danger del">削除</button></div></div>
      <div class="lab-grid" style="margin-top:9px">${labs}</div>`;
    el.querySelector(".edit").onclick=async()=>{await loadVisit(r.date);window.scrollTo({top:0,behavior:"smooth"})};
    el.querySelector(".del").onclick=async()=>{if(confirm(`${r.date} の外来記録を削除しますか？`)){await deleteItem(VISIT_STORE,r.date);await refreshAll()}};
    box.appendChild(el)
  })
}


function loadEyeRecords(){try{const x=JSON.parse(localStorage.getItem(EYE_RECORDS_KEY)||"[]");return Array.isArray(x)?x:[]}catch(e){return []}}
function saveEyeRecords(arr){localStorage.setItem(EYE_RECORDS_KEY,JSON.stringify(arr))}
function addMonthsISO(dateStr,months){if(!dateStr||!months)return null;const d=new Date(dateStr+"T12:00:00");if(Number.isNaN(d.getTime()))return null;d.setMonth(d.getMonth()+Number(months));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function eyeFormToRecord(){return{
  date:$("eyeDate").value,nextMonths:numOrNull($("eyeNextMonths").value),provider:$("eyeProvider").value.trim(),
  vaR:$("eyeVaR").value.trim(),vaL:$("eyeVaL").value.trim(),iopR:numOrNull($("eyeIopR").value),iopL:numOrNull($("eyeIopL").value),
  cataractR:$("eyeCataractR").value,cataractL:$("eyeCataractL").value,retinoR:$("eyeRetinoR").value,retinoL:$("eyeRetinoL").value,
  retinoChangeR:$("eyeRetinoChangeR").value,retinoChangeL:$("eyeRetinoChangeL").value,maculaR:$("eyeMaculaR").value,maculaL:$("eyeMaculaL").value,
  maculaChangeR:$("eyeMaculaChangeR").value,maculaChangeL:$("eyeMaculaChangeL").value,memo:$("eyeMemo").value.trim(),updatedAt:new Date().toISOString()
}}
function setEyeForm(r={}){$("eyeDate").value=r.date||todayISO();$("eyeNextMonths").value=r.nextMonths??"";$("eyeProvider").value=r.provider||"";$("eyeVaR").value=r.vaR||"";$("eyeVaL").value=r.vaL||"";$("eyeIopR").value=r.iopR??"";$("eyeIopL").value=r.iopL??"";["CataractR","CataractL","RetinoR","RetinoL","RetinoChangeR","RetinoChangeL","MaculaR","MaculaL","MaculaChangeR","MaculaChangeL"].forEach(s=>{const key=s.charAt(0).toLowerCase()+s.slice(1);$("eye"+s).value=r[key]||""});$("eyeMemo").value=r.memo||""}

function renderVisitEyeInfo(){
  const box=$("visitEyeInfo");if(!box)return;
  const arr=loadEyeRecords().sort((a,b)=>b.date.localeCompare(a.date));
  if(!arr.length){
    box.innerHTML='<strong>👁 眼科：</strong> 最終受診日 未記録　｜　次回受診予定 未入力';
    return
  }
  const r=arr[0],next=addMonthsISO(r.date,r.nextMonths);
  const last=r.date?escapeHtml(r.date.replaceAll("-","/")):"未記録";
  let nextText="未入力";
  if(r.nextMonths){
    nextText=`${escapeHtml(String(r.nextMonths))}か月後`;
    if(next)nextText+=`（${escapeHtml(next.replaceAll("-","/"))}頃）`
  }
  box.innerHTML=`<strong>👁 眼科：</strong> 最終受診 ${last}　｜　次回受診予定 ${nextText}`;
}

function renderEyeSummary(){const box=$("eyeSummary");if(!box)return;const arr=loadEyeRecords().sort((a,b)=>b.date.localeCompare(a.date));if(!arr.length){box.innerHTML='<strong>眼科受診記録はまだありません。</strong><br>眼科を受診したら、受診日と網膜症の有無を記録しておくと確認しやすくなります。';return}const r=arr[0],next=addMonthsISO(r.date,r.nextMonths),retino=(r.retinoR||r.retinoL)?`網膜症：右 ${r.retinoR||"—"}／左 ${r.retinoL||"—"}`:"網膜症：入力なし";let nextText=r.nextMonths?`次回予定：${r.nextMonths}か月後${next?`（${next.replaceAll("-","/")}頃）`:""}`:"次回予定：未入力";box.innerHTML=`<strong>最終眼科受診：${escapeHtml(r.date.replaceAll("-","/"))}</strong><br>${escapeHtml(retino)}<br>${escapeHtml(nextText)}`}
function renderEyeRecords(){renderEyeSummary();const box=$("eyeList");if(!box)return;const arr=loadEyeRecords().sort((a,b)=>b.date.localeCompare(a.date));box.innerHTML="";if(!arr.length){box.innerHTML='<div class="empty">眼科受診記録はまだありません</div>';return}arr.forEach(r=>{const el=document.createElement("div");el.className="eye-list-item";const next=r.nextMonths?`${r.nextMonths}か月後`:"—";el.innerHTML=`<div class="history-top"><div><div class="eye-list-title">${escapeHtml(r.date.replaceAll("-","/"))}</div><div class="eye-list-detail">網膜症：右 ${escapeHtml(r.retinoR||"—")} ／ 左 ${escapeHtml(r.retinoL||"—")}<br>黄斑症：右 ${escapeHtml(r.maculaR||"—")} ／ 左 ${escapeHtml(r.maculaL||"—")}<br>次回：${escapeHtml(next)}${r.provider?`<br>${escapeHtml(r.provider)}`:""}${r.memo?`<br>${escapeHtml(r.memo)}`:""}</div></div><div class="row"><button class="small secondary edit" type="button">編集</button><button class="small danger del" type="button">削除</button></div></div>`;el.querySelector(".edit").onclick=()=>{setEyeForm(r);window.scrollTo({top:0,behavior:"smooth"})};el.querySelector(".del").onclick=()=>{if(confirm(`${r.date} の眼科受診記録を削除しますか？`)){saveEyeRecords(loadEyeRecords().filter(x=>x.date!==r.date));renderEyeRecords();renderVisitEyeInfo()}};box.appendChild(el)})}
function saveEyeCurrent(){const r=eyeFormToRecord();if(!r.date){setSaveStatus("eyeStatus","受診年月日を入力してください。","warn");return}const arr=loadEyeRecords().filter(x=>x.date!==r.date);arr.push(r);saveEyeRecords(arr);setSaveStatus("eyeStatus","眼科受診記録を保存しました。","ok");renderEyeRecords();renderVisitEyeInfo()}


/* 設定 */
function bmiClass(b){
  if(b<18.5)return"低体重";if(b<25)return"普通体重";if(b<30)return"肥満1度";if(b<35)return"肥満2度";if(b<40)return"肥満3度";return"肥満4度"
}
function updateBMI(){
  const h=numOrNull($("height").value),wm=numOrNull($("startWeightMorning").value),we=numOrNull($("startWeightEvening").value);
  if(!h||(!wm&&!we)){$("bmiResult").textContent="身長と朝・夜の開始時体重を入力すると、それぞれの開始時BMIを表示します。";return}
  const parts=[];
  if(wm){const bmi=wm/((h/100)**2);parts.push(`朝の開始時BMI：<strong>${bmi.toFixed(1)} kg/m²</strong>　<span class="badge">${bmiClass(bmi)}</span>`)}
  if(we){const bmi=we/((h/100)**2);parts.push(`夜の開始時BMI：<strong>${bmi.toFixed(1)} kg/m²</strong>　<span class="badge">${bmiClass(bmi)}</span>`)}
  $("bmiResult").innerHTML=parts.join("<br>")
}
function loadSettingsToForm(){
  const s=loadSettings();
  $("height").value=s.height??"";
  $("startWeightMorning").value=s.startWeightMorning??"";
  $("startWeightEvening").value=s.startWeightEvening??"";
  $("targetWeight").value=s.targetWeight??"";
  updateBMI()
}


/* バックアップ状態 */
function formatJapaneseDate(iso){
  try{
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return "未実施";
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  }catch(e){return "未実施"}
}
function daysSince(iso){
  if(!iso)return null;
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return null;
  const now=new Date();
  const a=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const b=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.floor((b-a)/(1000*60*60*24));
}
function refreshBackupReminder(){
  const last=localStorage.getItem(LAST_BACKUP_KEY);
  const box=$("backupReminderBox"),dateEl=$("lastBackupDate"),textEl=$("backupReminderText");
  if(!box||!dateEl||!textEl)return;

  if(!last){
    dateEl.textContent="未実施";
    textEl.textContent="まだ完全バックアップが作成されていません。";
    box.style.background="#fff8e9";
    box.style.borderLeftColor="#d59a36";
    return;
  }

  const days=daysSince(last);
  dateEl.textContent=formatJapaneseDate(last);

  if(days===null){
    textEl.textContent="バックアップ日時を確認できません。新しい完全バックアップを作成してください。";
    box.style.background="#fff8e9";
    box.style.borderLeftColor="#d59a36";
  }else if(days>=30){
    textEl.textContent=`最後の完全バックアップから${days}日経過しています。新しいバックアップを作成してください。`;
    box.style.background="#fff0f0";
    box.style.borderLeftColor="#c65b5b";
  }else{
    const remaining=30-days;
    textEl.textContent=`バックアップ済みです。次の確認目安まであと${remaining}日です。`;
    box.style.background="#eef5f3";
    box.style.borderLeftColor="#2f6f65";
  }
}

/* 書き出し */
function downloadBlob(content,name,type){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function saveBackupFile(content,name,type,title="生活習慣ケアノート 完全バックアップ",text="「ファイルに保存」を選び、iCloud Drive または このiPhone内に保存してください。"){
  try{
    const file=new File([content],name,{type});
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title,text});
      return "shared";
    }
  }catch(e){
    if(e && e.name==="AbortError")return "cancelled";
    // 共有機能が使えない場合は通常ダウンロードへフォールバック
  }
  downloadBlob(content,name,type);
  return "downloaded";
}

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(reader.error||new Error("写真を読み込めませんでした"));
    reader.readAsDataURL(blob)
  })
}
function dataURLToBlob(dataURL){
  const m=String(dataURL||"").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/);
  if(!m)throw new Error("写真データの形式が正しくありません");
  const mime=m[1]||"image/jpeg",binary=atob(m[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime})
}
async function buildBackupPayload(){
  return {
    app:"生活習慣ケアノート",version:61,exportedAt:new Date().toISOString(),
    settings:loadSettings(),
    preferences:{
      visitFields:loadVisitFieldSettings(),
      dailyMeasureFields:loadDailyMeasureSettings(),
      chartMode:selectedChartMode,
      smbgChartMode:selectedSmbgChartMode,
      bpChartMode:selectedBpChartMode,
      photoRetention:getPhotoRetention(),
      mealReviewSelections:loadMealReviewSelections(),
      visitChartMode:selectedVisitChartMode,
      weightReductionMethod:selectedWeightReductionMethod,
      weightRewardProgress:loadWeightRewardProgress(),
      weightRewardTime:selectedRewardTime
    },
    dailyRecords:await getAll(DAILY_STORE),
    outpatientRecords:await getAll(VISIT_STORE),
    eyeRecords:loadEyeRecords(),
    medicationPeriods:loadMedicationPeriods()
  }
}

const ENCRYPTED_BACKUP_FORMAT="lifestyle-care-note-encrypted-backup-v1";
const ENCRYPTED_BACKUP_ITERATIONS=310000;

function bytesToBase64(bytes){
  let binary="",chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)))
  }
  return btoa(binary)
}
function base64ToBytes(text){
  const binary=atob(String(text||"")),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes
}
async function deriveEncryptedBackupKey(password,salt,iterations){
  if(!window.crypto?.subtle)throw new Error("このブラウザでは暗号化機能を利用できません。");
  const material=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(password),{name:"PBKDF2"},false,["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {name:"PBKDF2",salt,iterations,hash:"SHA-256"},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
  )
}
function readEncryptedBackupPassword(requireConfirm=false){
  const password=$("encryptedBackupPassword")?.value||"";
  const confirmPassword=$("encryptedBackupPasswordConfirm")?.value||"";
  if(password.length<10)throw new Error("バックアップ用パスワードは10文字以上にしてください。");
  if(requireConfirm && password!==confirmPassword)throw new Error("パスワード確認が一致しません。");
  return password
}
async function encryptBackupPayload(payload,password,containsPhotos){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveEncryptedBackupKey(password,salt,ENCRYPTED_BACKUP_ITERATIONS);
  const plain=new TextEncoder().encode(JSON.stringify(payload));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  return {
    app:"生活習慣ケアノート",
    format:ENCRYPTED_BACKUP_FORMAT,
    formatVersion:1,
    createdAt:new Date().toISOString(),
    containsPhotos:!!containsPhotos,
    kdf:{name:"PBKDF2",hash:"SHA-256",iterations:ENCRYPTED_BACKUP_ITERATIONS,salt:bytesToBase64(salt)},
    cipher:{name:"AES-GCM",keyLength:256,iv:bytesToBase64(iv)},
    data:bytesToBase64(new Uint8Array(encrypted))
  }
}
async function decryptBackupEnvelope(envelope,password){
  if(!envelope||envelope.format!==ENCRYPTED_BACKUP_FORMAT)throw new Error("暗号化バックアップ形式が正しくありません。");
  const iterations=Number(envelope.kdf?.iterations);
  if(!Number.isFinite(iterations)||iterations<100000||iterations>1000000)throw new Error("暗号化設定が正しくありません。");
  const salt=base64ToBytes(envelope.kdf?.salt);
  const iv=base64ToBytes(envelope.cipher?.iv);
  const encrypted=base64ToBytes(envelope.data);
  const key=await deriveEncryptedBackupKey(password,salt,iterations);
  try{
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,encrypted);
    return JSON.parse(new TextDecoder().decode(plain))
  }catch(e){
    throw new Error("復号できませんでした。パスワードが違うか、ファイルが破損しています。")
  }
}
async function buildPhotoBackupPayload(statusId="encryptedBackupStatus"){
  if(!photoStorageAvailable())throw new Error("この閲覧環境では食事写真ストレージを利用できません。");
  const photos=await getAllMealPhotos();
  const payload=await buildBackupPayload();
  payload.backupType="full-with-photos";
  payload.mealPhotos=[];
  for(let i=0;i<photos.length;i++){
    const p=photos[i];
    setSaveStatus(statusId,`食事写真を準備しています… ${i+1}/${photos.length}`,"");
    payload.mealPhotos.push({
      id:p.id,date:p.date,meal:p.meal,mime:p.mime||p.blob?.type||"image/jpeg",
      size:p.size||p.blob?.size||0,width:p.width||null,height:p.height||null,
      createdAt:p.createdAt||null,dataURL:await blobToDataURL(p.blob)
    })
  }
  return {payload,photoCount:photos.length}
}
async function exportEncryptedBackup(includePhotos=false){
  try{
    const password=readEncryptedBackupPassword(true);
    setSaveStatus("encryptedBackupStatus","暗号化バックアップを準備しています…","");
    let payload,photoCount=0;
    if(includePhotos){
      const built=await buildPhotoBackupPayload("encryptedBackupStatus");
      payload=built.payload;photoCount=built.photoCount
    }else{
      payload=await buildBackupPayload()
    }
    const envelope=await encryptBackupPayload(payload,password,includePhotos);
    const json=JSON.stringify(envelope);
    const suffix=includePhotos?"with-photos":"no-photos";
    const name=`lifestyle-care-note-encrypted-${suffix}-${todayISO()}.lcnbackup`;
    setSaveStatus("encryptedBackupStatus",`暗号化ファイルを保存しています…（${formatBytes(new Blob([json]).size)}）`,"");
    const result=await saveBackupFile(
      json,name,"application/json",
      "生活習慣ケアノート 暗号化バックアップ",
      "暗号化されたバックアップです。パスワードはファイルとは別に安全に保管してください。"
    );
    if(result==="cancelled"){setSaveStatus("encryptedBackupStatus","保存／共有をキャンセルしました。","warn");return}
    localStorage.setItem(LAST_BACKUP_KEY,new Date().toISOString());
    refreshBackupReminder();
    setSaveStatus(
      "encryptedBackupStatus",
      includePhotos?`暗号化バックアップを作成しました（写真 ${photoCount}枚を含む）。`:"暗号化バックアップを作成しました（写真なし）。",
      "ok"
    )
  }catch(err){
    setSaveStatus("encryptedBackupStatus","暗号化バックアップを作成できませんでした："+err.message,"warn")
  }
}
async function importEncryptedBackup(file){
  const password=readEncryptedBackupPassword(false);
  if(!file)throw new Error("暗号化バックアップファイルが選択されていません。");
  setSaveStatus("encryptedBackupStatus","暗号化バックアップを復号しています…","");
  let envelope;
  try{envelope=JSON.parse(await file.text())}catch(e){throw new Error("暗号化バックアップ形式が正しくありません。")}
  const payload=await decryptBackupEnvelope(envelope,password);
  const includePhotos=!!envelope.containsPhotos || Array.isArray(payload.mealPhotos);
  if(includePhotos){
    if(!confirm("食事写真を含む暗号化バックアップを復元します。\nこの端末の食事写真はいったん削除し、バックアップ内の写真に置き換えます。続けますか？"))return
  }
  await importBackupData(payload,includePhotos);
  setSaveStatus("encryptedBackupStatus","暗号化バックアップを復元しました。記録・グラフを確認してください。","ok")
}

async function exportPhotoBackup(){
  if(!photoStorageAvailable()){
    setSaveStatus("photoBackupStatus","この閲覧環境では食事写真ストレージを利用できません。写真保存に対応したSafari/Chrome/PWAで実行してください。","warn");
    return
  }
  const photos=await getAllMealPhotos();
  const photoBytes=photos.reduce((s,p)=>s+(p.size||p.blob?.size||0),0);
  const estimatedJsonBytes=Math.round(photoBytes*1.37);
  const sizeMessage=photos.length
    ?`食事写真 ${photos.length}枚（元画像合計 約${formatBytes(photoBytes)}）を含みます。\nBase64化するため、バックアップファイルは概ね ${formatBytes(estimatedJsonBytes)} 以上となり、通常のバックアップより大きくなります。\n続けますか？`
    :`現在、保存されている食事写真はありません。\n写真を含む完全バックアップを作成しますか？`;
  if(!confirm(sizeMessage))return;

  setSaveStatus("photoBackupStatus",`写真を含む完全バックアップを準備しています…（写真 ${photos.length}枚）`,"");
  const payload=await buildBackupPayload();
  payload.backupType="full-with-photos";
  payload.mealPhotos=[];

  for(let i=0;i<photos.length;i++){
    const p=photos[i];
    setSaveStatus("photoBackupStatus",`写真を変換しています… ${i+1}/${photos.length}`,"");
    payload.mealPhotos.push({
      id:p.id,date:p.date,meal:p.meal,mime:p.mime||p.blob?.type||"image/jpeg",
      size:p.size||p.blob?.size||0,width:p.width||null,height:p.height||null,
      createdAt:p.createdAt||null,dataURL:await blobToDataURL(p.blob)
    })
  }

  const json=JSON.stringify(payload);
  const name=`lifestyle-care-note-full-with-photos-${todayISO()}.json`;
  setSaveStatus("photoBackupStatus",`バックアップファイルを出力しています…（${formatBytes(new Blob([json]).size)}）`,"");
  const result=await saveBackupFile(
    json,name,"application/json",
    "生活習慣ケアノート 完全バックアップ（写真を含む）",
    "食事写真を含む完全バックアップです。「ファイルに保存」で保管してください。"
  );
  if(result==="cancelled"){
    setSaveStatus("photoBackupStatus","保存／共有をキャンセルしました。","warn");
    return
  }
  localStorage.setItem(LAST_BACKUP_KEY,new Date().toISOString());
  refreshBackupReminder();
  setSaveStatus("photoBackupStatus",`写真を含む完全バックアップを出力しました。写真 ${photos.length}枚を含みます。通常のバックアップよりファイルサイズが大きくなります。`,"ok")
}

async function exportJSON(){
  const nowIso=new Date().toISOString();
  const payload=await buildBackupPayload();
  payload.exportedAt=nowIso;
  const name=`lifestyle-care-note-backup-${todayISO()}.json`;
  setSaveStatus("backupStatus","バックアップファイルを準備しています…","");
  const result=await saveBackupFile(JSON.stringify(payload,null,2),name,"application/json");
  if(result==="cancelled"){
    setSaveStatus("backupStatus","保存／共有をキャンセルしました。バックアップ日は更新していません。","warn");
    return;
  }
  localStorage.setItem(LAST_BACKUP_KEY,nowIso);
  refreshBackupReminder();
  if(result==="shared"){
    setSaveStatus("backupStatus","バックアップを出力しました。iPhoneでは共有画面の「ファイルに保存」で保存場所を指定できます。","ok");
  }else{
    setSaveStatus("backupStatus","バックアップをダウンロードしました。Safariでは「ファイル」アプリのダウンロード先を確認してください。","ok");
  }
}
async function exportDailyCSV(){
  const rows=await getAll(DAILY_STORE),header=["date","weightMorning","weightEvening","bodyFatMorning","bodyFatEvening","muscleMassMorning","muscleMassEvening","bgBeforeBreakfast","bgAfterBreakfast","bgBeforeLunch","bgAfterLunch","bgBeforeDinner","bgAfterDinner","bgBedtime","bpMorningSbp","bpMorningDbp","bpEveningSbp","bpEveningDbp","bowelMovement","bodyFat","muscleMass","steps","breakfast","lunch","dinner","snack","note"],q=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv="\uFEFF"+[header.join(","),...rows.map(r=>header.map(k=>q(r[k])).join(","))].join("\n");
  downloadBlob(csv,`lifestyle-care-note-daily-${todayISO()}.csv`,"text/csv;charset=utf-8")
}
async function exportVisitCSV(){
  const rows=await getAll(VISIT_STORE),header=["date","weight","waist","absi","hba1c","ga","sbp","dbp","glucose","tc","tg","hdl","ldl","ast","alt","ggt","ua","cr","egfr","protein","hb","medication","diet","exercise","note"],q=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const height=loadSettings().height;
  const csv="\uFEFF"+[header.join(","),...rows.map(r=>header.map(k=>q(k==="absi"?calculateABSI(r.weight,r.waist,height):r[k])).join(","))].join("\n");
  downloadBlob(csv,`lifestyle-care-note-outpatient-${todayISO()}.csv`,"text/csv;charset=utf-8")
}
async function importBackupData(data,includePhotos=false){
  if(!data || typeof data!=="object" || Array.isArray(data))throw new Error("バックアップ形式が正しくありません。");
  if(data.app && data.app!=="生活習慣ケアノート")throw new Error("生活習慣ケアノートのバックアップではありません。");
  if(includePhotos && !Array.isArray(data.mealPhotos)){
    throw new Error("このファイルには食事写真が含まれていません。「完全バックアップ（写真を含む）」で作成したファイルを選んでください。");
  }
  if(data.settings)saveSettings(data.settings);
  if(data.preferences){
    if(Array.isArray(data.preferences.visitFields))saveVisitFieldSettings(data.preferences.visitFields);
    if(Array.isArray(data.preferences.dailyMeasureFields))saveDailyMeasureSettings(data.preferences.dailyMeasureFields);
    if(["90","180","365","never"].includes(String(data.preferences.photoRetention)))setPhotoRetention(String(data.preferences.photoRetention));
    if(data.preferences.mealReviewSelections && typeof data.preferences.mealReviewSelections==="object"){
      saveMealReviewSelections(data.preferences.mealReviewSelections);
    }
    if(["separate","combined"].includes(data.preferences.visitChartMode)){
      selectedVisitChartMode=data.preferences.visitChartMode;
      localStorage.setItem(VISIT_CHART_MODE_KEY,selectedVisitChartMode);
    }
    if(["latest","median7"].includes(data.preferences.weightReductionMethod)){
      selectedWeightReductionMethod=data.preferences.weightReductionMethod;
      localStorage.setItem(WEIGHT_REDUCTION_METHOD_KEY,selectedWeightReductionMethod);
    }
    if(data.preferences.weightRewardProgress && typeof data.preferences.weightRewardProgress==="object"){
      saveWeightRewardProgress(data.preferences.weightRewardProgress);
    }
    if(["morning","evening"].includes(data.preferences.weightRewardTime)){
      selectedRewardTime=data.preferences.weightRewardTime;
      localStorage.setItem(WEIGHT_REWARD_TIME_KEY,selectedRewardTime);
    }
    if(["separate","continuous"].includes(data.preferences.chartMode)){
      selectedChartMode=data.preferences.chartMode;
      localStorage.setItem("weightControlChartModeV5",selectedChartMode);
    }
    if(["sameTime","continuous"].includes(data.preferences.smbgChartMode)){
      selectedSmbgChartMode=data.preferences.smbgChartMode;
      localStorage.setItem(SMBG_CHART_MODE_KEY,selectedSmbgChartMode);
    }
    if(["continuous","morning","evening"].includes(data.preferences.bpChartMode)){
      selectedBpChartMode=data.preferences.bpChartMode;
      localStorage.setItem(BP_CHART_MODE_KEY,selectedBpChartMode);
    }
  }
  const daily=data.dailyRecords||data.records||[];
  const visits=data.outpatientRecords||[];
  const eyes=data.eyeRecords||[];
  if(!Array.isArray(daily)||!Array.isArray(visits)||!Array.isArray(eyes))throw new Error("形式が違います");
  for(const r of daily)if(r.date)await putItem(DAILY_STORE,r);
  for(const r of visits)if(r.date)await putItem(VISIT_STORE,r);
  if(eyes.length)saveEyeRecords(eyes.filter(r=>r&&r.date));
  if(Array.isArray(data.medicationPeriods))saveMedicationPeriods(data.medicationPeriods.filter(p=>p&&p.id&&p.name&&p.startDate));

  if(includePhotos){
    if(!Array.isArray(data.mealPhotos))throw new Error("このファイルには食事写真が含まれていません。通常バックアップではなく「完全バックアップ（写真を含む）」を選んでください。");
    if(!photoStorageAvailable())throw new Error("この環境では食事写真を保存できません。写真保存に対応したSafari/Chrome/PWAで実行してください。");

    await clearMealPhotos();
    const affectedDates=new Set();
    for(let i=0;i<data.mealPhotos.length;i++){
      const p=data.mealPhotos[i];
      setSaveStatus("photoBackupStatus",`食事写真を復元しています… ${i+1}/${data.mealPhotos.length}`,"");
      if(!p||!p.date||!p.meal||!p.dataURL)continue;
      const blob=dataURLToBlob(p.dataURL);
      await putMealPhoto({
        id:p.id||newPhotoId(p.date,p.meal,i),
        date:p.date,meal:p.meal,blob,
        mime:p.mime||blob.type||"image/jpeg",
        size:p.size||blob.size,
        width:p.width||null,height:p.height||null,
        createdAt:p.createdAt||new Date().toISOString()
      });
      affectedDates.add(p.date)
    }
    for(const d of affectedDates)await syncDailyRecordPhotoMarker(d);
    await loadMealPhotosForDate($("date").value);
    await refreshStorageUsage()
  }

  await refreshAll();loadSettingsToForm();syncPermanentVisitFieldCheckboxes();applyVisitFieldVisibility();syncDailyMeasureSettingCheckboxes();applyDailyMeasureVisibility()
}

async function importJSON(file,includePhotos=false){
  if(!file)throw new Error("バックアップファイルが選択されていません。");
  const text=await file.text();
  let data;
  try{data=JSON.parse(text)}catch(e){throw new Error("JSON形式のバックアップではありません。")}
  return importBackupData(data,includePhotos)
}

async function refreshAll(){await refreshSummary();await refreshWeightReward();await drawHomeChart();await drawSmbgChart();await drawBpChart();await drawVisitCharts();await renderHistory();await renderVisits();renderEyeRecords()}
function showView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
  const view=$("view-"+name);if(!view)return;view.classList.add("active");
  const tab=document.querySelector(`.tabs button[data-view="${name}"]`);if(tab)tab.classList.add("active");
  if(name==="chart"){drawHomeChart();drawSmbgChart();drawBpChart()}
  if(name==="outpatient"){renderMedicationManager();drawVisitCharts();renderVisits()}
  if(name==="eye")renderEyeRecords();
  if(name==="review")renderMealReview();
  if(name==="history")renderHistory();
  if(name==="settings"){loadSettingsToForm();refreshBackupReminder();$("photoRetention").value=getPhotoRetention();refreshStorageUsage()}
}

/* イベント */
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$("refreshMealReviewBtn").onclick=()=>renderMealReview();
$("clearMealReviewBtn").onclick=async()=>{
  if(confirm("「良い食事の例」と「改善を考える食事の例」の選択を解除しますか？")){
    saveMealReviewSelections({good:null,improve:null});
    setSaveStatus("mealReviewStatus","食事レビューの選択を解除しました。","ok");
    await renderMealReview()
  }
};
document.querySelectorAll("#chartModeButtons button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#chartModeButtons button").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  selectedChartMode=b.dataset.mode;
  try{localStorage.setItem("weightControlChartModeV5",selectedChartMode)}catch(e){}
  const continuous=selectedChartMode==="continuous";
  $("showMorning").disabled=continuous;
  $("showEvening").disabled=continuous;
  $("showMorning").parentElement.style.opacity=continuous?".45":"1";
  $("showEvening").parentElement.style.opacity=continuous?".45":"1";
  drawHomeChart()
});

document.querySelectorAll("#rewardTimeButtons button").forEach(b=>b.onclick=async()=>{
  selectedRewardTime=b.dataset.time;
  localStorage.setItem(WEIGHT_REWARD_TIME_KEY,selectedRewardTime);
  await refreshWeightReward()
});
$("resetRewardBtn").onclick=async()=>{
  if(!confirm("獲得済みの減量メダル記録をリセットしますか？ 体重記録は削除されません。"))return;
  const p=loadWeightRewardProgress();p[selectedRewardTime]=0;saveWeightRewardProgress(p);
  await refreshWeightReward()
};

document.querySelectorAll("#weightReductionMethodButtons button").forEach(b=>b.onclick=async()=>{
  selectedWeightReductionMethod=b.dataset.method;
  localStorage.setItem(WEIGHT_REDUCTION_METHOD_KEY,selectedWeightReductionMethod);
  await refreshSummary();await refreshWeightReward()
});


document.querySelectorAll("#smbgChartModeButtons button").forEach(b=>b.onclick=()=>{
  selectedSmbgChartMode=b.dataset.mode;
  localStorage.setItem(SMBG_CHART_MODE_KEY,selectedSmbgChartMode);
  drawSmbgChart()
});
document.querySelectorAll("#smbgPeriodButtons button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#smbgPeriodButtons button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  selectedSmbgPeriod=b.dataset.days==="all"?"all":Number(b.dataset.days);
  drawSmbgChart()
});


document.querySelectorAll("#bpChartModeButtons button").forEach(b=>b.onclick=()=>{
  selectedBpChartMode=b.dataset.mode;localStorage.setItem(BP_CHART_MODE_KEY,selectedBpChartMode);drawBpChart()
});
document.querySelectorAll("#bpPeriodButtons button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#bpPeriodButtons button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  selectedBpPeriod=b.dataset.days==="all"?"all":Number(b.dataset.days);drawBpChart()
});

document.querySelectorAll("#periodButtons button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#periodButtons button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  selectedPeriod=b.dataset.days==="all"?"all":Number(b.dataset.days);drawHomeChart()
});
document.querySelectorAll("#visitPeriodButtons button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("#visitPeriodButtons button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  selectedVisitPeriod=b.dataset.days==="all"?"all":Number(b.dataset.days);drawVisitCharts()
});
$("visitChartSeparateBtn").onclick=()=>{
  selectedVisitChartMode="separate";
  localStorage.setItem(VISIT_CHART_MODE_KEY,selectedVisitChartMode);
  drawVisitCharts()
};
$("visitChartCombinedBtn").onclick=()=>{
  selectedVisitChartMode="combined";
  localStorage.setItem(VISIT_CHART_MODE_KEY,selectedVisitChartMode);
  drawVisitCharts()
};
$("showMorning").onchange=drawHomeChart;$("showEvening").onchange=drawHomeChart;
$("date").onchange=async()=>{
  clearTimeout(dailyAutoSaveTimer);
  const newDate=$("date").value;
  const draft=loadDraftSync(DAILY_DRAFT_KEY);
  if(draft && draft.date && draft.date!==newDate && hasMeaningfulDailyData(draft)){
    try{await putItem(DAILY_STORE,draft);clearDraftSync(DAILY_DRAFT_KEY)}catch(e){}
  }
  dailyMeasureTemporaryFields.clear();
  dailyMeasureShowAllTemporary=false;
  await loadDate(newDate);
};
$("saveBtn").onclick=()=>saveCurrent(false);
$("newBtn").onclick=()=>{
  clearTimeout(dailyAutoSaveTimer);clearDraftSync(DAILY_DRAFT_KEY);
  dailyMeasureTemporaryFields.clear();dailyMeasureShowAllTemporary=false;
  currentBowelMovement=false;
  isLoadingDaily=true;setDailyForm({date:$("date").value||todayISO()});isLoadingDaily=false;
  applyDailyMeasureVisibility();
  setSaveStatus("saveStatus","入力欄をクリアしました。入力すると自動保存されます。","");
};
$("visitDate").onchange=async()=>{
  clearTimeout(visitAutoSaveTimer);
  const newDate=$("visitDate").value;
  const draft=loadDraftSync(VISIT_DRAFT_KEY);
  if(draft && draft.date && draft.date!==newDate && hasMeaningfulVisitData(draft)){
    try{await putItem(VISIT_STORE,draft);clearDraftSync(VISIT_DRAFT_KEY)}catch(e){}
  }
  visitTemporaryFields.clear();
  visitShowAllTemporary=false;
  await loadVisit(newDate);
};
$("saveVisitBtn").onclick=()=>saveVisit(false);
$("addMedicationPeriodBtn").onclick=addMedicationPeriod;
$("visitDate").addEventListener("change",()=>{
  if($("medPeriodStart"))$("medPeriodStart").value=$("visitDate").value||todayISO();
  renderMedicationManager()
});
$("homeEventCloseBtn").onclick=closeHomeEventPopup;
$("homeEventOverlay").addEventListener("click",e=>{if(e.target.id==="homeEventOverlay")closeHomeEventPopup()});
$("clearVisitBtn").onclick=()=>{
  clearTimeout(visitAutoSaveTimer);clearDraftSync(VISIT_DRAFT_KEY);
  isLoadingVisit=true;setVisitForm({date:$("visitDate").value||todayISO()});isLoadingVisit=false;
  setSaveStatus("visitStatus","入力欄をクリアしました。入力すると自動保存されます。","");
};
$("historyMonth").onchange=renderHistory;$("todayMonthBtn").onclick=()=>{$("historyMonth").value=monthISO();renderHistory()};



// 日常記録：自宅測定項目の表示設定
$("dailyMeasureSettingsBtn").onclick=()=>{
  syncDailyMeasureSettingCheckboxes();
  $("dailyMeasureSettingsPanel").style.display=$("dailyMeasureSettingsPanel").style.display==="none"?"block":"none";
  $("dailyMeasureTempPanel").style.display="none";
};
$("dailyMeasureCancelSettingsBtn").onclick=()=>{$("dailyMeasureSettingsPanel").style.display="none"};
$("dailyMeasureSaveSettingsBtn").onclick=()=>{
  const selected=[...document.querySelectorAll(".daily-measure-perm-option:checked")].map(x=>x.value);
  saveDailyMeasureSettings(["weight",...selected]);
  dailyMeasureTemporaryFields=new Set([...dailyMeasureTemporaryFields].filter(k=>!selected.includes(k)));
  dailyMeasureShowAllTemporary=false;
  applyDailyMeasureVisibility();
  $("dailyMeasureSettingsPanel").style.display="none";
  setSaveStatus("saveStatus","自宅測定の表示項目設定を保存しました。","ok");
};
$("dailyMeasureTempAddBtn").onclick=()=>{
  renderDailyMeasureTempOptions();
  $("dailyMeasureTempPanel").style.display=$("dailyMeasureTempPanel").style.display==="none"?"block":"none";
  $("dailyMeasureSettingsPanel").style.display="none";
};
$("dailyMeasureCancelTempBtn").onclick=()=>{$("dailyMeasureTempPanel").style.display="none"};
$("dailyMeasureApplyTempBtn").onclick=()=>{
  const checked=new Set([...document.querySelectorAll(".daily-measure-temp-option:checked")].map(cb=>cb.value));
  document.querySelectorAll(".daily-measure-temp-option:checked").forEach(cb=>{
    if(cb.value!=="bowel")dailyMeasureTemporaryFields.add(cb.value)
  });

  // 「排便あり」は選択した時点で記録完了。追加後は文字だけ表示する。
  currentBowelMovement=checked.has("bowel");
  if(currentBowelMovement)dailyMeasureTemporaryFields.add("bowel");
  else dailyMeasureTemporaryFields.delete("bowel");

  dailyMeasureShowAllTemporary=false;
  applyDailyMeasureVisibility();
  $("dailyMeasureTempPanel").style.display="none";
  scheduleDailyAutoSave(100);
};
$("dailyMeasureShowAllBtn").onclick=()=>{
  dailyMeasureShowAllTemporary=true;
  $("dailyMeasureSettingsPanel").style.display="none";
  $("dailyMeasureTempPanel").style.display="none";
  applyDailyMeasureVisibility();
};
$("dailyMeasureNormalBtn").onclick=()=>resetDailyMeasureTemporaryDisplay();

// 外来記録：患者ごとの表示項目設定
$("visitFieldSettingsBtn").onclick=()=>{
  syncPermanentVisitFieldCheckboxes();
  $("visitFieldSettingsPanel").style.display=$("visitFieldSettingsPanel").style.display==="none"?"block":"none";
  $("visitTempAddPanel").style.display="none";
};
$("visitCancelFieldSettingsBtn").onclick=()=>{$("visitFieldSettingsPanel").style.display="none"};
$("visitSaveFieldSettingsBtn").onclick=()=>{
  const selected=[...document.querySelectorAll(".visit-perm-option:checked")].map(x=>x.value);
  saveVisitFieldSettings(selected);
  visitTemporaryFields=new Set([...visitTemporaryFields].filter(k=>!selected.includes(k)));
  visitShowAllTemporary=false;
  applyVisitFieldVisibility();
  $("visitFieldSettingsPanel").style.display="none";
  setSaveStatus("visitStatus","外来の表示項目設定を保存しました。","ok");
};
$("visitTempAddBtn").onclick=()=>{
  renderTemporaryVisitOptions();
  $("visitTempAddPanel").style.display=$("visitTempAddPanel").style.display==="none"?"block":"none";
  $("visitFieldSettingsPanel").style.display="none";
};
$("visitCancelTempBtn").onclick=()=>{$("visitTempAddPanel").style.display="none"};
$("visitApplyTempBtn").onclick=()=>{
  document.querySelectorAll(".visit-temp-option:checked").forEach(cb=>visitTemporaryFields.add(cb.value));
  visitShowAllTemporary=false;
  applyVisitFieldVisibility();
  $("visitTempAddPanel").style.display="none";
};
$("visitShowAllBtn").onclick=()=>{
  visitShowAllTemporary=true;
  $("visitFieldSettingsPanel").style.display="none";
  $("visitTempAddPanel").style.display="none";
  applyVisitFieldVisibility();
};
$("visitNormalViewBtn").onclick=()=>{
  resetVisitTemporaryDisplay();
};


// 写真拡大表示
$("photoModalClose").onclick=closePhotoModal;
$("photoModal").addEventListener("click",e=>{if(e.target===$("photoModal"))closePhotoModal()});

// 写真編集
$("photoEditorClose").onclick=closePhotoEditor;
$("photoEditorCancelBottom").onclick=closePhotoEditor;
$("photoRotateLeft").onclick=()=>rotatePhotoEditor(-90);
$("photoRotateRight").onclick=()=>rotatePhotoEditor(90);
$("photoEditorReset").onclick=()=>resetPhotoEditorView(false);
$("photoEditorSave").onclick=savePhotoEditor;
$("photoEditorZoom").addEventListener("input",e=>{photoEditorState.zoom=Number(e.target.value)||1;renderPhotoEditor()});
document.querySelectorAll("#photoEditorAspectButtons button").forEach(b=>b.onclick=()=>{
  photoEditorState.aspect=b.dataset.aspect||"original";
  photoEditorState.zoom=1;photoEditorState.offsetX=0;photoEditorState.offsetY=0;
  document.querySelectorAll("#photoEditorAspectButtons button").forEach(x=>x.classList.toggle("active",x===b));
  renderPhotoEditor()
});
setupPhotoEditorGestures();

// 食事写真（1食最大6枚）
MEALS.forEach(meal=>{
  $(`photo_${meal}`).addEventListener("change",async e=>{
    const files=e.target.files;
    if(files?.length)await handleMealPhotosSelected(meal,files);
    e.target.value=""
  });
});
$("savePhotoSettingsBtn").onclick=async()=>{
  setPhotoRetention($("photoRetention").value);const n=await cleanupExpiredPhotos(false);await refreshStorageUsage();setSaveStatus("photoSettingsStatus",`写真の保存期間を保存しました。${n?` ${n}枚の期限切れ写真を削除しました。`:""}`,"ok")
};
$("cleanupPhotosBtn").onclick=async()=>{await cleanupExpiredPhotos(true);await refreshStorageUsage()};
$("deleteAllPhotosBtn").onclick=async()=>{if(confirm("食事写真をすべて削除しますか？\n体重・文字の食事記録・外来記録は削除されません。")){const dates=[...new Set((await getAllMealPhotos()).map(p=>p.date))];await clearMealPhotos();for(const date of dates)await syncDailyRecordPhotoMarker(date);await loadMealPhotosForDate($("date").value);await refreshStorageUsage();setSaveStatus("photoSettingsStatus","食事写真をすべて削除しました。","ok")}};

// 日常記録：文字入力・数値入力のたびに下書きを即時退避し、少し待って自動保存
["weightMorning","weightEvening","bodyFatMorning","bodyFatEvening","muscleMassMorning","muscleMassEvening",...SMBG_KEYS,"bpMorningSbp","bpMorningDbp","bpEveningSbp","bpEveningDbp","steps","breakfast","lunch","dinner","snack","note"].forEach(id=>{
  $(id).addEventListener("input",()=>scheduleDailyAutoSave(700));
  $(id).addEventListener("change",()=>scheduleDailyAutoSave(100));
  $(id).addEventListener("blur",()=>scheduleDailyAutoSave(100));
});
// 外来記録も同様に自動保存
["visitWeight","visitWaist","visitAbsiAge","visitAbsiSex","visitMedication","visitDiet","visitExercise","visitSBP","visitDBP","visitGlucose","visitHbA1c","visitGA","visitHb",
 "visitTC","visitTG","visitHDL","visitLDL","visitAST","visitALT","visitGGT","visitUA","visitCr","visitEGFR","visitProtein","visitNote"].forEach(id=>{
  $(id).addEventListener("input",()=>scheduleVisitAutoSave(700));
  $(id).addEventListener("change",()=>scheduleVisitAutoSave(100));
  $(id).addEventListener("blur",()=>scheduleVisitAutoSave(100));
});
["visitWeight","visitWaist","visitAbsiAge"].forEach(id=>$(id).addEventListener("input",updateVisitABSI));
$("visitAbsiSex").addEventListener("change",updateVisitABSI);

$("saveEyeBtn").onclick=saveEyeCurrent;
$("clearEyeFormBtn").onclick=()=>{setEyeForm({date:todayISO()});setSaveStatus("eyeStatus","入力欄をクリアしました。","")};
["height","startWeightMorning","startWeightEvening"].forEach(id=>$(id).oninput=()=>{updateBMI();if(id==="height")updateVisitABSI()});
$("saveSettingsBtn").onclick=async()=>{
  const old=loadSettings();
  saveSettings({...old,height:numOrNull($("height").value),startWeightMorning:numOrNull($("startWeightMorning").value),startWeightEvening:numOrNull($("startWeightEvening").value),targetWeight:numOrNull($("targetWeight").value)});
  $("settingsStatus").textContent="設定を保存しました。";updateBMI();updateVisitABSI();await refreshSummary();await refreshWeightReward();await drawHomeChart();await drawVisitCharts()
};
$("exportJsonBtn").onclick=exportJSON;$("exportCsvBtn").onclick=exportDailyCSV;$("exportVisitCsvBtn").onclick=exportVisitCSV;
$("exportPhotoBackupBtn").onclick=exportPhotoBackup;
$("exportEncryptedBackupBtn").onclick=()=>exportEncryptedBackup(false);
$("exportEncryptedPhotoBackupBtn").onclick=()=>exportEncryptedBackup(true);

$("importEncryptedBackupInput").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{await importEncryptedBackup(f)}catch(err){setSaveStatus("encryptedBackupStatus","復元できませんでした："+err.message,"warn")}
  e.target.value=""
};
$("importJsonInput").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{await importJSON(f);$("backupStatus").textContent="バックアップを復元しました。"}catch(err){$("backupStatus").textContent="復元できませんでした："+err.message}
  e.target.value=""
};
$("importPhotoBackupInput").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  if(!confirm("食事写真を含む完全バックアップを復元します。\nこの端末に現在保存されている食事写真はいったん削除し、バックアップ内の写真に置き換えます。\n日常・外来・眼科の記録は日付単位で復元／上書きします。続けますか？")){e.target.value="";return}
  try{
    setSaveStatus("photoBackupStatus","写真を含むバックアップを読み込んでいます…","");
    await importJSON(f,true);
    const photoCount=(await getAllMealPhotos()).length;
    setSaveStatus("photoBackupStatus",`復元が完了しました。食事写真 ${photoCount}枚を復元しました。記録・履歴・グラフも確認してください。`,"ok");
  }catch(err){
    setSaveStatus("photoBackupStatus","復元できませんでした："+err.message,"warn")
  }
  e.target.value=""
};


// アプリを閉じる・別画面へ移る直前にも、入力中内容を同期的に下書き保存。
// 次回起動時に復元し、その後IndexedDBへ自動保存する。
function snapshotDraftsBeforeClose(){
  try{
    if(!isLoadingDaily){
      const r=dailyFormToRecord();
      if(hasMeaningfulDailyData(r))saveDraftSync(DAILY_DRAFT_KEY,r);
    }
    if(!isLoadingVisit){
      const r=visitFormToRecord();
      if(hasMeaningfulVisitData(r))saveDraftSync(VISIT_DRAFT_KEY,r);
    }
  }catch(e){}
}
window.addEventListener("pagehide",snapshotDraftsBeforeClose);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")snapshotDraftsBeforeClose()});

window.addEventListener("load",async()=>{
  // パスワードは端末内へ保存しない。再起動時は必ず空欄にする。
  if($("encryptedBackupPassword"))$("encryptedBackupPassword").value="";
  if($("encryptedBackupPasswordConfirm"))$("encryptedBackupPasswordConfirm").value="";
  $("date").value=todayISO();$("visitDate").value=todayISO();$("eyeDate").value=todayISO();$("historyMonth").value=monthISO();
  try{selectedChartMode=localStorage.getItem("weightControlChartModeV5")||"continuous"}catch(e){selectedChartMode="separate"}
  document.querySelectorAll("#chartModeButtons button").forEach(b=>b.classList.toggle("active",b.dataset.mode===selectedChartMode));
  const continuous=selectedChartMode==="continuous";
  $("showMorning").disabled=continuous;$("showEvening").disabled=continuous;
  $("showMorning").parentElement.style.opacity=continuous?".45":"1";
  $("showEvening").parentElement.style.opacity=continuous?".45":"1";
  await initDB();$("photoRetention").value=getPhotoRetention();await cleanupExpiredPhotos(false);syncDailyMeasureSettingCheckboxes();applyDailyMeasureVisibility();await loadDate(todayISO());syncPermanentVisitFieldCheckboxes();applyVisitFieldVisibility();await loadVisit(todayISO());loadSettingsToForm();refreshBackupReminder();await refreshAll();await refreshStorageUsage();
  if("serviceWorker" in navigator&&location.protocol.startsWith("http")){
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(reg=>{
      // GitHub Pages上で更新した版を起動時に確認する
      reg.update().catch(()=>{});
      if(hadController){
        let refreshing=false;
        navigator.serviceWorker.addEventListener("controllerchange",()=>{
          if(refreshing)return;refreshing=true;location.reload();
        });
      }
    }).catch(()=>{})
  }
});

const MANUAL_DEFINITIONS={
  device:{
    title:"端末利用マニュアル",
    pages:["./manual_device_01.png","./manual_device_02.png","./manual_device_03.png","./manual_device_04.png","./manual_device_05.png","./manual_device_06.png"]
  },
  app:{
    title:"生活習慣ケアノート 利用マニュアル",
    pages:["./manual_app_01.png","./manual_app_02.png","./manual_app_03.png","./manual_app_04.png","./manual_app_05.png","./manual_app_06.png","./manual_app_07.png","./manual_app_08.png","./manual_app_09.png","./manual_app_10.png","./manual_app_11.png","./manual_app_12.png","./manual_app_13.png"]
  }
};

function openManualViewer(kind){
  const def=MANUAL_DEFINITIONS[kind];if(!def)return;
  const viewer=$("manualViewer"),title=$("manualViewerTitle"),pagesBox=$("manualViewerPages");
  title.textContent=def.title;
  pagesBox.innerHTML=def.pages.map((src,i)=>`<figure class="manual-page"><img src="${src}" alt="${def.title} ${i+1}ページ"></figure>`).join("");
  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden","false");
  document.body.classList.add("manual-open");
  viewer.scrollTo({top:0,behavior:"auto"});
}
function closeManualViewer(){
  const viewer=$("manualViewer");if(!viewer)return;
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden","true");
  document.body.classList.remove("manual-open");
}
function setupManualViewer(){
  if($("openDeviceManualBtn"))$("openDeviceManualBtn").onclick=()=>openManualViewer("device");
  if($("openAppManualBtn"))$("openAppManualBtn").onclick=()=>openManualViewer("app");
  if($("manualBackTopBtn"))$("manualBackTopBtn").onclick=closeManualViewer;
  if($("manualBackBottomBtn"))$("manualBackBottomBtn").onclick=closeManualViewer;
  if($("manualViewer"))$("manualViewer").addEventListener("click",e=>{if(e.target.id==="manualViewer")closeManualViewer()});
}

window.addEventListener("load",()=>{setupManualViewer()});

})();
