import { Peer } from 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';

const app = document.querySelector('#app');
const state = { peer: null, conn: null, isHost: false, room: '', name: '', game: null, connected: false };
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bloodlines = [
  { name: 'Dracula', icon: '♛', desc: 'คุณคือแวมไพร์ผู้หิวกระหาย จงเปลี่ยนแขกให้เป็นบริวาร', kind: 'dracula' },
  { name: 'นักล่า', icon: '✠', desc: 'ในแต่ละคืน คุณตรวจสอบผู้ร่วมโต๊ะได้หนึ่งคน', kind: 'hunter' },
  { name: 'หมอ', icon: '✚', desc: 'ในแต่ละคืน คุณปกป้องแขกได้หนึ่งคนจากเขี้ยวของ Dracula', kind: 'doctor' },
  { name: 'แขกผู้กล้า', icon: '♢', desc: 'สังเกต ฟัง และร่วมโหวตเพื่อหยุด Dracula', kind: 'guest' },
];

function send(msg) { if (state.conn?.open) state.conn.send(msg); }
function broadcast(msg) { state.peer?.connections && Object.values(state.peer.connections).flat().forEach(c => c.open && c.send(msg)); }
function code() { return Array.from({length: 5}, () => letters[Math.floor(Math.random() * letters.length)]).join(''); }
function esc(v = '') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function card(p, opts = {}) {
  const role = bloodlines.find(r => r.kind === p.role) || bloodlines[3];
  return `<article class="player ${p.alive ? '' : 'dead'} ${opts.selected ? 'selected' : ''}" data-id="${p.id}">
    <div class="avatar">${p.name.slice(0, 1).toUpperCase()}</div><div><strong>${esc(p.name)}</strong><small>${p.alive ? (opts.reveal ? `${role.icon} ${role.name}` : 'ยังอยู่ในงานเลี้ยง') : 'จากไปแล้ว'}</small></div>
    ${opts.selectable ? '<span class="target">เลือก</span>' : ''}</article>`;
}

function renderHome() {
  app.innerHTML = `<section class="hero"><div class="moon"></div><div class="crest">♛</div><p class="eyebrow">A SOCIAL DEDUCTION GAME</p><h1>Dracula’s<br><em>Feast</em></h1><p class="subtitle">New Blood · เกมปาร์ตี้ล่าความจริงสำหรับ 3–8 คน</p>
  <div class="panel lobby"><label>ชื่อของคุณ<input id="name" maxlength="18" placeholder="เช่น Mina" value="${esc(state.name)}" /></label><div class="choices"><button class="primary" id="host">สร้างห้องใหม่ <span>→</span></button><span>หรือ</span><div class="join"><input id="room" maxlength="5" placeholder="รหัสห้อง" /><button id="join">เข้าร่วม</button></div></div><p id="notice" class="notice">เชิญเพื่อนด้วยรหัสห้อง แล้วเล่นในเบราว์เซอร์ได้เลย</p></div>
  <div class="how"><div><b>01</b><span>รับบทลับ</span></div><div><b>02</b><span>ผ่านคืนอันมืดมิด</span></div><div><b>03</b><span>โหวตหาตัว Dracula</span></div></div></section><footer>สร้างเพื่อเล่นกับเพื่อน · ใช้การเชื่อมต่อแบบตรงระหว่างเบราว์เซอร์</footer>`;
  document.querySelector('#host').onclick = hostRoom;
  document.querySelector('#join').onclick = joinRoom;
}
function validateName() { state.name = document.querySelector('#name').value.trim(); if (!state.name) { document.querySelector('#notice').textContent = 'โปรดใส่ชื่อก่อนเริ่มเกม'; return false; } return true; }

function hostRoom() {
  if (!validateName()) return;
  state.isHost = true; state.room = code(); state.peer = new Peer(`draculas-feast-${state.room}`);
  state.peer.on('open', () => { state.connected = true; state.game = { phase: 'lobby', round: 0, players: [{id: state.peer.id, name: state.name, alive: true}], actions: {}, log: [] }; renderLobby(); });
  state.peer.on('connection', connectHost);
  state.peer.on('error', e => showError(e.type === 'unavailable-id' ? 'รหัสนี้ถูกใช้แล้ว ลองใหม่อีกครั้ง' : 'เชื่อมต่อไม่ได้ กรุณาลองใหม่'));
}
function joinRoom() {
  if (!validateName()) return;
  const room = document.querySelector('#room').value.toUpperCase().trim(); if (room.length !== 5) { document.querySelector('#notice').textContent = 'รหัสห้องต้องมี 5 ตัวอักษร'; return; }
  state.isHost = false; state.room = room; state.peer = new Peer();
  state.peer.on('open', () => { state.conn = state.peer.connect(`draculas-feast-${room}`, { reliable: true }); state.conn.on('open', () => { state.connected = true; send({type:'join', name:state.name, id:state.peer.id}); }); state.conn.on('data', handleClient); state.conn.on('error', () => showError('หลุดจากห้องแล้ว')); });
  state.peer.on('error', () => showError('ไม่พบห้องนี้ หรือเจ้าของห้องออฟไลน์อยู่'));
}
function connectHost(conn) {
  conn.on('data', msg => { if (msg.type === 'join') { if (state.game.phase !== 'lobby' || state.game.players.length >= 8) { conn.send({type:'error', message:'ห้องนี้เริ่มแล้วหรือเต็มแล้ว'}); return; } state.game.players.push({id:msg.id,name:msg.name,alive:true}); sync(); renderLobby(); } else hostMessage(msg); });
  conn.on('close', () => { if (state.game?.phase === 'lobby') { state.game.players = state.game.players.filter(p => p.id !== conn.peer); sync(); renderLobby(); } });
}
function handleClient(msg) { if (msg.type === 'state') { state.game = msg.game; render(); } if (msg.type === 'error') showError(msg.message); }
function sync() { broadcast({type:'state', game:state.game}); }
function showError(message) { renderHome(); document.querySelector('#notice').textContent = message; }

