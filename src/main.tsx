import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
const mode=new URLSearchParams(window.location.search).get('mode');
const useMobile=mode==='app'||mode==='daily'||mode==='chat'||(!mode&&window.matchMedia('(max-width:760px)').matches);
const App=lazy(()=>useMobile?import('./mobile/MobileApp'):Promise.all([import('./App'),import('./styles.css')]).then(([component])=>component));
ReactDOM.createRoot(document.getElementById('root')!).render(<Suspense fallback={<div style={{padding:30,textAlign:'center',color:'#193d34',fontFamily:'sans-serif'}}>时辰心管家 · 正在打开</div>}><App /></Suspense>);
