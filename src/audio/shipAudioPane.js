import {
  clearShipAudioLoop,
  clearShipAudioSample,
  loadShipAudioLoopFile,
  loadShipAudioSampleFile,
  resumeShipAudio,
  resetShipAudioPreset,
  serializeShipAudioPreset,
  setShipAudioEnabled,
  setShipAudioLoopSampleActive,
  SHIP_AUDIO_FILTER_TYPE_OPTIONS,
  SHIP_AUDIO_OSC_TYPE_OPTIONS,
  SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS,
  shipAudioPreset,
  shipAudioRuntime,
  triggerShipAudioSample,
} from './shipAudio.js';

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  return copied;
}

function notify(callback, message) {
  if (typeof callback === 'function') {
    callback(message);
  }
}

function getSharedLoopFileInput(id = 'engine-loop') {
  let input = document.getElementById(`ship-audio-file-${id}`);
  if (input instanceof HTMLInputElement) {
    return input;
  }

  input = document.createElement('input');
  input.id = `ship-audio-file-${id}`;
  input.type = 'file';
  input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
  input.hidden = true;
  document.body.appendChild(input);
  return input;
}

function addSampleSlotFolder(parent, definition, options = {}) {
  const {
    pane = null,
    onMessage = null,
  } = options;

  const folder = parent.addFolder({ title: definition.title, expanded: false });
  const labelBinding = folder.addBinding(shipAudioRuntime, definition.runtimeLabelKey, { label: 'Loaded' });
  labelBinding.disabled = true;

  folder.addButton({ title: definition.type === 'loop' ? 'Load MP3 Loop' : 'Load MP3 Sample' }).on('click', () => {
    const input = getSharedLoopFileInput(definition.id);
    input.value = '';
    input.onchange = async () => {
      const [file] = Array.from(input.files || []);
      if (!file) return;

      try {
        const result = await loadShipAudioSampleFile(definition.id, file);
        pane?.refresh?.();
        notify(onMessage, `Loaded ${result.name} (${result.duration.toFixed(1)}s).`);
      } catch (error) {
        console.error(`Failed to load sample slot ${definition.id}`, error);
        notify(onMessage, `${definition.title} load failed. Check the console.`);
      } finally {
        input.value = '';
      }
    };
    input.click();
  });

  folder.addButton({ title: definition.type === 'loop' ? 'Clear Loop' : 'Clear Sample' }).on('click', () => {
    clearShipAudioSample(definition.id);
    pane?.refresh?.();
    notify(onMessage, `${definition.title} cleared.`);
  });

  if (definition.activeRuntimeKey) {
    folder.addBinding(shipAudioRuntime, definition.activeRuntimeKey, { label: 'Active' }).on('change', (event) => {
      const active = setShipAudioLoopSampleActive(definition.id, event.value);
      if (!active && event.value) {
        shipAudioRuntime[definition.activeRuntimeKey] = false;
        pane?.refresh?.();
        notify(onMessage, `Load ${definition.title.toLowerCase()} first.`);
        return;
      }
      notify(onMessage, active ? `${definition.title} active.` : `${definition.title} muted.`);
    });
  }

  folder.addButton({ title: definition.triggerTitle }).on('click', async () => {
    try {
      const triggered = await triggerShipAudioSample(definition.id);
      if (!triggered) {
        notify(onMessage, `Load ${definition.title.toLowerCase()} first.`);
        return;
      }
      pane?.refresh?.();
      if (definition.activeRuntimeKey) {
        notify(
          onMessage,
          shipAudioRuntime[definition.activeRuntimeKey]
            ? `${definition.title} active.`
            : `${definition.title} muted.`,
        );
      } else {
        notify(onMessage, `${definition.title} triggered.`);
      }
    } catch (error) {
      console.error(`Failed to trigger sample slot ${definition.id}`, error);
      notify(onMessage, `${definition.title} trigger failed. Check the console.`);
    }
  });

  const prefix = definition.presetPrefix;
  folder.addBinding(shipAudioPreset, `${prefix}Gain`, { min: 0, max: 1, step: 0.01, label: 'Gain' });
  folder.addBinding(shipAudioPreset, `${prefix}BaseRate`, { min: 0.25, max: 2, step: 0.01, label: 'Pitch' });
  folder.addBinding(shipAudioPreset, `${prefix}FilterType`, { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Filter' });
  folder.addBinding(shipAudioPreset, `${prefix}FilterHz`, { min: 80, max: 8000, step: 10, label: 'Filter Hz' });
  folder.addBinding(shipAudioPreset, `${prefix}FilterQ`, { min: 0.1, max: 16, step: 0.1, label: 'Filter Q' });

  return folder;
}

export function addShipAudioPane(parent, options = {}) {
  const {
    title = 'Ship Audio',
    expanded = false,
    pane = null,
    onMessage = null,
    sampleSlotIds = null,
    openPageUrl = '',
    openPageLabel = 'Open Audio Page',
  } = options;

  const root = parent.addFolder({ title, expanded });

  const transportFolder = root.addFolder({ title: 'Transport', expanded: true });
  transportFolder.addBinding(shipAudioRuntime, 'enabled', { label: 'Enable' }).on('change', async (event) => {
    try {
      await setShipAudioEnabled(event.value);
      notify(onMessage, event.value ? 'Ship audio online.' : 'Ship audio muted.');
    } catch (error) {
      console.error('Failed to toggle ship audio', error);
      shipAudioRuntime.enabled = false;
      pane?.refresh?.();
      notify(onMessage, 'Audio startup failed. Check the console.');
    }
  });
  transportFolder.addButton({ title: 'Wake Audio Context' }).on('click', async () => {
    try {
      await resumeShipAudio();
      notify(onMessage, 'Audio context resumed.');
    } catch (error) {
      console.error('Failed to resume ship audio', error);
      notify(onMessage, 'Audio resume failed. Check the console.');
    }
  });

  const mixFolder = root.addFolder({ title: 'Mix', expanded: false });
  mixFolder.addBinding(shipAudioPreset, 'masterGain', { min: 0, max: 0.5, step: 0.005, label: 'Master' });
  mixFolder.addBinding(shipAudioPreset, 'masterFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Master Type' });
  mixFolder.addBinding(shipAudioPreset, 'masterToneHz', { min: 1200, max: 12000, step: 10, label: 'Tone LPF' });
  mixFolder.addBinding(shipAudioPreset, 'masterFilterQ', { min: 0.1, max: 16, step: 0.1, label: 'Master Q' });
  mixFolder.addBinding(shipAudioPreset, 'responseHz', { min: 1, max: 16, step: 0.1, label: 'Response' });

  const engineFolder = root.addFolder({ title: 'Engine Body', expanded: true });
  engineFolder.addBinding(shipAudioPreset, 'engineFundamentalType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Fund Wave' });
  engineFolder.addBinding(shipAudioPreset, 'engineBaseHz', { min: 18, max: 120, step: 1, label: 'Base Hz' });
  engineFolder.addBinding(shipAudioPreset, 'engineFundamentalMix', { min: 0, max: 2, step: 0.01, label: 'Fund Mix' });
  engineFolder.addBinding(shipAudioPreset, 'engineHarmonicType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Harm Wave' });
  engineFolder.addBinding(shipAudioPreset, 'engineHarmonicMix', { min: 0, max: 2, step: 0.01, label: 'Harm Mix' });
  engineFolder.addBinding(shipAudioPreset, 'engineHarmonicRatio', { min: 0.25, max: 6, step: 0.01, label: 'Harm Ratio' });
  engineFolder.addBinding(shipAudioPreset, 'engineHarmonicOffsetHz', { min: -120, max: 240, step: 1, label: 'Harm Offset' });
  engineFolder.addBinding(shipAudioPreset, 'engineSubType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Sub Wave' });
  engineFolder.addBinding(shipAudioPreset, 'engineSubMix', { min: 0, max: 2, step: 0.01, label: 'Sub Mix' });
  engineFolder.addBinding(shipAudioPreset, 'engineSubRatio', { min: 0.1, max: 2, step: 0.01, label: 'Sub Ratio' });
  engineFolder.addBinding(shipAudioPreset, 'engineSubOffsetHz', { min: -120, max: 120, step: 1, label: 'Sub Offset' });
  engineFolder.addBinding(shipAudioPreset, 'engineThrottleHz', { min: 10, max: 180, step: 1, label: 'Throttle Hz' });
  engineFolder.addBinding(shipAudioPreset, 'engineBoostHz', { min: 0, max: 80, step: 1, label: 'Boost Hz' });
  engineFolder.addBinding(shipAudioPreset, 'engineDetuneCents', { min: 0, max: 40, step: 1, label: 'Detune' });
  engineFolder.addBinding(shipAudioPreset, 'enginePulseDepth', { min: 0, max: 0.6, step: 0.01, label: 'Pulse Depth' });
  engineFolder.addBinding(shipAudioPreset, 'enginePulseRate', { min: 0.5, max: 12, step: 0.1, label: 'Pulse Rate' });
  engineFolder.addBinding(shipAudioPreset, 'engineFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Filter Type' });
  engineFolder.addBinding(shipAudioPreset, 'engineFilterBaseHz', { min: 80, max: 2000, step: 5, label: 'LPF Base' });
  engineFolder.addBinding(shipAudioPreset, 'engineFilterDriveHz', { min: 100, max: 4000, step: 10, label: 'LPF Drive' });
  engineFolder.addBinding(shipAudioPreset, 'engineFilterQ', { min: 0.1, max: 16, step: 0.1, label: 'Filter Q' });
  engineFolder.addBinding(shipAudioPreset, 'engineGain', { min: 0, max: 0.8, step: 0.01, label: 'Gain' });

  const engineLoopFolder = root.addFolder({ title: 'Engine Loop', expanded: false });
  const loopLabelBinding = engineLoopFolder.addBinding(shipAudioRuntime, 'engineLoopLabel', { label: 'Loaded' });
  loopLabelBinding.disabled = true;
  engineLoopFolder.addButton({ title: 'Load MP3 Loop' }).on('click', () => {
    const input = getSharedLoopFileInput('engine-loop');
    input.value = '';
    input.onchange = async () => {
      const [file] = Array.from(input.files || []);
      if (!file) return;

      try {
        const result = await loadShipAudioLoopFile(file);
        pane?.refresh?.();
        notify(
          onMessage,
          `Loaded ${result.name} (${result.duration.toFixed(1)}s).`,
        );
      } catch (error) {
        console.error('Failed to load engine loop', error);
        notify(onMessage, 'Loop load failed. Check the console.');
      } finally {
        input.value = '';
      }
    };
    input.click();
  });
  engineLoopFolder.addButton({ title: 'Clear Loop' }).on('click', () => {
    clearShipAudioLoop();
    pane?.refresh?.();
    notify(onMessage, 'Engine loop cleared.');
  });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopGain', { min: 0, max: 0.8, step: 0.01, label: 'Loop Gain' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopBaseRate', { min: 0.25, max: 2, step: 0.01, label: 'Base Pitch' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopDriveRate', { min: 0, max: 2.5, step: 0.01, label: 'Speed Pitch' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopBoostRate', { min: 0, max: 1.5, step: 0.01, label: 'Boost Pitch' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Loop Filter' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopFilterBaseHz', { min: 80, max: 6000, step: 10, label: 'Filter Base' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopFilterDriveHz', { min: 0, max: 6000, step: 10, label: 'Filter Drive' });
  engineLoopFolder.addBinding(shipAudioPreset, 'engineLoopFilterQ', { min: 0.1, max: 16, step: 0.1, label: 'Filter Q' });

  const visibleSampleSlotIds = Array.isArray(sampleSlotIds)
    ? new Set(sampleSlotIds)
    : null;

  SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS.forEach((definition) => {
    if (visibleSampleSlotIds && !visibleSampleSlotIds.has(definition.id)) {
      return;
    }
    addSampleSlotFolder(root, definition, {
      pane,
      onMessage,
    });
  });

  const palpitationFolder = root.addFolder({ title: 'Palpitation', expanded: true });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Wave' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationRateHz', { min: 0.5, max: 80, step: 0.5, label: 'Base Rate' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationDriveRateHz', { min: 0, max: 120, step: 1, label: 'Drive Rate' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationBoostRateHz', { min: 0, max: 180, step: 1, label: 'Boost Rate' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationBaseHz', { min: 40, max: 1000, step: 1, label: 'Base Tone' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationDriveHz', { min: 0, max: 400, step: 1, label: 'Drive Tone' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationToneMix', { min: 0, max: 1, step: 0.01, label: 'Tone Mix' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationNoiseMix', { min: 0, max: 1, step: 0.01, label: 'Noise Mix' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Filter' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationFilterHz', { min: 80, max: 6000, step: 10, label: 'Filter Hz' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationFilterQ', { min: 0.2, max: 16, step: 0.1, label: 'Filter Q' });
  palpitationFolder.addBinding(shipAudioPreset, 'palpitationGain', { min: 0, max: 0.4, step: 0.01, label: 'Gain' });

  const whineFolder = root.addFolder({ title: 'Whine', expanded: false });
  whineFolder.addBinding(shipAudioPreset, 'whinePrimaryType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Main Wave' });
  whineFolder.addBinding(shipAudioPreset, 'whineBaseHz', { min: 40, max: 600, step: 1, label: 'Base Hz' });
  whineFolder.addBinding(shipAudioPreset, 'whinePrimaryMix', { min: 0, max: 2, step: 0.01, label: 'Main Mix' });
  whineFolder.addBinding(shipAudioPreset, 'whineOvertoneType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Over Wave' });
  whineFolder.addBinding(shipAudioPreset, 'whineOvertoneMix', { min: 0, max: 2, step: 0.01, label: 'Over Mix' });
  whineFolder.addBinding(shipAudioPreset, 'whineOvertoneRatio', { min: 0.25, max: 8, step: 0.01, label: 'Over Ratio' });
  whineFolder.addBinding(shipAudioPreset, 'whineOvertoneOffsetHz', { min: -240, max: 240, step: 1, label: 'Over Offset' });
  whineFolder.addBinding(shipAudioPreset, 'whineOvertoneDetuneCents', { min: -60, max: 60, step: 1, label: 'Over Detune' });
  whineFolder.addBinding(shipAudioPreset, 'whineThrottleHz', { min: 50, max: 1600, step: 5, label: 'Throttle Hz' });
  whineFolder.addBinding(shipAudioPreset, 'whineTurnHz', { min: 0, max: 1200, step: 5, label: 'Turn Hz' });
  whineFolder.addBinding(shipAudioPreset, 'whineBoostHz', { min: 0, max: 900, step: 5, label: 'Boost Hz' });
  whineFolder.addBinding(shipAudioPreset, 'whineVibratoRate', { min: 0, max: 20, step: 0.1, label: 'Vibrato Rate' });
  whineFolder.addBinding(shipAudioPreset, 'whineVibratoDepth', { min: 0, max: 60, step: 1, label: 'Vibrato Depth' });
  whineFolder.addBinding(shipAudioPreset, 'whineFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Filter Type' });
  whineFolder.addBinding(shipAudioPreset, 'whineFilterHz', { min: 200, max: 8000, step: 10, label: 'Bandpass' });
  whineFolder.addBinding(shipAudioPreset, 'whineFilterQ', { min: 0.1, max: 16, step: 0.1, label: 'Filter Q' });
  whineFolder.addBinding(shipAudioPreset, 'whineGain', { min: 0, max: 0.5, step: 0.01, label: 'Gain' });

  const turnFolder = root.addFolder({ title: 'Turn And Groan', expanded: false });
  turnFolder.addBinding(shipAudioPreset, 'turnType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Turn Wave' });
  turnFolder.addBinding(shipAudioPreset, 'turnBaseHz', { min: 40, max: 600, step: 1, label: 'Turn Base' });
  turnFolder.addBinding(shipAudioPreset, 'turnRiseHz', { min: 0, max: 1600, step: 5, label: 'Turn Rise' });
  turnFolder.addBinding(shipAudioPreset, 'turnFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Turn Filter' });
  turnFolder.addBinding(shipAudioPreset, 'turnQ', { min: 0.2, max: 14, step: 0.1, label: 'Turn Q' });
  turnFolder.addBinding(shipAudioPreset, 'turnGain', { min: 0, max: 0.5, step: 0.01, label: 'Turn Gain' });
  turnFolder.addBinding(shipAudioPreset, 'groanCenterHz', { min: 20, max: 400, step: 1, label: 'Groan Base' });
  turnFolder.addBinding(shipAudioPreset, 'groanTurnHz', { min: 0, max: 260, step: 1, label: 'Groan Rise' });
  turnFolder.addBinding(shipAudioPreset, 'groanBoostHz', { min: 0, max: 220, step: 1, label: 'Groan Boost' });
  turnFolder.addBinding(shipAudioPreset, 'groanFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Groan Filter' });
  turnFolder.addBinding(shipAudioPreset, 'groanQ', { min: 0.2, max: 8, step: 0.1, label: 'Groan Q' });
  turnFolder.addBinding(shipAudioPreset, 'groanJitterRate', { min: 0, max: 6, step: 0.05, label: 'Jitter Rate' });
  turnFolder.addBinding(shipAudioPreset, 'groanJitterDepth', { min: 0, max: 2, step: 0.01, label: 'Jitter Depth' });
  turnFolder.addBinding(shipAudioPreset, 'groanGain', { min: 0, max: 0.4, step: 0.01, label: 'Groan Gain' });

  const boostFolder = root.addFolder({ title: 'Boost And Scrape', expanded: false });
  boostFolder.addBinding(shipAudioPreset, 'boostPulseRate', { min: 0.5, max: 18, step: 0.1, label: 'Boost Pulse' });
  boostFolder.addBinding(shipAudioPreset, 'boostOscType', { options: SHIP_AUDIO_OSC_TYPE_OPTIONS, label: 'Boost Wave' });
  boostFolder.addBinding(shipAudioPreset, 'boostOscBaseHz', { min: 20, max: 200, step: 1, label: 'Boost Base' });
  boostFolder.addBinding(shipAudioPreset, 'boostOscRiseHz', { min: 0, max: 260, step: 1, label: 'Boost Rise' });
  boostFolder.addBinding(shipAudioPreset, 'boostToneMix', { min: 0, max: 1, step: 0.01, label: 'Tone Mix' });
  boostFolder.addBinding(shipAudioPreset, 'boostFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Boost Filter' });
  boostFolder.addBinding(shipAudioPreset, 'boostFilterHz', { min: 200, max: 6000, step: 10, label: 'Boost Filter' });
  boostFolder.addBinding(shipAudioPreset, 'boostFilterQ', { min: 0.1, max: 16, step: 0.1, label: 'Boost Q' });
  boostFolder.addBinding(shipAudioPreset, 'boostNoiseFilterHz', { min: 80, max: 6000, step: 10, label: 'Noise HPF' });
  boostFolder.addBinding(shipAudioPreset, 'boostNoiseGain', { min: 0, max: 0.6, step: 0.01, label: 'Boost Noise' });
  boostFolder.addBinding(shipAudioPreset, 'boostGain', { min: 0, max: 0.5, step: 0.01, label: 'Boost Gain' });
  boostFolder.addBinding(shipAudioPreset, 'scrapeFilterType', { options: SHIP_AUDIO_FILTER_TYPE_OPTIONS, label: 'Scrape Filter' });
  boostFolder.addBinding(shipAudioPreset, 'scrapeCenterHz', { min: 200, max: 2600, step: 10, label: 'Scrape Base' });
  boostFolder.addBinding(shipAudioPreset, 'scrapeQ', { min: 0.5, max: 14, step: 0.1, label: 'Scrape Q' });
  boostFolder.addBinding(shipAudioPreset, 'scrapeGain', { min: 0, max: 0.4, step: 0.01, label: 'Scrape Gain' });

  const actionsFolder = root.addFolder({ title: 'Actions', expanded: false });
  if (openPageUrl) {
    actionsFolder.addButton({ title: openPageLabel }).on('click', () => {
      window.open(openPageUrl, '_blank', 'noopener');
    });
  }
  actionsFolder.addButton({ title: 'Copy Preset JSON' }).on('click', async () => {
    try {
      await copyText(serializeShipAudioPreset());
      notify(onMessage, 'Ship audio preset copied.');
    } catch (error) {
      console.error('Failed to copy ship audio preset', error);
      notify(onMessage, 'Preset copy failed. Check the console.');
    }
  });
  actionsFolder.addButton({ title: 'Reset Preset' }).on('click', () => {
    resetShipAudioPreset();
    pane?.refresh?.();
    notify(onMessage, 'Ship audio preset reset.');
  });

  return root;
}
