import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';

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
].map(([name,icon,rule])=>({name,icon,rule}));
const qs = cast.map(card=>[card.name,`คุณคือ ${card.name} ใช่ไหม?`]);
const clean = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const myId = () => s.peer?.id;
const self = () => s.g?.players.find(p=>p.id===myId());
const transmit = msg => s.conn?.open && s.conn.send(msg);
const roomCode = () => Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');
function neighbours(g,a,b){const x=g.players.findIndex(p=>p.id===a),y=g.players.findIndex(p=>p.id===b),n=g.players.length;return Math.abs(x-y)===1||Math.abs(x-y)===n-1}
function requiredAnswer(g,target,asking,asked){
  const card=target.card, honest=card.name===asked, nextToAsker=neighbours(g,target.id,asking);
  if(card.name==='Trickster') return true;
  if(card.name==='Zombie'&&nextToAsker) return asked!=='Witch';
  if(card.name==='Witch'&&nextToAsker) return !honest;
  if(card.name==='Alucard'&&asked==='Dracula') return true;
  return honest;
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
  if (msg.kind==='error') home(msg.message);
}
function publicGame(id) {
  const g=structuredClone(s.g);
  g.players.forEach(p=>{
    const danced=g.dances.some(pair=>pair.includes(id)&&pair.includes(p.id));
    if (p.id!==id&&!danced) delete p.card;
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
  const selected=[cast[0],...cast.slice(1).sort(()=>Math.random()-.5).slice(0,s.g.players.length-1)];
  [...s.g.players].sort(()=>Math.random()-.5).forEach((p,i)=>p.card=selected[i]);
  const eligible=s.g.players.map((p,i)=>p.card.name==='Dracula'?-1:i).filter(i=>i>=0);
  Object.assign(s.g,{phase:'play',turn:eligible[Math.floor(Math.random()*eligible.length)],available:selected,log:['แขกทุกคนได้รับบัตรตัวตนลับแล้ว','ถึงเวลาสังเกต ตั้งคำถาม และหาความจริง'],pending:null,dances:[]});
  sync(); game();
}
function draw(){ if(s.g.phase==='lobby') lobby(); else game(); }
function game() {
  const g=s.host?publicGame(myId()):s.g, me=g.players.find(p=>p.id===myId()), active=g.players[g.turn];
  const offer=g.pending?.kind==='dance'&&g.pending.target===myId();
  const questionOffer=g.pending?.kind==='inquireReply'&&g.pending.target===myId();
  const mustDance=['Boogie Monster','Dr. Jekyll','Ghost'].includes(me.card?.name);
  let center='';
  if(g.phase==='end') center=`<div class="result"><div>♛</div><h3>${clean(g.winner.name)} ชนะงานเลี้ยง!</h3><p>${g.accused?`กล่าวหา ${clean(g.accused.name)} ได้ถูกต้องว่าเป็น ${g.accused.card.name}`:'Alucard เต้นรำกับ Dracula สำเร็จ'}</p>${s.host?'<button class="primary" id="restart">เล่นอีกครั้ง</button>':''}</div>`;
  else if(offer) center=`<div class="reveal-card"><div>♫</div><h3>${clean(g.pending.fromName)} ชวนคุณเต้นรำ</h3><p>${mustDance?'เอฟเฟกต์การ์ดของคุณบังคับให้ตอบตกลง':'หากตอบตกลง ทั้งสองฝ่ายจะเห็นตัวตนของกันและกันตลอดเกม'}</p><button class="primary" id="yes">ตกลงเต้นรำ</button>${mustDance?'<button class="outline" disabled>ปฏิเสธไม่ได้ — เอฟเฟกต์ตัวละคร</button>':'<button class="outline" id="no">ปฏิเสธ</button>'}</div>`;
  else if(questionOffer){const required=requiredAnswer(g,me,g.pending.from,g.pending.type);center=`<div class="reveal-card"><div>?</div><h3>${clean(g.pending.fromName)} ถามคุณ</h3><p>${clean(g.pending.text)}</p><p class="required-answer">กฎของการ์ดคุณกำหนดให้ตอบ <b>${required?'YES':'NO'}</b></p><button class="primary" id="answer-yes">YES</button><button class="outline" id="answer-no">NO</button></div>`;}
  else if(active.id===myId()) center=turnScreen(g,me);
  else center=`<div class="instruction">กำลังรอ <b>${clean(active.name)}</b> เลือกการกระทำ…</div><div class="player-grid table-grid">${g.players.map(p=>tile(p)).join('')}</div>`;
  app.innerHTML=`<section class="game"><header><div class="brand">♛ <span>DRACULA’S FEAST</span></div><div class="round">✦ ตาของ ${clean(active.name)}</div><div class="room-tag">ห้อง ${s.room}</div></header><div class="game-main"><aside><p class="eyebrow">YOUR IDENTITY</p><div class="role-card"><div class="role-icon">${me.card?.icon||'?'}</div><h3>${me.card?.name||'กำลังแจกบัตร…'}</h3><p>${me.card?.clue||''}</p><p class="card-rule">${me.card?.rule||''}</p></div><div class="chronicle"><b>บันทึกงานเลี้ยง</b>${g.log.slice(-5).reverse().map(x=>'<p>'+clean(x)+'</p>').join('')}</div></aside><section class="table"><p class="eyebrow">FIND THE MONSTERS</p><h2>${g.phase==='end'?'คำตอบปรากฏแล้ว':'ใครกันแน่ที่อยู่ตรงหน้า?'}</h2>${center}</section></div></section>`;
  document.querySelectorAll('[data-player]').forEach(el=>el.addEventListener('click',()=>chooseTarget(el.dataset.player)));
  const yes=document.querySelector('#yes'), no=document.querySelector('#no'), answerYes=document.querySelector('#answer-yes'), answerNo=document.querySelector('#answer-no'), restart=document.querySelector('#restart');
  if(yes) yes.addEventListener('click',()=>dispatch({kind:'danceReply',yes:true}));
  if(no) no.addEventListener('click',()=>dispatch({kind:'danceReply',yes:false}));
  if(answerYes) answerYes.addEventListener('click',()=>dispatch({kind:'inquireReply',answer:true}));
  if(answerNo) answerNo.addEventListener('click',()=>dispatch({kind:'inquireReply',answer:false}));
  if(restart) restart.addEventListener('click',restartGame);
}
function turnScreen(g,me) {
  const p=g.pending;
  if((p?.kind==='dance'||p?.kind==='inquireReply')&&p.from===myId()) return `<div class="instruction">กำลังรอคำตอบจาก ${clean(p.targetName)}…</div>`;
  if(p&&!p.target) return `<div class="instruction">เลือกแขกที่คุณต้องการ${p.kind==='inquire'?'ถาม':p.kind==='dance'?'ชวนเต้นรำ':'กล่าวหา'}</div><div class="player-grid table-grid">${g.players.map(x=>tile(x,x.id!==me.id)).join('')}</div>`;
  if(p?.kind==='inquire') return `<div class="instruction">เลือกคำถามเพื่อถาม ${clean(p.targetName)}</div><div class="question-list">${qs.filter(([name])=>g.available.some(c=>c.name===name)).map(([type,text])=>'<button class="outline ask" data-type="'+type+'">'+text+'</button>').join('')}</div>`;
  if(p?.kind==='accuse') return `<div class="instruction">คุณกำลังกล่าวหา ${clean(p.targetName)} ว่าเป็นใคร?</div><div class="question-list">${g.available.map(c=>'<button class="outline accuse" data-name="'+c.name+'">'+c.icon+' '+c.name+'</button>').join('')}</div>`;
  return `<div class="action-menu"><button class="primary action-btn" data-action="inquire"><b>?</b><span>ถามแขก<small>รับคำตอบ YES หรือ NO ที่เป็นจริง</small></span></button><button class="outline action-btn" data-action="dance"><b>♫</b><span>ชวนเต้นรำ<small>ทั้งคู่จะเปิดบัตรตัวตนต่อกัน</small></span></button><button class="outline action-btn" data-action="accuse"><b>!</b><span>กล่าวหา<small>ทายตัวตนของแขกคนหนึ่ง</small></span></button></div>`;
}
function chooseTarget(id) {
  const g=s.g; if(g.phase!=='play'||g.players[g.turn]?.id!==myId()||id===myId()||!g.pending) return;
  const p=g.players.find(x=>x.id===id); dispatch({kind:'target',action:g.pending.kind,target:id,targetName:p.name});
}
document.addEventListener('click',e=>{
  const g=s.g; if(!g||g.phase!=='play'||g.players[g.turn]?.id!==myId()) return;
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action){g.pending={kind:action}; draw(); return;}
  if(e.target.matches('.ask')) dispatch({kind:'inquire',target:g.pending.target,type:e.target.dataset.type});
  if(e.target.matches('.accuse')) dispatch({kind:'accuse',target:g.pending.target,name:e.target.dataset.name});
});
function dispatch(msg){ if(s.host) hostMessage(msg); else transmit(msg); }
function hostMessage(msg) {
  const g=s.g, actor=g.players[g.turn];
  if(msg.kind==='target'){g.pending={kind:msg.action,target:msg.target,targetName:msg.targetName,from:actor.id,fromName:actor.name}; sync(); game(); return;}
  if(msg.kind==='inquire'){
    const target=g.players.find(p=>p.id===msg.target), text=qs.find(q=>q[0]===msg.type)[1];
    g.pending={kind:'inquireReply',target:target.id,targetName:target.name,from:actor.id,fromName:actor.name,type:msg.type,text};
    sync(); game(); return;
  }
  if(msg.kind==='inquireReply'){
    const target=g.players.find(p=>p.id===g.pending.target);
    const required=requiredAnswer(g,target,g.pending.from,g.pending.type);
    g.log.push(`${g.pending.fromName} ถาม ${target.name}: “${g.pending.text}” — ${required?'YES':'NO'}`);
    next(); return;
  }
  if(msg.kind==='danceReply'){
    const target=g.players.find(p=>p.id===g.pending.target), forced=['Boogie Monster','Dr. Jekyll','Ghost'].includes(target.card.name), accepted=msg.yes||forced;
    if(accepted){
      g.dances.push([g.pending.from,target.id]); g.log.push(`${actor.name} และ ${target.name} เต้นรำด้วยกัน และแลกเปลี่ยนตัวตน`);
      const pair=[actor.card.name,target.card.name];
      if(pair.includes('Alucard')&&pair.includes('Dracula')){Object.assign(g,{phase:'end',winner:pair[0]==='Alucard'?actor:target,accused:null,pending:null});sync();game();return;}
    } else g.log.push(`${target.name} ปฏิเสธคำชวนเต้นรำของ ${actor.name}`);
    next(); return;
  }
  if(msg.kind==='accuse'){const target=g.players.find(p=>p.id===msg.target);g.log.push(`${actor.name} กล่าวหาว่า ${target.name} คือ ${msg.name}`);if(target.card.name==='Alucard'&&msg.name==='Dracula'){Object.assign(g,{phase:'end',winner:target,accused:null,pending:null});sync();game()}else if(target.card.name===msg.name){Object.assign(g,{phase:'end',winner:actor,accused:target,pending:null});sync();game()}else{g.log[g.log.length-1]+=' — ยังไม่ถูกต้อง';next();}}
}
function next(){s.g.pending=null;s.g.turn=(s.g.turn+1)%s.g.players.length;sync();game();}
function restartGame(){s.g.phase='lobby';s.g.players.forEach(p=>delete p.card);s.g.log=[];s.g.dances=[];s.g.pending=null;sync();lobby();}
home();
