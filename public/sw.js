// Notifications only. Do not cache app HTML, health records, or API responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const route=event.notification.data;
  // No arbitrary URL, external origin, or page path may be supplied by data.
  if(!route||route.version!==1||!['personal','competition'].includes(route.mode)||typeof route.noticeId!=='string'||!route.noticeId||route.noticeId.length>160||/[\u0000-\u001f\u007f]/u.test(route.noticeId))return;
  const target=new URL('/',self.location.origin);
  target.searchParams.set('mode',route.mode);
  target.searchParams.set('panel','notifications');
  target.searchParams.set('notice',route.noticeId);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const client=clients.find(candidate=>{
      try{
        const url=new URL(candidate.url);
        const rawMode=url.searchParams.get('mode');
        const mode=rawMode==='competition'?'competition':'personal';
        return url.origin===self.location.origin&&url.pathname==='/'&&(!rawMode||['personal','competition'].includes(rawMode))&&mode===route.mode;
      }catch{return false;}
    });
    if(client){client.postMessage({type:'open-notifications',source:'shichen-notifications',mode:route.mode,noticeId:route.noticeId});return client.focus();}
    return self.clients.openWindow(target.href);
  }));
});
