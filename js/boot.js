'use strict';
// Запуск игры. Порядок важен для площадки Playgama: сначала Bridge SDK (скрипт в <head>) инициализируется и подгружаются сохранения,
// и только потом начинается загрузка самой игры (код, three.js, модели).
(async function () {
  const load = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error(src)); document.head.appendChild(s); });
  try {
    await load('js/platform.js');
    await Plat.init();
    if (Plat.id === 'mock' && new URLSearchParams(location.search).has('mpmock')) await load('tools/mp-mock.js'); // проверка сетевой игры вне площадки (между вкладками)
    await load('js/i18n.js'); I18n.set(Plat.id === 'mock' && /^[a-z]{2}$/.test(new URLSearchParams(location.search).get('lang') || '') ? new URLSearchParams(location.search).get('lang') : Plat.lang); // (?lang=en — проверка вне площадок) // язык — только из Bridge: ru → русский, любой другой → английский
    for (const src of ['js/data.js', 'js/game.js', 'js/ai.js', 'js/net.js', 'js/campaign.js']) await load(src); // классические скрипты — строго по очереди
    I18n.applyData(); I18n.applyDom(document.body);
    Plat.bind();
    await import('./main.js');
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:0;display:grid;place-items:center;color:#ddd;font:16px sans-serif">Не удалось загрузить игру. Обновите страницу.</p>');
  }
})();
