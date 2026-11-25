// Exercise the packaged journal in Safari on the iPhone Simulator using loopback fixtures.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve('ios/App/App/public');
const practiceHistory = process.argv.includes('--practice-history');
const initialFocus = process.argv.includes('--initial-focus');
const port = initialFocus ? 8795 : practiceHistory ? 8794 : 8793;
const origin = 'http://127.0.0.1:'+port;
const member = { id: 'qa-journal', role: 'user', displayName: 'QA', avatarUrl: '', email: '' };
let finish;
const result = new Promise(resolve => { finish = resolve; });
const posts = [];
const requests = [];

function exerciseInitialNotificationFocus() {
  const visible = n => n && n.getClientRects().length > 0;
  const prompt = () => [...document.querySelectorAll('dialog.notification-modal-card[open]')].find(visible);
  let permissionChecks = 0;
  Object.defineProperty(window,'Notification',{configurable:true,value:class {
    static get permission() { permissionChecks++; return 'default'; }
  }});
  const wait = async (name, read) => {
    for(let i=0;i<400;i++){const v=read();if(v)return v;await new Promise(r=>setTimeout(r,60));}
    throw Error(name+', permission reads '+permissionChecks+', active '+document.activeElement?.tagName);
  };
  async function scenario() {
    const field = await wait('library search',()=>document.querySelector('.search-input'));
    field.focus();
    if(document.activeElement!==field)throw Error('iPhone Safari did not focus the search field');
    field.value='kinh';
    field.dispatchEvent(new Event('input',{bubbles:true}));
    const before=permissionChecks;
    await wait('automatic permission check while focused',()=>permissionChecks>before);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(prompt() || document.activeElement!==field || field.value!=='kinh')throw Error('startup dialog interrupted input');
    field.blur();
    const dialog=await wait('automatic prompt after editing',prompt);
    if(field.value!=='kinh')throw Error('typed text lost after blur');
    return {passed:true,permissionChecks,retained:field.value,dialog:dialog.getAttribute('aria-label')};
  }
  addEventListener('DOMContentLoaded',()=>{
    scenario().catch(e=>({passed:false,reason:String(e)})).then(result=>
      fetch('/__qa-result',{method:'POST',body:JSON.stringify(result)}));
  },{once:true});
}

function exercisePracticeHistory() {
  const visible = node => node && node.getClientRects().length > 0;
  const all = selector => [...document.querySelectorAll(selector)].filter(visible);
  const current = () => location.pathname + location.search;
  const find = async (label, read) => {
    for (let i = 0; i < 200; i++) {
      const permission = all('dialog[open] button').find(b => b.textContent.trim() === 'Để sau');
      if (permission) permission.click();
      const value = read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    throw Error(label + ' at ' + current() + ', heading ' + (all('h1').map(x=>x.textContent).join(' | ')));
  };
  const click = async (name, locate) => {
    const control = await find(name, locate);
    control.scrollIntoView({block:'center'});
    control.click();
  };
  const card = () => all('.tt-grid .tt-card').find(n => n.textContent.toLocaleUpperCase('vi').includes('ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN'));
  const toc = () => all('.tt-preview__toc-list > button')[0];
  const back = () => all('.tt-topbar .tt-back-btn,.qts-nav .nav-back-circle-btn')[0];
  const hub = () => all('.tt-mode-card--kinh')[0] && all('.tt-page-header .tt-page-title')[0] && current()==='/tu-tap';
  const marker = 'tutam-simulator-history-reload';
  const cleanSearch = () => !new URL(location.href).searchParams.has('chap');
  async function scenario() {
    await find('mounted visit', () => document.querySelector('[data-mounted="1"]'));
    const prior = sessionStorage.getItem(marker);
    if (prior) {
      await find('reload must reopen the hub', hub);
      const path = JSON.parse(prior);
      sessionStorage.removeItem(marker);
      return {passed:true,path:[...path,current()],reloaded:true};
    }
    const path = [];
    await find('reading hub with clean URL', hub);
    path.push(current());
    await click('choose reading category', () => all('.tt-mode-card--kinh')[0]);
    await find('list route and offline article', () => new URL(location.href).searchParams.get('muc')==='kinh' && card());
    path.push(current());
    await click('open Earth Store Sutra',card);
    await find('table of contents',toc);
    path.push(current());
    await click('open chapter',toc);
    await find('chapter URL and rendered text', () => new URL(location.href).searchParams.has('chap') && all('.tt-reader-chapter-title')[0]);
    path.push(current());
    await click('return to chapters', () => all('.tt-reader-back-btn')[0]);
    await find('chapter cleared and contents visible', () => cleanSearch() && toc());
    path.push(current());
    await click('header Back to reading category',back);
    await find('category restored', () => current()==='/tu-tap?muc=kinh' && card());
    path.push(current());
    await click('header Back to practice hub',back);
    await find('hub must clear category query',hub);
    path.push(current());
    sessionStorage.setItem(marker,JSON.stringify(path));
    location.reload();
    return new Promise(()=>{});
  }
  addEventListener('DOMContentLoaded',()=>{
    scenario().catch(e=>({passed:false,reason:String(e)})).then(result=>
      fetch('/__qa-result',{method:'POST',body:JSON.stringify(result)}));
  },{once:true});
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
      res.end(bytes.toString().replace('<head>','<head><script>('+(initialFocus ? exerciseInitialNotificationFocus : practiceHistory ? exercisePracticeHistory : exercise).toString()+')()</script>'));return;
    }
    res.end(bytes);
  }catch {json({error:'fixture'},500)}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)});
let browser;
try{
 if(process.env.TUTAM_QA_SIMULATOR) execFileSync('xcrun',['simctl','openurl',process.env.TUTAM_QA_SIMULATOR,origin+(initialFocus?'/kinh-sach':'/tu-tap')]);
 else {
   const playwright=await import('playwright');browser=await playwright[process.env.TUTAM_QA_BROWSER || 'chromium'].launch();
   const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
   await page.goto(origin+(initialFocus?'/kinh-sach':'/tu-tap'));
 }
 const timer=setTimeout(()=>finish({passed:false,reason:'Fixture timed out',posts,requests:requests.slice(-45)}),115000);let out;
 try{out=await result}finally{clearTimeout(timer)}
 console.log(JSON.stringify(out));
 if(process.env.TUTAM_QA_SIMULATOR)writeFileSync('build/release-evidence/'+(initialFocus?'initial-focus.json':practiceHistory?'practice-history.json':'journal-webkit.json'),JSON.stringify(out));
 if(!out.passed||(initialFocus ? !out.permissionChecks : practiceHistory ? !out.reloaded : out.posts?.join(',')!=='repentance,good_deed'))process.exitCode=1;
}finally{await browser?.close();server.closeAllConnections();server.close();}
