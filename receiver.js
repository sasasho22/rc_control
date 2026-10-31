/*
 * receiver.js — ゲーム側（PCブラウザ）でスマホコントローラーの入力を受け取るライブラリ
 *
 * 事前に PeerJS を読み込んでおくこと:
 *   <script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
 *
 * 使い方:
 *   const pad = new PhoneController({ controllerUrl: "https://example.github.io/rc/controller.html" });
 *   const pairUrl = await pad.start();     // このURLをQRコードにして表示する
 *   // ゲームループ内:
 *   const { steer, throttle, brake } = pad.state;
 *     steer    : -1(左) 〜 1(右)
 *     throttle :  0 〜 1
 *     brake    :  0 〜 1
 *
 * 入力が途絶えたとき(staleMs以上)は自動で 0 を返します（暴走防止）。
 */
class PhoneController {
  constructor(opts = {}) {
    this.controllerUrl = opts.controllerUrl || new URL("controller.html", location.href).href;
    this.staleMs = opts.staleMs ?? 400;
    this.onStatus = opts.onStatus || (() => {});
    this.connected = false;
    this.id = "";
    this.pairUrl = "";
    this._s = { steer: 0, throttle: 0, brake: 0 };
    this._t = 0;
    this._conn = null;
    this._peer = null;
  }

  get state() {
    if (performance.now() - this._t > this.staleMs) return { steer: 0, throttle: 0, brake: 0 };
    return this._s;
  }

  start() {
    return new Promise((resolve, reject) => {
      const open = (attempt) => {
        const id = "rc" + Math.random().toString(36).slice(2, 8);
        const peer = new Peer(id);
        this._peer = peer;

        peer.on("open", () => {
          this.id = id;
          const u = new URL(this.controllerUrl);
          u.searchParams.set("id", id);
          this.pairUrl = u.href;
          this.onStatus("待機中：スマホで接続してください");
          resolve(this.pairUrl);
        });

        peer.on("connection", (conn) => {
          if (this._conn && this._conn.open) { try { this._conn.close(); } catch (e) {} }
          this._conn = conn;
          conn.on("open", () => { this.connected = true; this.onStatus("スマホ接続済み"); });
          conn.on("data", (d) => {
            if (!d || typeof d !== "object") return;
            const c = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || 0));
            this._s = { steer: c(d.s, -1, 1), throttle: c(d.t, 0, 1), brake: c(d.b, 0, 1) };
            this._t = performance.now();
          });
          conn.on("close", () => {
            if (this._conn === conn) { this.connected = false; this.onStatus("スマホが切断されました"); }
          });
        });

        peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });

        peer.on("error", (err) => {
          if (err.type === "unavailable-id" && attempt < 5) { open(attempt + 1); return; }
          this.onStatus("エラー: " + err.type);
          if (!this.id) reject(err);
        });
      };
      open(0);
    });
  }

  stop() {
    try { if (this._peer) this._peer.destroy(); } catch (e) {}
    this.connected = false;
  }
}
