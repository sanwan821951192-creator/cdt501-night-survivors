'use strict';
const control = window.nightSurvivorsControl = {mode:'auto',pauseRequested:false};
const params = new URLSearchParams(location.search);
if(['auto','touch','desktop'].includes(params.get('mode'))) control.mode=params.get('mode');
const mode=document.getElementById('control-mode');mode.value=control.mode;
const canvas=document.getElementById('canvas');
const requestPause=()=>{control.pauseRequested=true;};
const musicButton=document.getElementById('music-button');
const musicPanel=document.getElementById('music-panel');
const musicPlayer=document.getElementById('music-player');
musicButton.addEventListener('click',()=>{
  const opening=musicPanel.hidden;
  requestPause();
  musicPanel.hidden=!opening;
  document.body.dataset.musicOpen=String(opening);
  musicButton.setAttribute('aria-expanded',String(opening));
  musicButton.textContent=opening?'关音乐':'音乐';
  musicPlayer.src=opening?'https://www.youtube.com/embed/NhTxeM3-hB8?autoplay=1&loop=1&playlist=NhTxeM3-hB8&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin):'about:blank';
  fitGame();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&!musicPanel.hidden)musicPlayer.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube.com');
});
function fitGame(){
  const r=document.getElementById('playfield').getBoundingClientRect();
  const scale=Math.max(.1,Math.min(r.width/390,r.height/700,1.35));
  const s=document.documentElement.style;
  s.setProperty('--game-width',`${390*scale}px`);s.setProperty('--game-height',`${700*scale}px`);
  s.setProperty('--game-left',`${r.left+r.width/2}px`);s.setProperty('--game-top',`${r.top+r.height/2}px`);
}
new ResizeObserver(fitGame).observe(document.getElementById('playfield'));
window.addEventListener('resize',fitGame);window.visualViewport?.addEventListener('resize',fitGame);fitGame();
window.addEventListener('blur',requestPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)requestPause();});
canvas.addEventListener('touchcancel',requestPause,{passive:true});
canvas.addEventListener('pointercancel',requestPause,{passive:true});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
mode.addEventListener('change',()=>{control.mode=mode.value;canvas.focus({preventScroll:true});});
const help=document.getElementById('help-dialog');
document.getElementById('help-button').addEventListener('click',()=>{requestPause();help.showModal();});
document.getElementById('close-help').addEventListener('click',()=>help.close());
help.addEventListener('close',()=>canvas.focus({preventScroll:true}));
const message=document.getElementById('web-message');let messageTimer;
function announce(text){message.textContent=text;message.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>message.hidden=true,4500);}
document.getElementById('fullscreen-button').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else announce('当前浏览器不支持网页全屏，可直接在此游玩。');}catch{announce('暂时无法全屏，可直接在此游玩。');}
  canvas.focus({preventScroll:true});fitGame();
});
document.addEventListener('fullscreenchange',()=>{document.getElementById('fullscreen-button').textContent=document.fullscreenElement?'退出全屏':'全屏';fitGame();});
const launch=document.getElementById('launch-button');let launched=false,launchedAt=0;
launch.addEventListener('click',()=>{launched=true;launchedAt=performance.now();launch.disabled=true;launch.textContent='正在进入…';canvas.focus({preventScroll:true});});
const start=performance.now();
const loadPanel=document.getElementById('load-panel');
const loadHint=document.getElementById('load-hint');
const loadInfo=document.getElementById('infobox');
const retry=document.getElementById('retry-link');
const stages={runtime:'正在加载运行环境',resources:'正在下载游戏资源',preload:'正在准备游戏资源',ready:'准备好了，点击下方按钮进入',assets:'正在准备游戏画面',starting:'正在启动游戏'};
const stageOrder=['runtime','resources','preload','ready','assets','starting'];
let observedStage='runtime',previousStage='',lastActivity=start,failure=null,resourceObserver=null;
loadHint.setAttribute('role','status');loadHint.setAttribute('aria-live','polite');

function startupResource(value){
  try{
    const url=new URL(typeof value==='string'?value:value.url,document.baseURI);
    const path=url.pathname.toLowerCase();
    const name=path.split('/').pop();
    if(/\.(tar\.gz|apk)$/.test(path))return {stage:'resources',name,url:url.href};
    if(/\.(wasm|data|whl)$/.test(path)||/(pythons|browserfs|cpython|pythonrc|vtx|vt\.js|index-0\.9\.3)/.test(path))return {stage:'runtime',name,url:url.href};
  }catch{}
  return null;
}

function currentLoadStage(){
  if(window.nightSurvivorsRuntimeReady&&!launched)return 'ready';
  const explicit=window.nightSurvivorsLoadStage;
  if(launched&&(!explicit||explicit==='ready'))return 'assets';
  return stageOrder.includes(explicit)?explicit:observedStage;
}

