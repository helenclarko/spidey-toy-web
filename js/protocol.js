// Smart Toy BLE protocol, recovered from the Android app (see docs/FINDINGS.md).
// Everything here is plain ES module code with no UI dependencies.

export const SERVICE = '38a561e5-d18a-4c92-9f73-dbc0e5cd2e13';
export const CH_WRITE = '81e4c615-62f2-48b6-8be4-96dcd0801bb7';   // app -> toy
export const CH_NOTIFY = '740563d5-3736-4033-87b5-029c38ccc893';  // toy -> app
export const CH_ACK = '1eaebabd-4ce8-48c3-a1fc-fbe733e1e6ea';     // app writes "1" per received chunk
const XOR_KEY = '$u?4dMk?ii/;b0g';
const CHUNK = 20;

// OP enum ordinals (com.smarttoy.f$b). Loaded from docs/OP_CODES.md-derived table below.
export const OP = {
  LOGIN: 0, SELECT_PROFILE: 1, PLAY_ACTIVITY: 2, GET_NETWORK_SSIDS: 3, CONNECT_TO_SSID: 4, QR_SETUP: 5, HANDSHAKE: 6,
  SLEEP_TOY: 7, PROCESS_UNLOCK_CODE: 8, REGISTER_ACCESS_TOKEN: 9, CHANGE_VOLUME: 10, GET_BATTERY_STATUS: 11, TEST_TOY: 12,
  TEST_TOY_EXTRACTION: 13, TEST_TOY_RECORDING: 14, PACK_COMPLETED: 15, INFO: 16, PROCESS_NETWORK_SSIDS: 17,
  SSID_CONNECTION_STATUS: 18, PARENT_INFO: 19, DISCONNECT_TOY: 20, PARENT_CONNECTED_TO_SOCKET: 21, PARENT_LOGOUT: 22,
  BATTERY_STATUS: 23, GET_API_TOKEN: 35, API_TOKEN: 36, PLAY_ACTIVITY_WITHOUT_ACC: 39, GET_TOY_INFO: 44,
  TOGGLE_VOLUME_CONTROL: 45, SETUP_STATUS: 58, ENABLE_USB_PORT: 59, END_LISTEN_FOR: 60, TOY_STATS: 61, GET_TOY_STATS: 62,
  UPDATE_PROFILE: 63, CLEAR_ACCOUNT: 64, NETWORK_WITHOUT_INTERNET: 65, GET_SETUP_STATE: 66, SETUP_STATE: 67,
  START_PLAY: 70, SET_ALARM: 71, ALARM_FIRED: 72, NETWORK_CONNECTION_FAILURE: 73, CURRENT_ACTIVITY: 74,
  CHECK_AND_UPDATE_TOY: 75, TOY_UPDATE_STATUS: 76, START_TOY_UPDATE: 77, SKIP_SETUP: 78, UPDATE_PROFILE_NAME: 79,
  UPDATE_PROFILE_JSON: 80, DISCONNECT_BLE: 81, PLAY_STARTED: 84, SPIDER_BUTTON_SHORT_PRESS: 85, SHUTDOWN_TOY: 86,
  ENABLE_AVS: 90, AVS_ENABLED: 91, DISABLE_AVS: 92, ENABLE_AVS_FAILED: 93, FORCE_TEAM_CHANGE: 94,
  PLAY_ONBOARDING_AUDIO: 95, SET_TIME_ZONE: 96, TEST_INTERNET_REACHABILITY: 97, REMOVE_ALL_WIFI_NETWORKS: 98,
  REMOVE_CURRENT_WIFI_NETWORK: 99, TOY_VOLUME_UPDATED: 100, GET_PROFILE: 105, ATTACK: 106, PROFILE_JSON_VERSION: 107,
  PLAY_BEEP_SOUND: 108, UPDATE_SKIMMED_PROFILE: 109, NETWORK_PORT_BLOCKED: 110, CLEAR_NEW_PACKS_LIST: 111,
  SET_SENSOR_STATE: 112,
};
export const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

// Merge in the complete generated table (113 ops) when available.
export async function loadFullOpTable(url = 'docs/OP_CODES.md') {
  try {
    const t = await (await fetch(url)).text();
    for (const m of t.matchAll(/^\| (\d+) \| ([A-Z_0-9]+) \|/gm)) { OP[m[2]] = +m[1]; OP_NAME[+m[1]] = m[2]; }
  } catch { /* built-in subset is enough */ }
}

