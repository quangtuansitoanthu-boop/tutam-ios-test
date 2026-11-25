// Exercise the packaged journal in Safari on the iPhone Simulator using loopback fixtures.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve('ios/App/App/public');
const practiceHistory = process.argv.includes('--practice-history');
const port = practiceHistory ? 8796 : 8793;
const origin = 'http://127.0.0.1:'+port;
const member = { id: 'qa-journal', role: 'user', displayName: 'QA', avatarUrl: '', email: '' };
let finish;
const result = new Promise(resolve => { finish = resolve; });
const posts = [];
const requests = [];

function exercisePracticeHistory() {
  const seen = (sel) => [...document.querySelectorAll(sel)].find(n=>n.getClientRects().length);
  const wait=async (name,f)=>{for(let i=0;i<350;i++){const n=f();if(n)return n; const later=[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.trim()==='Để sau');later?.click();await new Promise(r=>setTimeout(r,80));}throw Error(name+' @ '+location.href+' '+document.body.innerText.slice(0,140));};
  async function test() {
    (await wait('chapter practice',()=>seen('.tt-reader-practice-btn'))).click();
    (await wait('begin',()=>seen('.practice-confirm__primary'))).click();
    const handle=await wait('fab',()=>seen('.ttr-toggle-btn'));
    const group=handle.closest('.ttr-fabs');
    if(group.classList.contains('panel-open'))handle.click();
    await wait('collapsed',()=>!group.classList.contains('panel-open'));
    await new Promise(r=>setTimeout(r,450));
    const r=group.getBoundingClientRect(),h=handle.getBoundingClientRect();
    const hits=[];
    for(const delta of [-8,-20,-36,8]){
      const x=h.x+h.width/2,y=delta<0?h.y+delta:h.bottom+delta;
      const t=document.elementFromPoint(x,y);
      hits.push({x,y,delta,class:t?.className,reader:!!t?.closest('.tt-practice,.reader-content,.tt-reader'),within:group.contains(t)});
    }
    if(h.width<44||h.height<44||r.width>h.width+2||r.height>h.height+12)throw Error('collapsed reader control geometry '+JSON.stringify([r,h]));
    if(hits.some(hit=>hit.within||!hit.reader))throw Error('reader surface intercepted '+JSON.stringify(hits));
    handle.click();await wait('expanded',()=>group.classList.contains('panel-open'));
    return {passed:true,reloaded:true,group:r.toJSON(),handle:h.toJSON(),hits,under:document.elementsFromPoint(h.x+h.width/2,h.y-10).slice(0,5).map(n=>n.className)};
  }
  addEventListener('DOMContentLoaded',()=>{test().catch(e=>({passed:false,reason:String(e)})).then(r=>fetch('/__qa-result',{method:'POST',body:JSON.stringify(r)}))},{once:true});
}

function exercise() {
  const wait = async (name, verify) => {
    for (let i=0;i<240;i++) {
      const later=[...document.querySelectorAll('dialog[open] button')].find(el=>el.textContent.trim()==='Để sau');
      if(later)later.click();
      const v=verify(); if(v) return v; await new Promise(r=>setTimeout(r,150));
    }
    const dialogs=[...document.querySelectorAll('dialog[open]')].map(el=>el.getAttribute('aria-label')||el.querySelector('h1,h2,h3')?.textContent||el.className);
    const status=[...document.querySelectorAll('.personal-journal [role=status],.personal-journal p.notice')].map(el=>el.textContent.trim()).filter(Boolean);
    throw new Error(name+'; dialogs '+JSON.stringify(dialogs)+'; journal notices '+JSON.stringify(status)+'; current page '+location.pathname);
  };
  const visible = el => el && el.getClientRects().length > 0;
  const select = (selector, parent=document) => [...parent.querySelectorAll(selector)].find(visible);
  const input = (el, value) => { el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); };
  const btn = (parent, label) => [...parent.querySelectorAll('button')].find(el=>visible(el)&&el.textContent.trim()===label&&!el.disabled);
  const exact = 'Đã gửi bài, vui lòng chờ quản trị viên duyệt trong 48 giờ !';
  const raw = window.fetch.bind(window);
  window.fetch = (resource, init) => {
    const url=new URL(resource instanceof Request ? resource.url : resource,location.href);
    if(url.pathname.startsWith('/api/')) return raw(location.origin+url.pathname+url.search, init);
    if(url.origin!==location.origin) return Promise.resolve(new Response('{}',{status:503}));
    return raw(resource,init);
  };
  async function test() {
    await wait('app mounted',()=>document.querySelector('[data-mounted="1"]'));
    (await wait('journal entry',()=>select('.tt-mode-card--reflection'))).click();
    const acceptedGuides = new WeakSet();
    await wait('authenticated journal ready', () => {
      const guide = select('.personal-journal [data-testid=reflection-guide]');
      if (guide && !acceptedGuides.has(guide)) {
        const action = btn(guide, 'Tôi đã hiểu, Bắt đầu quán chiếu →');
        if (action) {
          acceptedGuides.add(guide);
          action.click();
        }
      }
      return select('#panel-repentance textarea') && !document.querySelector('.personal-journal p.notice');
    });
    input(await wait('nickname',()=>select('input[aria-label="Biệt danh đồng tu"]')),'Đồng Tu QA');
    const evidence=[];
    for(const [id,share] of [['repentance','Gửi cộng đồng sám hối'],['good-deed','Chia sẻ việc lành']]){
      document.querySelector('#tab-'+id).click();
      const panel=await wait('active panel '+id,()=>select('#panel-'+id));
      const textarea=select('textarea',panel);
      const editorHeight=textarea.getBoundingClientRect().height;
      const snippets=[...panel.querySelectorAll('.snippet-pill')].filter(visible);
      const minSnippet=snippets.length ? Math.min(...snippets.flatMap(el=>{
        const {width,height}=el.getBoundingClientRect();return [width,height];
      })) : 0;
      if(editorHeight<280 || minSnippet<44)throw Error('journal layout '+JSON.stringify({id,editorHeight,minSnippet}));
      input(textarea,'Hôm nay tôi tập lắng nghe và giữ tâm an lành. '.repeat(6));
      const send=await wait('send '+id,()=>btn(panel,share));send.scrollIntoView({block:'center'});send.click();
      (await wait('confirm '+id,()=>btn(document,'Đồng ý chia sẻ'))).click();
      const dlg=await wait('48 hour alert '+id,()=>{const node=select('dialog[data-app-message]');return node?.querySelector('p')?.textContent===exact&&node});
      const close=btn(dlg,'Đóng'); if(!close)throw Error('missing close');
      close.click();
      await wait('success dialog dismissed',()=>!select('dialog[data-app-message]'));
      const card=await wait('compact receipt '+id,()=>select('.journal-pending',panel));
      const toggle=btn(card,'Chi tiết');
      if(!toggle||toggle.getAttribute('aria-expanded')!=='false'||select('time',card)||!card.textContent.includes('Đã gửi bài · Chờ duyệt'))throw Error('initial compact state '+id);
      const height=card.getBoundingClientRect().height;if(height>52)throw Error('oversized card '+height);
      toggle.click();
      const deadline=await wait('48h date '+id,()=>{const d=card.querySelectorAll('time');return d.length===2&&Date.parse(d[1].dateTime)-Date.parse(d[0].dateTime)===48*3600000});
      btn(card,'Thu gọn').click();
      await wait('collapse '+id,()=>!select('time',card));
      evidence.push({id,height,deadline,editorHeight,minSnippet});
    }
    return {passed:true,evidence,width:innerWidth};
  }
  addEventListener('DOMContentLoaded',()=>{test().catch(e=>({passed:false,reason:String(e)})).then(out=>raw('/__qa-result',{method:'POST',body:JSON.stringify(out)}));},{once:true});
}

