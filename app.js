import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';
import { GUESTS, setupGuests, inquiryAnswer, mustAcceptDance } from './game-rules.js';

const app = document.querySelector('#app');
const s = { peer:null, conn:null, host:false, room:'', name:'', g:null };
const cast = [
  ['Dracula','♛','หากการกล่าวหาครั้งแรกไม่สำเร็จ คุณกล่าวหาอีกครั้งได้เมื่อจบตานั้น'],
  ['Boogie Monster','♫','ต้องตอบรับคำชวนเต้นรำทุกครั้ง และกล่าวหาได้หลังมีผู้เล่นเต้นรำกัน'],
  ['Dr. Jekyll','⚗','ต้องตอบรับคำชวนเต้นรำทุกครั้ง และอาจสลับกับ Mystery Guest เมื่อจบตาของคุณ'],
  ['Ghost','♢','ต้องตอบรับคำชวนเต้นรำทุกครั้ง; หากได้รับการกล่าวหาผิด ให้กล่าวหาทันที'],
  ['Swamp Creature','♞','ชนะได้ด้วยการกล่าวหาผู้เล่นข้างเคียงทั้งสองคนให้ถูกต้อง'],
  ['Trickster','☠','ต้องตอบ YES ต่อทุกคำถาม'],
  ['Van Helsing','✠','หลังการกล่าวหาที่เปิด NO ทุกใบ คุณกล่าวหาเฉพาะ Dracula ได้ทันที'],
  ['Alucard','☾','ตอบ YES เมื่อถูกถามว่าเป็น Dracula; ชนะเมื่อเต้นกับ Dracula หรือถูกกล่าวหาว่าเป็น Dracula'],
  ['Zombie','☣','หากผู้เล่นก่อนหน้าเต้นรำ คุณต้องชวนเต้น; เมื่อถูกเพื่อนข้างเคียงถาม คุณต้องโกหก'],
  ['Witch','✦','เมื่อถูกเพื่อนข้างเคียงถาม คุณต้องโกหก']
].map(([name,icon,rule])=>({id:GUESTS.find(g=>g.name===name).id,name,icon,rule,image:`./assets/characters/${({
  'Dracula':'dracula','Boogie Monster':'boogie-monster','Dr. Jekyll':'dr-jekyll','Ghost':'ghost',
  'Swamp Creature':'swamp-creature','Trickster':'trickster','Van Helsing':'van-helsing',
  'Alucard':'alucard','Zombie':'zombie','Witch':'witch'
}[name])}.png`}));
const qs = cast.map(card=>[card.id,`คุณคือ ${card.name} ใช่ไหม?`]);
const CARD_BY_NAME = Object.fromEntries(cast.map(card=>[card.name, card]));
const cardFor = guest => ({...CARD_BY_NAME[guest.name], id:guest.id});
const clean = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const myId = () => s.peer?.id;
const self = () => s.g?.players.find(p=>p.id===myId());
const transmit = msg => s.conn?.open && s.conn.send(msg);
const roomCode = () => Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');
function neighbours(g,a,b){const x=g.players.findIndex(p=>p.id===a),y=g.players.findIndex(p=>p.id===b),n=g.players.length;return Math.abs(x-y)===1||Math.abs(x-y)===n-1}
function requiredAnswer(g,target,asking,asked){ return inquiryAnswer({players:g.players,respondent:{...target,guest:target.card},askerId:asking,askedGuestId:asked}); }
function flash(g,icon,title,body){ g.flash={id:`${Date.now()}-${Math.random()}`,icon,title,body}; }
function accusationTargets(g, actor){
  if(actor.card.id==='swamp'){
    const i=g.players.findIndex(p=>p.id===actor.id), left=g.players[(i+g.players.length-1)%g.players.length], right=g.players[(i+1)%g.players.length];
    if(!left.revealed&&!right.revealed) return [left,right];
  }
  return g.players.filter(p=>p.id!==actor.id);
}

