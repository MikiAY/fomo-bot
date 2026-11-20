'use strict';
const $=id=>document.getElementById(id), KEY='fomo-paper-v2';
const defaultState=()=>({cash:3,positions:{},history:[],seen:[],day:new Date().toISOString().slice(0,10),logs:[]});
let state;try{state=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('fomo-paper-v1'))||defaultState()}catch{state=defaultState()}
let running=false,timer=null,busy=false,latest=[],demoPrice={},lastScan=0;
const POLL_MS=15000, MAX_AGE_MIN=45, MAX_SEEN=600;
const fmt=n=>'$'+Number(n).toFixed(2), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function log(s){state.logs.unshift(new Date().toLocaleTimeString()+' '+s);state.logs=state.logs.slice(0,50);save();render()}
function config(){return {tp:Math.max(1,Math.min(500,Number($('tp').value)||30))/100,sl:Math.max(1,Math.min(99,Number($('sl').value)||15))/100,trade:Math.max(.05,Math.min(3,Number($('trade').value)||.5))}}
function price(p){return Number(p.priceUsd)||0}
function equity(){return state.cash+Object.values(state.positions).reduce((a,p)=>a+p.units*p.lastPrice,0)}
function dailyLoss(){let today=new Date().toISOString().slice(0,10);return state.history.filter(t=>t.day===today&&t.pnl<0).reduce((a,t)=>a-t.pnl,0)}
function render(){let eq=equity();$('equity').textContent=fmt(eq);$('cash').textContent='Cash '+fmt(state.cash);let pnl=eq-3;$('pnl').textContent=(pnl>=0?'+':'')+fmt(pnl);$('pnl').className='number '+(pnl>=0?'green':'red');$('positionCount').textContent=Object.keys(state.positions).length+' open positions';$('status').textContent=running?'● Auto scanning (foreground only)':'● Stopped';$('start').disabled=running;$('stop').disabled=!running;
$('openPositions').innerHTML=Object.entries(state.positions).map(([id,p])=>`<div class="item"><div class="row"><b>${esc(p.symbol)}</b><span class="${p.lastPrice>=p.entry?'green':'red'}">${((p.lastPrice/p.entry-1)*100).toFixed(1)}%</span></div><div class="tiny">${esc(id)}</div><div class="row"><small>Estimated value ${fmt(p.units*p.lastPrice)}</small><button class="sell" data-sell="${esc(id)}">Paper sell</button></div></div>`).join('')||'No open positions.';
$('trades').innerHTML=state.history.slice().reverse().map(t=>`<div class="item"><div class="row"><b>${esc(t.symbol)} · ${esc(t.reason)}</b><span class="${t.pnl>=0?'green':'red'}">${t.pnl>=0?'+':''}${fmt(t.pnl)}</span></div><div class="tiny">${esc(t.time)} · ${esc(t.address)}</div></div>`).join('')||'No trades yet.';
$('log').textContent=state.logs.join('\n');save()}
function demoPairs(){const names=['MOON','FROG','DOGE','PEPE','CAT'];return names.map((s,i)=>{let id='Demo'+i+'pump';demoPrice[id]=(demoPrice[id]||(.00001*(i+1)))*(1+(Math.random()-.47)*.09);return {chainId:'solana',dexId:'pumpswap',baseToken:{address:id,symbol:s},priceUsd:String(demoPrice[id]),pairCreatedAt:Date.now()-1000*60*(5+i*10),liquidity:{usd:25000+i*2000},volume:{m5:3500+i*100},txns:{m5:{buys:25+i,sells:12}},url:''}})}
async function getJSON(url){let ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);try{let r=await fetch(url,{signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timeout)}}
async function livePairs(){const profiles=await getJSON('https://api.dexscreener.com/token-profiles/latest/v1');let ids=[...new Set(profiles.filter(x=>x.chainId==='solana'&&x.tokenAddress?.endsWith('pump')).map(x=>x.tokenAddress))].slice(0,30);if(!ids.length)return [];let pairs=await getJSON('https://api.dexscreener.com/tokens/v1/solana/'+ids.join(','));return Array.isArray(pairs)?pairs:[]}
function narrative(p){
  // Transparent keyword heuristic; no X/Twitter or social verification.
  const text=[p.baseToken?.name,p.baseToken?.symbol,p.info?.websites?.map(x=>x.label).join(' '),p.info?.socials?.map(x=>x.type).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const themes={ai:/\b(ai|agent|gpt|robot|bot)\b/,animals:/\b(cat|dog|frog|pepe|shiba|inu|monkey)\b/,culture:/\b(meme|viral|trend|based)\b/,tech:/\b(solana|crypto|defi|pump)\b/};
  let matches=Object.entries(themes).filter(([k,re])=>re.test(text)).map(([k])=>k);
  let socials=(p.info?.socials||[]).length;
  return {themes:matches,score:Math.min(20,matches.length*5+Math.min(2,socials)*3),note:'Keyword-based only; no social trend verification'};
}
function rank(p){
  const tx=p.txns?.m5||{},b=Number(tx.buys)||0,s=Number(tx.sells)||0,age=(Date.now()-Number(p.pairCreatedAt))/60000;
  const n=narrative(p),ratio=b/Math.max(1,s);
  const momentum=Math.min(35,Math.round(Math.log10(1+Number(p.volume?.m5||0))*7+Math.min(10,ratio*3)));
  const activity=Math.min(25,Math.round(b/3));
  const fresh=Math.max(0,Math.round(20*(1-age/MAX_AGE_MIN)));
  return {score:n.score+momentum+activity+fresh,narrative:n};
}
function eligible(p){let age=(Date.now()-Number(p.pairCreatedAt))/60000,tx=p.txns?.m5||{};return p.chainId==='solana'&&['pumpswap','pumpfun'].includes(String(p.dexId).toLowerCase())&&p.baseToken?.address?.endsWith('pump')&&age>=0&&age<=MAX_AGE_MIN&&price(p)>0&&Number(p.liquidity?.usd)>=10000&&Number(p.volume?.m5)>=1500&&Number(tx.buys)>=12&&Number(tx.buys)/Math.max(1,Number(tx.sells))>=1.3}
function sell(id,reason){let p=state.positions[id];if(!p)return;let proceeds=p.units*p.lastPrice*.99,pnl=proceeds-p.cost;state.cash+=proceeds;state.history.push({symbol:p.symbol,address:id,reason,pnl,time:new Date().toLocaleString(),day:new Date().toISOString().slice(0,10)});delete state.positions[id];log('PAPER SELL '+p.symbol+' '+reason+' '+fmt(pnl));render()}
function updatePositions(pairs){for(let [id,p] of Object.entries(state.positions)){let match=pairs.filter(x=>x.baseToken?.address===id&&price(x)>0).sort((a,b)=>Number(b.liquidity?.usd||0)-Number(a.liquidity?.usd||0))[0];if(!match)continue;p.lastPrice=price(match);p.peak=Math.max(p.peak,p.lastPrice);let c=config(),change=p.lastPrice/p.entry-1;if(change<=-c.sl)sell(id,'STOP LOSS');else if(change>=c.tp)sell(id,'TAKE PROFIT');else if(p.lastPrice<=p.peak*.88)sell(id,'TRAILING STOP')}}
function buy(p){let c=config(),id=p.baseToken.address;if(state.positions[id]||state.cash<c.trade||Object.keys(state.positions).length||dailyLoss()>=.45)return;let cost=c.trade;state.cash-=cost;state.positions[id]={symbol:p.baseToken.symbol||'?',entry:price(p),lastPrice:price(p),peak:price(p),units:cost*.99/price(p),cost};state.seen.push(id);state.seen=state.seen.slice(-MAX_SEEN);log('PAPER BUY '+state.positions[id].symbol+' · score '+rank(p).score+' · '+fmt(cost));render()}
async function scan(){if(busy)return;busy=true;$('dataStatus').textContent='Scanning…';try{let demo=$('source').value==='demo',pairs=demo?demoPairs():await livePairs();latest=pairs;let held=Object.keys(state.positions);if(!demo&&held.length){for(let id of held){try{let hp=await getJSON('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(id));if(Array.isArray(hp))pairs.push(...hp)}catch(e){log('Position quote unavailable '+id+': '+e.message)}}}updatePositions(pairs);let qualified=pairs.filter(eligible).sort((a,b)=>rank(b).score-rank(a).score);$('tokens').innerHTML=qualified.slice(0,12).map(p=>`<div class="item"><div class="row"><div class="stack"><span class="symbol">${esc(p.baseToken.symbol)}</span><span class="tiny">${esc(p.baseToken.address)}</span></div><button class="buy" data-buy="${esc(p.baseToken.address)}">Paper buy</button></div><div class="tiny">Score ${rank(p).score}/100 · Themes: ${esc(rank(p).narrative.themes.join(', ')||'none')} · Liquidity ${fmt(p.liquidity.usd)} · 5m volume ${fmt(p.volume.m5)}</div></div>`).join('')||'<p class="muted">No qualifying tokens found in this scan. Latest profiles are not a complete launch feed.</p>';
if(running&&qualified.length&&Object.keys(state.positions).length===0){let p=qualified.find(x=>!state.seen.includes(x.baseToken.address)&&rank(x).score>=65);if(p)buy(p)}$('dataStatus').textContent=(demo?'DEMO simulated prices':'LIVE DexScreener public data')+' · '+pairs.length+' pairs checked · '+new Date().toLocaleTimeString();save();render()}
catch(e){$('dataStatus').textContent='Market data unavailable: '+e.message+'. Switch to Demo simulation to test. No automatic fallback to fake prices.';log('SCAN ERROR '+e.message)}finally{busy=false}}
$('start').onclick=()=>{running=true;log('Bot started');scan();timer=setInterval(scan,POLL_MS);render()};$('stop').onclick=()=>{running=false;clearInterval(timer);log('Bot stopped');render()};
$('tokens').onclick=e=>{let b=e.target.closest('[data-buy]');if(b){let p=latest.find(x=>x.baseToken?.address===b.dataset.buy);if(p)buy(p)}};
$('openPositions').onclick=e=>{let b=e.target.closest('[data-sell]');if(b)sell(b.dataset.sell,'MANUAL')};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');['scanner','positions','history','settings'].forEach(id=>$(id).classList.toggle('hide',id!==b.dataset.tab))});
$('reset').onclick=()=>{if(confirm('Reset ALL paper trading history and balance to $3?')){state=defaultState();save();render()}};
$('export').onclick=()=>{let blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fomo-paper-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){running=false;clearInterval(timer);log('Bot stopped: Safari hidden. Stops cannot execute in background.')}});
render();
