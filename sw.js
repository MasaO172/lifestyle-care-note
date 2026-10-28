const CACHE_PREFIX="lifestyle-care-note-";
const CACHE=CACHE_PREFIX+"v61";

/*
  起動に必須の3ファイルはインストール時に必ずキャッシュする。
  これらがそろえば、通信不能時でもPWA本体を起動できる。
*/
const REQUIRED_ASSETS=[
  "./index.html",
  "./app.js",
  "./styles.css"
];

/*
  マニフェスト・アイコン・マニュアルは補助ファイル。
  1つ取得できなくてもService Worker全体のインストールを失敗させない。
*/
const OPTIONAL_ASSETS=[
  "./",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./manual_device.pdf",
  "./manual_device_01.png",
  "./manual_device_02.png",
  "./manual_device_03.png",
  "./manual_device_04.png",
  "./manual_device_05.png",
  "./manual_device_06.png",
  "./manual_app.pdf",
  "./manual_app_01.png",
  "./manual_app_02.png",
  "./manual_app_03.png",
  "./manual_app_04.png",
  "./manual_app_05.png",
  "./manual_app_06.png",
  "./manual_app_07.png",
  "./manual_app_08.png",
  "./manual_app_09.png",
  "./manual_app_10.png",
  "./manual_app_11.png",
  "./manual_app_12.png",
  "./manual_app_13.png"
];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);

    // 本体3ファイルだけは確実に保存する。
    await cache.addAll(REQUIRED_ASSETS);

    // 補助ファイルは個別に保存し、1件の失敗で全体を失敗させない。
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(asset=>cache.add(asset))
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(
      keys
        .filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE)
        .map(key=>caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;

  const url=new URL(req.url);

  // セキュリティ方針：外部オリジンはService Workerで処理・保存しない。
  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);

    /*
      まずキャッシュを返す（offline-first）。
      Wi-Fiには接続しているがインターネットへ出られない場合でも、
      ネットワークのタイムアウトを待たずに起動できる。
    */
    const cached=await cache.match(req,{ignoreSearch:true});

    // オンラインなら裏で最新版を取り、次回用にキャッシュを更新する。
    const networkUpdate=fetch(req,{cache:"no-store"})
      .then(async response=>{
        if(response&&response.ok){
          try{await cache.put(req,response.clone())}catch(e){}
        }
        return response;
      })
      .catch(()=>null);

    if(cached){
      event.waitUntil(networkUpdate);
      return cached;
    }

    // 初回などキャッシュにない場合のみネットワークを待つ。
    const response=await networkUpdate;
    if(response)return response;

    // ナビゲーション要求はindex.htmlへフォールバック。
    if(req.mode==="navigate"){
      const shell=await cache.match("./index.html");
      if(shell)return shell;
    }

    return new Response("Offline",{
      status:503,
      statusText:"Offline",
      headers:{"Content-Type":"text/plain; charset=utf-8"}
    });
  })());
});