function renderLobby() {
  const p = state.game.players;
  app.innerHTML = `<section class="room"><header><div class="brand">♛ <span>DRACULA’S FEAST</span></div><div class="status"><i></i> ห้องเปิดอยู่</div></header><div class="room-code"><span>รหัสห้องของคุณ</span><strong>${state.room}</strong><button id="copy">คัดลอกรหัส</button></div><div class="lobby-content"><p class="eyebrow">WAITING FOR THE GUESTS</p><h2>ผู้ร่วมงาน <em>${p.length}/8</em></h2><div class="player-grid">${p.map(x => card(x)).join('')}</div>${state.isHost ? `<button id="start" class="primary large" ${p.length < 3 ? 'disabled' : ''}>เริ่มงานเลี้ยง <span>→</span></button><p class="hint">ต้องมีอย่างน้อย 3 คนเพื่อเริ่มเกม</p>` : '<div class="waiting">กำลังรอเจ้าของห้องเริ่มเกม…</div>'}</div></section>`;
  document.querySelector('#copy').onclick = () => navigator.clipboard.writeText(state.room).then(() => document.querySelector('#copy').textContent = 'คัดลอกแล้ว ✓');
  const start = document.querySelector('#start'); if (start) start.onclick = startGame;
}
function startGame() {
  const g = state.game; const ids = [...g.players].sort(() => Math.random()-.5);
  ids.forEach((p, i) => p.role = i === 0 ? 'dracula' : i === 1 && g.players.length >= 4 ? 'hunter' : i === 2 && g.players.length >= 6 ? 'doctor' : 'guest');
  g.phase = 'reveal'; g.round = 1; g.log = ['งานเลี้ยงเริ่มต้นขึ้น…']; sync(); render();
}
function me() { return state.game.players.find(p => p.id === state.peer.id); }
function render() { state.game?.phase === 'lobby' ? renderLobby() : renderGame(); }
function renderGame() {
  const g = state.game, mine = me(), phase = g.phase, reveal = phase === 'end';
  const titles = {reveal:['บทบาทของคุณ','เก็บความลับนี้ไว้ให้ดี'], night:['ราตรีที่ '+g.round,'ดวงจันทร์ลอยสูงเหนือคฤหาสน์'], day:['รุ่งอรุณของวันที่ '+g.round,'ถึงเวลาถกเถียงและเปิดโปง'], vote:['พิพากษา Dracula','ทุกคนเลือกผู้ต้องสงสัยหนึ่งคน'], end:['งานเลี้ยงจบลง','ความจริงถูกเปิดเผย']};
  const [title,sub] = titles[phase]; const isAction = phase === 'night' && ['dracula','hunter','doctor'].includes(mine.role);
  const voted = g.actions?.[state.peer.id];
  app.innerHTML = `<section class="game"><header><div class="brand">♛ <span>DRACULA’S FEAST</span></div><div class="round">${phase === 'night' ? '☾' : '☼'} ${phase === 'end' ? 'จบเกม' : 'รอบ '+g.round}</div><div class="room-tag">ห้อง ${state.room}</div></header><div class="game-main"><aside><p class="eyebrow">YOUR BLOODLINE</p><div class="role-card ${mine.role}"><div class="role-icon">${bloodlines.find(r=>r.kind===mine.role).icon}</div><h3>${bloodlines.find(r=>r.kind===mine.role).name}</h3><p>${bloodlines.find(r=>r.kind===mine.role).desc}</p></div><div class="chronicle"><b>บันทึกเหตุการณ์</b>${g.log.slice(-4).reverse().map(x=>`<p>${esc(x)}</p>`).join('')}</div></aside><section class="table"><p class="eyebrow">${sub}</p><h2>${title}</h2>${phase === 'reveal' ? `<div class="reveal-card"><div>${bloodlines.find(r=>r.kind===mine.role).icon}</div><h3>${mine.role === 'dracula' ? 'จงเลือกเหยื่อทุกคืน' : 'อย่าให้ Dracula กลืนคฤหาสน์นี้'}</h3><button class="primary" id="continue">รับรู้แล้ว <span>→</span></button></div>` : phase === 'end' ? `<div class="result"><div>${g.winner === 'dracula' ? '♛' : '✠'}</div><h3>${g.winner === 'dracula' ? 'Dracula ครองงานเลี้ยง' : 'เหล่าแขกชนะแล้ว!'}</h3><p>${g.log[g.log.length-1]}</p>${state.isHost ? '<button id="restart" class="primary">เล่นอีกครั้ง</button>' : ''}</div>` : `<div class="instruction">${!mine.alive ? 'คุณออกจากเกมแล้ว — เฝ้าดูชะตากรรมของผู้รอดชีวิต' : phase === 'night' ? (isAction ? 'เลือกเป้าหมายของคุณแบบลับ ๆ' : 'ปิดตาไว้ และรอจนกว่ารุ่งอรุณจะมา…') : phase === 'vote' ? (voted ? 'บัตรลงคะแนนของคุณถูกส่งแล้ว รอผู้อื่น…' : 'แตะชื่อผู้ที่คุณสงสัย') : 'พูดคุยกับเพื่อน ๆ แล้วเจ้าของห้องจะเปิดการโหวต'}</div><div class="player-grid table-grid">${g.players.map(x => card(x,{reveal, selectable:(phase==='night' && isAction && x.alive && x.id!==mine.id) || (phase==='vote' && mine.alive && x.alive && !voted),selected:voted===x.id})).join('')}</div>${state.isHost ? hostControls() : ''}`}</section></div></section>`;
  document.querySelectorAll('.player[data-id]').forEach(el => el.onclick = () => choose(el.dataset.id));
  document.querySelector('#continue')?.addEventListener('click', () => state.isHost ? advanceReveal() : send({type:'ready'}));
  document.querySelector('#restart')?.addEventListener('click', () => { state.game.phase='lobby'; state.game.players.forEach(p=>{p.alive=true;delete p.role});sync();renderLobby(); });
}
function hostControls() { const g=state.game; if(g.phase==='reveal') return ''; if(g.phase==='night') return '<button class="outline host-next" id="resolve">ให้รุ่งอรุณมาเยือน</button>'; if(g.phase==='day') return '<button class="primary host-next" id="open-vote">เปิดการโหวต <span>→</span></button>'; if(g.phase==='vote') return '<button class="outline host-next" id="resolve">นับคะแนนโหวต</button>'; return ''; }
function choose(id) { const g=state.game,m=me(); if(!m.alive) return; if(g.phase==='night' && ['dracula','hunter','doctor'].includes(m.role)) sendAction(id); else if(g.phase==='vote' && !g.actions[m.id]) sendAction(id); }
function sendAction(target) { if(state.isHost) hostMessage({type:'action',from:state.peer.id,target}); else send({type:'action',from:state.peer.id,target}); }
function hostMessage(msg) { if(msg.type==='action') { state.game.actions[msg.from]=msg.target; sync(); render(); } if(msg.type==='ready' && state.game.phase==='reveal') {} }
function advanceReveal(){ state.game.phase='night';state.game.actions={};state.game.log.push('ความมืดปกคลุมคฤหาสน์');sync();render(); }
function resolveNight() { const g=state.game, drac=g.players.find(p=>p.role==='dracula'&&p.alive), victim=g.actions[drac?.id], doctor=g.players.find(p=>p.role==='doctor'&&p.alive), saved=g.actions[doctor?.id]; if(victim&&victim!==saved){const p=g.players.find(x=>x.id===victim);p.alive=false;g.log.push(`${p.name} ถูกพบในยามเช้า…`);}else g.log.push('คืนนี้ไม่มีผู้ใดถูกสังเวย'); checkEnd() || (g.phase='day');g.actions={};sync();render(); }
function resolveVote() { const g=state.game, votes={};Object.values(g.actions).forEach(id=>votes[id]=(votes[id]||0)+1);const target=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]?.[0];if(target){const p=g.players.find(x=>x.id===target);p.alive=false;g.log.push(`${p.name} ถูกขับออกจากงานเลี้ยง`);}else g.log.push('ไม่มีใครถูกขับออก');if(!checkEnd()){g.round++;g.phase='night';g.actions={};g.log.push('ราตรีใหม่เริ่มต้นขึ้น');}sync();render(); }
function checkEnd(){const g=state.game, drac=g.players.find(p=>p.role==='dracula'),alive=g.players.filter(p=>p.alive);if(!drac.alive){g.phase='end';g.winner='guests';g.log.push('Dracula ถูกเปิดโปง เหล่าแขกรอดชีวิต!');return true;}if(alive.length<=2){g.phase='end';g.winner='dracula';g.log.push('ไม่มีใครเหลือพอจะหยุด Dracula ได้');return true;}return false;}
document.addEventListener('click', e => { if(!state.isHost)return; if(e.target.id==='resolve') state.game.phase==='night'?resolveNight():resolveVote(); if(e.target.id==='open-vote'){state.game.phase='vote';state.game.actions={};state.game.log.push('บัตรลงคะแนนถูกส่งรอบโต๊ะ');sync();render();} });
renderHome();
