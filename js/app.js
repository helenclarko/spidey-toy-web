import { Toy, OP, OP_NAME, loadFullOpTable } from './protocol.js';
import { MODES, ACTIVITIES, ALL_PACKS, HANDLES } from './catalog.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const { dataset, ...props } = attrs;
  const n = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(n.dataset, dataset);   // dataset is read-only, so it can't go through Object.assign(n, ...)
  kids.forEach(k => n.append(k)); return n;
};

// ---------- offline stand-in so the UI can be explored without a toy ----------
class DemoToy extends Toy {
  async connect() {
    this.connected = true; this.id = 'DEMO-TOY';
    this.emit('connected', { name: 'ST-Demo' });
    setTimeout(() => this._handle({ OP: OP.INFO, ID: this.id, DT: JSON.stringify({ PER: 0.82, CHG: false, VOL: 0.6, SSID: 'Demo Wi-Fi' }) }), 300);
  }
  send(opName, dt = '') {
    const ord = typeof opName === 'number' ? opName : OP[opName];
    this.emit('tx', { op: OP_NAME[ord] || ord, json: JSON.stringify({ OP: ord, DT: typeof dt === 'string' ? dt : JSON.stringify(dt) }) });
    if (OP_NAME[ord] === 'GET_BATTERY_STATUS') this._handle({ OP: OP.BATTERY_STATUS, ID: this.id, DT: JSON.stringify({ PER: 0.82 }) });
    return Promise.resolve();
  }
  disconnect() { this.connected = false; this.emit('disconnected'); }
}

let toy = null, demo = false, playing = null;
const stack = ['splash'];

// ---------- navigation ----------
function show(id, { push = true } = {}) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (push && stack[stack.length - 1] !== id) stack.push(id);
  if (id === 'settings') renderToyInfo();
}
function back() { if (stack.length > 1) stack.pop(); show(stack[stack.length - 1], { push: false }); }
document.querySelectorAll('[data-back]').forEach(b => b.onclick = back);

function toast(msg, ms = 2600) {
  const t = el('div', { className: 'toast', textContent: msg }); document.body.append(t); setTimeout(() => t.remove(), ms);
}

// ---------- log ----------
const logEl = $('#log');
function log(cls, msg) {
  const d = el('div', { className: cls, textContent: `${new Date().toLocaleTimeString()}  ${msg}` });
  logEl.append(d); logEl.scrollTop = 1e9;
}
$('#clearLog').onclick = () => { logEl.textContent = ''; };
$('#copyLog').onclick = () => navigator.clipboard?.writeText(logEl.textContent).then(() => toast('Log copied'));