function home(message='เชิญเพื่อนด้วยรหัสห้อง แล้วเริ่มงานเลี้ยงได้เลย') {
  app.innerHTML = `<section class="hero"><div class="moon"></div><div class="crest">♛</div><p class="eyebrow">A DEDUCTION CARD GAME</p><h1>Dracula’s<br><em>Feast</em></h1><p class="subtitle">New Blood · 4–8 คน · 10–15 นาที</p><div class="panel lobby"><label>ชื่อของคุณ<input id="name" maxlength="18" placeholder="เช่น Mina" value="${clean(s.name)}"></label><div class="choices"><button class="primary" id="create">สร้างห้องใหม่ <span>→</span></button><span>หรือ</span><div class="join"><input id="room" maxlength="5" placeholder="รหัสห้อง"><button id="join">เข้าร่วม</button></div></div><p class="notice">${message}</p></div><div class="how"><div><b>01</b><span>ถามแขก</span></div><div><b>02</b><span>ชวนเต้นรำ</span></div><div><b>03</b><span>กล่าวหาให้ถูกต้อง</span></div></div></section><footer>เกมแฟนเมดสำหรับเล่นส่วนตัว · ไม่ใช่ผลิตภัณฑ์ทางการ</footer>`;
  document.querySelector('#create').addEventListener('click', createRoom);
  document.querySelector('#join').addEventListener('click', joinRoom);
}
function validName() {
  s.name = document.querySelector('#name').value.trim();
  if (s.name) return true;
  document.querySelector('.notice').textContent = 'โปรดใส่ชื่อก่อนเริ่ม';
  return false;
}
function createRoom() {
  if (!validName()) return;
  s.host=true; s.room=roomCode(); s.peer=new Peer('draculas-feast-'+s.room);
  s.peer.on('open',()=>{s.g={phase:'lobby',players:[{id:myId(),name:s.name}],turn:0,log:[],dances:[],pending:null}; lobby();});
  s.peer.on('connection', hostConnection);
  s.peer.on('error',()=>home('สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง'));
}
function joinRoom() {
  if (!validName()) return;
  const code=document.querySelector('#room').value.toUpperCase().trim();
  if (code.length!==5) { document.querySelector('.notice').textContent='รหัสห้องมี 5 ตัวอักษร'; return; }
  s.room=code; s.peer=new Peer();
  s.peer.on('open',()=>{
    s.conn=s.peer.connect('draculas-feast-'+code,{reliable:true});
    s.conn.on('open',()=>transmit({kind:'join',id:myId(),name:s.name}));
    s.conn.on('data', clientMessage);
  });
  s.peer.on('error',()=>home('ไม่พบห้องนี้ หรือเจ้าของห้องปิดไปแล้ว'));
}
function hostConnection(conn) {
  conn.on('data', msg=>{
    if (msg.kind==='join') {
      if (s.g.phase!=='lobby'||s.g.players.length>=8) { conn.send({kind:'error',message:'ห้องเริ่มแล้วหรือเต็มแล้ว'}); return; }
      s.g.players.push({id:msg.id,name:msg.name}); sync(); lobby();
    } else hostMessage(msg);
  });
}
function clientMessage(msg) {
  if (msg.kind==='state') { s.g=msg.game; draw(); }
  if (msg.kind==='whisper') { s.whisper=msg; draw(); }
  if (msg.kind==='error') home(msg.message);
}
function publicGame(id) {
  const g=structuredClone(s.g);
  g.players.forEach(p=>{
    const danced=g.dances.some(pair=>pair.includes(id)&&pair.includes(p.id));
    if (p.id!==id&&!danced&&!p.revealed) delete p.card;
  });
  return g;
}
function sync() {
  Object.values(s.peer.connections||{}).flat().forEach(c=>{
    if (c.open) c.send({kind:'state',game:publicGame(c.peer)});
  });
}
function tile(p, selectable=false) {
  const card=p.card;
  return `<article class="player ${selectable?'actionable':''}" data-player="${p.id}"><div class="avatar">${p.name[0]?.toUpperCase()||'?'}</div><div><strong>${clean(p.name)}</strong><small>${card?card.icon+' '+card.name:'ตัวตนยังเป็นความลับ'}</small></div>${selectable?'<span class="target">เลือก</span>':''}</article>`;
}
function lobby() {
  const g=s.g;
  app.innerHTML=`<section class="room"><header><div class="brand">♛ <span>DRACULA’S FEAST</span></div><div class="status"><i></i> ห้องเปิดอยู่</div></header><div class="room-code"><span>รหัสห้องของคุณ</span><strong>${s.room}</strong><button id="copy">คัดลอกรหัส</button></div><div class="lobby-content"><p class="eyebrow">WAITING FOR THE GUESTS</p><h2>ผู้ร่วมงาน <em>${g.players.length}/8</em></h2><div class="player-grid">${g.players.map(p=>tile(p)).join('')}</div>${s.host?'<button id="start" class="primary large" '+(g.players.length<4?'disabled':'')+'>เริ่มงานเลี้ยง <span>→</span></button><p class="hint">ต้องมี 4–8 คนจึงจะเริ่มได้</p>':'<div class="waiting">กำลังรอเจ้าของห้องเริ่มเกม…</div>'}</div></section>`;
  document.querySelector('#copy').addEventListener('click',()=>navigator.clipboard.writeText(s.room).then(()=>document.querySelector('#copy').textContent='คัดลอกแล้ว ✓'));
  const start=document.querySelector('#start'); if (start) start.addEventListener('click', startGame);
}
function startGame() {
  const setup=setupGuests(s.g.players.length), selected=setup.chosen.map(cardFor);
  [...s.g.players].sort(()=>Math.random()-.5).forEach((p,i)=>p.card=cardFor(setup.identities[i]));
  Object.assign(s.g,{phase:'play',turn:Math.floor(Math.random()*s.g.players.length),available:selected,mystery:setup.mystery.map(cardFor),log:['แขกทุกคนได้รับบัตรตัวตนลับแล้ว','ถึงเวลาสังเกต ตั้งคำถาม และหาความจริง'],pending:null,dances:[],lastDance:false,revealed:[]});
  sync(); game();
}
function draw(){ if(s.g.phase==='lobby') lobby(); else game(); }
function game() {
  const g=s.host?publicGame(myId()):s.g, me=g.players.find(p=>p.id===myId()), active=g.players[g.turn];
  const offer=g.pending?.kind==='dance'&&g.pending.target===myId();
  const questionOffer=g.pending?.kind==='inquireReply'&&g.pending.target===myId();
  const mustDance=mustAcceptDance(me.card?.id);
  let center='';
  if(g.phase==='end') center=`<div class="result"><div>♛</div><h3>${clean(g.winner.name)} ชนะงานเลี้ยง!</h3><p>${g.accused?`กล่าวหา ${clean(g.accused.name)} ได้ถูกต้องว่าเป็น ${g.accused.card.name}`:'Alucard เต้นรำกับ Dracula สำเร็จ'}</p>${s.host?'<button class="primary" id="restart">เล่นอีกครั้ง</button>':''}</div>`;
  else if(offer) center=`<div class="reveal-card"><div>♫</div><h3>${clean(g.pending.fromName)} ชวนคุณเต้นรำ</h3><p>${mustDance?'เอฟเฟกต์การ์ดของคุณบังคับให้ตอบตกลง':'หากตอบตกลง ทั้งสองฝ่ายจะเห็นตัวตนของกันและกันตลอดเกม'}</p><button class="primary" id="yes">ตกลงเต้นรำ</button>${mustDance?'<button class="outline" disabled>ปฏิเสธไม่ได้ — เอฟเฟกต์ตัวละคร</button>':'<button class="outline" id="no">ปฏิเสธ</button>'}</div>`;
  else if(questionOffer){const required=requiredAnswer(g,me,g.pending.from,g.pending.type);center=`<div class="reveal-card"><div>?</div><h3>${clean(g.pending.fromName)} ถามคุณ</h3><p>${clean(g.pending.text)}</p><p class="required-answer">กฎของการ์ดคุณกำหนดให้ตอบ <b>${required?'YES':'NO'}</b></p><button class="primary" id="answer-yes">YES</button><button class="outline" id="answer-no">NO</button></div>`;}
  else if(active.id===myId()) center=turnScreen(g,me);
  else center=`<div class="instruction">กำลังรอ <b>${clean(active.name)}</b> เลือกการกระทำ…</div><div class="player-grid table-grid">${g.players.map(p=>tile(p)).join('')}</div>`;
  const eventPopup=g.flash&&s.hiddenFlash!==g.flash.id?`<div class="event-popup"><div class="event-mark">${g.flash.icon}</div><div><b>${clean(g.flash.title)}</b><p>${clean(g.flash.body)}</p></div><button id="dismiss-event" aria-label="ปิด">×</button></div>`:'';
  const order=`<div class="turn-order"><span>ลำดับเล่น</span>${g.players.map((p,i)=>`<div class="turn-chip ${i===g.turn?'now':''}">${i+1}. ${clean(p.name)}</div>`).join('')}</div>`;
  app.innerHTML=`<section class="game"><header><div class="brand">♛ <span>DRACULA’S FEAST</span></div><div class="round">✦ ตาของ ${clean(active.name)}</div><button class="guide-button" id="guide">☰ คู่มือตัวละคร</button><div class="room-tag">ห้อง ${s.room}</div></header><div class="game-main"><aside><p class="eyebrow">การ์ดลับของคุณ — ห้ามบอกผู้อื่น</p><div class="role-card">${me.card?.image?`<img class="role-portrait" src="${me.card.image}" alt="ภาพตัวละคร ${clean(me.card.name)}">`:''}<div class="role-icon">${me.card?.icon||'?'}</div><h3>${me.card?.name||'กำลังแจกบัตร…'}</h3><p class="ability-label">ความสามารถ</p><p class="card-rule">${me.card?.rule||''}</p></div></aside><section class="table"><p class="eyebrow">FIND THE MONSTERS</p><h2>${g.phase==='end'?'คำตอบปรากฏแล้ว':'ใครกันแน่ที่อยู่ตรงหน้า?'}</h2>${order}${s.whisper?`<div class="whisper"><b>คำตอบลับ</b><p>${clean(s.whisper.question)}</p><strong>${s.whisper.answer}</strong><button id="dismiss-whisper">ปิด</button></div>`:''}${eventPopup}${center}</section></div></section>`;
  document.querySelectorAll('[data-player]').forEach(el=>el.addEventListener('click',()=>chooseTarget(el.dataset.player)));
  document.querySelectorAll('[data-assign]').forEach(el=>el.addEventListener('click',()=>{s.g.pending.selecting=el.dataset.assign;draw();}));
  document.querySelectorAll('[data-helsing]').forEach(el=>el.addEventListener('click',()=>dispatch({kind:'helsing',target:el.dataset.helsing})));
  document.querySelectorAll('.assign').forEach(el=>el.addEventListener('click',()=>{s.g.pending.assignments??={};s.g.pending.assignments[s.g.pending.selecting]=el.dataset.name;s.g.pending.selecting=null;draw();}));
  const yes=document.querySelector('#yes'), no=document.querySelector('#no'), answerYes=document.querySelector('#answer-yes'), answerNo=document.querySelector('#answer-no'), restart=document.querySelector('#restart');
  if(yes) yes.addEventListener('click',()=>dispatch({kind:'danceReply',yes:true}));
  if(no) no.addEventListener('click',()=>dispatch({kind:'danceReply',yes:false}));
  if(answerYes) answerYes.addEventListener('click',()=>dispatch({kind:'inquireReply',answer:true}));
  if(answerNo) answerNo.addEventListener('click',()=>dispatch({kind:'inquireReply',answer:false}));
  if(restart) restart.addEventListener('click',restartGame);
  document.querySelector('#submit-accusation')?.addEventListener('click',()=>dispatch({kind:'accusePlan',assignments:s.g.pending.assignments}));
  document.querySelector('#jekyll-swap')?.addEventListener('click',()=>dispatch({kind:'jekyllSwap'}));
  document.querySelector('#jekyll-skip')?.addEventListener('click',()=>dispatch({kind:'jekyllSkip'}));
  document.querySelector('#dismiss-whisper')?.addEventListener('click',()=>{s.whisper=null;game();});
  document.querySelector('#dismiss-event')?.addEventListener('click',()=>{s.hiddenFlash=g.flash.id;game();});
  document.querySelector('#guide').addEventListener('click',showGuide);
}
function showGuide(){
  const sheet=document.createElement('section'); sheet.className='guide-overlay';
  sheet.innerHTML=`<div class="guide-panel"><button class="guide-close" id="close-guide" aria-label="ปิดคู่มือ">×</button><p class="eyebrow">REFERENCE CARD</p><h2>คู่มือตัวละคร</h2><p>ทุกคนดูหน้านี้ได้ เพื่อเข้าใจกติกาและเงื่อนไขพิเศษของแต่ละบทบาท</p><div class="guide-grid">${cast.map(c=>`<article><img src="${c.image}" alt=""><div><h3>${c.icon} ${c.name}</h3><p>${c.rule}</p></div></article>`).join('')}</div></div>`;
  document.body.append(sheet); document.querySelector('#close-guide').addEventListener('click',()=>sheet.remove());
}
function turnScreen(g,me) {
  const p=g.pending;
  if((p?.kind==='dance'||p?.kind==='inquireReply')&&p.from===myId()) return `<div class="instruction">กำลังรอคำตอบจาก ${clean(p.targetName)}…</div>`;
  if(p&&!p.target&&['inquire','dance'].includes(p.kind)) return `<div class="instruction">เลือกแขกที่คุณต้องการ${p.kind==='inquire'?'ถาม':'ชวนเต้นรำ'}</div><div class="player-grid table-grid">${g.players.map(x=>tile(x,x.id!==me.id)).join('')}</div>`;
  if(p?.kind==='inquire') return `<div class="instruction">เลือกคำถามเพื่อถาม ${clean(p.targetName)}</div><div class="question-list">${qs.filter(([id])=>g.available.some(c=>c.id===id)).map(([type,text])=>'<button class="outline ask" data-type="'+type+'">'+text+'</button>').join('')}</div>`;
  if(p?.kind==='helsing') return `<div class="instruction">Van Helsing: เลือกผู้เล่นที่คุณคิดว่าเป็น Dracula</div><div class="player-grid table-grid">${g.players.filter(x=>x.id!==me.id).map(x=>`<article class="player actionable" data-helsing="${x.id}"><div class="avatar">${x.name[0]}</div><div><strong>${clean(x.name)}</strong><small>กล่าวหา</small></div></article>`).join('')}</div>`;
  if(p?.kind==='jekyll') return `<div class="instruction">Dr. Jekyll: คุณอาจเปิดตัวตนและสลับเป็น Mystery Guest</div><button class="primary" id="jekyll-swap">สลับ Mystery Guest</button><button class="outline" id="jekyll-skip">จบตา</button>`;
  if(p?.kind==='accusePlan'){
    const assignments=p.assignments||{}, targets=accusationTargets(g,me);
    if(p.selecting){const used=new Set(Object.values(assignments));return `<div class="instruction">เลือกการ์ดที่จะวางหน้า ${clean(g.players.find(x=>x.id===p.selecting).name)}</div><div class="question-list">${g.available.filter(c=>!used.has(c.name)).map(c=>'<button class="outline assign" data-name="'+c.name+'">'+c.icon+' '+c.name+'</button>').join('')}</div>`}
    const complete=targets.every(x=>assignments[x.id]);return `<div class="instruction">วางการ์ดกล่าวหาให้ผู้เล่นทุกคน (ยกเว้นตัวคุณ)</div><div class="player-grid table-grid">${targets.map(x=>`<article class="player actionable" data-assign="${x.id}"><div class="avatar">${x.name[0]}</div><div><strong>${clean(x.name)}</strong><small>${assignments[x.id]||'เลือกตัวตน'}</small></div><span class="target">เลือก</span></article>`).join('')}</div>${complete?'<button class="primary" id="submit-accusation">เปิดการกล่าวหา</button>':''}`;
  }
  if(g.forceDance) return `<div class="instruction">Zombie: ผู้เล่นก่อนหน้าเต้นรำ คุณต้องชวนผู้เล่นคนหนึ่งเต้นรำ</div><div class="action-menu"><button class="primary action-btn" data-action="dance"><b>♫</b><span>ชวนเต้นรำ</span></button></div>`;
  return `<div class="action-menu"><button class="primary action-btn" data-action="inquire"><b>?</b><span>ถามแขก<small>รับคำตอบลับ YES หรือ NO</small></span></button>${me.revealed?'':`<button class="outline action-btn" data-action="dance"><b>♫</b><span>ชวนเต้นรำ<small>ทั้งคู่เปิดตัวตนต่อกัน</small></span></button>`}<button class="outline action-btn" data-action="accusePlan"><b>!</b><span>กล่าวหา<small>วางตัวตนให้ผู้เล่นทุกคน</small></span></button></div>`;
}
function chooseTarget(id) {
  const g=s.g; if(g.phase!=='play'||g.players[g.turn]?.id!==myId()||id===myId()||id===g.pending?.blocked||!g.pending) return;
  const p=g.players.find(x=>x.id===id), me=g.players.find(x=>x.id===myId()); if(g.pending.kind==='dance'&&(p.revealed||me.revealed))return;
  dispatch({kind:'target',action:g.pending.kind,target:id,targetName:p.name});
}
document.addEventListener('click',e=>{
  const g=s.g; if(!g||g.phase!=='play'||g.players[g.turn]?.id!==myId()) return;
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action){g.pending={kind:action,...(action==='accusePlan'?{assignments:{}}:{})}; draw(); return;}
  if(e.target.matches('.ask')) dispatch({kind:'inquire',target:g.pending.target,type:e.target.dataset.type});
});
function dispatch(msg){ if(s.host) hostMessage(msg); else transmit(msg); }
function hostMessage(msg) {
  const g=s.g, actor=g.players[g.turn];
  if(msg.kind==='target'){
    g.pending={kind:msg.action,target:msg.target,targetName:msg.targetName,from:actor.id,fromName:actor.name};
    if(msg.action==='dance') flash(g,'♫','มีคำชวนเต้นรำ',`${actor.name} ชวน ${msg.targetName} เต้นรำ`);
    sync(); game(); return;
  }
  if(msg.kind==='inquire'){
    const target=g.players.find(p=>p.id===msg.target), text=qs.find(q=>q[0]===msg.type)[1];
    g.pending={kind:'inquireReply',target:target.id,targetName:target.name,from:actor.id,fromName:actor.name,type:msg.type,text};
    sync(); game(); return;
  }
  if(msg.kind==='inquireReply'){
    const target=g.players.find(p=>p.id===g.pending.target);
    const required=requiredAnswer(g,target,g.pending.from,g.pending.type);
    g.log.push(`${g.pending.fromName} ถาม ${target.name} เป็นการส่วนตัว`);
    flash(g,'?','การถามเสร็จสิ้น',`${g.pending.fromName} ได้รับคำตอบลับจาก ${target.name}`);
    const whisper={kind:'whisper',question:g.pending.text,answer:required?'YES':'NO'};
    if(g.pending.from===myId()) s.whisper=whisper;
    else Object.values(s.peer.connections||{}).flat().filter(c=>c.peer===g.pending.from&&c.open).forEach(c=>c.send(whisper));
    next(); return;
  }
  if(msg.kind==='danceReply'){
    const target=g.players.find(p=>p.id===g.pending.target), forced=['Boogie Monster','Dr. Jekyll','Ghost'].includes(target.card.name), accepted=msg.yes||forced;
    if(accepted){
      g.dances.push([g.pending.from,target.id]); g.log.push(`${actor.name} และ ${target.name} เต้นรำด้วยกัน และแลกเปลี่ยนตัวตน`);
      flash(g,'♫','เต้นรำสำเร็จ',`${actor.name} และ ${target.name} เห็นตัวตนของกันและกันแล้ว`);
      g.lastDance=true;
      const pair=[actor.card.name,target.card.name];
      if(pair.includes('Alucard')&&pair.includes('Dracula')){Object.assign(g,{phase:'end',winner:pair[0]==='Alucard'?actor:target,accused:null,pending:null});sync();game();return;}
    } else {
      g.log.push(`${target.name} ปฏิเสธคำชวนเต้นรำของ ${actor.name}`);
      flash(g,'×','ปฏิเสธการเต้นรำ',`${target.name} ปฏิเสธคำชวนของ ${actor.name}`);
      if(actor.card.id==='zombie'){target.revealed=true;g.pending={kind:'accusePlan',assignments:{},forced:true};sync();game();return;}
      g.pending={kind:'inquire',blocked:target.id};sync();game();return;
    }
    next(); return;
  }
  if(msg.kind==='accusePlan'){
    const targets=accusationTargets(g,actor), answers=targets.map(p=>msg.assignments[p.id]===p.card.name), allYes=answers.every(Boolean), allNo=answers.every(x=>!x);
    actor.revealed=true; g.log.push(`${actor.name} เปิดการกล่าวหาผู้เล่นทั้งโต๊ะ — ${allYes?'ถูกต้องทั้งหมด!':'ไม่สำเร็จ'}`);
    const alucard=g.players.find(p=>p.card.id==='alucard');
    if(alucard&&msg.assignments[alucard.id]==='Dracula'){Object.assign(g,{phase:'end',winner:alucard,accused:null,pending:null});sync();game();return;}
    if(allYes){Object.assign(g,{phase:'end',winner:actor,accused:null,pending:null});sync();game();return;}
    if(actor.card.id==='helsing'&&allNo){g.pending={kind:'helsing',from:actor.id};sync();game();return;}
    const ghost=g.players.find(p=>p.card.id==='ghost');
    if(ghost&&msg.assignments[ghost.id]&&msg.assignments[ghost.id]!==ghost.card.name){g.turn=g.players.indexOf(ghost);g.pending={kind:'accusePlan',assignments:{},forced:true};sync();game();return;}
    if(actor.card.id==='dracula'&&!actor.draculaRetry){actor.draculaRetry=true;g.pending={kind:'accusePlan',assignments:{}};sync();game();return;}
    next(); return;
  }
  if(msg.kind==='helsing'){const target=g.players.find(p=>p.id===msg.target);if(target.card.id==='dracula'){Object.assign(g,{phase:'end',winner:actor,accused:null,pending:null});sync();game()}else next();}
  if(msg.kind==='jekyllSwap'){const mystery=g.mystery.shift();if(mystery){actor.revealed=true;g.mystery.push(actor.card);actor.card=mystery;g.log.push(`${actor.name} เปิดตัวตนและสลับกับ Mystery Guest`);}g.jekyllResolved=true;next();}
  if(msg.kind==='jekyllSkip'){g.jekyllResolved=true;next();}
}
function next(){
  const g=s.g, actor=g.players[g.turn];
  if(actor.card.id==='jekyll'&&!g.jekyllResolved&&g.mystery?.length){g.pending={kind:'jekyll',from:actor.id};sync();game();return;}
  if(g.lastDance){
    const boogie=g.players.find(p=>p.card.id==='boogie');
    if(boogie){g.lastDance=false;g.turn=g.players.indexOf(boogie);g.pending={kind:'accusePlan',assignments:{},forced:true};g.log.push(`${boogie.name} ใช้เอฟเฟกต์กล่าวหาหลังการเต้นรำ`);sync();game();return;}
  }
  g.jekyllResolved=false;g.pending=null;g.turn=(g.turn+1)%g.players.length;g.forceDance=g.lastDance&&g.players[g.turn].card.id==='zombie';g.lastDance=false;
  sync();game();
}
function restartGame(){s.g.phase='lobby';s.g.players.forEach(p=>delete p.card);s.g.log=[];s.g.dances=[];s.g.pending=null;sync();lobby();}
home();
