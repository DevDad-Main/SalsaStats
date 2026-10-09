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
    const customizeToggle = document.getElementById('customize-toggle');
    const pinToggle = document.getElementById('pin-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const logsPath = document.getElementById('logs-path');
    const logsStatus = document.getElementById('logs-status');
    const previewStage = document.getElementById('preview-stage');
    const osdPanel = document.getElementById('osd-panel');
    const maxSamples = 48;
    const defaultSettings = {
      visible: {
        gpuTemp: true, gpuUsage: true, gpuVram: true, gpuClock: true, gpuPower: true,
        cpuTemp: true, cpuUsage: true, cpuClock: true, cpuPower: true, memoryUsage: true,
        fpsCurrent: true, fpsAverage: true, fpsLow: true, graphRate: true, graphTime: true,
      },
      colors: { gpu: '#50f45d', cpu: '#4ea8ff', memory: '#ffb65d', fps: '#ef49df' },
      scale: 100,
      size: 100,
      opacity: 88,
      backgroundMode: 'soft',
      anchor: 'top-right',
      overlayAboveGames: false,
    };

    let settings = defaultSettings;
    try {
      const saved = JSON.parse(localStorage.getItem('salsastats-overlay-settings') || 'null');
      if (saved) {
        settings = {
          ...defaultSettings,
          ...saved,
          visible: { ...defaultSettings.visible, ...saved.visible },
          colors: { ...defaultSettings.colors, ...saved.colors },
        };
      }
    } catch (error) {
      localStorage.removeItem('salsastats-overlay-settings');
    }

    const preview = osdPanel.cloneNode(true);
    preview.removeAttribute('id');
    preview.classList.add('preview-osd');
    preview.querySelector('.osd-tools').remove();
    previewStage.append(preview);

    function saveSettings() {
      localStorage.setItem('salsastats-overlay-settings', JSON.stringify(settings));
    }

    function applySettings() {
      const root = document.documentElement;
      root.style.setProperty('--osd-scale', settings.scale / 100);
      const effectiveOpacity = settings.backgroundMode === 'none' ? 0 : settings.opacity / 100;
      root.style.setProperty('--osd-opacity', effectiveOpacity);
      document.querySelectorAll('.osd-shell').forEach(shell => {
        shell.classList.toggle('background-none', settings.backgroundMode === 'none');
        shell.classList.toggle('background-soft', settings.backgroundMode === 'soft');
        shell.classList.toggle('background-full', settings.backgroundMode === 'full');
      });
      Object.entries(settings.colors).forEach(([name, color]) => {
        root.style.setProperty(`--${name}-color`, color);
      });

      document.querySelectorAll('[data-row]').forEach(row => {
        const setting = row.dataset.row;
        row.hidden = Object.prototype.hasOwnProperty.call(settings.visible, setting)
          ? !settings.visible[setting]
          : false;
      });
      document.querySelectorAll('.osd-group').forEach(group => {
        const rows = [...group.querySelectorAll('[data-row]')];
        if (group.dataset.group === 'fps') {
          const fpsRows = rows.filter(row => row.dataset.row !== 'fpsNote');
          const hasVisibleMetric = fpsRows.some(row => !row.hidden);
          group.querySelector('[data-row="fpsNote"]').hidden = !hasVisibleMetric;
          group.hidden = !hasVisibleMetric;
        } else {
          group.hidden = rows.length > 0 && rows.every(row => row.hidden);
        }
      });

      document.querySelectorAll('[data-setting]').forEach(input => {
        input.checked = settings.visible[input.dataset.setting] !== false;
      });
      document.querySelectorAll('[data-color]').forEach(input => {
        input.value = settings.colors[input.dataset.color];
      });
      document.getElementById('scale-setting').value = settings.scale;
      document.getElementById('scale-output').textContent = `${settings.scale}%`;
      document.getElementById('size-setting').value = settings.size;
      document.getElementById('size-output').textContent = `${settings.size}%`;
      document.getElementById('opacity-setting').value = settings.opacity;
      document.getElementById('opacity-output').textContent = `${settings.opacity}%`;
      document.getElementById('background-setting').value = settings.backgroundMode;
      document.getElementById('anchor-setting').value = settings.anchor;
      document.getElementById('overlay-above-games').checked = settings.overlayAboveGames === true;
      drawOsdCharts();
    }

    document.querySelectorAll('[data-setting]').forEach(input => {
      input.addEventListener('change', () => {
        settings.visible[input.dataset.setting] = input.checked;
        saveSettings();
        applySettings();
      });
    });
    document.querySelectorAll('[data-color]').forEach(input => {
      input.addEventListener('input', () => {
        settings.colors[input.dataset.color] = input.value;
        saveSettings();
        applySettings();
      });
    });
    document.getElementById('scale-setting').addEventListener('input', event => {
      settings.scale = Number(event.target.value);
      saveSettings();
      applySettings();
    });
    document.getElementById('size-setting').addEventListener('input', event => {
      settings.size = Number(event.target.value);
      saveSettings();
      applySettings();
      statsApi.setScale(settings.size);
    });
    document.getElementById('opacity-setting').addEventListener('input', event => {
      settings.opacity = Number(event.target.value);
      saveSettings();
      applySettings();
    });
    document.getElementById('background-setting').addEventListener('change', event => {
      settings.backgroundMode = event.target.value;
      saveSettings();
      applySettings();
    });
    document.getElementById('anchor-setting').addEventListener('change', event => {
      settings.anchor = event.target.value;
      saveSettings();
      statsApi.setAnchor(settings.anchor);
    });
    document.getElementById('overlay-above-games').addEventListener('change', event => {
      settings.overlayAboveGames = event.target.checked;
      saveSettings();
      statsApi.setOverlayAboveGames(settings.overlayAboveGames);
    });

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
      });
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
      document.getElementById('cpu-cores').textContent = `${stats.cpu.cores || '--'} cores`;
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
      setField('gpuPower', stats.gpu.power === null ? 'Unavailable' : `${stats.gpu.power.toFixed(1)} W`);
      setField('cpuTemp', stats.cpu.temperature === null ? '--' : stats.cpu.temperature);
      setField('cpuUsage', stats.cpu.usage);
      setField('cpuClock', stats.cpu.clock === null ? 'Unavailable' : `${stats.cpu.clock} MHz`);
      setField('cpuPower', 'Unavailable');
      setField('memoryUsage', `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)} (${stats.memory.usage}%)`);
      setField('fpsCurrent', '--');
      setField('fpsAverage', '--');
      setField('fpsLow', '--');

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

    function setMode(mode) {
      document.body.classList.toggle('compact', mode === 'compact');
      document.body.classList.toggle('overlay', mode === 'overlay');
      modeToggle.textContent = mode === 'compact' ? 'Full view' : 'Compact view';
      modeToggle.title = mode === 'compact' ? 'Switch to full view' : 'Switch to compact view';
      overlayToggle.setAttribute('aria-pressed', String(mode === 'overlay'));
      statsApi.setMode(mode);
      if (mode === 'overlay') {
        statsApi.setAnchor(settings.anchor);
        statsApi.setScale(settings.size);
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
      settingsPanel.hidden = false;
      requestAnimationFrame(() => settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    function renderUpdateState(state) {
      if (!state || ['idle', 'checking', 'current'].includes(state.status)) {
        updateBanner.hidden = true;
        return;
      }

      updateInstall.hidden = state.status !== 'downloaded';
      if (state.status === 'available') updateMessage.textContent = `SalsaStats ${state.version} is available and downloading.`;
      else if (state.status === 'downloading') updateMessage.textContent = `Downloading SalsaStats ${state.version || 'update'}: ${state.percent || 0}%.`;
      else if (state.status === 'downloaded') updateMessage.textContent = `SalsaStats ${state.version} is ready to install.`;
      else updateMessage.textContent = 'Could not check for updates. SalsaStats will try again later.';
      updateBanner.hidden = false;
    }

    const unsubscribeUpdates = statsApi.onUpdateState?.(renderUpdateState);
    statsApi.getUpdateState?.().then(renderUpdateState).catch(() => {});
    updateInstall.addEventListener('click', () => statsApi.installUpdate?.());
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
    customizeToggle.addEventListener('click', openSettings);
    document.getElementById('overlay-customize').addEventListener('click', openSettings);
    document.getElementById('overlay-dashboard').addEventListener('click', () => setMode('full'));
    document.getElementById('settings-close').addEventListener('click', () => { settingsPanel.hidden = true; });
    document.getElementById('settings-overlay').addEventListener('click', () => {
      settingsPanel.hidden = true;
      setMode('overlay');
    });

    pinToggle.addEventListener('click', () => {
      const pinned = pinToggle.getAttribute('aria-pressed') !== 'true';
      pinToggle.setAttribute('aria-pressed', String(pinned));
      pinToggle.textContent = pinned ? 'Pinned' : 'Pin';
      statsApi.setPinned(pinned);
    });

    document.getElementById('window-minimize').addEventListener('click', () => statsApi.minimize());
    document.getElementById('window-toggle-fullscreen').addEventListener('click', () => statsApi.toggleFullscreen());
    document.getElementById('window-close').addEventListener('click', () => statsApi.closeWindow());
    refreshLogDirectory();
    new ResizeObserver(() => refreshCharts()).observe(chart);
    document.addEventListener('visibilitychange', refreshCharts);
    window.addEventListener('beforeunload', unsubscribeStats, { once: true });
    if (unsubscribeUpdates) window.addEventListener('beforeunload', unsubscribeUpdates, { once: true });
    statsApi.setOverlayAboveGames(settings.overlayAboveGames);
    applySettings();
