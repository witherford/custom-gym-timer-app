// features.js — additive features for Custom Gym Timer
// Reads/writes window.timerCfg already defined in index.html. Listens for
// timer:* CustomEvents dispatched by the main script.

(function () {
  'use strict';

  var APP_VERSION = '2.0.0';

  // ── ARIA live region announcements ──────────────────────────
  function announce(text) {
    var live = document.getElementById('aria-live');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 30);
  }

  // ── Wake Lock ───────────────────────────────────────────────
  var wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (!window.timerCfg.wakeLockOn) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', function () { wakeLock = null; });
    } catch (e) { /* user denied or unavailable */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && window.__timerActive) requestWakeLock();
  });

  // ── Vibration ───────────────────────────────────────────────
  function vibrate(pattern) {
    if (!window.timerCfg.vibrateOn) return;
    if (!('vibrate' in navigator)) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  // ── Custom audio cues ───────────────────────────────────────
  var cueAudio = { start: null, end: null };
  function rebuildCues() {
    ['start', 'end'].forEach(function (k) {
      var key = k === 'start' ? 'customCueStart' : 'customCueEnd';
      var data = window.timerCfg[key];
      cueAudio[k] = data ? new Audio(data) : null;
      var status = document.getElementById('cue-' + k + '-status');
      if (status) status.textContent = data ? 'Custom' : 'Default';
    });
  }
  function playCue(which) {
    var a = cueAudio[which];
    if (!a) return false;
    try { a.currentTime = 0; a.play(); return true; } catch (e) { return false; }
  }
  window.loadCue = function (which, ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function (e) {
      var key = which === 'start' ? 'customCueStart' : 'customCueEnd';
      window.timerCfg[key] = e.target.result;
      window.saveLocal();
      rebuildCues();
    };
    r.readAsDataURL(f);
  };
  window.clearCue = function (which) {
    var key = which === 'start' ? 'customCueStart' : 'customCueEnd';
    window.timerCfg[key] = '';
    window.saveLocal();
    rebuildCues();
  };
  window.testCue = function (which) {
    if (!playCue(which)) {
      if (which === 'start') window.startOfRoundBeep && window.startOfRoundBeep();
      else window.endOfRoundBeep && window.endOfRoundBeep();
    }
  };

  // ── Theming ─────────────────────────────────────────────────
  var THEMES = [
    { id: 'dark',   label: 'Dark',   bg: '#0a0a0a', dot: '#0a0a0a' },
    { id: 'light',  label: 'Light',  bg: '#f5f5f5', dot: '#f5f5f5' },
    { id: 'amoled', label: 'AMOLED', bg: '#000000', dot: '#000000' }
  ];
  function renderThemeSwatches() {
    var wrap = document.getElementById('theme-swatches');
    if (!wrap) return;
    wrap.innerHTML = '';
    THEMES.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'theme-swatch' + (window.timerCfg.theme === t.id ? ' active' : '');
      el.innerHTML = '<div class="sw-dot" style="background:' + t.dot + ';border:1px solid rgba(255,255,255,0.2)"></div><span>' + t.label + '</span>';
      el.onclick = function () { setTheme(t.id); };
      wrap.appendChild(el);
    });
  }
  function setTheme(id) {
    window.timerCfg.theme = id;
    document.documentElement.setAttribute('data-theme', id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var t = THEMES.find(function (x) { return x.id === id; });
      if (t) meta.setAttribute('content', t.bg);
    }
    window.saveLocal();
    renderThemeSwatches();
  }
  window.setAccent = function (color) {
    window.timerCfg.accent = color;
    document.documentElement.style.setProperty('--accent', color);
    var input = document.getElementById('th-accent');
    if (input) input.value = color;
    window.saveLocal();
  };

  // ── Voice countdown 3-2-1 ───────────────────────────────────
  function maybeVoiceCountdown(secLeft, isReady) {
    if (!window.timerCfg.voiceCountdownOn) return;
    if (!isReady) return;
    if (secLeft === 3) window.speak && window.speak('three');
    else if (secLeft === 2) window.speak && window.speak('two');
    else if (secLeft === 1) window.speak && window.speak('one');
  }

  // ── Session history & stats ─────────────────────────────────
  var HISTORY_KEY = 'mbt_history';
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-200))); } catch (e) {}
  }
  var sessionStartTs = null;
  var sessionPreset = null;
  var sessionRoundsCompleted = 0;
  function startSession(preset) {
    sessionStartTs = Date.now();
    sessionPreset = preset;
    sessionRoundsCompleted = 0;
  }
  function endSession(completed) {
    if (!sessionStartTs || !sessionPreset) return;
    var entry = {
      ts: sessionStartTs,
      end: Date.now(),
      durationSec: Math.round((Date.now() - sessionStartTs) / 1000),
      presetName: window.getPresetFullName ? window.getPresetFullName(sessionPreset, null) : 'Session',
      rounds: sessionRoundsCompleted,
      totalRounds: sessionPreset.rounds,
      completed: !!completed
    };
    var h = loadHistory();
    h.push(entry);
    saveHistory(h);
    sessionStartTs = null;
    sessionPreset = null;
    renderHistory(); renderStats();
  }
  window.clearHistory = function () {
    if (!confirm('Delete all session history?')) return;
    saveHistory([]);
    renderHistory(); renderStats();
  };
  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function renderHistory() {
    var list = document.getElementById('history-list');
    if (!list) return;
    var h = loadHistory().slice().reverse();
    if (!h.length) { list.innerHTML = '<div class="history-empty">No sessions logged yet.</div>'; return; }
    list.innerHTML = h.map(function (e) {
      return '<div class="history-row">'
        + '<div><div class="h-name">' + (e.presetName || 'Session') + '</div>'
        + '<div class="h-meta">' + fmtDate(e.ts) + ' · ' + e.rounds + '/' + e.totalRounds + ' rounds · ' + (e.completed ? 'Completed' : 'Stopped') + '</div></div>'
        + '<div class="h-meta">' + fmtDur(e.durationSec) + '</div>'
        + '</div>';
    }).join('');
  }
  function renderStats() {
    var grid = document.getElementById('stats-grid');
    var week = document.getElementById('stats-week');
    if (!grid || !week) return;
    var h = loadHistory();
    var totalSec = h.reduce(function (a, e) { return a + (e.durationSec || 0); }, 0);
    var totalRounds = h.reduce(function (a, e) { return a + (e.rounds || 0); }, 0);
    var completed = h.filter(function (e) { return e.completed; }).length;
    grid.innerHTML =
      '<div class="stat-card"><div class="stat-num">' + h.length + '</div><div class="stat-label">Sessions</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + completed + '</div><div class="stat-label">Completed</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + totalRounds + '</div><div class="stat-label">Rounds</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + fmtDur(totalSec) + '</div><div class="stat-label">Total time</div></div>';

    var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var w = h.filter(function (e) { return e.ts >= weekAgo; });
    var wSec = w.reduce(function (a, e) { return a + (e.durationSec || 0); }, 0);
    var wRounds = w.reduce(function (a, e) { return a + (e.rounds || 0); }, 0);
    week.innerHTML =
      '<div class="stat-card"><div class="stat-num">' + w.length + '</div><div class="stat-label">Sessions</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + wRounds + '</div><div class="stat-label">Rounds</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + fmtDur(wSec) + '</div><div class="stat-label">Time</div></div>';
  }

  // ── Import/Export ───────────────────────────────────────────
  window.exportPresets = function () {
    var payload = {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      sections: window.sections,
      timerCfg: window.timerCfg
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gym-timer-presets-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  window.importPresets = function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.sections) throw new Error('Invalid file');
        if (!confirm('Import will replace all current presets. Continue?')) return;
        window.sections = data.sections;
        if (data.timerCfg) window.timerCfg = Object.assign(window.timerCfg, data.timerCfg);
        window.saveLocal();
        window.render && window.render();
        window.syncSettingsUI && window.syncSettingsUI();
        applyAllSettings();
        alert('Imported ' + data.sections.length + ' section(s).');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    r.readAsText(f);
    ev.target.value = '';
  };

  // ── Web Worker timer keep-alive (background tabs) ──────────
  // Keeps the timer ticking when the tab is throttled. The main
  // tick() function still runs via rAF when foregrounded; this
  // worker fires postMessage every 250ms which we use to invoke
  // a manual tick if rAF is stalled.
  var worker = null;
  var workerLastTick = 0;
  function startWorker() {
    if (worker) return;
    var src = "var iv=null;onmessage=function(e){if(e.data==='start'){if(iv)clearInterval(iv);iv=setInterval(function(){postMessage('tick')},250)}else if(e.data==='stop'){if(iv){clearInterval(iv);iv=null}}}";
    var blob = new Blob([src], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = function () {
      // If rAF hasn't fired in >500ms, force a tick.
      if (window.__timerActive && document.visibilityState !== 'visible') {
        if (typeof window.tick === 'function') {
          try { window.tick(); } catch (e) {}
        }
      }
    };
    worker.postMessage('start');
  }
  function stopWorker() {
    if (worker) { try { worker.postMessage('stop'); worker.terminate(); } catch (e) {} worker = null; }
  }

  // ── Wire up timer events ────────────────────────────────────
  window.addEventListener('timer:loaded', function (e) {
    startSession(e.detail.preset);
    sessionRoundsCompleted = 0;
  });
  window.addEventListener('timer:play', function () {
    window.__timerActive = true;
    requestWakeLock();
    startWorker();
    vibrate(50);
  });
  window.addEventListener('timer:pause', function () {
    window.__timerActive = false;
    releaseWakeLock();
    stopWorker();
  });
  window.addEventListener('timer:stop', function () {
    if (sessionStartTs && sessionRoundsCompleted > 0) endSession(false);
    window.__timerActive = false;
    releaseWakeLock();
    stopWorker();
  });
  window.addEventListener('timer:phase', function (e) {
    var p = e.detail.phase;
    if (p === 'work') {
      sessionRoundsCompleted = e.detail.round || sessionRoundsCompleted;
      announce('Round ' + e.detail.round + ' of ' + e.detail.total + ', work');
      vibrate([200, 80, 200]);
    } else if (p === 'rest') {
      announce('Rest');
      vibrate([100, 80, 100]);
    } else if (p === 'ready') {
      announce('Get ready');
      vibrate(80);
    }
  });
  window.addEventListener('timer:tick', function (e) {
    maybeVoiceCountdown(e.detail.secLeft, e.detail.isReady);
  });
  window.addEventListener('timer:done', function (e) {
    sessionRoundsCompleted = (e.detail.rounds) || sessionRoundsCompleted;
    endSession(true);
    announce('Session complete');
    vibrate([400, 100, 400, 100, 400]);
    releaseWakeLock();
    stopWorker();
    window.__timerActive = false;
  });

  // ── Apply settings on load ──────────────────────────────────
  function applyAllSettings() {
    var cfg = window.timerCfg;
    document.documentElement.setAttribute('data-theme', cfg.theme || 'dark');
    document.documentElement.style.setProperty('--accent', cfg.accent || '#c8102e');

    var setIf = function (id, prop, val) {
      var el = document.getElementById(id); if (el) el[prop] = val;
    };
    setIf('th-wakelock', 'checked', !!cfg.wakeLockOn);
    setIf('th-vibrate', 'checked', !!cfg.vibrateOn);
    setIf('th-voicecount', 'checked', !!cfg.voiceCountdownOn);
    setIf('th-accent', 'value', cfg.accent || '#c8102e');

    rebuildCues();
    renderThemeSwatches();
    renderHistory(); renderStats();

    var ver = document.getElementById('app-version');
    if (ver) ver.textContent = 'v' + APP_VERSION;
  }

  // ── Check for updates (manual) ──────────────────────────────
  window.checkForUpdates = async function () {
    var btn = document.getElementById('btn-check-update');
    var status = document.getElementById('update-status');
    if (status) status.textContent = 'Checking…';
    if (btn) btn.disabled = true;

    if (!('serviceWorker' in navigator)) {
      if (status) status.textContent = 'Not supported in this browser';
      if (btn) btn.disabled = false;
      return;
    }
    try {
      var reg = window.__swReg || await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (status) status.textContent = 'Service worker not registered';
        if (btn) btn.disabled = false;
        return;
      }
      await reg.update();
      // Give the browser a moment to discover a waiting worker
      await new Promise(function (r) { setTimeout(r, 800); });

      if (reg.waiting) {
        if (status) status.textContent = 'Updating…';
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange listener in index.html will reload
      } else if (reg.installing) {
        if (status) status.textContent = 'Downloading update…';
        reg.installing.addEventListener('statechange', function () {
          if (reg.waiting) {
            if (status) status.textContent = 'Updating…';
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      } else {
        if (status) status.textContent = 'Already up to date';
        if (btn) btn.disabled = false;
        setTimeout(function () { if (status) status.textContent = ''; }, 4000);
      }
    } catch (e) {
      if (status) status.textContent = 'Update check failed';
      if (btn) btn.disabled = false;
    }
  };

  // expose for SW-cue checking & first-paint init
  window.Features = {
    playCue: playCue,
    announce: announce,
    requestWakeLock: requestWakeLock,
    applyAllSettings: applyAllSettings
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAllSettings);
  } else {
    applyAllSettings();
  }

  // Patch switchTab to refresh history/stats when those tabs are opened
  var origSwitchTab = window.switchTab;
  window.switchTab = function (id) {
    origSwitchTab(id);
    if (id === 'history') renderHistory();
    if (id === 'stats') renderStats();
  };
})();
