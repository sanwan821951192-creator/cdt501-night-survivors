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
const launch=document.getElementById('launch-button');let launched=false;
launch.addEventListener('click',()=>{launched=true;launch.disabled=true;launch.textContent='正在进入…';canvas.focus({preventScroll:true});});
const start=performance.now();
const readyTimer=setInterval(()=>{
  if(window.nightSurvivorsReady){document.body.dataset.ready='true';document.getElementById('load-panel').hidden=true;clearInterval(readyTimer);fitGame();canvas.focus({preventScroll:true});return;}
  if(window.nightSurvivorsRuntimeReady&&!launched){launch.disabled=false;launch.textContent='进入游戏';document.getElementById('infobox').textContent='准备好了，点击下方按钮进入';}
  if(launched){document.getElementById('infobox').textContent='正在准备游戏画面…';}
  if(performance.now()-start>30000){document.getElementById('load-hint').textContent='加载较慢，请保持网络连接。若一直无法进入，可重新加载。';document.getElementById('retry-link').hidden=false;}
},120);
window.addEventListener('error',e=>{if(!window.nightSurvivorsReady&&e.target?.tagName==='SCRIPT'){document.getElementById('load-hint').textContent='游戏资源加载失败，请检查网络后重试。';document.getElementById('retry-link').hidden=false;}},true);
