'use strict';
const control = window.nightSurvivorsControl = {mode:'auto',pauseRequested:false};
const params = new URLSearchParams(location.search);
if(['auto','touch','desktop'].includes(params.get('mode'))) control.mode=params.get('mode');
const mode=document.getElementById('control-mode');mode.value=control.mode;
const canvas=document.getElementById('canvas');
const requestPause=()=>{control.pauseRequested=true;};
const musicConfigURL=new URL('audio/music.json',document.baseURI);
let music=null,musicUnavailable=false,musicBlocked=false,musicPending=false,musicBackgroundHold=false;
let musicBridge=null,musicState={phase:'title',muted:false,run_id:0},musicNeedsRewind=false;
const musicStatus=window.nightSurvivorsMusicStatus={configured:false,state:'loading-config',source:null};
function musicWanted(){
  return launched&&!document.hidden&&!musicBackgroundHold&&['title','playing','levelup'].includes(musicState.phase);
}
function pauseMusic(){
  if(music){music.pause();if(!musicUnavailable)musicStatus.state='paused';}
}
function rewindMusic(){
  if(!music)return;
  try{music.currentTime=0;musicNeedsRewind=false;}catch{musicNeedsRewind=true;}
}
function tryMusicPlay(fromGesture=false){
  if(fromGesture)musicBlocked=false;
  if(!music||musicUnavailable)return;
  if(!musicWanted()){pauseMusic();return;}
  music.muted=musicState.muted;
  if(musicNeedsRewind)rewindMusic();
  if(musicBlocked||musicPending||!music.paused)return;
  try{
    // Called synchronously by the existing launch/pointer/key event handlers.
    const attempt=music.play();musicPending=true;
    Promise.resolve(attempt).then(()=>{
      if(!musicWanted())pauseMusic();
      else musicStatus.state=music.paused?'paused':'playing';
    }).catch(error=>{
      if(error?.name==='AbortError'||!musicWanted())return;
      musicBlocked=error?.name==='NotAllowedError';
      musicUnavailable=!musicBlocked;
      musicStatus.state=musicBlocked?'blocked':'unavailable';
    }).finally(()=>{musicPending=false;});
  }catch(error){
    musicBlocked=error?.name==='NotAllowedError';musicUnavailable=!musicBlocked;
    musicStatus.state=musicBlocked?'blocked':'unavailable';
  }
}
function syncMusicState(){
  const raw=window.nightSurvivorsAudioState;
  if(raw&&raw!==musicBridge){
    try{
      const next=typeof raw==='string'?JSON.parse(raw):raw;
      if(typeof next.phase==='string'&&typeof next.muted==='boolean'&&Number.isFinite(next.run_id)){
        if(next.run_id>musicState.run_id&&musicState.run_id>0)rewindMusic();
        if(next.phase==='playing'&&musicState.phase==='paused')musicBackgroundHold=false;
        musicState={phase:next.phase,muted:next.muted,run_id:next.run_id};
        musicBridge=raw;
      }
    }catch{}
  }
  if(music)music.muted=musicState.muted;
  musicStatus.muted=musicState.muted;
  tryMusicPlay();
}
function musicGesture(event){
  if(event&&event.isTrusted===false)return;
  musicBackgroundHold=false;syncMusicState();tryMusicPlay(true);
}
function suspendMusic(){musicBackgroundHold=true;pauseMusic();}
canvas.addEventListener('pointerdown',musicGesture,{capture:true,passive:true});
window.addEventListener('keydown',musicGesture,{capture:true});
window.addEventListener('blur',suspendMusic);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendMusic();});
setInterval(syncMusicState,100);
// A missing/empty configuration is intentional until a real audio file is supplied.
fetch(musicConfigURL.href,{cache:'no-store'}).then(response=>{
  if(!response.ok)throw new Error('Music configuration unavailable');
  return response.json();
}).then(config=>{
  if(typeof config.source!=='string'||!config.source.trim()){musicStatus.state='unconfigured';return;}
  const source=new URL(config.source,musicConfigURL);
  if(!['https:','http:'].includes(source.protocol))throw new Error('Unsupported audio URL');
  music=new Audio();music.loop=true;music.preload='none';
  music.volume=Number.isFinite(config.volume)?Math.max(0,Math.min(1,config.volume)):0.25;
  music.addEventListener('error',()=>{musicUnavailable=true;musicStatus.state='unavailable';music.pause();});
  music.addEventListener('loadedmetadata',()=>{if(musicNeedsRewind)rewindMusic();});
  music.src=source.href;
  musicStatus.configured=true;musicStatus.source=source.href;musicStatus.state='ready';
  syncMusicState();
}).catch(()=>{musicUnavailable=true;musicStatus.state='unavailable';});
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
launch.addEventListener('click',event=>{launched=true;launchedAt=performance.now();musicGesture(event);launch.disabled=true;launch.textContent='正在进入…';canvas.focus({preventScroll:true});});
const start=performance.now();
const loadPanel=document.getElementById('load-panel');
const loadHint=document.getElementById('load-hint');
const loadInfo=document.getElementById('infobox');
const retry=document.getElementById('retry-link');
const stages={runtime:'正在加载运行环境',resources:'正在下载游戏资源',preload:'正在准备游戏资源',ready:'准备好了，点击下方按钮进入',assets:'正在准备游戏画面',starting:'正在启动游戏'};
const stageOrder=['runtime','resources','preload','ready','assets','starting'];
let observedStage='runtime',previousStage='',lastActivity=start,failure=null,resourceObserver=null,lastDownloadBytes=-1;
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
  const download=window.nightSurvivorsRuntimeDownload;
  const downloading=stage==='runtime'&&download&&download.status!=='complete';
  if(downloading&&Number.isFinite(download.loadedBytes)&&download.loadedBytes!==lastDownloadBytes){
    lastDownloadBytes=download.loadedBytes;lastActivity=performance.now();
  }
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
  const total=downloading&&Number.isFinite(download.totalBytes)?download.totalBytes:0;
  const done=total?Math.max(0,Math.min(total,download.loadedBytes||0)):0;
  const downloaded=total?`${(done/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`:'';
  const infoText=total?`正在下载运行环境 ${downloaded} · ${Math.floor(done/total*100)}%`:stages[stage]+(waitingForClick?'':`… 已等待 ${seconds} 秒`);
  if(loadInfo.textContent!==infoText)loadInfo.textContent=infoText;
  retry.hidden=!(failure||slow);
  loadPanel.dataset.loadState=failure?'error':slow?'slow':'loading';
  let hintText;
  if(downloading&&download.status==='failed'){
    hintText='部分运行文件未能下载完成。点击重新加载重试，已保存的分块可复用。';
    retry.hidden=false;
  }else if(failure){
    const section=failure.stage==='runtime'?'运行环境':'游戏资源';
    hintText=`${section}加载遇到问题，可重新加载。若资源随后加载成功，页面会自动恢复。`;
  }else if(downloading&&download.status==='retrying'){
    hintText='连接刚刚中断，正在自动重试；本次已完成的下载会保留。';
  }else if(total){
    const progress=download.chunkCount?`${download.chunksDone||0} / ${download.chunkCount} 个分块`:`${download.filesDone||0} / ${download.fileCount||0} 个文件`;
    hintText=`首次下载可能需要一些时间，已完成 ${progress}。${download.cacheAvailable?'已保存的分块可在刷新后复用。':'请保持页面打开。'}`;
  }else if(slow){
    const section=stage==='runtime'?'运行环境':'游戏资源';
    hintText=`${section}仍在准备，可能是网络较慢。可继续等待，或点击下方重新加载。`;
  }else{
    hintText=waitingForClick?'点击进入即可开始，首次加载的资源已准备好。':'首次进入需要下载运行环境和游戏资源，请保持页面打开。';
  }
  if(loadHint.textContent!==hintText)loadHint.textContent=hintText;
  window.nightSurvivorsLoadDiagnostic={stage,elapsedSeconds:seconds,slow,error:failure?.detail||null,download:download?{...download}:null};
  return false;
}
renderLoading();
const readyTimer=setInterval(()=>{
  if(renderLoading()){
    clearInterval(readyTimer);resourceObserver?.disconnect();
    fitGame();canvas.focus({preventScroll:true});
  }
},250);
