import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('ios/App/App/public');
const original = readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = path.join(root, '_app/immutable');
const matches = [];
for (const relative of readdirSync(scripts, {recursive:true}).filter(p=>p.endsWith('.js'))) {
  const code = readFileSync(path.join(scripts, relative), 'utf8');
  if (!code.includes('startup-ready') || !code.includes('finishNativeStartup')) continue;
  const parsed = ts.createSourceFile(relative,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function find(node) {
    if (ts.isArrowFunction(node)) {
      const text = node.getText(parsed);
      if (text.includes('startup-ready') && text.includes('finishNativeStartup') && text.includes('cancelAnimationFrame') && text.includes('clearTimeout')) {
        matches.push({code, text, relative});
      }
    }
    ts.forEachChild(node,find);
  }
  find(parsed);
}
matches.sort((a,b)=>a.text.length-b.text.length);
const gate = matches[0];
if (!gate || gate.text.length>1500 || !gate.text.includes('shownAt')) throw Error('Cannot isolate the packaged Svelte onMount callback');
const gateUrl = '/_app/immutable/'+path.posix.dirname(gate.relative.replaceAll('\\','/'))+'/qa-observed-gate.js';
const verifiedHash = createHash('sha256').update(gate.text).digest('hex');
const content = gate.code + '\nexport const observedGate = '+gate.text+';\n';
const host = 'http://127.0.0.1:8794';

async function exercise(mode, moduleUrl) {
  const timer=window.setTimeout.bind(window);
  const wait=ms=>new Promise(resolve=>timer(resolve,ms));
  const element=document.getElementById('app-startup');
  const data={mode,viewport:innerWidth};
  function sampleAssets(){
    const bg=element.querySelector('[data-startup-bg]');
    const title=element.querySelector('[data-startup-title]');
    const label=element.querySelector('[data-startup-loading]');
    const spinner=element.querySelector('.startup-spinner');
    if(!data.artAt && bg?.naturalWidth && title?.naturalWidth && label?.getBoundingClientRect().height && spinner?.getBoundingClientRect().width && getComputedStyle(element).opacity>0) data.artAt=performance.now();
    if(element.isConnected && !data.artAt) requestAnimationFrame(sampleAssets);
  }
  requestAnimationFrame(sampleAssets);
  const observer=new MutationObserver(()=>{
    if(data.fadeAt===undefined && element.classList.contains('startup-ready')) data.fadeAt=performance.now();
    if(!element.isConnected && data.removedAt===undefined) data.removedAt=performance.now();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  const nativeSet=window.setTimeout;
  window.setTimeout=function(action,delay,...args) {
    if(typeof action==='function' && Function.prototype.toString.call(action).includes('startup-ready')) {
      data.scheduledAt=performance.now(); data.scheduledDelay=delay;
    }
    return Reflect.apply(nativeSet,this,[action,delay,...args]);
  };
  try {
    const {observedGate}=await import(moduleUrl);
    for(let i=0;i<120&&!element.dataset.shownAt;i++) await wait(20);
    data.shownAt=Number(element.dataset.shownAt);
    if(mode==='slow') await wait(Math.max(0,data.shownAt+2450-performance.now()));
    observedGate();
    for(let i=0;i<240 && data.removedAt===undefined;i++) await wait(30);
  } finally { observer.disconnect(); window.setTimeout=nativeSet; }
  return data;
}

const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const evidence=[];
let finish; const completed=new Promise(resolve=>{finish=resolve;});
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,host).pathname;
  try {
    if(pathname==='/__result' && req.method==='POST'){
      const chunks=[];for await(const c of req)chunks.push(c);
      evidence.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200);res.end('ok');if(evidence.length>=2 || evidence.at(-1).error)finish();return;
    }
    if(pathname==='/'){
      res.setHeader('Content-Type',mime['.html']);res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">try { await import('+JSON.stringify(gateUrl)+'); location.replace("/fast"); } catch(e) { await fetch("/__result",{method:"POST", body:JSON.stringify({error:String(e)})}); }</script>');return;
    }
    if(pathname==='/fast'||pathname==='/slow'){
      const mode=pathname.slice(1);
      const prelude='<script>document.documentElement.dataset.nativeApp="true";</script>';
      const run='<script type="module">Promise.resolve(('+exercise.toString()+')('+JSON.stringify(mode)+','+JSON.stringify(gateUrl)+')).catch(e=>({error:String(e)})).then(async out=>{await fetch("/__result",{method:"POST",body:JSON.stringify(out)});if(out.mode==="fast")location.replace("/slow");});</script>';
      let removed=0;
      const html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,block=>{if(!block.includes('kit.start(app, element)'))return block; removed++;return run;}).replace('<head>','<head>'+prelude);
      if(removed!==1)throw Error('Expected the single Svelte bootstrap');
      res.setHeader('Content-Type',mime['.html']);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline' data:; connect-src 'self'");res.end(html);return;
    }
    if(pathname===gateUrl){res.setHeader('Content-Type',mime['.js']);res.end(content);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(pathname));
    if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=3600');res.end(readFileSync(file));
  } catch(e){res.writeHead(500);res.end(String(e));finish();}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(8794,'127.0.0.1',ok)});
let browser,timeout;
try {
  if(process.env.TUTAM_QA_SIMULATOR)execFileSync('xcrun',['simctl','openurl',process.env.TUTAM_QA_SIMULATOR,host]);
  else {const {webkit}=await import('playwright');browser=await webkit.launch();const page=await browser.newPage({viewport:{width:402,height:874}});await page.goto(host);}
  timeout=setTimeout(finish,55000);
  await completed;
  const out={compiledOwnerSha256:verifiedHash,cases:evidence};
  console.log(JSON.stringify(out));
  if(process.env.TUTAM_QA_SIMULATOR)writeFileSync('build/release-evidence/startup-controlled-webkit.json',JSON.stringify(out));
  if(evidence.length!==2)throw Error('Missing early/delayed WebKit readiness cases');
  for(const [idx,d] of evidence.entries()){
    if(d.error || !['shownAt','scheduledAt','scheduledDelay','fadeAt','removedAt','artAt'].every(k=>Number.isFinite(d[k])))throw Error('Startup did not complete '+JSON.stringify(d));
    const expected=Math.max(0,1600-(d.scheduledAt-d.shownAt));
    if(Math.abs(expected-d.scheduledDelay)>10 || d.fadeAt+10<d.scheduledAt+expected || d.fadeAt>d.scheduledAt+expected+250 || d.removedAt-d.fadeAt<205 || d.removedAt-d.fadeAt>400 || d.fadeAt-d.artAt<1200)throw Error('Actual timer / CSS removal sequence '+JSON.stringify(d));
    if(idx===0 && (d.mode!=='fast'||d.scheduledDelay<100||d.removedAt-d.shownAt>2050||d.removedAt-d.shownAt<1750))throw Error('Fast ready path '+JSON.stringify(d));
    if(idx===1 && (d.mode!=='slow'||d.scheduledAt-d.shownAt<2300||d.scheduledDelay>10))throw Error('Delayed gate must use zero extra hold '+JSON.stringify(d));
  }
} finally { clearTimeout(timeout);await browser?.close();server.closeAllConnections();server.close(); }
