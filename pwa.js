/* PWA lifecycle only. Customer/catalog state is deliberately not persisted. */
(() => {
  'use strict';
  const status = document.getElementById('pwaStatus');
  const install = document.getElementById('installApp');
  const help = document.getElementById('installDialog');
  const instructions = document.getElementById('installInstructions');
  const details = document.getElementById('installDetails');
  const updateBanner = document.getElementById('pwaUpdate');
  const updateButton = document.getElementById('updateApp');
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const isStandalone = () => standaloneQuery.matches || window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const supported = 'serviceWorker' in navigator && window.isSecureContext && (location.protocol === 'https:' || isLocal);
  let deferredInstall = null, registration = null, offlineReady = false, updateRequested = false;
  function showStatus(text) { status.textContent = text; details.textContent = text; }
  function syncInstallButton() {
    install.textContent = isStandalone() ? 'Об установке' : 'Установить';
    if (isStandalone() && offlineReady) showStatus('Установлено · офлайн-версия готова');
  }
  function showHelp() {
    instructions.replaceChildren();
    const add = (text) => { const p = document.createElement('p'); p.textContent = text; instructions.append(p); };
    if (!supported) {
      add('Для установки откройте опубликованное приложение по HTTPS-ссылке. Из файла или обычного HTTP-адреса в локальной сети PWA не устанавливается.');
      add('На компьютере для разработки подходит localhost. Для iPhone используйте HTTPS, например адрес GitHub Pages.');
    } else if (isStandalone()) {
      add('Вы уже открыли Danatela как приложение. После первого успешного сохранения файлов конструктор можно запускать без интернета.');
    } else if (isIOS) {
      add('Откройте эту страницу в Safari. Нажмите «Поделиться», затем «На экран „Домой“» и подтвердите добавление. Если предлагается переключатель «Открывать как веб-приложение», включите его.');
      add('Дождитесь сообщения «Офлайн-версия готова», затем запускайте Danatela с появившейся иконки. Интерфейс меню зависит от версии iOS.');
    } else {
      add('Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран». Если команды нет, попробуйте Chrome, Edge или Safari на поддерживаемом устройстве.');
    }
    add('Для открытия VK нужен интернет. Установка приложения не создаёт общий кабинет и не делает демонстрационную админку защищённой.');
    syncInstallButton();
    help.showModal();
  }
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstall = event; syncInstallButton(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; syncInstallButton(); showStatus('Установлено. Запускайте Danatela с главного экрана.'); });
  standaloneQuery.addEventListener('change', syncInstallButton);
  install.addEventListener('click', async () => {
    if (!deferredInstall || isStandalone()) return showHelp();
    const prompt = deferredInstall; deferredInstall = null;
    try { await prompt.prompt(); const result = await prompt.userChoice; if (result.outcome !== 'accepted') showHelp(); }
    catch { showHelp(); }
  });
  function showWaitingUpdate() {
    if (registration?.waiting && navigator.serviceWorker.controller) updateBanner.classList.remove('hidden');
  }
  updateButton.addEventListener('click', () => {
    if (!registration?.waiting) { showStatus('Новая версия уже активна. Обновите страницу, когда будете готовы.'); updateBanner.classList.add('hidden'); return; }
    if (!window.confirm('Обновить приложение? Начинки, цены и заявки этой сессии будут сброшены.')) return;
    updateRequested = true;
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  });
  if (!supported) {
    showStatus('Для установки и офлайн-режима нужен HTTPS');
    syncInstallButton();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
    else if (offlineReady) showStatus(isStandalone() ? 'Установлено · офлайн-версия готова' : 'Офлайн-версия готова · можно установить');
  });
  window.addEventListener('offline', () => showStatus(offlineReady ? 'Без интернета · конструктор доступен' : 'Нет сети · офлайн-версия ещё не готова'));
  window.addEventListener('online', () => {
    showStatus(offlineReady ? 'Офлайн-версия готова' : 'Подготавливаем офлайн-версию…');
    registration?.update().catch(() => {});
  });
  async function boot() {
    try {
      showStatus('Подготавливаем офлайн-версию…');
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      showWaitingUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') showWaitingUpdate();
          if (worker.state === 'redundant' && !offlineReady) showStatus('Не удалось сохранить файлы для офлайн. Проверьте сеть и публикацию.');
        });
      });
      await navigator.serviceWorker.ready;
      offlineReady = true;
      showStatus(navigator.onLine ? 'Офлайн-версия готова · можно установить' : 'Без интернета · конструктор доступен');
      syncInstallButton();
      registration.update().catch(() => {});
    } catch (error) {
      console.warn('Danatela PWA registration:', error);
      showStatus('Офлайн недоступен. Проверьте HTTPS и файлы публикации.');
    }
  }
  syncInstallButton();
  boot();
})();
