// Enlace directo entre los dos jugadores (WebRTC DataChannel): evita el viaje de ida y vuelta por el servidor
// (que en el plan gratuito está lejos y es el principal origen del retraso). El servidor solo sirve de
// "teléfono" para intercambiar las direcciones (señalización); si no se logra conectar, todo sigue por el servidor.

export type SignalMsg = { k: 'rtc'; sdp?: { type: 'offer' | 'answer'; sdp: string }; ice?: RTCIceCandidateInit | null };

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
];

export type PeerState = 'idle' | 'connecting' | 'open' | 'failed' | 'closed';

export class PeerLink {
  state: PeerState = 'idle';
  /** Latencia (ms) de ida y vuelta medida por el canal directo. */
  rtt = 0;
  private pc: RTCPeerConnection | null = null;
  /** Canal fiable y ordenado: mandos, cambios, pausas, chat y latidos. */
  private ctl: RTCDataChannel | null = null;
  /** Canal fiable sin orden: instantáneas del partido (una pérdida no frena a las siguientes). */
  private snap: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pingTimer = 0;
  private failTimer = 0;
  private opened = 0;

  constructor(
    readonly role: 'host' | 'guest',
    private readonly signal: (m: SignalMsg) => void,
    private readonly onMessage: (d: { k?: string; [key: string]: unknown }) => void,
    private readonly onState: (s: PeerState) => void = () => {},
  ) {}

  static supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  start(timeoutMs = 8000) {
    if (!PeerLink.supported() || this.pc) return;
    this.setState('connecting');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onicecandidate = (e) => this.signal({ k: 'rtc', ice: e.candidate ? e.candidate.toJSON() : null });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') this.fail();
    };
    pc.ondatachannel = (e) => this.attach(e.channel);
    if (this.role === 'host') {
      this.attach(pc.createDataChannel('ctl', { ordered: true }));
      this.attach(pc.createDataChannel('snap', { ordered: false }));
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o).then(() => this.signal({ k: 'rtc', sdp: { type: 'offer', sdp: o.sdp ?? '' } })))
        .catch(() => this.fail());
    }
    this.failTimer = window.setTimeout(() => { if (this.state !== 'open') this.fail(); }, timeoutMs);
  }

  private attach(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'ctl') this.ctl = ch; else if (ch.label === 'snap') this.snap = ch; else return;
    ch.onopen = () => this.check();
    ch.onclose = () => { if (this.state === 'open') this.fail(); };
    ch.onmessage = (ev) => {
      let d: { k?: string; [key: string]: unknown };
      try { d = JSON.parse(String(ev.data)); } catch { return; }
      if (d.k === 'pp') { this.send({ k: 'pq', at: d.at }); return; }
      if (d.k === 'pq') { const r = performance.now() - Number(d.at); if (r >= 0 && r < 5000) this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; return; }
      this.onMessage(d);
    };
    if (ch.readyState === 'open') this.check();
  }

  private check() {
    if (this.state === 'open' || !this.ctl || !this.snap || this.ctl.readyState !== 'open' || this.snap.readyState !== 'open') return;
    window.clearTimeout(this.failTimer);
    this.opened = performance.now();
    this.setState('open');
    this.pingTimer = window.setInterval(() => this.send({ k: 'pp', at: performance.now() }), 2000);
    this.send({ k: 'pp', at: performance.now() });
  }

  /** Mensaje de señalización recibido del otro jugador (por el servidor). */
  async handleSignal(m: SignalMsg) {
    const pc = this.pc;
    if (!pc || this.state === 'failed' || this.state === 'closed') return;
    try {
      if (m.sdp) {
        await pc.setRemoteDescription(m.sdp);
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (m.sdp.type === 'offer') {
          const a = await pc.createAnswer();
          await pc.setLocalDescription(a);
          this.signal({ k: 'rtc', sdp: { type: 'answer', sdp: a.sdp ?? '' } });
        }
      } else if (m.ice) {
        if (pc.remoteDescription) await pc.addIceCandidate(m.ice).catch(() => {});
        else this.pendingIce.push(m.ice);
      }
    } catch {
      this.fail();
    }
  }

  /** Envía por el canal directo. Devuelve false si no está disponible (hay que usar el servidor). */
  send(d: { k?: string; [key: string]: unknown }): boolean {
    if (this.state !== 'open') return false;
    const ch = d.k === 's' ? this.snap : this.ctl;
    if (!ch || ch.readyState !== 'open') return false;
    // si el canal se atasca (mala conexión), las instantáneas viejas se descartan en vez de acumularse
    if (d.k === 's' && ch.bufferedAmount > 64 * 1024) return true;
    try { ch.send(JSON.stringify(d)); return true; } catch { return false; }
  }

  get open() {
    return this.state === 'open';
  }

  private setState(s: PeerState) {
    if (this.state === s) return;
    this.state = s;
    this.onState(s);
  }

  private fail() {
    if (this.state === 'closed') return;
    window.clearTimeout(this.failTimer);
    window.clearInterval(this.pingTimer);
    this.setState('failed');
    try { this.pc?.close(); } catch { /* */ }
  }

  close() {
    window.clearTimeout(this.failTimer);
    window.clearInterval(this.pingTimer);
    this.state = 'closed';
    try { this.pc?.close(); } catch { /* */ }
    this.pc = this.ctl = this.snap = null;
  }
}
