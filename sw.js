const CACHE_PREFIX="lifestyle-care-note-";
const CACHE=CACHE_PREFIX+"v46";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./manual_device_01.png","./manual_device_02.png","./manual_device_03.png","./manual_device_04.png","./manual_device_05.png","./manual_device_06.png","./manual_app_01.png","./manual_app_02.png","./manual_app_03.png","./manual_app_04.png","./manual_app_05.png","./manual_app_06.png","./manual_app_07.png","./manual_app_08.png","./manual_app_09.png","./manual_app_10.png","./manual_app_11.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const req=event.request;
  // 公開版ではネット接続時は最新版を優先し、失敗時だけキャッシュへ戻る
  event.respondWith(
    fetch(req,{cache:"no-store"}).then(response=>{
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy));
      }
      return response;
    }).catch(()=>caches.match(req).then(hit=>hit||caches.match("./index.html")))
  );
});