// ---------- wiring a toy instance to the UI ----------
function attach(t) {
  toy = t;
  t.addEventListener('connected', e => {
    log('inf', 'connected to ' + e.detail.name);
    $('#connDot').classList.add('on'); $('#connText').textContent = demo ? 'Demo mode' : 'Connected';
    $('#chime')?.play().catch(() => {});
    show('home');
  });
  t.addEventListener('disconnected', () => {
    log('inf', 'disconnected');
    $('#connDot').classList.remove('on'); $('#connText').textContent = 'Not connected';
    toast('Lost connection with the toy.');
    stopSetupPoll(); setup.active = false;
    setPlaying(null);
    stack.length = 1; show('splash', { push: false });
  });
  // the toy drops Bluetooth while it listens/plays; stay on the current screen and reconnect quietly
  t.addEventListener('reconnecting', () => {
    log('inf', 'connection dropped, reconnecting...');
    $('#connDot').classList.remove('on'); $('#connText').textContent = 'Reconnecting...';
  });
  t.addEventListener('reconnected', () => {
    log('inf', 'reconnected');
    $('#connDot').classList.add('on'); $('#connText').textContent = 'Connected';
  });
  t.addEventListener('diag', e => { console.log('[toy]', e.detail); log('inf', e.detail); diagLines.push(e.detail); });
  t.addEventListener('tx', e => log('tx', `> ${e.detail.op}  ${String(e.detail.json).replace(/(\\"PWD\\":\\")(?:[^"\\]|\\.)*?(\\")/, '$1<hidden>$2')}`));
  t.addEventListener('message', e => {
    const { name, dt } = e.detail;
    setupOnMessage(name, dt);
    if (name === 'TOY_STATS' && dt && dt.ACC) {
      t.acc = String(dt.ACC);
      const box = $('#aAccVal'); if (box) box.value = t.acc;
      log('inf', 'ACC read from the toy: ' + t.acc + ' (used for name/power writes)');
      try { localStorage.toyAcc = t.acc; } catch { /* storage unavailable */ }
    }
    if (name === 'UPDATE_PROFILE' || name === 'UPDATE_SKIMMED_PROFILE') {
      const out = $('#profileOut');
      let txt = typeof dt === 'string' ? dt : JSON.stringify(dt, null, 1);
      // each profile's "json" is itself a JSON string: unpack it so it is readable
      try { const arr = typeof dt === 'string' ? JSON.parse(dt) : dt; (Array.isArray(arr) ? arr : [arr]).forEach(o => { if (o && typeof o.json === 'string') o.json = JSON.parse(o.json); }); txt = JSON.stringify(arr, null, 1); } catch { /* show as received */ }
      if (out) out.textContent = `${name}
${txt}`;
    }
  });
  t.addEventListener('rx', e => log('', `< ${e.detail.op || '?'}  ${hideToken(String(e.detail.json))}`));
  t.addEventListener('raw', e => { if ($('#rawLog').checked) log('inf', 'raw< ' + e.detail); });
  t.addEventListener('error', e => log('err', e.detail.message || String(e.detail)));
  t.addEventListener('info', e => { applyInfo(e.detail); renderToyInfo(); setupOnInfo(e.detail); });
  t.addEventListener('battery', e => showBattery(e.detail));
}

function pct(v) { const n = Number(v); if (Number.isNaN(n)) return null; return Math.round(n <= 1 ? n * 100 : n); }
function showBattery(dt) {
  const p = pct(dt && (dt.PER ?? dt.BAT ?? dt.LVL ?? dt.BL));
  const b = $('#battery');
  if (p === null) return;
  b.hidden = false; b.textContent = `Battery ${p}%${dt.CHG ? ' ⚡' : ''}`;
}
function applyInfo(i) {
  showBattery(i);
  if (i.VOL !== undefined && !Number.isNaN(Number(i.VOL))) { const v = Number(i.VOL); $('#volume').value = Math.round((v <= 1 ? v : v / 100) * 100); }
}
function renderToyInfo() {
  const dl = $('#toyInfo'); dl.textContent = '';
  const i = (toy && toy.info) || {};
  const rows = [['Name', toy?.device?.name || (demo ? 'ST-Demo' : '—')], ['Toy ID', toy?.id || '—'], ['Wi-Fi', i.SSID || '—'], ['Product', i.TPI || '—'], ['Charging', i.CHG === undefined ? '—' : (i.CHG ? 'Yes' : 'No')]];
  rows.forEach(([k, v]) => dl.append(el('dt', { textContent: k }), el('dd', { textContent: v })));
}

// ---------- splash ----------
let connecting = false;
async function connectReal(any = false) {
  if (connecting) return fail('Already trying to connect, please wait.');   // a second concurrent connect fights the first for the toy
  connecting = true;
  try { await connectReal2(any); } finally { connecting = false; }
}
async function connectReal2(any) {
  $('#splashErr').hidden = true; diagLines.length = 0;
  try { toy?.disconnect(); } catch { /* old connection already gone */ }
  if (!Toy.supported()) { return fail('This browser can\'t talk Bluetooth. Please use Chrome or Edge.'); }
  try { demo = false; attach(new Toy()); toy.acc = ($('#aAccVal').value.trim() || 'cust_spideyweb'); toy.sendAcc = $('#aAcc').checked; toy.reconnectDelay = +$('#aRcDelay').value; await toy.connect({ anyDevice: any }); }
  catch (e) {
    if (e.name === 'NotFoundError') return fail('No toy chosen. Make sure the toy is on (foot light glowing) and try again.');
    console.error('[toy] connect failed', e);
    fail('Could not connect (build 3): ' + e.message + (diagLines.length ? '\n\n' + diagLines.join('\n') : ''));
  }
}
const diagLines = [];
function fail(msg) { const p = $('#splashErr'); p.textContent = msg; p.hidden = false; }
$('#btnConnect').onclick = () => connectReal(false);
$('#btnAny').onclick = () => connectReal(true);   // no name filter, for toys that don't advertise "ST…"
$('#btnDemo').onclick = async () => { demo = true; attach(new DemoToy()); await toy.connect(); };
if (!Toy.supported()) fail('Bluetooth isn\'t available in this browser. Use Chrome or Edge (https or localhost).');

// ---------- home ----------
const modesEl = $('#modes');
MODES.forEach(m => modesEl.append(el('button', { className: 'mode', onclick: () => openMode(m) },
  el('img', { src: 'artwork/' + m.icon.replace('.png', '.svg'), alt: '' }),
  el('span', {}, el('b', { textContent: m.title }), el('small', { textContent: m.blurb })))));

$('#btnSettings').onclick = () => show('settings');
$('#btnHelp').onclick = () => show('help');

let guardBusy = false;
$('#guard').onchange = async e => {
  if (guardBusy) return;
  try { await toy.setGuard(e.target.checked); setNow(e.target.checked ? 'Guard mode is on' : null); }
  catch { toast('Cannot connect with the toy at the moment.'); guardBusy = true; e.target.checked = !e.target.checked; guardBusy = false; }
};

let volTimer;
$('#volume').oninput = e => { clearTimeout(volTimer); volTimer = setTimeout(() => toy?.setVolume((e.target.value / 100).toFixed(2)), 250); };

function setNow(text) { $('#nowPlayingText').textContent = text || 'Your toy is waiting'; }

// ---------- activity lists ----------
function openMode(m) {
  $('#listTitle').textContent = m.title;
  const wrap = $('#activities'); wrap.textContent = '';
  ACTIVITIES.filter(a => a.mode === m.key).forEach(a => {
    const b = el('button', { className: 'act', dataset: { id: a.id } }, el('img', { src: 'artwork/v4_pack_place_holder.svg', alt: '' }), a.name);
    b.onclick = () => toggleActivity(a);
    wrap.append(b);
  });
  syncPlaying(); show('list');
}
function setPlaying(a) { playing = a; syncPlaying(); setNow(a ? 'Playing: ' + a.name : null); }
function syncPlaying() { document.querySelectorAll('.act').forEach(b => b.classList.toggle('playing', playing && +b.dataset.id === playing.id)); }
async function toggleActivity(a) {
  // Always launch. The page cannot tell when an activity finishes by itself, and the cancel message
  // (stop.<id>) is unconfirmed, so a "second press cancels" rule sent stop instead of play.
  try { await (a.handle ? toy.playHandle(a.handle) : toy.playPack(a.id)); setPlaying(a); }
  catch { toast('Cannot connect with the toy at the moment.'); }
}

// ---------- settings ----------
// hero name: word lists are the audio files the original app shipped (assets/names/first|second)
// Only words that have a spoken '_first_second.mp3' in the activity packs (checked against the server file lists):
// the app also listed Crimson, Iron, Night, War and Avenger, but no pack carries audio for them.
// TOY_STATS carries the toy's login token (ATOK): keep it out of the log you may paste somewhere
function hideToken(j) {
  const a = j.indexOf('ATOK'); if (a < 0) return j;
  const col = j.indexOf(':', a), b = j.indexOf('ACC', a), c = b < 0 ? -1 : j.lastIndexOf(',', b);
  return col < 0 || c < col ? j : j.slice(0, col + 1) + '<hidden>' + j.slice(c);
}

const NAMES_A = 'Amazing Battle Colossal Danger Doctor Frost Galactic Ghost Incredible Mech Midnight Mini Pyro Scarlet Sonic Spark Stealth Supreme Turbo Ultimate'.split(' ');
const NAMES_B = 'Cat Dude Falcon Fury Hornet Hound Hunter Kid King Lady Machine Master Patriot Raptor Raven Saber Shark Striker Tiger Wolf'.split(' ');
const POW_A = 'Acid Bionic Electric Explosive Flaming Freezing Indestructible Laser Magnetized Piercing Plasma Projectile Radioactive Rapid Shockwave Sticky Super Thunder Tremor Whirlwind'.split(' ');
const POW_B = 'Arms Bark Blades Blasters Breath Burst Clap Claws Fangs Fists Grenades Hammer Kick Missiles Shock Stomp Strength Tail Waves Webs'.split(' ');
POW_A.forEach(w => $('#powA').append(el('option', { value: w, textContent: w })));
POW_B.forEach(w => $('#powB').append(el('option', { value: w, textContent: w })));
// words with no single-word clip (docs/PROFILE_PATH.md s3): the toy may stay quiet for them in some activities
const QUIET = new Set(['Amazing', 'Battle', 'Midnight', 'Scarlet', 'Hornet']);
NAMES_A.forEach(w => $('#nameA').append(el('option', { value: w, textContent: QUIET.has(w) ? w + ' (quiet)' : w })));
NAMES_B.forEach(w => $('#nameB').append(el('option', { value: w, textContent: QUIET.has(w) ? w + ' (quiet)' : w })));
try { $('#nameA').value = localStorage.heroA || 'Supreme'; $('#nameB').value = localStorage.heroB || 'Tiger'; $('#powA').value = localStorage.powA || 'Super'; $('#powB').value = localStorage.powB || 'Strength'; } catch { /* storage unavailable */ }
$('#namePlay').onclick = () => { $('#nameMsg').textContent = 'Audio previews are not included in this version.'; };
$('#nameSave').onclick = async () => {
  const a = $('#nameA').value, b = $('#nameB').value, c = $('#powA').value, d = $('#powB').value;
  try {
    $('#nameMsg').textContent = 'Sending... this takes about 20 seconds.';
    await toy.setHero(a, b, c, d);
    try { localStorage.heroA = a; localStorage.heroB = b; localStorage.powA = c; localStorage.powB = d; } catch { /* storage unavailable */ }
    $('#nameMsg').textContent = `Sent: ${a} ${b}, ${c} ${d}. Check the Advanced log, then ask Spidey "What's my name?"`;
  } catch { $('#nameMsg').textContent = 'Cannot connect with the toy at the moment.'; }
};
$('#btnBeep').onclick = () => toy.beep();
$('#btnBatt').onclick = () => toy.getBattery();
$('#btnSleep').onclick = () => { toy.sleep(); toast('Sleep sent'); };
$('#btnDisc').onclick = () => toy.disconnect();
$('#btnWifi').onclick = async () => {
  const s = $('#ssid').value.trim(), p = $('#pwd').value;
  if (!s) return $('#wifiMsg').textContent = 'No network name is provided.';
  if (!p) return $('#wifiMsg').textContent = 'You must enter a password for the network.';
  await toy.joinWifi(s, p); $('#wifiMsg').textContent = 'The new Wi-Fi settings have been sent to your toy.';
};
// ---------- first-time setup ----------
// A factory-state toy reports STM:true in INFO. Observed after a pin-hole reset: send Wi-Fi, the toy logs in and downloads
// by itself, and INFO flips to STM:false (about 5 minutes). Replies other than INFO are not answered while it is online.
const setup = { active: false, dismissed: false, poll: null, started: 0 };
function setupStep(n) { document.querySelectorAll('#setup [data-step]').forEach(s => { s.hidden = +s.dataset.step !== n; }); }
function setupMsg(t) { $('#setupMsg').textContent = t; }
function stopSetupPoll() { clearInterval(setup.poll); setup.poll = null; }
function startSetupPoll() {
  stopSetupPoll(); setup.started = Date.now();
  setup.poll = setInterval(() => {
    if (!toy?.connected) return;
    if (Date.now() - setup.started > 20 * 60000) { stopSetupPoll(); setupMsg('Still not finished after 20 minutes. Check the Wi-Fi password, then press "Enter it again".'); return; }
    try { Promise.resolve(toy.send('GET_TOY_INFO', {})).catch(() => {}); } catch { /* not connected right now */ }
  }, 12000);
}
function openSetup(info) {
  setup.active = true; setup.dismissed = false;
  $('#setupDone').hidden = true; setupMsg('');
  if (info && info.STM === false && info.ICS !== 'ON') { setupStep(3); setupMsg('This toy already finished setup. You can still set its hero.'); }
  else if (info && info.ICS === 'ON') { setupStep(2); setupMsg('The toy is online. Waiting for it to finish setting itself up...'); startSetupPoll(); }
  else setupStep(1);
  show('setup');
}
function closeSetup() {
  stopSetupPoll(); setup.active = false; setup.dismissed = true;
  stack.length = 1; show('home');
}
function setupOnInfo(i) {
  if (!setup.active) { if (i.STM === true && !setup.dismissed && !demo) openSetup(i); return; }
  if (i.STM === false && setup.poll) { stopSetupPoll(); setupStep(3); setupMsg('Setup is complete. Now pick your hero.'); }
  else if (i.ICS === 'ON' && setup.poll) setupMsg('The toy is online and still setting itself up... (' + Math.round((Date.now() - setup.started) / 60000) + ' min)');
}
function setupOnMessage(name, dt) {
  if (!setup.active) return;
  if (name === 'SSID_CONNECTION_STATUS') {
    if (dt && dt.ST === 'connected') { setupStep(2); setupMsg('Connected to Wi-Fi. Waiting for the toy to finish setting itself up...'); startSetupPoll(); }
    else setupMsg('The toy could not join that network (' + ((dt && dt.ST) || 'unknown') + '). Check the name and password.');
  } else if (name === 'NETWORK_CONNECTION_FAILURE') setupMsg('The toy could not join that network. Check the name and password.');
}
NAMES_A.forEach(w => $('#setupA').append(el('option', { value: w, textContent: w })));
NAMES_B.forEach(w => $('#setupB').append(el('option', { value: w, textContent: w })));
POW_A.forEach(w => $('#setupPA').append(el('option', { value: w, textContent: w })));
POW_B.forEach(w => $('#setupPB').append(el('option', { value: w, textContent: w })));
$('#setupA').value = 'Supreme'; $('#setupB').value = 'Tiger'; $('#setupPA').value = 'Piercing'; $('#setupPB').value = 'Arms';
$('#setupWifi').onclick = async () => {
  const s = $('#setupSsid').value.trim(), p = $('#setupPwd').value;
  if (!s) return setupMsg('No network name is provided.');
  if (!p) return setupMsg('You must enter a password for the network.');
  setupMsg('Sending the Wi-Fi settings to the toy...');
  try { await toy.joinWifi(s, p); setupMsg('Sent. Waiting for the toy to join the network...'); } catch { setupMsg('Cannot connect with the toy at the moment.'); }
};
$('#setupAgain').onclick = () => { stopSetupPoll(); setupStep(1); setupMsg(''); };
$('#setupSave').onclick = async () => {
  const a = $('#setupA').value, b = $('#setupB').value, c = $('#setupPA').value, d = $('#setupPB').value;
  try {
    setupMsg('Sending... this takes about 20 seconds.');
    await toy.setHero(a, b, c, d);
    try { localStorage.heroA = a; localStorage.heroB = b; localStorage.powA = c; localStorage.powB = d; } catch { /* storage unavailable */ }
    setupMsg(`Sent: ${a} ${b}, ${c} ${d}. Ask Spidey "What's my name?" to check.`); $('#setupDone').hidden = false;
  } catch { setupMsg('Cannot connect with the toy at the moment.'); }
};
$('#setupSkip').onclick = closeSetup;
$('#setupDone').onclick = closeSetup;
$('#btnSetup').onclick = () => openSetup(toy?.info);