const types={'.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.otf':'font/otf','.ttf':'font/ttf','.webp':'image/webp','.html':'text/html; charset=utf-8'};
const server=createServer(async (req,res)=>{
  const url=new URL(req.url,origin), route=url.pathname;
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(route.startsWith('/api/'))requests.push(req.method+' '+route);
  try {
    if(req.method==='POST'){
      const parts=[];for await(const b of req)parts.push(b);
      const body=JSON.parse(Buffer.concat(parts).toString()||'{}');
      if(route==='/__qa-result'){json({ok:true});finish({...body,posts,requests:requests.slice(-45)});return}
      if(route==='/api/practice/mindful-posts'){
        posts.push(body.kind);const createdAt=new Date().toISOString();
        json({post:{...body,id:body.clientPostId,isOwn:true,status:'hidden',reviewState:'pending',reviewRevision:1,createdAt,reviewDueAt:new Date(Date.parse(createdAt)+48*3600000).toISOString(),publishedAt:null,reviewReason:null,reactionCount:0,viewerReacted:false},accountLocked:false});return;
      }
      json({});return;
    }
    if(route==='/api/session'||route==='/api/auth/session'){json({authenticated:true,user:member,csrfToken:'qa-fixture',expiresAt:'2099-01-01T00:00:00.000Z'});return}
    if(route.startsWith('/api/')){if(practiceHistory) json({error:'Offline fixture'},503);else json({items:[],nextCursor:null});return}
    let file=path.resolve(root,'.'+decodeURIComponent(route));
    if(file!==root&&!file.startsWith(root+path.sep)){json({},400);return}
    if(!existsSync(file)||!statSync(file).isFile()){
      if(path.extname(route)){json({},404);return}file=path.join(root,'index.html');
    }
    const bytes=readFileSync(file);
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    if(file===path.join(root,'index.html')){
      res.setHeader('Set-Cookie','quangtu_session=qa-local-fixture; Path=/; HttpOnly; SameSite=Lax');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Security-Policy',"connect-src 'self'; worker-src 'none'");
      res.end(bytes.toString().replace('<head>','<head><script>('+(practiceHistory ? exercisePracticeHistory : exercise).toString()+')()</script>'));return;
    }
    res.end(bytes);
  }catch {json({error:'fixture'},500)}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)});
let browser;
try{
 if(process.env.TUTAM_QA_SIMULATOR) execFileSync('xcrun',['simctl','openurl',process.env.TUTAM_QA_SIMULATOR,origin+'/tu-tap?muc=kinh&article=tt_1780910773084&chap=3']);
 else {
   const playwright=await import('playwright');browser=await playwright[process.env.TUTAM_QA_BROWSER || 'chromium'].launch();
   const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
   await page.goto(origin+'/tu-tap?muc=kinh&article=tt_1780910773084&chap=3');
 }
 const timer=setTimeout(()=>finish({passed:false,reason:'Fixture timed out',posts,requests:requests.slice(-45)}),115000);let out;
 try{out=await result}finally{clearTimeout(timer)}
 console.log(JSON.stringify(out));
 if(process.env.TUTAM_QA_SIMULATOR)writeFileSync('build/release-evidence/'+(practiceHistory?'reader-hit-test.json':'journal-webkit.json'),JSON.stringify(out));
 if(!out.passed||(practiceHistory ? !out.reloaded : out.posts?.join(',')!=='repentance,good_deed'))process.exitCode=1;
}finally{await browser?.close();server.closeAllConnections();server.close();}