function reportLoadError(stage,detail){
  if(window.nightSurvivorsReady)return;
  const text=String(detail?.message||detail||'');
  failure={stage:stageOrder.includes(stage)?stage:currentLoadStage(),detail:text.slice(0,300)};
  renderLoading();
}
window.nightSurvivorsReportLoadError=reportLoadError;
for(const item of window.nightSurvivorsLoadErrors||[])reportLoadError(item.stage,item.detail);
window.nightSurvivorsLoadErrors=[];

function noteResource(resource,status=0){
  if(!resource||window.nightSurvivorsReady)return;
  observedStage=resource.stage;lastActivity=performance.now();
  if(status>=400)reportLoadError(resource.stage,`${resource.name} HTTP ${status}`);
  else if(status>=200&&status<400&&failure?.detail.includes(resource.name))failure=null;
}

// Observe failures without consuming response bodies or changing fetch options.
// This also catches WASM/data fetches which do not dispatch a script error event.
const originalFetch=window.fetch;
if(originalFetch)window.fetch=function(input,init){
  const resource=startupResource(input);
  const request=originalFetch.call(this,input,init);
  if(!resource)return request;
  observedStage=resource.stage;
  return request.then(response=>{noteResource(resource,response.status);return response;},error=>{
    if(error?.name!=='AbortError')reportLoadError(resource.stage,`${resource.name}: ${error?.message||'network error'}`);
    throw error;
  });
};

// Buffered entries cover requests which finished before this deferred script ran.
if(window.PerformanceObserver){
  try{
    resourceObserver=new PerformanceObserver(list=>{
      for(const entry of list.getEntries())noteResource(startupResource(entry.name),entry.responseStatus||0);
    });
    resourceObserver.observe({type:'resource',buffered:true});
  }catch{}
}
window.addEventListener('error',event=>{
  if(window.nightSurvivorsReady)return;
  const source=event.target?.src||event.filename;
  const resource=source&&startupResource(source);
  if(resource)reportLoadError(resource.stage,`${resource.name}: ${event.message||'script load error'}`);
  else if(event.target?.tagName==='SCRIPT')reportLoadError('runtime','script load error');
  else if(/WebAssembly|wasm|CompileError|LinkError/i.test(event.message||''))reportLoadError('runtime',event.message);
},true);
window.addEventListener('unhandledrejection',event=>{
  if(window.nightSurvivorsReady)return;
  const reason=event.reason;
  if(reason?.name==='AbortError')return;
  if(reason?.name==='NotAllowedError'&&/play|audio|media|gesture/i.test(reason.message||''))return;
  reportLoadError(currentLoadStage(),reason?.message||reason);
});

function renderLoading(){
  if(window.nightSurvivorsReady){
    document.body.dataset.ready='true';loadPanel.hidden=true;
    failure=null;retry.hidden=true;delete loadPanel.dataset.loadState;
    window.nightSurvivorsLoadDiagnostic={stage:'complete',elapsedSeconds:Math.floor((performance.now()-start)/1000),slow:false,error:null};
    return true;
  }
  const stage=currentLoadStage();
  if(stage!==previousStage){
    lastActivity=performance.now();previousStage=stage;
    if(failure&&stageOrder.indexOf(stage)>stageOrder.indexOf(failure.stage))failure=null;
  }
  const seconds=Math.floor((performance.now()-(launched?launchedAt:start))/1000);
  const waitingForClick=stage==='ready'&&!launched;
  const slow=!waitingForClick&&(performance.now()-lastActivity>30000||seconds>=60);
  if(waitingForClick){
    failure=null;launch.disabled=false;launch.textContent='进入游戏';
  }else if(!launched){
    launch.disabled=true;launch.textContent=stage==='runtime'?'正在加载运行环境…':'正在准备资源…';
  }
  const infoText=stages[stage]+(waitingForClick?'':`… 已等待 ${seconds} 秒`);
  if(loadInfo.textContent!==infoText)loadInfo.textContent=infoText;
  retry.hidden=!(failure||slow);
  loadPanel.dataset.loadState=failure?'error':slow?'slow':'loading';
  let hintText;
  if(failure){
    const section=failure.stage==='runtime'?'运行环境':'游戏资源';
    hintText=`${section}加载遇到问题，可重新加载。若资源随后加载成功，页面会自动恢复。`;
  }else if(slow){
    const section=stage==='runtime'?'运行环境':'游戏资源';
    hintText=`${section}仍在准备，可能是网络较慢。可继续等待，或点击下方重新加载。`;
  }else{
    hintText=waitingForClick?'点击进入即可开始，首次加载的资源已准备好。':'首次进入需要下载运行环境和游戏资源，请保持页面打开。';
  }
  if(loadHint.textContent!==hintText)loadHint.textContent=hintText;
  window.nightSurvivorsLoadDiagnostic={stage,elapsedSeconds:seconds,slow,error:failure?.detail||null};
  return false;
}
renderLoading();
const readyTimer=setInterval(()=>{
  if(renderLoading()){
    clearInterval(readyTimer);resourceObserver?.disconnect();
    fitGame();canvas.focus({preventScroll:true});
  }
},250);