let taps = 0, tapTimer;
$('#version').onclick = () => {
  clearTimeout(tapTimer); tapTimer = setTimeout(() => taps = 0, 1500);
  if (++taps >= 5) { taps = 0; toast('Advanced tools unlocked'); show('advanced'); }
};

// ---------- advanced ----------
function fillAdvanced() {
  const opSel = $('#opSel'); opSel.textContent = '';
  Object.keys(OP).sort((a, b) => OP[a] - OP[b]).forEach(n => opSel.append(el('option', { textContent: `${OP[n]} · ${n}`, value: n })));
  const ps = $('#packSel'); ps.textContent = '';
  const hs = $('#handleSel'); hs.textContent = '';
  [...HANDLES].sort((a, b) => a.localeCompare(b)).forEach(h => hs.append(el('option', { value: h, textContent: h })));
  ALL_PACKS.forEach(([id, n]) => ps.append(el('option', { value: id, textContent: `${id} · ${n}` })));
}
$('#opSend').onclick = () => {
  const dt = $('#opDt').value.trim();
  try { toy.send($('#opSel').value, dt); } catch (e) { toast(e.message); }
};
$('#handleGo').onclick = () => toy.playHandle($('#handleSel').value);
$('#handleStop').onclick = () => toy.stopHandle($('#handleSel').value);
$('#packGo').onclick = () => toy.playPack($('#packSel').value);
$('#packStop').onclick = () => toy.stopHandle($('#packSel').value);
$('#aTz').onclick = () => toy.setTimeZone();
$('#aInfo').onclick = () => toy.send('GET_TOY_INFO', {});
// read-only diagnostics: ask the toy about itself, write nothing to its profile
// The app's init-pairing call (BleCentral.lf) sends the phone's team-socket id (TSI) and a list of known toys (CIA).
// We learned the toy's TSI from INFO; echoing it back may be what makes the toy treat us as its paired phone.
$('#aPair').onclick = () => {
  const tsi = toy?.info?.TSI;
  if (!tsi) return toast('No TSI yet: wait for the toy info first.');
  toy.send('GET_TOY_INFO', { TSI: tsi, CIA: '[]' });   // the phone sends TSI once it knows one
};
$('#aPull').onclick = () => { $('#profileOut').textContent = 'Asking the toy... (about 30 s)'; toy.pullProfile(); };
// exactly what the APK sends (mobile/d/a.java getProfileFromToy): op 105 with an empty DT; no time sync, no SKIP_SETUP
$('#aPull2').onclick = () => { $('#profileOut').textContent = 'Asking the toy (GET_PROFILE only)... wait 30 s'; toy.getProfile(); };
$('#aStats').onclick = () => toy.send(62, { CSN: true, SP: true });   // GET_TOY_STATS
$('#aSetup').onclick = () => toy.send(66, '');                         // GET_SETUP_STATE
$('#aScan').onclick = () => toy.scanWifi();
$('#aUpd').onclick = () => toy.checkUpdate();
$('#aForget').onclick = () => toy.forgetWifi();
$('#aShut').onclick = () => { if (confirm('Shut the toy down?')) toy.shutdown(); };
$('#aSens').onchange = e => toy.setSensors(e.target.checked);
$('#aAcc').onchange = e => { toy.sendAcc = e.target.checked; log('inf', 'ACC field ' + (e.target.checked ? 'on' : 'off')); };
try { if (localStorage.toyAcc && $('#aAccVal')) $('#aAccVal').value = localStorage.toyAcc; } catch { /* storage unavailable */ }   // ACC remembered from the toy's stats
$('#aAccVal').onchange = e => { if (toy) toy.acc = e.target.value.trim() || 'cust_spideyweb'; log('inf', 'ACC value ' + toy.acc); };
$('#aRcDelay').onchange = e => { if (toy) toy.reconnectDelay = +e.target.value; };
$('#aVolCtl').onchange = e => toy.setVolumeControl(e.target.checked);

loadFullOpTable().then(fillAdvanced);
fillAdvanced();
if (location.search.includes('advanced')) { /* dev shortcut: ?demo&advanced */ }
if (location.search.includes('demo')) $('#btnDemo').click();
