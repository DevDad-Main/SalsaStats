    const statsApi = window.salsaStats;
    const updateBanner = document.getElementById('update-banner');
    const updateMessage = document.getElementById('update-message');
    const updateInstall = document.getElementById('update-install');
    window.addEventListener('error', event => {
      event.preventDefault();
      statsApi?.reportError?.('Uncaught renderer error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
      }, true);
    });
    window.addEventListener('unhandledrejection', event => {
      event.preventDefault();
      const reason = event.reason;
      statsApi?.reportError?.('Unhandled renderer promise rejection', {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });
    const samples = [];
    const chart = document.getElementById('history-chart');
    const context = chart.getContext('2d');
    const modeToggle = document.getElementById('mode-toggle');
    const overlayToggle = document.getElementById('overlay-toggle');
    const pinToggle = document.getElementById('pin-toggle');
    const logsPath = document.getElementById('logs-path');
    const logsStatus = document.getElementById('logs-status');
    const previewStage = document.getElementById('preview-stage');
    const osdPanel = document.getElementById('osd-panel');
    const quickMenu = osdPanel.querySelector('.osd-quick-menu');
    const maxSamples = 48;
    const PREVIEW_BASE_WIDTH = 340;
    const defaultSettings = {
      visible: {
        gpuTemp: true, gpuUsage: true, gpuVram: true, gpuClock: true,
        cpuTemp: true, cpuUsage: true, cpuClock: true, memoryUsage: true,
        fpsCurrent: true, fpsAverage: true, fpsLow: true, graphRate: true, graphTime: true,
        cpuBusy: false, gpuBusy: false, clickToPhoton: false, syncInfo: false, frameType: false, videoBusy: false,
        encoderLoad: false, diskRead: false, diskWrite: false,
        streamRtt: true, streamQuality: true, streamScores: false, streamMode: false, streamBitrate: false, streamHealth: false, streamBottleneck: true, streamClient: false, streamCodec: true, streamFeatures: false, streamFps: true, streamLoss: true, streamAge: true, streamBandwidth: true,
      },
      colors: { gpu: '#3ddc97', cpu: '#5aa9ff', memory: '#f5b94c', fps: '#c084fc' },
      scale: 100,
      size: 100,
      spacing: 0,
      border: true,
      opacity: 88,
      backgroundMode: 'soft',
      anchor: 'top-right',
      overlayAboveGames: false,
      fpsMode: 'raw',
      fpsCap: 60,
      games: [],
      minimal: false,
      minimalRows: { fpsCurrent: true, gpuUsage: true, gpuTemp: true, cpuUsage: true },
      minimalLook: { scale: 100, size: 100, spacing: 0, opacity: 88, backgroundMode: 'soft', border: true },
      hideUnavailable: true,
      startInOverlay: false,
      autoOverlay: false,
    };

    let settings = JSON.parse(JSON.stringify(defaultSettings));
    let legacyGameNames = null;
    try {
      const saved = JSON.parse(localStorage.getItem('salsastats-overlay-settings') || 'null');
      if (saved) {
        legacyGameNames = saved.gameNames || null;
        settings = {
          ...defaultSettings,
          ...saved,
          visible: { ...defaultSettings.visible, ...saved.visible },
          colors: { ...defaultSettings.colors, ...saved.colors },
          games: Array.isArray(saved.games) ? saved.games : [],
          minimalRows: { ...defaultSettings.minimalRows, ...saved.minimalRows },
          minimalLook: { ...defaultSettings.minimalLook, ...saved.minimalLook },
        };
      }
    } catch (error) {
      localStorage.removeItem('salsastats-overlay-settings');
    }
    delete settings.gameNames;

    // A profile is the part of the overlay look a game can override.
    const PROFILE_KEYS = ['visible', 'colors', 'scale', 'size', 'spacing', 'border', 'opacity', 'backgroundMode', 'minimal', 'minimalRows', 'minimalLook'];
    function copyProfile(source) {
      return JSON.parse(JSON.stringify(Object.fromEntries(PROFILE_KEYS.map(key => [key, source[key]]))));
    }
    function normalizeProfile(profile) {
      return {
        ...copyProfile(defaultSettings),
        ...profile,
        visible: { ...defaultSettings.visible, ...profile.visible },
        colors: { ...defaultSettings.colors, ...profile.colors },
        minimalRows: { ...defaultSettings.minimalRows, ...profile.minimalRows },
        minimalLook: { ...defaultSettings.minimalLook, ...profile.minimalLook },
      };
    }
    function newGameId() {
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }
    if (legacyGameNames && !settings.games.length) {
      Object.entries(legacyGameNames).forEach(([exe, name]) => {
        settings.games.push({ id: newGameId(), exe: String(exe).toLowerCase(), name: String(name).slice(0, 60), profile: null });
      });
    }
    settings.games.forEach(game => {
      if (game.profile) game.profile = normalizeProfile(game.profile);
    });

    let editingId = null;
    let activeGameId = null;
    const findGame = id => settings.games.find(game => game.id === id) || null;
    // b1-Win64-Shipping.exe and b1.exe count as the same game.
    function exeKey(name) {
      const lower = String(name).toLowerCase().replace(/\.exe$/, '');
      let key = lower;
      let previous;
      do {
        previous = key;
        key = key.replace(/[-_ ]?(shipping|win64|win32|x64|x86)$/, '');
      } while (key !== previous && key);
      return key || lower;
    }
    const matchGame = exe => settings.games.find(game => exeKey(game.exe) === exeKey(exe)) || null;
    // The minimal view has its own look so tuning it never changes the detailed overlay.
    const lookOf = profile => (profile.minimal ? { ...profile, ...profile.minimalLook } : profile);
    const lookTarget = profile => (profile.minimal ? profile.minimalLook : profile);
    function editTarget() {
      const game = findGame(editingId);
      return game && game.profile ? game.profile : settings;
    }
    function appliedProfile() {
      const id = document.body.classList.contains('overlay') ? activeGameId : editingId;
      const game = findGame(id);
      return game && game.profile ? game.profile : settings;
    }

    const preview = osdPanel.cloneNode(true);
    preview.removeAttribute('id');
    preview.classList.add('preview-osd');
    previewStage.append(preview);

    function saveSettings() {
      localStorage.setItem('salsastats-overlay-settings', JSON.stringify(settings));
    }

    function applySettings() {
      // P drives what the overlay looks like now; E is the profile shown in the editing controls.
      const P = appliedProfile();
      const E = editTarget();
      const L = lookOf(P);
      const root = document.documentElement;
      preview.style.width = `${PREVIEW_BASE_WIDTH * L.size / 100}px`;
      root.style.setProperty('--osd-scale', L.scale / 100);
      root.style.setProperty('--osd-spacing', `${L.spacing || 0}px`);
      const effectiveOpacity = L.backgroundMode === 'none' ? 0 : L.opacity / 100;
      root.style.setProperty('--osd-opacity', effectiveOpacity);
      document.querySelectorAll('.osd-shell').forEach(shell => {
        shell.classList.toggle('background-none', L.backgroundMode === 'none');
        shell.classList.toggle('background-soft', L.backgroundMode === 'soft');
        shell.classList.toggle('background-full', L.backgroundMode === 'full');
        shell.classList.toggle('no-border', L.border === false);
      });
      Object.entries(P.colors).forEach(([name, color]) => {
        root.style.setProperty(`--${name}-color`, color);
      });

      document.querySelectorAll('[data-row]').forEach(row => {
        const setting = row.dataset.row;
        let hidden = Object.prototype.hasOwnProperty.call(P.visible, setting)
          ? !P.visible[setting]
          : false;
        if (P.minimal && !P.minimalRows[setting]) hidden = true;
        row.hidden = hidden;
      });
      document.body.classList.toggle('osd-minimal', P.minimal);
      document.body.classList.toggle('anchor-right', settings.anchor.endsWith('right'));
      document.body.classList.toggle('anchor-bottom', settings.anchor.startsWith('bottom'));
      document.body.classList.toggle('hide-unavailable', settings.hideUnavailable);
      document.querySelectorAll('[data-minimal]').forEach(input => {
        input.checked = E.minimalRows[input.dataset.minimal] === true;
      });
      document.getElementById('hide-unavailable').checked = settings.hideUnavailable;
      document.querySelectorAll('.osd-group').forEach(group => {
        const rows = [...group.querySelectorAll('[data-row]')];
        if (group.dataset.group === 'fps') {
          const fpsRows = rows.filter(row => row.dataset.row !== 'fpsNote');
          const hasVisibleMetric = fpsRows.some(row => !row.hidden);
          group.querySelector('[data-row="fpsNote"]').hidden = !hasVisibleMetric || P.minimal;
          group.hidden = !hasVisibleMetric;
        } else {
          group.hidden = rows.length > 0 && rows.every(row => row.hidden);
        }
      });

      document.querySelectorAll('.osd-shell').forEach(shell => {
        let first = true;
        shell.querySelectorAll('.osd-group').forEach(group => {
          group.classList.toggle('first', first && !group.hidden);
          if (!group.hidden) first = false;
        });
      });

      document.querySelectorAll('[data-setting]').forEach(input => {
        input.checked = E.visible[input.dataset.setting] !== false;
      });
      osdPanel.querySelectorAll('[data-menu-setting]').forEach(input => {
        input.checked = P.visible[input.dataset.menuSetting] !== false;
      });
      document.querySelectorAll('[data-color]').forEach(input => {
        input.value = E.colors[input.dataset.color];
      });
      document.getElementById('scale-setting').value = E.scale;
      document.getElementById('scale-output').textContent = `${E.scale}%`;
      document.getElementById('size-setting').value = E.size;
      document.getElementById('size-output').textContent = `${E.size}%`;
      document.getElementById('spacing-setting').value = E.spacing || 0;
      document.getElementById('spacing-output').textContent = `${E.spacing || 0} px`;
      document.getElementById('opacity-setting').value = E.opacity;
      document.getElementById('opacity-output').textContent = `${E.opacity}%`;
      document.getElementById('background-setting').value = E.backgroundMode;
      document.getElementById('border-setting').checked = E.border !== false;
      document.getElementById('start-overlay').checked = settings.startInOverlay === true;
      document.getElementById('auto-overlay').checked = settings.autoOverlay === true;
      document.querySelectorAll('[data-min]').forEach(input => {
        const value = E.minimalLook[input.dataset.min];
        if (input.type === 'checkbox') input.checked = value !== false;
        else input.value = value;
      });
      document.querySelectorAll('[data-min-output]').forEach(output => {
        const key = output.dataset.minOutput;
        output.textContent = key === 'spacing' ? `${E.minimalLook[key]} px` : `${E.minimalLook[key]}%`;
      });
      document.getElementById('anchor-setting').value = settings.anchor;
      document.getElementById('overlay-above-games').checked = settings.overlayAboveGames === true;
      document.getElementById('fps-mode').value = settings.fpsMode;
      document.getElementById('fps-cap').value = String(settings.fpsCap);
      document.getElementById('fps-cap-row').hidden = settings.fpsMode !== 'capped';
      drawOsdCharts();
    }

    document.querySelectorAll('[data-setting]').forEach(input => {
      input.addEventListener('change', () => {
        editTarget().visible[input.dataset.setting] = input.checked;
        saveSettings();
        applySettings();
      });
    });
    osdPanel.querySelectorAll('[data-menu-setting]').forEach(input => {
      input.addEventListener('change', () => {
        appliedProfile().visible[input.dataset.menuSetting] = input.checked;
        saveSettings();
        applySettings();
      });
    });
    quickMenu.querySelector('.osd-menu-close').addEventListener('click', () => statsApi.setOverlayMenu(false));
    quickMenu.querySelector('.osd-menu-settings').addEventListener('click', openSettings);
    document.querySelectorAll('[data-color]').forEach(input => {
      input.addEventListener('input', () => {
        editTarget().colors[input.dataset.color] = input.value;
        saveSettings();
        applySettings();
      });
    });
    document.getElementById('scale-setting').addEventListener('input', event => {
      editTarget().scale = Number(event.target.value);
      saveSettings();
      applySettings();
    });
    document.getElementById('size-setting').addEventListener('input', event => {
      editTarget().size = Number(event.target.value);
      saveSettings();
      applySettings();
      statsApi.setScale(appliedProfile().size);
    });
    document.getElementById('opacity-setting').addEventListener('input', event => {
      editTarget().opacity = Number(event.target.value);
      saveSettings();
      applySettings();
    });
    document.querySelectorAll('[data-min]').forEach(input => {
      input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
        const target = editTarget().minimalLook;
        const key = input.dataset.min;
        if (input.type === 'checkbox') target[key] = input.checked;
        else if (input.type === 'range') target[key] = Number(input.value);
        else target[key] = input.value;
        saveSettings();
        applySettings();
        if (document.body.classList.contains('overlay')) statsApi.setScale(lookOf(appliedProfile()).size);
      });
    });
    document.getElementById('border-setting').addEventListener('change', event => {
      editTarget().border = event.target.checked;
      saveSettings();
      applySettings();
    });
    document.getElementById('spacing-setting').addEventListener('input', event => {
      editTarget().spacing = Number(event.target.value);
      saveSettings();
      applySettings();
    });
    document.getElementById('background-setting').addEventListener('change', event => {
      editTarget().backgroundMode = event.target.value;
      saveSettings();
      applySettings();
    });
    document.getElementById('anchor-setting').addEventListener('change', event => {
      settings.anchor = event.target.value;
      saveSettings();
      applySettings();
      statsApi.setAnchor(settings.anchor, true);
    });
    document.getElementById('overlay-above-games').addEventListener('change', event => {
      settings.overlayAboveGames = event.target.checked;
      saveSettings();
      statsApi.setOverlayAboveGames(settings.overlayAboveGames);
    });
    document.getElementById('fps-mode').addEventListener('change', event => {
      settings.fpsMode = event.target.value === 'capped' ? 'capped' : 'raw';
      saveSettings();
      applySettings();
      renderFrames(lastFrames);
    });
    document.getElementById('fps-cap').addEventListener('change', event => {
      settings.fpsCap = Number(event.target.value) || 60;
      saveSettings();
      renderFrames(lastFrames);
    });

    const gameLibrary = document.getElementById('game-library');
    const gameStatus = document.getElementById('game-status');

    function prettyGameName(exe) {
      const name = String(exe)
        .replace(/\.exe$/i, '')
        .replace(/[-_ ]?win(32|64)([-_ ]?shipping)?$/i, '')
        .replace(/[-_.]+/g, ' ')
        .trim();
      return name || String(exe);
    }

    function renderProfileBar() {
      const select = document.getElementById('profile-select');
      select.textContent = '';
      [{ id: '', label: 'Default (all games)' }, ...settings.games.map(game => ({ id: game.id, label: game.name }))].forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.label;
        select.append(option);
      });
      if (!findGame(editingId)) editingId = null;
      select.value = editingId || '';
      const game = findGame(editingId);
      const locked = Boolean(game) && !game.profile;
      document.getElementById('profile-custom').hidden = !locked;
      document.getElementById('profile-reset').hidden = !(game && game.profile);
      const controls = document.getElementById('overlay-controls');
      controls.inert = locked;
      controls.classList.toggle('locked', locked);
      let note = 'These settings apply to every game that has no layout of its own.';
      if (locked) note = `${game.name} uses the default layout. Customise it to give this game its own.`;
      else if (game) note = `Changes here only affect ${game.name}.`;
      document.getElementById('profile-note').textContent = note;
    }

    function renderLibrary() {
      gameLibrary.textContent = '';
      document.getElementById('game-empty').hidden = settings.games.length > 0;
      settings.games.forEach(game => {
        const row = document.createElement('li');
        row.className = 'game-row';

        const main = document.createElement('div');
        main.className = 'game-main';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = game.name;
        nameInput.maxLength = 60;
        nameInput.setAttribute('aria-label', `Display name for ${game.exe}`);
        nameInput.addEventListener('change', () => {
          game.name = nameInput.value.trim().slice(0, 60) || prettyGameName(game.exe);
          nameInput.value = game.name;
          saveSettings();
          renderProfileBar();
          renderFrames(lastFrames);
        });
        const meta = document.createElement('div');
        meta.className = 'game-meta';
        const exe = document.createElement('span');
        exe.textContent = game.exe;
        const badge = document.createElement('span');
        badge.className = `game-badge${game.profile ? ' custom' : ''}`;
        badge.textContent = game.profile ? 'Custom layout' : 'Default layout';
        meta.append(exe, badge);
        main.append(nameInput, meta);

        const actions = document.createElement('div');
        actions.className = 'button-row';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'window-action';
        edit.textContent = 'Edit layout';
        edit.addEventListener('click', () => {
          editingId = game.id;
          renderProfileBar();
          applySettings();
          selectTab('overlay');
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'window-action';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          settings.games = settings.games.filter(item => item.id !== game.id);
          if (activeGameId === game.id) activeGameId = null;
          saveSettings();
          renderLibrary();
          renderProfileBar();
          applySettings();
          renderFrames(lastFrames);
        });
        actions.append(edit, remove);

        row.append(main, actions);
        gameLibrary.append(row);
      });
    }

    function addGame(exe, name) {
      const key = String(exe || '').trim().toLowerCase();
      if (!key) return;
      const existing = settings.games.find(game => exeKey(game.exe) === exeKey(key));
      if (existing) {
        gameStatus.textContent = `${existing.name} is already in your library.`;
        return;
      }
      const game = { id: newGameId(), exe: key, name: (name || prettyGameName(exe)).slice(0, 60), profile: null };
      settings.games.push(game);
      saveSettings();
      renderLibrary();
      renderProfileBar();
      renderFrames(lastFrames);
      gameStatus.textContent = `Added ${game.name}. Rename it or customise its layout below.`;
    }

    const picker = document.getElementById('file-picker');
    const pickerList = document.getElementById('picker-list');
    const pickerStatus = document.getElementById('picker-status');
    let pickerListing = { path: '', parent: null, entries: [] };
    let scanResults = null;

    function renderCrumbs() {
      const crumbs = document.getElementById('picker-path');
      crumbs.textContent = '';
      const add = (label, target) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crumb';
        button.textContent = label;
        button.addEventListener('click', () => openFolder(target));
        crumbs.append(button);
      };
      add('This PC', '');
      const parts = (pickerListing.path || '').split('\\').filter(Boolean);
      parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.textContent = '\u203A';
        crumbs.append(separator);
        add(part, `${parts.slice(0, index + 1).join('\\')}\\`);
      });
    }

    function renderPicker() {
      document.getElementById('picker-scan-actions').hidden = !scanResults;
      document.getElementById('picker-scan').hidden = Boolean(scanResults);
      document.getElementById('picker-scan').disabled = !pickerListing.path;
      if (scanResults) return;
      const filter = document.getElementById('picker-filter').value.trim().toLowerCase();
      renderCrumbs();
      document.getElementById('picker-up').disabled = !pickerListing.path;
      pickerList.textContent = '';
      pickerListing.entries
        .filter(entry => !filter || entry.name.toLowerCase().includes(filter))
        .forEach(entry => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `picker-item ${entry.type}`;
          const icon = document.createElement('span');
          icon.className = `picker-icon ${entry.type}`;
          const name = document.createElement('span');
          name.className = 'picker-name';
          name.textContent = entry.name;
          const kind = document.createElement('span');
          kind.className = 'picker-kind';
          kind.textContent = entry.type === 'dir' ? 'Folder' : 'Game .exe';
          button.append(icon, name, kind);
          button.addEventListener('click', () => {
            if (entry.type === 'dir') {
              openFolder(entry.path);
            } else {
              localStorage.setItem('salsastats-picker-dir', pickerListing.path);
              picker.close();
              addGame(entry.name);
            }
          });
          item.append(button);
          pickerList.append(item);
        });
      pickerStatus.textContent = pickerListing.error
        ? `Cannot open this folder: ${pickerListing.error}`
        : (pickerList.childElementCount ? '' : 'No folders or .exe files here.');
    }

    async function openFolder(directory) {
      scanResults = null;
      document.getElementById('picker-filter').value = '';
      try {
        pickerListing = (await statsApi.listDirectory(directory)) || { path: '', parent: null, entries: [] };
      } catch {
        pickerListing = { path: directory, parent: '', entries: [], error: 'Request failed.' };
      }
      renderPicker();
      pickerList.scrollTop = 0;
    }

    document.getElementById('game-browse').addEventListener('click', () => {
      gameStatus.textContent = '';
      picker.showModal();
      openFolder(localStorage.getItem('salsastats-picker-dir') || '');
    });
    document.getElementById('picker-close').addEventListener('click', () => picker.close());

    function updateScanCount() {
      const count = scanResults.filter(game => game.selected && !game.known).length;
      const add = document.getElementById('picker-scan-add');
      add.textContent = `Add selected (${count})`;
      add.disabled = count === 0;
    }

    function renderScan(truncated) {
      pickerList.textContent = '';
      document.getElementById('picker-scan-actions').hidden = false;
      document.getElementById('picker-scan').hidden = true;
      scanResults.forEach(game => {
        const item = document.createElement('li');
        const label = document.createElement('label');
        label.className = 'scan-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = game.selected;
        box.disabled = game.known;
        box.addEventListener('change', () => {
          game.selected = box.checked;
          updateScanCount();
        });
        const name = document.createElement('span');
        name.className = 'picker-name';
        name.textContent = game.name;
        const exe = document.createElement('span');
        exe.className = 'picker-kind';
        exe.textContent = game.known ? 'Already in library' : game.exe;
        label.append(box, name, exe);
        item.append(label);
        pickerList.append(item);
      });
      updateScanCount();
      pickerStatus.textContent = scanResults.length
        ? `${scanResults.length} games found. Untick any you don't want.${truncated ? ' The scan stopped early; try a smaller folder for the rest.' : ''}`
        : 'No games found in this folder.';
    }

    document.getElementById('picker-scan').addEventListener('click', async () => {
      if (!pickerListing.path) return;
      pickerStatus.textContent = 'Scanning...';
      const result = await statsApi.scanGames(pickerListing.path).catch(() => null);
      scanResults = ((result && result.games) || []).map(game => {
        const known = settings.games.some(item => exeKey(item.exe) === exeKey(game.exe));
        return { ...game, known, selected: !known };
      });
      renderScan(result && result.truncated);
    });
    document.getElementById('picker-scan-back').addEventListener('click', () => {
      scanResults = null;
      openFolder(pickerListing.path || '');
    });
    document.getElementById('game-detect').addEventListener('click', async () => {
      gameStatus.textContent = '';
      picker.showModal();
      pickerListing = { path: '', parent: null, entries: [] };
      scanResults = [];
      renderCrumbs();
      renderScan(false);
      pickerStatus.textContent = 'Looking for installed games...';
      const result = await statsApi.detectGames().catch(() => null);
      scanResults = ((result && result.games) || []).map(game => {
        const known = settings.games.some(item => exeKey(item.exe) === exeKey(game.exe));
        return { ...game, known, selected: !known };
      });
      renderScan(false);
      if (!scanResults.length) pickerStatus.textContent = 'No installed games found. Use Add game to pick a folder or .exe.';
    });
    document.getElementById('picker-select-all').addEventListener('click', () => {
      scanResults.forEach(game => { game.selected = !game.known; });
      renderScan(false);
    });
    document.getElementById('picker-select-none').addEventListener('click', () => {
      scanResults.forEach(game => { game.selected = false; });
      renderScan(false);
    });
    document.getElementById('picker-scan-add').addEventListener('click', () => {
      const chosen = (scanResults || []).filter(game => game.selected && !game.known);
      chosen.forEach(game => addGame(game.exe, game.name));
      localStorage.setItem('salsastats-picker-dir', pickerListing.path);
      scanResults = null;
      picker.close();
      gameStatus.textContent = chosen.length ? `Added ${chosen.length} game${chosen.length === 1 ? '' : 's'} from the folder.` : 'No new games were added.';
    });
    document.getElementById('picker-home').addEventListener('click', () => openFolder(''));
    document.getElementById('picker-up').addEventListener('click', () => openFolder(pickerListing.parent || ''));
    document.getElementById('picker-filter').addEventListener('input', renderPicker);
    document.getElementById('picker-system').addEventListener('click', async () => {
      try {
        const picked = await statsApi.browseGame();
        if (picked) {
          picker.close();
          addGame(picked.exe);
        }
      } catch {
        pickerStatus.textContent = 'Could not open the system dialog.';
      }
    });
    document.getElementById('game-current').addEventListener('click', () => {
      const running = lastFrames?.fps;
      if (!running) {
        gameStatus.textContent = 'No running game detected. Start a game first, or use Add game.';
        return;
      }
      addGame(running.application, running.displayName);
    });
    document.getElementById('profile-select').addEventListener('change', event => {
      editingId = event.target.value || null;
      renderProfileBar();
      applySettings();
    });
    document.getElementById('profile-custom').addEventListener('click', () => {
      const game = findGame(editingId);
      if (!game) return;
      game.profile = copyProfile(settings);
      saveSettings();
      renderLibrary();
      renderProfileBar();
      applySettings();
    });
    document.getElementById('profile-reset').addEventListener('click', () => {
      const game = findGame(editingId);
      if (!game) return;
      game.profile = null;
      saveSettings();
      renderLibrary();
      renderProfileBar();
      applySettings();
    });
    renderLibrary();
    renderProfileBar();

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '--';
      return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    }

    function setMeter(id, value) {
      const meter = document.getElementById(id);
      meter.style.width = `${Math.max(0, Math.min(100, value || 0))}%`;
    }

    function drawChart() {
      const bounds = chart.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = window.devicePixelRatio || 1;
      chart.width = Math.round(bounds.width * ratio);
      chart.height = Math.round(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = bounds.width;
      const height = bounds.height;
      const inset = { top: 8, right: 8, bottom: 18, left: 34 };
      const plotWidth = width - inset.left - inset.right;
      const plotHeight = height - inset.top - inset.bottom;

      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;
      context.font = '9px "Segoe UI", sans-serif';
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillStyle = '#8b978d';
      context.strokeStyle = 'rgba(139, 151, 141, .15)';
      for (let line = 0; line <= 4; line += 1) {
        const y = inset.top + (plotHeight * line) / 4;
        context.beginPath();
        context.moveTo(inset.left, y);
        context.lineTo(width - inset.right, y);
        context.stroke();
        context.fillText(`${100 - line * 25}%`, inset.left - 6, y);
      }

      context.textBaseline = 'bottom';
      context.textAlign = 'left';
      context.fillText('older', inset.left, height - 1);
      context.textAlign = 'right';
      context.fillText('now', width - inset.right, height - 1);

      const drawSeries = (key, color) => {
        const values = samples.map(sample => sample[key]);
        if (!values.length || values.every(value => value === null)) return;
        context.beginPath();
        let started = false;
        values.forEach((value, index) => {
          if (value === null) return;
          const x = inset.left + (values.length <= 1 ? 0 : (index / (maxSamples - 1)) * plotWidth);
          const y = inset.top + plotHeight * (1 - Math.max(0, Math.min(100, value)) / 100);
          if (!started) {
            context.moveTo(x, y);
            started = true;
          } else {
            context.lineTo(x, y);
          }
        });
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke();
      };

      const colors = getComputedStyle(document.documentElement);
      drawSeries('cpu', colors.getPropertyValue('--cpu-color').trim());
      drawSeries('gpu', colors.getPropertyValue('--gpu-color').trim());
    }

    var frametimes = [];
    var lastFrames = null;
    var lastGameSeen = 0;
    var gameRunning = false;
    var lastStats = null;

    function syncAutoOverlay() {
      statsApi.setAutoOverlay?.(settings.autoOverlay, gameRunning);
    }

    function renderFrames(frames) {
      lastFrames = frames;
      if (frames?.fps) lastGameSeen = Date.now();
      const running = Date.now() - lastGameSeen < 20000;
      if (running !== gameRunning) {
        gameRunning = running;
        syncAutoOverlay();
      }
      const raw = frames?.fps;
      const cap = settings.fpsMode === 'capped' ? settings.fpsCap : Infinity;
      const matched = raw ? matchGame(raw.application) : null;
      const matchedId = matched ? matched.id : null;
      if (matchedId !== activeGameId) {
        activeGameId = matchedId;
        applySettings();
        if (document.body.classList.contains('overlay')) statsApi.setScale(lookOf(appliedProfile()).size);
      }
      const fps = raw && {
        ...raw,
        name: (matched && matched.name) || raw.displayName || raw.application,
        current: Math.min(raw.current, cap),
        average: Math.min(raw.average, cap),
        low: Math.min(raw.low, cap),
        frametimes: raw.frametimes.map(ms => Math.max(ms, 1000 / cap)),
      };
      frametimes = fps ? fps.frametimes : [];
      const show = value => (fps ? String(value) : '--');
      setField('fpsCurrent', show(fps?.current));
      setField('fpsAverage', show(fps?.average));
      setField('fpsLow', show(fps?.low));
      const milliseconds = value => (Number.isFinite(value) ? `${value.toFixed(1)} ms` : '--');
      const cpuBusy = milliseconds(fps?.cpuBusy);
      const gpuBusy = milliseconds(fps?.gpuBusy);
      const clickToPhoton = milliseconds(fps?.clickToPhotonLatency);
      const videoBusy = milliseconds(fps?.videoBusy);
      const presentation = [
        fps?.presentMode,
        Number.isFinite(fps?.syncInterval) ? `Sync ${fps.syncInterval}` : null,
        fps?.allowsTearing === true ? 'Tearing allowed' : fps?.allowsTearing === false ? 'No tearing' : null,
      ].filter(Boolean).join(' · ') || '--';
      setField('cpuBusy', cpuBusy);
      setField('gpuBusy', gpuBusy);
      setField('clickToPhoton', clickToPhoton);
      setField('syncInfo', presentation);
      setField('frameType', fps?.frameType || '--');
      setField('videoBusy', videoBusy);
      document.getElementById('fps-busy-summary').textContent = cpuBusy === '--' && gpuBusy === '--'
        ? '--'
        : `${cpuBusy} / ${gpuBusy}`;
      document.getElementById('fps-click-to-photon').textContent = clickToPhoton;
      document.getElementById('fps-presentation').textContent = presentation;
      document.getElementById('fps-frame-type').textContent = fps?.frameType || '--';
      const meanFrameTime = raw?.frametimes?.length
        ? raw.frametimes.reduce((sum, value) => sum + value, 0) / raw.frametimes.length
        : null;
      let diagnosis = 'CPU/GPU limit data unavailable.';
      if (Number.isFinite(meanFrameTime) && Number.isFinite(fps?.cpuBusy) && Number.isFinite(fps?.gpuBusy)) {
        const cpuRatio = fps.cpuBusy / meanFrameTime;
        const gpuRatio = fps.gpuBusy / meanFrameTime;
        if (gpuRatio >= 0.85 && cpuRatio <= 0.65) diagnosis = 'Heuristic: likely GPU-limited';
        else if (cpuRatio >= 0.85 && gpuRatio <= 0.65) diagnosis = 'Heuristic: likely CPU-limited';
        else diagnosis = 'Heuristic: no clear CPU/GPU limit';
      }
      document.getElementById('fps-diagnosis').textContent = diagnosis;
      const optionalRows = {
        cpuBusy: Number.isFinite(fps?.cpuBusy),
        gpuBusy: Number.isFinite(fps?.gpuBusy),
        clickToPhoton: Number.isFinite(fps?.clickToPhotonLatency),
        syncInfo: presentation !== '--',
        frameType: Boolean(fps?.frameType),
        videoBusy: Number.isFinite(fps?.videoBusy),
      };
      Object.entries(optionalRows).forEach(([row, unavailable]) => {
        document.querySelectorAll(`[data-row="${row}"]`).forEach(element => element.classList.toggle('unavailable', !unavailable));
      });
      document.getElementById('fps-value').textContent = show(fps?.current);
      document.getElementById('fps-average').textContent = show(fps?.average);
      document.getElementById('fps-low').textContent = show(fps?.low);

      let tag = 'No capture source';
      let note = frames?.message || '';
      const modeLabel = Number.isFinite(cap) ? `capped at ${cap} FPS` : 'raw render rate';
      if (fps) {
        tag = fps.name;
        note = `Measuring ${fps.name} (${modeLabel}).`;
      } else if (frames?.status === 'active') {
        tag = 'Waiting for a game';
        note = 'Start a game to see its frame rate.';
      } else if (frames?.status === 'starting') {
        tag = 'Starting';
        note = 'Starting frame capture...';
      }
      document.getElementById('fps-tag').textContent = tag;
      document.getElementById('fps-note').textContent = note;
      setField('fpsSource', fps ? fps.name : tag);
      const noteText = fps ? `Measuring ${fps.name} · ${modeLabel}` : (note || 'Game capture unavailable');
      document.querySelectorAll('[data-row="fpsNote"]').forEach(element => { element.textContent = noteText; });
    }

    function drawFrameLine(canvas, values, color) {
      if (!values.length) return;
      const bounds = canvas.getBoundingClientRect();
      const chartContext = canvas.getContext('2d');
      const max = Math.max(...values) * 1.1 || 1;
      chartContext.beginPath();
      values.forEach((value, index) => {
        const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * bounds.width;
        const y = 2 + (bounds.height - 4) * (1 - value / max);
        if (index === 0) chartContext.moveTo(x, y);
        else chartContext.lineTo(x, y);
      });
      chartContext.strokeStyle = color;
      chartContext.lineWidth = 1.5;
      chartContext.stroke();
    }

    function drawOsdCharts() {
      document.querySelectorAll('.osd-chart').forEach(canvas => {
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(bounds.width * ratio);
        canvas.height = Math.round(bounds.height * ratio);
        const chartContext = canvas.getContext('2d');
        chartContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        chartContext.clearRect(0, 0, bounds.width, bounds.height);
        chartContext.strokeStyle = 'rgba(255,255,255,.12)';
        chartContext.lineWidth = 1;
        for (let x = 0; x < bounds.width; x += 24) {
          chartContext.beginPath();
          chartContext.moveTo(x, 2);
          chartContext.lineTo(x, bounds.height - 2);
          chartContext.stroke();
        }
        const fpsColor = getComputedStyle(document.documentElement).getPropertyValue('--fps-color').trim() || '#c084fc';
        if (canvas.dataset.chart === 'rate') drawFrameLine(canvas, frametimes.map(ms => 1000 / ms), fpsColor);
        if (canvas.dataset.chart === 'time') drawFrameLine(canvas, frametimes, fpsColor);
      });
    }

    // A single empty sample must not blank the STREAM group, so keep the last reading briefly.
    let lastStream = null;
    let lastStreamAt = 0;
    function heldStream(stream, now) {
      if (stream) {
        lastStream = stream;
        lastStreamAt = now;
        return stream;
      }
      return lastStream && now - lastStreamAt < 15000 ? lastStream : null;
    }

    function setField(name, value) {
      document.querySelectorAll(`[data-field="${name}"]`).forEach(field => {
        field.textContent = value;
        if (name === 'cpuName' || name === 'gpuName') field.title = value;
      });
    }

    const unsubscribeStats = statsApi.onStatsUpdate(stats => {
      document.getElementById('cpu-value').textContent = stats.cpu.usage;
      document.getElementById('cpu-name').textContent = stats.cpu.name;
      document.getElementById('cpu-cores').textContent = stats.cpu.rig
        ? `${stats.cpu.rig.tier} \u00b7 ${stats.cpu.rig.allocation} \u00b7 ${stats.cpu.rig.memory} RAM`
        : `${stats.cpu.cores || '--'} cores`;
      setField('cpuName', stats.cpu.name);
      setMeter('cpu-meter', stats.cpu.usage);

      document.getElementById('gpu-name').textContent = stats.gpu.name;
      setField('gpuName', stats.gpu.name);
      document.getElementById('gpu-value').textContent = stats.gpu.usage === null ? '--' : stats.gpu.usage;
      document.getElementById('gpu-unit').textContent = stats.gpu.usage === null ? '' : '%';
      document.getElementById('gpu-load-label').textContent = stats.gpu.usage === null ? 'Load unavailable' : 'GPU load';
      document.getElementById('gpu-temperature').textContent = stats.gpu.temperature === null ? '-- C' : `${stats.gpu.temperature} C`;
      setMeter('gpu-meter', stats.gpu.usage);

      document.getElementById('memory-value').textContent = stats.memory.usage;
      document.getElementById('memory-detail').textContent = `${formatBytes(stats.memory.used)} in use`;
      document.getElementById('memory-total').textContent = `${formatBytes(stats.memory.total)} total`;
      setMeter('memory-meter', stats.memory.usage);

      setField('gpuTemp', stats.gpu.temperature === null ? '--' : stats.gpu.temperature);
      setField('gpuUsage', stats.gpu.usage === null ? '--' : stats.gpu.usage);
      setField('gpuVram', Number.isFinite(stats.gpu.memoryUsed)
        ? Number.isFinite(stats.gpu.memoryTotal)
          ? `${Math.round(stats.gpu.memoryUsed)} / ${Math.round(stats.gpu.memoryTotal)} MiB`
          : `${Math.round(stats.gpu.memoryUsed)} MiB used`
        : 'Unavailable');
      setField('gpuClock', stats.gpu.clock === null ? 'Unavailable' : `${stats.gpu.clock} MHz`);
      setField('cpuTemp', stats.cpu.temperature === null ? '--' : stats.cpu.temperature);
      setField('cpuUsage', stats.cpu.usage);
      setField('cpuClock', stats.cpu.clock === null ? 'Unavailable' : `${stats.cpu.clock} MHz`);
      setField('memoryUsage', `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)} (${stats.memory.usage}%)`);
      renderFrames(stats.frames);
      lastStats = stats;
      const io = stats.io || {};
      const oneDecimal = value => (Number.isFinite(value) ? value.toFixed(1) : '--');
      setField('encoderLoad', Number.isFinite(stats.gpu.encoder) ? String(stats.gpu.encoder) : '--');
      setField('diskRead', oneDecimal(io.diskReadMBps));
      setField('diskWrite', oneDecimal(io.diskWriteMBps));
      renderCoreBars(stats.cpu.perCore || []);
      const stream = heldStream(stats.stream, stats.sampledAt);
      // QoS values come from log lines that NVIDIA stops writing mid-session; stale ones are not shown.
      const live = Boolean(stream && stream.live);
      const sent = stats.network?.sentMbps;
      const ageSeconds = stream && Number.isFinite(stream.ageMs) ? Math.round(stream.ageMs / 1000) : null;
      const ageText = ageSeconds === null ? null : ageSeconds < 120 ? `${ageSeconds} s` : `${Math.round(ageSeconds / 60)} min`;
      const hasRtd = Boolean(stream && Number.isFinite(stream.rtd));
      setField('streamRtt', !hasRtd ? '--' : live || ageText === null ? `${stream.rtd} ms` : `${stream.rtd} ms \u00b7 ${ageText} ago`);
      setField('streamQuality', live ? `${stream.quality} / 100` : '--');
      setField('streamScores', live ? `${stream.bandwidthScore} / ${stream.lossScore} / ${stream.latencyScore}` : '--');
      setField('streamMode', stream && Number.isFinite(stream.width) ? `${stream.width}x${stream.height}@${stream.fps}` : '--');
      setField('streamBitrate', stream && Number.isFinite(stream.maxBitrateMbps) ? `${stream.maxBitrateMbps} Mbps` : '--');
      setField('streamHealth', live && Number.isFinite(stream.health) ? `${stream.health}%` : '--');
      setField('streamBottleneck', live && Number.isFinite(stream.health) ? (stream.bottleneck || 'None') : '--');
      setField('streamClient', stream && stream.clientType
        ? `${stream.clientType}${stream.clientVersion ? ` v${stream.clientVersion}` : ''} \u00b7 HDR ${stream.hdr ? 'on' : 'off'}`
        : '--');
      document.querySelectorAll('[data-group="stream"]').forEach(group => group.classList.toggle('no-stream', !stream));
      setField('streamCodec', stream && stream.codec
        ? [stream.codec, stream.bitDepth && `${stream.bitDepth}-bit`, stream.chroma && `YUV ${stream.chroma}`].filter(Boolean).join(' \u00b7 ')
        : '--');
      const featureList = stream ? [
        stream.reflex && 'Reflex', stream.cloudGsync && 'G-Sync', stream.l4s && 'L4S',
      ].filter(Boolean) : [];
      setField('streamFeatures', featureList.length ? featureList.join(' \u00b7 ') : '--');
      setField('streamFps', live && Number.isFinite(stream.streamFps) ? String(stream.streamFps) : '--');
      setField('streamLoss', live && Number.isFinite(stream.lossDips) ? `${stream.lossDips} / ${stream.samples}` : '--');
      setField('streamAge', ageText === null ? '--' : `${ageText}${live ? '' : ' (stale)'}`);
      setField('streamBandwidth', stream && Number.isFinite(sent) ? `${sent.toFixed(sent < 10 ? 1 : 0)} Mbps` : '--');
      const unavailable = {
        streamRtt: !hasRtd,
        streamQuality: !live,
        streamScores: !live,
        streamMode: !(stream && Number.isFinite(stream.width)),
        streamBitrate: !(stream && Number.isFinite(stream.maxBitrateMbps)),
        streamHealth: !(live && Number.isFinite(stream.health)),
        streamBottleneck: !(live && Number.isFinite(stream.health)),
        streamClient: !(stream && stream.clientType),
        streamCodec: !(stream && stream.codec),
        streamFeatures: !featureList.length,
        streamFps: !(live && Number.isFinite(stream.streamFps)),
        streamLoss: !(live && Number.isFinite(stream.lossDips)),
        streamAge: ageSeconds === null,
        streamBandwidth: !(stream && Number.isFinite(sent)),
        encoderLoad: !Number.isFinite(stats.gpu.encoder),
        diskRead: !Number.isFinite(io.diskReadMBps),
        diskWrite: !Number.isFinite(io.diskWriteMBps),
        gpuTemp: stats.gpu.temperature === null,
        gpuClock: stats.gpu.clock === null,
        gpuVram: !Number.isFinite(stats.gpu.memoryUsed),
        cpuTemp: stats.cpu.temperature === null,
        cpuClock: stats.cpu.clock === null,
      };
      Object.entries(unavailable).forEach(([row, isUnavailable]) => {
        document.querySelectorAll(`[data-row="${row}"]`).forEach(element => element.classList.toggle('unavailable', isUnavailable));
      });
      document.getElementById('status-gpu').textContent = `GPU source: ${stats.gpu.telemetrySource}`;
      const captureLabels = { capturing: 'capturing', active: 'waiting for a game', starting: 'starting', error: 'needs administrator', missing: 'unavailable', off: 'off' };
      document.getElementById('status-capture').textContent = `Frame capture: ${captureLabels[stats.frames?.status] || 'unavailable'}`;

      document.getElementById('sample-time').textContent = `Updated ${new Date(stats.sampledAt).toLocaleTimeString()}`;
      samples.push({ cpu: stats.cpu.usage, gpu: stats.gpu.usage });
      if (samples.length > maxSamples) samples.shift();
      drawChart();
      drawOsdCharts();
    });

    let dragState = null;

    osdPanel.addEventListener('pointerdown', event => {
      if (!document.body.classList.contains('overlay')) return;
      if (event.target.closest('button')) return;
      if (event.target.closest('.osd-grip')) return;
      if (event.target.closest('.osd-grip-bottom')) return;
      const shell = event.target.closest('.osd-shell');
      if (!shell) return;
      const { screenX, screenY } = event;
      dragState = {
        startX: screenX,
        startY: screenY,
        x: window.screenX,
        y: window.screenY,
      };
    });

    window.addEventListener('pointermove', event => {
      if (!dragState) return;
      const dx = event.screenX - dragState.startX;
      const dy = event.screenY - dragState.startY;
      statsApi.moveWindow({ x: dragState.x + dx, y: dragState.y + dy });
    });

    window.addEventListener('pointerup', () => {
      dragState = null;
    });

    // Dragging any corner grip scales the overlay; the opposite corner stays where it is.
    osdPanel.querySelectorAll('.osd-grip').forEach(grip => {
      const corner = grip.dataset.corner;
      grip.addEventListener('pointerdown', event => {
        event.preventDefault();
        grip.setPointerCapture(event.pointerId);
        const startX = event.screenX;
        const profile = lookTarget(appliedProfile());
        const startSize = profile.size;
        const start = { left: window.screenX, top: window.screenY, width: window.outerWidth, height: window.outerHeight };
        const westward = corner.includes('w');
        const northward = corner.includes('n');
        const move = moveEvent => {
          const delta = (moveEvent.screenX - startX) / 3.4;
          const size = Math.max(70, Math.min(150, Math.round(startSize + (westward ? -delta : delta))));
          profile.size = size;
          profile.scale = Math.max(80, Math.min(140, size));
          applySettings();
          statsApi.setScale(profile.size);
          if (!westward && !northward) return;
          const width = Math.round(340 * Math.max(0.7, Math.min(1.5, size / 100)));
          const height = Math.ceil(osdPanel.getBoundingClientRect().height) + 16;
          statsApi.moveWindow({
            x: westward ? start.left + start.width - width : start.left,
            y: northward ? start.top + start.height - height : start.top,
          });
        };
        const finish = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', finish);
          saveSettings();
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', finish);
      });
    });

    // Dragging the bottom edge adds spacing between the groups; the window height follows the content.
    const osdGripBottom = osdPanel.querySelector('.osd-grip-bottom');
    osdGripBottom.addEventListener('pointerdown', event => {
      event.preventDefault();
      osdGripBottom.setPointerCapture(event.pointerId);
      const startY = event.screenY;
      const profile = lookTarget(appliedProfile());
      const startSpacing = profile.spacing || 0;
      const gaps = Math.max(1, osdPanel.querySelectorAll('.osd-group:not([hidden])').length - 1);
      const move = moveEvent => {
        profile.spacing = Math.max(0, Math.min(60, Math.round(startSpacing + (moveEvent.screenY - startY) / gaps)));
        applySettings();
      };
      const finish = () => {
        osdGripBottom.removeEventListener('pointermove', move);
        osdGripBottom.removeEventListener('pointerup', finish);
        saveSettings();
      };
      osdGripBottom.addEventListener('pointermove', move);
      osdGripBottom.addEventListener('pointerup', finish);
    });

    let lastFitHeight = 0;
    function fitOverlayHeight() {
      if (!document.body.classList.contains('overlay')) return;
      const height = Math.ceil(osdPanel.getBoundingClientRect().height) + 16;
      if (height === lastFitHeight) return;
      lastFitHeight = height;
      statsApi.setOverlayHeight(height);
    }
    new ResizeObserver(fitOverlayHeight).observe(osdPanel);

    function setMode(mode) {
      document.body.classList.toggle('compact', mode === 'compact');
      document.body.classList.toggle('overlay', mode === 'overlay');
      if (mode !== 'overlay') document.body.classList.remove('osd-editing');
      modeToggle.textContent = mode === 'compact' ? 'Full view' : 'Compact view';
      modeToggle.title = mode === 'compact' ? 'Switch to full view' : 'Switch to compact view';
      overlayToggle.setAttribute('aria-pressed', String(mode === 'overlay'));
      statsApi.setMode(mode);
      applySettings();
      lastFitHeight = 0;
      if (mode === 'overlay') {
        statsApi.setAnchor(settings.anchor);
        statsApi.setScale(lookOf(appliedProfile()).size);
        requestAnimationFrame(fitOverlayHeight);
      }
      requestAnimationFrame(() => {
        drawChart();
        drawOsdCharts();
      });
    }

    function refreshCharts() {
      if (document.hidden) return;
      drawChart();
      drawOsdCharts();
    }

    function openSettings() {
      setMode('full');
      selectTab('overlay');
    }

    function selectTab(name) {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
      });
      document.querySelectorAll('[data-tab-panel]').forEach(panel => {
        panel.hidden = panel.dataset.tabPanel !== name;
      });
      requestAnimationFrame(() => {
        drawChart();
        drawOsdCharts();
      });
    }

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    });

    const logPanel = document.getElementById('log-panel');
    const logBody = document.getElementById('log-body');
    const logToggle = document.getElementById('log-toggle');
    const MAX_LOG_LINES = 500;
    let logOffset = null;
    let logTimer = null;
    let logPaused = false;

    function appendLogEntries(entries) {
      if (!entries.length) return;
      const stickToBottom = !logPaused && logBody.scrollTop + logBody.clientHeight >= logBody.scrollHeight - 24;
      const fragment = document.createDocumentFragment();
      entries.forEach(entry => {
        const level = entry.level === 'fatal' ? 'error' : (entry.level || 'info');
        const line = document.createElement('div');
        line.className = `log-line level-${level}`;
        const time = entry.time ? new Date(entry.time).toLocaleTimeString() : '';
        const parts = [
          ['log-time', time],
          ['log-level', String(entry.level || 'info').toUpperCase()],
          ['log-message', entry.message || ''],
        ];
        if (entry.details) parts.push(['log-details', entry.details]);
        parts.forEach(([className, text]) => {
          const span = document.createElement('span');
          span.className = className;
          span.textContent = text;
          line.append(span);
        });
        fragment.append(line);
      });
      logBody.append(fragment);
      while (logBody.childElementCount > MAX_LOG_LINES) logBody.firstElementChild.remove();
      if (stickToBottom) logBody.scrollTop = logBody.scrollHeight;
    }

    async function pollLogs() {
      try {
        const result = await statsApi.readLogTail(logOffset);
        if (!result) return;
        logOffset = result.offset;
        appendLogEntries(result.entries);
      } catch {
        // The next poll will retry.
      }
    }

    function setLogOpen(open) {
      logPanel.hidden = !open;
      logToggle.setAttribute('aria-pressed', String(open));
      localStorage.setItem('salsastats-log-open', open ? '1' : '0');
      clearInterval(logTimer);
      logTimer = null;
      if (open) {
        pollLogs();
        logTimer = setInterval(pollLogs, 1500);
      }
      requestAnimationFrame(refreshCharts);
    }

    logToggle.addEventListener('click', () => setLogOpen(logPanel.hidden));
    document.getElementById('log-close').addEventListener('click', () => setLogOpen(false));
    document.getElementById('log-clear').addEventListener('click', () => { logBody.textContent = ''; });
    document.getElementById('log-pause').addEventListener('click', event => {
      logPaused = !logPaused;
      event.currentTarget.setAttribute('aria-pressed', String(logPaused));
      event.currentTarget.textContent = logPaused ? 'Resume' : 'Pause';
      if (!logPaused) logBody.scrollTop = logBody.scrollHeight;
    });
    document.getElementById('log-copy').addEventListener('click', async event => {
      const button = event.currentTarget;
      const text = [...logBody.children]
        .filter(line => getComputedStyle(line).display !== 'none')
        .map(line => [...line.children].map(part => part.textContent).filter(Boolean).join(' '))
        .join('\n');
      const copied = text ? await statsApi.copyText(text).catch(() => false) : false;
      button.textContent = copied ? 'Copied' : 'Nothing to copy';
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    });
    document.getElementById('log-open-folder').addEventListener('click', () => statsApi.openLogDirectory());
    document.getElementById('log-filter').addEventListener('change', event => {
      logBody.dataset.filter = event.target.value;
      logBody.scrollTop = logBody.scrollHeight;
    });
    window.addEventListener('keydown', event => {
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault();
        setLogOpen(logPanel.hidden);
      }
    });

    const savedLogHeight = Number(localStorage.getItem('salsastats-log-height'));
    if (savedLogHeight >= 120) document.documentElement.style.setProperty('--log-height', `${savedLogHeight}px`);
    document.getElementById('log-resize').addEventListener('pointerdown', event => {
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = logPanel.getBoundingClientRect().height;
      const move = moveEvent => {
        const height = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + startY - moveEvent.clientY));
        document.documentElement.style.setProperty('--log-height', `${Math.round(height)}px`);
        refreshCharts();
      };
      const finish = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        localStorage.setItem('salsastats-log-height', String(Math.round(logPanel.getBoundingClientRect().height)));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
    });

    if (localStorage.getItem('salsastats-log-open') === '1') setLogOpen(true);

    function updateStatusText(state) {
      switch (state?.status) {
        case 'checking': return 'Checking for updates...';
        case 'current': return 'You are on the latest version.';
        case 'available': return `Version ${state.version} found. Downloading...`;
        case 'downloading': return `Downloading update: ${state.percent || 0}%.`;
        case 'downloaded': return `Version ${state.version} is ready. Restart to install.`;
        case 'error': return 'Could not check for updates. Open the log panel for details.';
        case 'dev': return 'Update checks only run in the installed app.';
        default: return 'Updates are checked on launch and every six hours.';
      }
    }

    let manualUpdate = false;

    function renderUpdateCard(state) {
      const status = state?.status;
      const percent = status === 'downloaded' ? 100 : (status === 'downloading' ? state.percent || 0 : 0);
      document.getElementById('update-progress').hidden = !['available', 'downloading', 'downloaded'].includes(status);
      document.getElementById('update-progress-fill').style.width = `${percent}%`;
      document.getElementById('update-card-install').hidden = status !== 'downloaded';
      document.getElementById('check-updates').hidden = status === 'downloaded';
    }

    function renderUpdateState(state) {
      document.getElementById('update-status').textContent = updateStatusText(state);
      renderUpdateCard(state);
      if (!state || ['idle', 'checking', 'current', 'dev'].includes(state.status)) {
        updateBanner.hidden = true;
        return;
      }

      updateInstall.hidden = state.status !== 'downloaded';
      if (state.status === 'available') updateMessage.textContent = `SalsaStats ${state.version} is available and downloading.`;
      else if (state.status === 'downloading') updateMessage.textContent = `Downloading SalsaStats ${state.version || 'update'}: ${state.percent || 0}%.`;
      else if (state.status === 'downloaded') updateMessage.textContent = `SalsaStats ${state.version} is ready to install.`;
      else updateMessage.textContent = 'Could not check for updates. SalsaStats will try again later.';
      // A check started from the Updates card reports there instead of in the banner.
      updateBanner.hidden = manualUpdate;
    }

    const unsubscribeUpdates = statsApi.onUpdateState?.(renderUpdateState);
    statsApi.getUpdateState?.().then(renderUpdateState).catch(() => {});
    updateInstall.addEventListener('click', () => statsApi.installUpdate?.());
    document.getElementById('update-card-install').addEventListener('click', () => statsApi.installUpdate?.());
    statsApi.getVersion?.().then(version => {
      if (!version) return;
      document.getElementById('app-version').textContent = `SalsaStats v${version}`;
      document.getElementById('status-version').textContent = `v${version}`;
    }).catch(() => {});
    document.getElementById('check-updates').addEventListener('click', async event => {
      const button = event.currentTarget;
      manualUpdate = true;
      updateBanner.hidden = true;
      button.disabled = true;
      button.textContent = 'Checking...';
      document.getElementById('update-status').textContent = updateStatusText({ status: 'checking' });
      try {
        renderUpdateState(await statsApi.checkForUpdates());
      } catch {
        renderUpdateState({ status: 'error' });
      } finally {
        button.disabled = false;
        button.textContent = 'Check for updates';
      }
    });
    document.getElementById('update-later').addEventListener('click', () => { updateBanner.hidden = true; });

    async function refreshLogDirectory() {
      if (!statsApi?.getLogDirectory) return;
      try {
        const result = await statsApi.getLogDirectory();
        if (!result) return;
        logsPath.textContent = result.directory;
        logsPath.title = result.logFile;
      } catch (error) {
        logsStatus.textContent = `Unable to read log folder: ${error.message}`;
      }
    }

    document.getElementById('choose-logs-folder').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      logsStatus.textContent = '';
      try {
        const result = await statsApi.chooseLogDirectory();
        if (result?.ok) {
          logsPath.textContent = result.directory;
          logsPath.title = result.logFile;
          logsStatus.textContent = 'Log folder updated.';
        } else if (!result?.canceled) {
          logsStatus.textContent = `Unable to change log folder: ${result?.error || 'Unknown error'}`;
        }
      } catch (error) {
        logsStatus.textContent = `Unable to change log folder: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('open-logs-folder').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      logsStatus.textContent = '';
      try {
        const result = await statsApi.openLogDirectory();
        if (!result?.ok) logsStatus.textContent = `Unable to open log folder: ${result?.error || 'Unknown error'}`;
      } catch (error) {
        logsStatus.textContent = `Unable to open log folder: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });

    modeToggle.addEventListener('click', () => {
      setMode(document.body.classList.contains('compact') ? 'full' : 'compact');
    });
    overlayToggle.addEventListener('click', () => setMode('overlay'));
    document.querySelectorAll('[data-minimal]').forEach(input => {
      input.addEventListener('change', () => {
        editTarget().minimalRows[input.dataset.minimal] = input.checked;
        saveSettings();
        applySettings();
      });
    });
    document.getElementById('hide-unavailable').addEventListener('change', event => {
      settings.hideUnavailable = event.target.checked;
      saveSettings();
      applySettings();
    });
    statsApi.onShortcut?.(action => {
      if (action === 'edit-on') document.body.classList.add('osd-editing');
      if (action === 'edit-off') document.body.classList.remove('osd-editing');
      if (action === 'menu-on') quickMenu.hidden = false;
      if (action === 'menu-off') quickMenu.hidden = true;
      if (action === 'customize') openSettings();
      if (action === 'minimal') {
        const profile = appliedProfile();
        profile.minimal = !profile.minimal;
        saveSettings();
        applySettings();
        statsApi.setScale(lookOf(profile).size);
      }
    });

    const KEYBIND_LABELS = {
      customize: 'Open the dashboard and overlay settings',
      minimal: 'Switch the overlay between full and minimal',
      toggle: 'Hide or show the overlay',
      edit: 'Unlock the overlay to move and resize it',
      menu: 'Open quick overlay controls',
    };
    const keybindStatus = document.getElementById('keybind-status');

    function acceleratorFromEvent(event) {
      let key = null;
      if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
      else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
      else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code;
      else {
        key = ({
          Space: 'Space', Tab: 'Tab', Enter: 'Return', NumpadEnter: 'Return',
          Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
          ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
          Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        })[event.code] || null;
      }
      if (!key) return null;
      const modifiers = [event.ctrlKey && 'CommandOrControl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean);
      if (!modifiers.length && !key.startsWith('F')) return null;
      return [...modifiers, key].join('+');
    }

    function renderKeybinds(shortcuts) {
      const list = document.getElementById('keybind-list');
      list.textContent = '';
      Object.entries(KEYBIND_LABELS).forEach(([action, label]) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'keybind-button';
        button.title = 'Click, then press the new key combination';
        String(shortcuts[action]).replace('CommandOrControl', 'Ctrl').split('+').forEach(part => {
          const key = document.createElement('kbd');
          key.textContent = part;
          button.append(key);
        });
        const text = document.createElement('span');
        text.textContent = label;
        button.addEventListener('click', async () => {
          const started = await statsApi.setKeybindCapture(true).catch(() => false);
          if (!started) {
            keybindStatus.textContent = 'Could not start key capture.';
            return;
          }
          button.textContent = 'Press keys now (Esc cancels)';
          keybindStatus.textContent = 'Shortcuts are paused while capturing.';
          list.querySelectorAll('button').forEach(candidate => { candidate.disabled = true; });
          let captureTimer;
          let finished = false;
          const finishCapture = async () => {
            if (finished) return;
            finished = true;
            clearTimeout(captureTimer);
            window.removeEventListener('keydown', capture, true);
            await statsApi.setKeybindCapture(false).catch(() => false);
          };
          const capture = async event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') {
              await finishCapture();
              keybindStatus.textContent = 'Keybind change cancelled.';
              renderKeybinds(shortcuts);
              return;
            }
            const accelerator = acceleratorFromEvent(event);
            if (!accelerator) {
              keybindStatus.textContent = 'Use Ctrl, Alt, Shift, or Win with a supported key.';
              return;
            }
            await finishCapture();
            const result = await statsApi.setKeybind(action, accelerator).catch(() => ({ ok: false, error: 'Could not save the keybind.' }));
            keybindStatus.textContent = result.ok ? 'Keybind saved.' : result.error;
            renderKeybinds(result.ok ? result.shortcuts : shortcuts);
          };
          window.addEventListener('keydown', capture, true);
          captureTimer = setTimeout(async () => {
            await finishCapture();
            keybindStatus.textContent = 'Key capture timed out. Click a keybind to try again.';
            renderKeybinds(shortcuts);
          }, 20000);
        });
        item.append(button, text);
        list.append(item);
      });
    }

    function renderCoreBars(cores) {
      const box = document.getElementById('core-bars');
      while (box.childElementCount < cores.length) {
        const bar = document.createElement('span');
        bar.className = 'core-bar';
        bar.append(document.createElement('i'));
        box.append(bar);
      }
      while (box.childElementCount > cores.length) box.lastElementChild.remove();
      [...box.children].forEach((bar, index) => {
        bar.firstElementChild.style.height = `${Math.max(4, cores[index])}%`;
        bar.title = `Core ${index + 1}: ${cores[index]}%`;
      });
    }

    // Share: readings as text, or the live preview as an image.
    function buildShareText() {
      const stats = lastStats;
      if (!stats) return '';
      const fps = lastFrames?.fps;
      const cap = settings.fpsMode === 'capped' ? settings.fpsCap : Infinity;
      const game = fps ? ((matchGame(fps.application) || {}).name || fps.displayName || fps.application) : null;
      const lines = [`SalsaStats${game ? ` \u2014 ${game}` : ''}`];
      const gpu = [stats.gpu.name];
      if (stats.gpu.temperature !== null) gpu.push(`${stats.gpu.temperature} C`);
      if (stats.gpu.usage !== null) gpu.push(`${stats.gpu.usage}%`);
      if (Number.isFinite(stats.gpu.memoryUsed)) gpu.push(`${Math.round(stats.gpu.memoryUsed)} MiB VRAM`);
      if (stats.gpu.clock !== null) gpu.push(`${stats.gpu.clock} MHz`);
      lines.push(`GPU: ${gpu.join(' \u00b7 ')}`);
      lines.push(`CPU: ${stats.cpu.name} \u00b7 ${stats.cpu.usage}%`);
      if (stats.cpu.rig) lines.push(`Rig: ${stats.cpu.rig.rig} \u00b7 ${stats.cpu.rig.tier} \u00b7 ${stats.cpu.rig.allocation}`);
      lines.push(`RAM: ${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`);
      if (fps) lines.push(`FPS: ${Math.min(fps.current, cap)} (avg ${Math.min(fps.average, cap)}, 1% low ${Math.min(fps.low, cap)})`);
      return lines.join('\n');
    }
    const shareStatus = document.getElementById('share-status');
    document.getElementById('share-text').addEventListener('click', async () => {
      const text = buildShareText();
      const copied = text ? await statsApi.copyText(text).catch(() => false) : false;
      shareStatus.textContent = copied ? 'Copied the readings.' : 'No readings yet.';
    });
    document.getElementById('share-image').addEventListener('click', async () => {
      const box = previewStage.getBoundingClientRect();
      const copied = await statsApi.copyImage({ x: box.x, y: box.y, width: box.width, height: box.height }).catch(() => false);
      shareStatus.textContent = copied ? 'Copied the preview image.' : 'Could not copy the image.';
    });

    document.getElementById('auto-overlay').addEventListener('change', event => {
      settings.autoOverlay = event.target.checked;
      saveSettings();
      syncAutoOverlay();
    });
    document.getElementById('start-overlay').addEventListener('change', event => {
      settings.startInOverlay = event.target.checked;
      saveSettings();
    });
    const loginBox = document.getElementById('login-enabled');
    statsApi.getLogin?.().then(enabled => { loginBox.checked = enabled === true; }).catch(() => {});
    loginBox.addEventListener('change', async () => {
      const ok = await statsApi.setLogin(loginBox.checked).catch(() => false);
      if (!ok) loginBox.checked = !loginBox.checked;
    });
    setTimeout(() => {
      syncAutoOverlay();
      if (settings.startInOverlay) setMode('overlay');
    }, 800);

    statsApi.getKeybinds?.().then(data => data && renderKeybinds(data.shortcuts)).catch(() => {});
    document.getElementById('keybind-reset').addEventListener('click', async () => {
      const result = await statsApi.resetKeybinds().catch(() => null);
      if (result?.ok) {
        renderKeybinds(result.shortcuts);
        keybindStatus.textContent = 'Keybinds reset to the defaults.';
      }
    });

    pinToggle.addEventListener('click', () => {
      const pinned = pinToggle.getAttribute('aria-pressed') !== 'true';
      pinToggle.setAttribute('aria-pressed', String(pinned));
      pinToggle.textContent = pinned ? 'Pinned' : 'Pin';
      statsApi.setPinned(pinned);
    });

    document.getElementById('window-minimize').addEventListener('click', () => statsApi.minimize());
    document.getElementById('window-toggle-fullscreen').addEventListener('click', () => statsApi.toggleMaximize());
    document.getElementById('window-close').addEventListener('click', () => statsApi.closeWindow());
    refreshLogDirectory();
    new ResizeObserver(() => refreshCharts()).observe(chart);
    document.addEventListener('visibilitychange', refreshCharts);
    window.addEventListener('beforeunload', unsubscribeStats, { once: true });
    if (unsubscribeUpdates) window.addEventListener('beforeunload', unsubscribeUpdates, { once: true });
    statsApi.setOverlayAboveGames(settings.overlayAboveGames);
    applySettings();