// ---- message codec: base64( utf8( xor(json, key) ) ) ----
const te = new TextEncoder(), td = new TextDecoder();
function xor(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  return out;
}
export function encodeMessage(s) {
  const bytes = te.encode(xor(s));
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
export function decodeMessage(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return xor(td.decode(bytes));
}

// ---- toy connection ----
export class Toy extends EventTarget {
  constructor() {
    super();
    this.device = null; this.connected = false;
    this.id = null;          // toy id, learned from INFO replies
    this.info = {};          // last INFO payload
    this._rx = null; this._queue = Promise.resolve();
  }
  static supported() { return typeof navigator !== 'undefined' && !!navigator.bluetooth; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async connect({ anyDevice = false } = {}) {
    const opts = anyDevice
      ? { acceptAllDevices: true, optionalServices: [SERVICE] }
      : { filters: [{ namePrefix: 'ST' }], optionalServices: [SERVICE] };
    this.device = await navigator.bluetooth.requestDevice(opts);
    this._manual = false;
    this.device.addEventListener('gattserverdisconnected', () => this._onDrop());
    await this._open(false);
  }
  // The toy drops Bluetooth by itself while it listens or plays (the original app just scans again and
  // carries on), so an unexpected drop is retried on the same device instead of ending the session.
  _onDrop() {
    this.connected = false; clearInterval(this._poll); this._rx = null;
    if (this._manual) { this.emit('disconnected'); return; }
    this._reconnect();
  }
  async _reconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true; this.emit('reconnecting');
    // give the toy time to finish listening/playing before we poke it; back off after each failure
    let wait = (this.reconnectDelay ?? 6) * 1000;   // 0 = never reconnect (hands-off test)
    if (!wait) { this._reconnecting = false; this.emit('disconnected'); return; }
    for (let i = 1; i <= 15 && !this._manual; i++) {
      await new Promise(r => setTimeout(r, wait));
      try { await this._open(true); this._reconnecting = false; this.emit('reconnected'); return; }
      catch (e) {
        this.emit('diag', `reconnect attempt ${i} failed: ${e.message}`);
        try { this.device.gatt.disconnect(); } catch { /* already down */ }
        wait = Math.min(wait + 2000, 12000);
      }
    }
    this._reconnecting = false; this.emit('disconnected');
  }
  async _open(isReconnect) {
    clearInterval(this._poll);
    // Windows often fails the first GATT attempt; retry a few times before giving up
    let server, lastErr;
    for (let i = 1; i <= 6 && !server; i++) {
      try { server = await this.device.gatt.connect(); }
      catch (e) { lastErr = e; this.emit('diag', `connect attempt ${i} failed: ${e.message}`); await new Promise(r => setTimeout(r, 800)); }
    }
    if (!server) throw lastErr;
    this.emit('diag', 'Connected to ' + (this.device.name || this.device.id));
    let svc;
    try { svc = await server.getPrimaryService(SERVICE); }
    catch (e) { this.emit('diag', 'Service ' + SERVICE + ' not found: ' + e.message); throw e; }
    // list what the toy really offers (properties tell us which channel can write / notify)
    const chars = await svc.getCharacteristics();
    const byUuid = {};
    for (const c of chars) {
      byUuid[c.uuid] = c;
      const p = c.properties;
      this.emit('diag', `char ${c.uuid}  ` + ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(k => p[k]).join('+'));
    }
    this.chWrite = byUuid[CH_WRITE]; this.chNotify = byUuid[CH_NOTIFY]; this.chAck = byUuid[CH_ACK];
    if (!this.chWrite) throw new Error('Write channel ' + CH_WRITE + ' missing');
    // only subscribe where the toy says it can notify; the original app tried all three
    this.notifying = false;
    for (const c of [this.chNotify, this.chAck, this.chWrite]) {
      if (!c || !(c.properties.notify || c.properties.indicate)) continue;
      const onChange = e => this._onNotify(e);
      c.addEventListener('characteristicvaluechanged', onChange);
      let ok = false;
      for (let i = 1; i <= 3 && !ok; i++) {   // Windows sometimes refuses the first descriptor write
        try { await c.startNotifications(); ok = true; this.emit('diag', 'subscribed ' + c.uuid); if (c === this.chNotify) this.notifying = true; }
        catch (e) { this.emit('diag', `subscribe ${i} failed ${c.uuid}: ${e.message}`); await new Promise(r => setTimeout(r, 400)); }
      }
      // Chrome also fires this event for every readValue(), which would hand each polled chunk to us twice
      if (!ok) c.removeEventListener('characteristicvaluechanged', onChange);
    }
    if (!this.notifying) { this.emit('diag', 'notifications unavailable, polling the reply channel instead'); this._startPolling(); }
    this.connected = true;
    if (!isReconnect) this.emit('connected', { name: this.device.name });
    // the app's first call after discovery; the toy answers with INFO
    // after a drop the toy may still be mid-activity (listening): don't poke it with a message
    if (isReconnect) return;
    // the app's first call is the pairing call (BleCentral.lf): GET_TOY_INFO with CIA = JSON list of known toys ("[]")
    await this.send('GET_TOY_INFO', { CIA: '[]' });
    // a reply can be lost on the first try (polling mode), so ask again a few times
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 8000));
      if (!this.connected || Object.keys(this.info).length) break;
      this.emit('diag', 'no INFO yet, asking again');
      await this.send('GET_TOY_INFO', { CIA: '[]' });   // _writeFrames waits for any reply in progress to finish first
    }
  }
  // Fallback when the OS won't enable notifications: read the reply channel repeatedly and
  // feed any new value through the same path as a notification.
  _startPolling() {
    let busy = false, n = 0;
    this._pollMode = true; this._pollLast = '';
    this._poll = setInterval(async () => {
      if (busy || !this.connected) return;
      busy = true;
      try {
        const dv = await this.chNotify.readValue();
        const s = td.decode(dv);
        if (s && s !== this._pollLast) {
          this._pollLast = s;
          if (n++ < 400) this.emit('diag', 'poll read: ' + JSON.stringify(s));
          this._onNotify({ target: { value: dv } });
        }
      } catch (e) { if (n++ < 5) this.emit('diag', 'poll read failed: ' + e.message); }
      busy = false;
    }, 150);
  }
  disconnect() { this._manual = true; clearInterval(this._poll); if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); }

  // dt may be a string or an object/array (serialised to JSON like the app does)
  send(opName, dt = '') {
    const ord = typeof opName === 'number' ? opName : OP[opName];
    if (ord === undefined) throw new Error('Unknown op ' + opName);
    const env = { OP: ord, DT: typeof dt === 'string' ? dt : JSON.stringify(dt) };
    if (this.id) env.ID = this.id;
    if (this.sendAcc !== false) env.ACC = this.acc ?? 'cust_spideyweb';   // the app always sends ACC: its account id, or "0" when there is no account (b.hz())
    const json = JSON.stringify(env);
    this.emit('tx', { op: OP_NAME[ord] || ord, json });
    return this._writeFrames(encodeMessage(json));
  }

  _writeFrames(payload) {
    const frames = ['#MS'];
    for (let i = 0; i < payload.length; i += CHUNK) frames.push(payload.slice(i, i + CHUNK));
    frames.push('#ME');
    this._queue = this._queue.then(async () => {
      if (!this.connected) throw new Error('Toy is not connected');
      await this._idle();
      const p = this.chWrite.properties;
      for (const f of frames) {
        const buf = te.encode(f);
        if (p.write) await this.chWrite.writeValueWithResponse(buf); else await this.chWrite.writeValueWithoutResponse(buf);
      }
    }).catch(e => this.emit('error', e));
    return this._queue;
  }

  // The toy sends one reply at a time, slowly (it waits for our ack after every chunk). A new request
  // sent mid-reply gets its answer mixed into the old one, so wait until the channel has gone quiet.
  async _idle(maxMs = 12000) {
    const t0 = Date.now();
    while (this.connected && Date.now() - t0 < maxMs) {
      const quiet = Date.now() - (this._lastRx || 0);
      if (this._rx === null && quiet > 600) return;
      if (this._rx !== null && quiet > 4000) { this._rx = null; return; }   // abandoned half-reply
      await new Promise(r => setTimeout(r, 150));
    }
  }

  async _onNotify(ev) {
    this._lastRx = Date.now();
    const text = td.decode(ev.target.value);
    this.emit('raw', text);
    try { await this.chAck.writeValue(te.encode('1')); } catch { /* ack is best-effort */ }
    if (text === '#MS') { this._rx = ''; return; }
    if (text === '#ME') {
      const frame = this._rx; this._rx = null;
      if (!frame) return;             // stale #ME still sitting on the channel: no ack, no reset
      this._pollLast = '';            // a message finished: forget the last value so the next one is not de-duplicated
      try {
        const json = decodeMessage(frame);
        let msg; try { msg = JSON.parse(json); } catch { msg = null; }
        if (msg) this._handle(msg); else this.emit('error', new Error('Reply was not JSON: ' + json));
        this.emit('rx', { op: msg && OP_NAME[msg.OP], json, msg });
      } catch (e) { this.emit('error', new Error('Could not decode a reply (wrong key?) ' + e.message)); }
      return;
    }
    // Polling can miss the opening #MS (the channel is overwritten between reads), so a data
    // chunk with no message open starts one. In notify mode this branch never runs.
    if (this._rx === null && this._pollMode) this._rx = '';
    if (this._rx !== null) this._rx += text;
  }

  _handle(msg) {
    if (msg.ID) this.id = msg.ID;
    let dt = msg.DT; if (typeof dt === 'string') { try { dt = JSON.parse(dt); } catch { /* keep string */ } }
    const name = OP_NAME[msg.OP];
    if (name === 'INFO') { this.info = dt || {}; this.emit('info', this.info); }
    else if (name === 'BATTERY_STATUS') this.emit('battery', dt);
    else if (name === 'CURRENT_ACTIVITY' || name === 'PLAY_STARTED') this.emit('activity', dt);
    this.emit('message', { name, dt, raw: msg });
  }

  // ---- friendly commands used by the UI ----
  playHandle(h) { return this.send('PLAY_ACTIVITY', [{ handle: String(h) }]); }
  playPack(id) { return this.send('PLAY_ACTIVITY', [{ handle: 'pack.' + id }]); }
  stopHandle(h) { return this.send('PLAY_ACTIVITY', [{ handle: 'stop.' + h }]); }
  setGuard(on) { return on ? this.playPack(470) : this.stopHandle('guard'); }   // "pack.470" / "stop.guard" in GuardModeView
  setVolume(frac) { return this.send('CHANGE_VOLUME', { VOL: String(frac) }); }
  getBattery() { return this.send('GET_BATTERY_STATUS', ''); }
  beep() { return this.send('PLAY_BEEP_SOUND', ''); }
  // Exactly the app's onboarding (SelectionView.uG, once per screen), all values lower case, no read-back:
  //   name screen : op 79 "first_second", then op 80 {heroNameOne, heroNameTwo}
  //   power screen: op 80 {powerOne, powerTwo}
  // The phone never waits for a reply from the toy; each send() only waits for the channel to be quiet.
  async setHero(nameA, nameB, powerA, powerB) {
    const [a, b, c, d] = [nameA, nameB, powerA, powerB].map(w => w.toLowerCase());
    await this.send(79, `${a}_${b}`);
    await this.send(80, JSON.stringify({ heroNameOne: a, heroNameTwo: b }));
    await this.send(80, JSON.stringify({ powerOne: c, powerTwo: d }));
  }
  getProfile() { return this.send(105, ''); }
  // Sequence from the author's earlier Android tool (helenclarko/Sphero-Spiderman, MainViewModel on OP=16): the toy only
  // answers GET_PROFILE after SET_TOY_TIME + SKIP_SETUP ("enter offline BLE mode"); otherwise it just replies CURRENT_ACTIVITY.
  // The full profile arrives as UPDATE_PROFILE (63), a trimmed one as UPDATE_SKIMMED_PROFILE (109); it takes ~13 s.
  async pullProfile() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    await this.send(113, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    await new Promise(r => setTimeout(r, 500));
    await this.send(78, '');
    await new Promise(r => setTimeout(r, 2000));
    await this.send(105, '');
  }
  sleep() { return this.send('SLEEP_TOY', ''); }
  shutdown() { return this.send('SHUTDOWN_TOY', ''); }
  setTimeZone(tz = Intl.DateTimeFormat().resolvedOptions().timeZone) { return this.send('SET_TIME_ZONE', { TZ: tz }); }
  setSensors(on) { return this.send('SET_SENSOR_STATE', { DSP: !!on }); }
  setVolumeControl(on) { return this.send('TOGGLE_VOLUME_CONTROL', { AVE: !!on }); }
  scanWifi() { return this.send('GET_NETWORK_SSIDS', ''); }
  joinWifi(ssid, pwd) { return this.send('CONNECT_TO_SSID', { SSID: ssid, PWD: pwd }); }
  forgetWifi() { return this.send('REMOVE_ALL_WIFI_NETWORKS', ''); }
  checkUpdate() { return this.send('CHECK_AND_UPDATE_TOY', ''); }
}
