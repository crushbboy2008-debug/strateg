'use strict';
// ---------- Связь с площадкой Playgama (Bridge SDK) ----------
// Bridge подключён скриптом в index.html и инициализируется в boot.js до загрузки игры. Если его нет (например, нет сети), игра работает как обычно.
// Тут: язык площадки, хранилище (вместо localStorage), состояние звука/паузы/рекламы, сообщение «игра готова», показ рекламы между боями.
const Plat = {
  ok: false, lang: 'en', paused: false, adOpen: false, mobile: false,
  get frozen() { return this.paused || this.adOpen; }, // одиночный бой стоит, пока площадка просит паузу или показывает рекламу
  async init() {
    if (typeof bridge === 'undefined') return;
    try { await bridge.initialize(); this.ok = true; } catch (e) { return; }
    try { this.lang = String(bridge.platform.language || 'en').slice(0, 2).toLowerCase(); this.id = bridge.platform.id; } catch (e) {}
    try { this.mobile = ['mobile', 'tablet'].includes(bridge.device.type); } catch (e) {}
    await Store.load();
  },
  // подписки на события площадки; звук отдаётся единому регулятору Sfx (там же скрытая вкладка)
  bind() {
    if (!this.ok) return;
    try {
      const p = bridge.platform, E = bridge.EVENT_NAME;
      // стартовое состояние: если площадка заглушила игру, молчим с первого кадра (у заглушки 'mock' вне площадок флаг всегда false — его не слушаем)
      if (p.id !== 'mock') Sfx.setHold('platform', p.isAudioEnabled === false);
      p.on(E.AUDIO_STATE_CHANGED, on => Sfx.setHold('platform', !on));
      p.on(E.PAUSE_STATE_CHANGED, v => { this.paused = !!v; Sfx.setHold('pause', !!v); });
      const ad = bridge.advertisement;
      if (ad) {
        if (ad.interstitialState === 'opened') { this.adOpen = true; Sfx.setHold('ad', true); }
        ad.on(E.INTERSTITIAL_STATE_CHANGED, s => { this.adOpen = s === 'opened'; Sfx.setHold('ad', this.adOpen); });
      }
    } catch (e) {}
  },
  // Первый играбельный кадр готов (меню построено, игрок может нажимать)
  ready() { if (this.ok) try { bridge.platform.sendMessage('game_ready'); } catch (e) {} },
  // Рекламу показывает сам Bridge (он решает, когда пора): вызываем в естественных паузах
  showAd(placement) { if (this.ok) try { bridge.advertisement.showInterstitial(placement); } catch (e) {} },
  // Сообщения о ходе боя для аналитики площадки
  level(name) { if (this.ok) try { bridge.platform.sendMessage(name); } catch (e) {} },
  get multiplayer() { try { return this.ok && bridge.multiplayer && bridge.multiplayer.isSupported ? bridge.multiplayer : null; } catch (e) { return null; } },
};

// Сохранения только через Bridge (localStorage запрещён правилами площадки): значения хранятся как JSON-строки, пишутся не чаще раза в 0,4 с
const Store = {
  vals: {}, dirty: new Set(), timer: null, KEYS: ['settings', 'profile'],
  async load() {
    try {
      const d = await bridge.storage.get(this.KEYS);
      this.KEYS.forEach((k, i) => { try { const v = d && d[i]; this.vals[k] = v ? (typeof v === 'string' ? JSON.parse(v) : v) : null; } catch (e) { this.vals[k] = null; } });
    } catch (e) {}
  },
  get(k) { return this.vals[k] || null; },
  set(k, v) { this.vals[k] = v; this.dirty.add(k); clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); },
  flush() {
    clearTimeout(this.timer);
    if (!Plat.ok || !this.dirty.size) return;
    const keys = [...this.dirty]; this.dirty.clear();
    try { bridge.storage.set(keys, keys.map(k => JSON.stringify(this.vals[k]))).catch(() => {}); } catch (e) {}
  },
};
document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });
