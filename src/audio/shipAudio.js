const TAU = Math.PI * 2;
const NOISE_BUFFER_DURATION = 2;
const DEFAULT_BUCKET_COUNT = 48;
const DEFAULT_WAVEFORM_SAMPLES = 128;
const OSCILLATOR_TYPES = new Set(['sine', 'triangle', 'sawtooth', 'square']);
const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'notch']);
const LOOP_PLAYBACK_RATE_MIN = 0.25;
const LOOP_PLAYBACK_RATE_MAX = 4;
const DEFAULT_ENGINE_LOOP_URL = '/audio/ship-engine-default.mp3';
const DEFAULT_ENGINE_LOOP_LABEL = 'a_pulsing_hum_of_a_f_#1';
const DEFAULT_SAMPLE_SLOT_ASSETS = {
  sonar: {
    url: '/audio/ship-sonar-default.mp3',
    label: 'Short_subtle_sci-fi__#4',
  },
  laser: {
    url: '/audio/ship-laser-default.wav',
    label: 'snap.wav',
  },
  ambientCockpit: {
    url: '/audio/ship-ambient-cockpit-default.mp3',
    label: 'the_ambient_interior_#2',
  },
  salvagePickup: {
    url: '/audio/ship-salvage-default.mp3',
    label: 'Isolated_sci-fi_game_#3',
  },
  botExplosion: {
    url: '/audio/ship-bot-destroyed-default.mp3',
    label: 'Epic_cinematic_sound_#3',
  },
  botGroundImpact: {
    url: '/audio/ship-bot-ground-default.mp3',
    label: 'Epic_cinematic_sound_#1',
  },
};

export const SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS = [
  {
    id: 'sonar',
    title: 'Sonar',
    type: 'oneshot',
    presetPrefix: 'sonarSample',
    runtimeLabelKey: 'sonarSampleLabel',
    runtimeLoadedKey: 'sonarSampleLoaded',
    triggerTitle: 'Trigger Sonar',
  },
  {
    id: 'laser',
    title: 'Laser Sound',
    type: 'oneshot',
    presetPrefix: 'laserSample',
    runtimeLabelKey: 'laserSampleLabel',
    runtimeLoadedKey: 'laserSampleLoaded',
    triggerTitle: 'Trigger Laser',
  },
  {
    id: 'damage',
    title: 'Taking Damage',
    type: 'oneshot',
    presetPrefix: 'damageSample',
    runtimeLabelKey: 'damageSampleLabel',
    runtimeLoadedKey: 'damageSampleLoaded',
    triggerTitle: 'Trigger Damage',
  },
  {
    id: 'docking',
    title: 'Docking',
    type: 'oneshot',
    presetPrefix: 'dockingSample',
    runtimeLabelKey: 'dockingSampleLabel',
    runtimeLoadedKey: 'dockingSampleLoaded',
    triggerTitle: 'Trigger Dock',
  },
  {
    id: 'undocking',
    title: 'Undocking',
    type: 'oneshot',
    presetPrefix: 'undockingSample',
    runtimeLabelKey: 'undockingSampleLabel',
    runtimeLoadedKey: 'undockingSampleLoaded',
    triggerTitle: 'Trigger Undock',
  },
  {
    id: 'ambientCockpit',
    title: 'Ambient Cockpit',
    type: 'loop',
    presetPrefix: 'ambientCockpit',
    runtimeLabelKey: 'ambientCockpitLabel',
    runtimeLoadedKey: 'ambientCockpitLoaded',
    activeRuntimeKey: 'ambientCockpitActive',
    triggerTitle: 'Toggle Cockpit',
  },
  {
    id: 'salvagePickup',
    title: 'Pick Up Salvage',
    type: 'oneshot',
    presetPrefix: 'salvagePickupSample',
    runtimeLabelKey: 'salvagePickupSampleLabel',
    runtimeLoadedKey: 'salvagePickupSampleLoaded',
    triggerTitle: 'Trigger Salvage',
  },
  {
    id: 'botExplosion',
    title: 'Bot Destroyed',
    type: 'oneshot',
    presetPrefix: 'botExplosionSample',
    runtimeLabelKey: 'botExplosionSampleLabel',
    runtimeLoadedKey: 'botExplosionSampleLoaded',
    triggerTitle: 'Trigger Explosion',
  },
  {
    id: 'botGroundImpact',
    title: 'Bot Hits Ground',
    type: 'oneshot',
    presetPrefix: 'botGroundImpactSample',
    runtimeLabelKey: 'botGroundImpactSampleLabel',
    runtimeLoadedKey: 'botGroundImpactSampleLoaded',
    triggerTitle: 'Trigger Impact',
  },
];

const SHIP_AUDIO_SAMPLE_SLOT_MAP = new Map(
  SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const SHIP_AUDIO_OSC_TYPE_OPTIONS = {
  Sine: 'sine',
  Triangle: 'triangle',
  Saw: 'sawtooth',
  Square: 'square',
};

export const SHIP_AUDIO_FILTER_TYPE_OPTIONS = {
  Lowpass: 'lowpass',
  Highpass: 'highpass',
  Bandpass: 'bandpass',
  Notch: 'notch',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function smoothValue(current, target, responseHz, delta) {
  const dt = Math.max(0, Number.isFinite(delta) ? delta : 0.016);
  const rate = Math.max(0.001, responseHz);
  const blend = 1 - Math.exp(-rate * dt);
  return current + ((target - current) * blend);
}

function sanitizeOscillatorType(value, fallback = 'sine') {
  return OSCILLATOR_TYPES.has(value) ? value : fallback;
}

function sanitizeFilterType(value, fallback = 'lowpass') {
  return FILTER_TYPES.has(value) ? value : fallback;
}

function setNodeType(node, value, sanitizer, fallback) {
  if (!node) return;
  const nextType = sanitizer(value, fallback);
  if (node.type !== nextType) {
    node.type = nextType;
  }
}

function createDefaultTelemetry() {
  return {
    throttle: 0,
    speed: 0,
    turn: 0,
    boost: 0,
    strain: 0,
    groan: 0,
    scrape: 0,
    acceleration: 0,
    proximity: 0,
  };
}

export function createDefaultShipAudioPreset() {
  return {
    masterGain: 0.49999999999999994,
    masterFilterType: 'lowpass',
    masterToneHz: 6720,
    masterFilterQ: 2.7,
    engineBaseHz: 18,
    engineThrottleHz: 101,
    engineBoostHz: 60,
    engineFundamentalType: 'triangle',
    engineFundamentalMix: 1.0399999999999998,
    engineHarmonicType: 'triangle',
    engineHarmonicMix: 0.039999999999999945,
    engineHarmonicRatio: 2.5,
    engineHarmonicOffsetHz: 240,
    engineSubType: 'triangle',
    engineSubMix: 1.22,
    engineSubRatio: 0.7,
    engineSubOffsetHz: -31,
    engineDetuneCents: 30,
    enginePulseDepth: 0.46,
    enginePulseRate: 5,
    engineFilterType: 'lowpass',
    engineFilterBaseHz: 415,
    engineFilterDriveHz: 1030,
    engineFilterQ: 2.2,
    engineGain: 0.5,
    engineLoopGain: 0.4,
    engineLoopBaseRate: 0.27,
    engineLoopDriveRate: 1.17,
    engineLoopBoostRate: 1.06,
    engineLoopFilterType: 'lowpass',
    engineLoopFilterBaseHz: 3620,
    engineLoopFilterDriveHz: 6000,
    engineLoopFilterQ: 16,
    sonarSampleGain: 0.78,
    sonarSampleBaseRate: 0.71,
    sonarSampleFilterType: 'lowpass',
    sonarSampleFilterHz: 8000,
    sonarSampleFilterQ: 7.2,
    laserSampleGain: 0.74,
    laserSampleBaseRate: 1.54,
    laserSampleFilterType: 'lowpass',
    laserSampleFilterHz: 5590,
    laserSampleFilterQ: 8.9,
    damageSampleGain: 0.48,
    damageSampleBaseRate: 1,
    damageSampleFilterType: 'lowpass',
    damageSampleFilterHz: 3000,
    damageSampleFilterQ: 1.6,
    dockingSampleGain: 0.42,
    dockingSampleBaseRate: 1,
    dockingSampleFilterType: 'lowpass',
    dockingSampleFilterHz: 4200,
    dockingSampleFilterQ: 1.2,
    undockingSampleGain: 0.42,
    undockingSampleBaseRate: 1,
    undockingSampleFilterType: 'lowpass',
    undockingSampleFilterHz: 4200,
    undockingSampleFilterQ: 1.2,
    ambientCockpitGain: 0.54,
    ambientCockpitBaseRate: 1,
    ambientCockpitFilterType: 'lowpass',
    ambientCockpitFilterHz: 1600,
    ambientCockpitFilterQ: 0.9,
    salvagePickupSampleGain: 0.46,
    salvagePickupSampleBaseRate: 1,
    salvagePickupSampleFilterType: 'lowpass',
    salvagePickupSampleFilterHz: 3600,
    salvagePickupSampleFilterQ: 1.1,
    botExplosionSampleGain: 0.8,
    botExplosionSampleBaseRate: 1.13,
    botExplosionSampleFilterType: 'lowpass',
    botExplosionSampleFilterHz: 1890,
    botExplosionSampleFilterQ: 1.4,
    botGroundImpactSampleGain: 0.64,
    botGroundImpactSampleBaseRate: 0.82,
    botGroundImpactSampleFilterType: 'lowpass',
    botGroundImpactSampleFilterHz: 2600,
    botGroundImpactSampleFilterQ: 1.6,
    whineBaseHz: 40,
    whineThrottleHz: 720,
    whineTurnHz: 510,
    whineBoostHz: 260,
    whinePrimaryType: 'triangle',
    whinePrimaryMix: 0,
    whineOvertoneType: 'triangle',
    whineOvertoneMix: 2.0816681711721685e-17,
    whineOvertoneRatio: 1.5,
    whineOvertoneOffsetHz: 0,
    whineOvertoneDetuneCents: 6,
    whineVibratoRate: 6.4,
    whineVibratoDepth: 16,
    whineFilterType: 'bandpass',
    whineFilterHz: 3400,
    whineFilterQ: 4.2,
    whineGain: 0.16,
    turnBaseHz: 40,
    turnRiseHz: 0,
    turnType: 'triangle',
    turnFilterType: 'lowpass',
    turnQ: 0.2,
    turnGain: 0.24,
    groanCenterHz: 326,
    groanTurnHz: 175,
    groanBoostHz: 110,
    groanFilterType: 'lowpass',
    groanQ: 4.7,
    groanJitterRate: 5.8,
    groanJitterDepth: 0.54,
    groanGain: 0.14,
    palpitationRateHz: 10,
    palpitationDriveRateHz: 34,
    palpitationBoostRateHz: 72,
    palpitationType: 'square',
    palpitationBaseHz: 180,
    palpitationDriveHz: 70,
    palpitationToneMix: 0.72,
    palpitationNoiseMix: 0.28,
    palpitationFilterType: 'bandpass',
    palpitationFilterHz: 1280,
    palpitationFilterQ: 7.2,
    palpitationGain: 0.08,
    boostPulseRate: 18,
    boostOscBaseHz: 90,
    boostOscRiseHz: 260,
    boostOscType: 'sine',
    boostToneMix: 0.8200000000000001,
    boostFilterType: 'lowpass',
    boostFilterHz: 3980,
    boostFilterQ: 6.1,
    boostNoiseFilterHz: 2650,
    boostNoiseGain: 0.06,
    boostGain: 0.12999999999999998,
    scrapeCenterHz: 1430,
    scrapeFilterType: 'lowpass',
    scrapeQ: 5.9,
    scrapeGain: 0.08,
    responseHz: 1,
  };
}

export const shipAudioPreset = createDefaultShipAudioPreset();

export const shipAudioRuntime = {
  enabled: true,
  engineLoopLabel: 'No sample loaded',
  engineLoopLoaded: false,
  sonarSampleLabel: 'No sample loaded',
  sonarSampleLoaded: false,
  laserSampleLabel: 'No sample loaded',
  laserSampleLoaded: false,
  damageSampleLabel: 'No sample loaded',
  damageSampleLoaded: false,
  dockingSampleLabel: 'No sample loaded',
  dockingSampleLoaded: false,
  undockingSampleLabel: 'No sample loaded',
  undockingSampleLoaded: false,
  ambientCockpitLabel: 'No sample loaded',
  ambientCockpitLoaded: false,
  ambientCockpitActive: false,
  salvagePickupSampleLabel: 'No sample loaded',
  salvagePickupSampleLoaded: false,
  botExplosionSampleLabel: 'No sample loaded',
  botExplosionSampleLoaded: false,
  botGroundImpactSampleLabel: 'No sample loaded',
  botGroundImpactSampleLoaded: false,
};

const audioState = {
  context: null,
  nodes: null,
  noiseBuffer: null,
  engineLoopBuffer: null,
  engineLoopSelectionVersion: 0,
  defaultEngineLoopPromise: null,
  defaultSampleSlotPromises: Object.create(null),
  sampleSlots: Object.fromEntries(
    SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS.map((definition) => [
      definition.id,
      {
        buffer: null,
        selectionVersion: 0,
      },
    ]),
  ),
  time: 0,
  smoothedTelemetry: createDefaultTelemetry(),
  frequencyData: null,
  waveformData: null,
};

function sanitizeTelemetry(telemetry = {}) {
  return {
    throttle: clamp01(telemetry.throttle),
    speed: clamp01(telemetry.speed),
    turn: clamp(Number.isFinite(telemetry.turn) ? telemetry.turn : 0, -1, 1),
    boost: clamp01(telemetry.boost),
    strain: clamp01(telemetry.strain),
    groan: clamp01(telemetry.groan),
    scrape: clamp01(telemetry.scrape),
    acceleration: clamp01(telemetry.acceleration),
    proximity: clamp01(telemetry.proximity),
  };
}

function createNoiseBuffer(context) {
  const sampleRate = context.sampleRate;
  const frameCount = sampleRate * NOISE_BUFFER_DURATION;
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    channel[i] = (Math.random() * 2) - 1;
  }

  return buffer;
}

function createOptionalPanner(context) {
  if (typeof context.createStereoPanner === 'function') {
    return context.createStereoPanner();
  }
  return context.createGain();
}

function setPan(node, value, time) {
  if (node?.pan?.setTargetAtTime) {
    node.pan.setTargetAtTime(clamp(value, -1, 1), time, 0.03);
  }
}

function createLoopingNoiseSource(context, buffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

function stopAudioNode(node) {
  if (!node) return;
  try {
    node.stop?.();
  } catch (error) {
    // Ignore nodes that are already stopped or cannot be stopped.
  }
  try {
    node.disconnect?.();
  } catch (error) {
    // Ignore disconnect failures during teardown/reload.
  }
}

function createLoopingBufferSource(context, buffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

function getSampleSlotDefinition(slotId) {
  return SHIP_AUDIO_SAMPLE_SLOT_MAP.get(slotId) || null;
}

function getSampleSlotState(slotId) {
  return audioState.sampleSlots[slotId] || null;
}

function getSampleSlotNodes(nodes, slotId) {
  return nodes?.sampleSlots?.[slotId] || null;
}

function getSampleSlotPresetKey(slotId, suffix) {
  const definition = getSampleSlotDefinition(slotId);
  return definition ? `${definition.presetPrefix}${suffix}` : '';
}

function getSampleSlotRate(slotId) {
  const key = getSampleSlotPresetKey(slotId, 'BaseRate');
  return clamp(shipAudioPreset[key], LOOP_PLAYBACK_RATE_MIN, LOOP_PLAYBACK_RATE_MAX);
}

function updateSampleSlotRuntime(definition, buffer, label) {
  shipAudioRuntime[definition.runtimeLoadedKey] = Boolean(buffer);
  shipAudioRuntime[definition.runtimeLabelKey] = buffer ? (label || 'Custom sample') : 'No sample loaded';
  if (definition.activeRuntimeKey && !buffer) {
    shipAudioRuntime[definition.activeRuntimeKey] = false;
  }
}

function setEngineLoopBuffer(context, nodes, buffer, label) {
  audioState.engineLoopBuffer = buffer;
  shipAudioRuntime.engineLoopLoaded = Boolean(buffer);
  shipAudioRuntime.engineLoopLabel = buffer ? (label || 'Custom sample') : 'No sample loaded';

  if (context && nodes) {
    replaceEngineLoopSource(context, nodes, buffer);
  }

  return buffer
    ? {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        name: shipAudioRuntime.engineLoopLabel,
      }
    : null;
}

async function decodeShipAudioLoopBuffer(context, arrayBuffer) {
  return context.decodeAudioData(arrayBuffer.slice(0));
}

function replaceSampleSlotLoopSource(context, slotNodes, buffer) {
  if (!slotNodes) return null;

  stopAudioNode(slotNodes.source);
  slotNodes.source = null;

  if (!buffer) {
    return null;
  }

  const source = createLoopingBufferSource(context, buffer);
  source.connect(slotNodes.filter);
  slotNodes.source = source;
  return source;
}

function setSampleSlotBuffer(slotId, buffer, label) {
  const definition = getSampleSlotDefinition(slotId);
  const slotState = getSampleSlotState(slotId);
  if (!definition || !slotState) {
    throw new Error(`Unknown sample slot: ${slotId}`);
  }

  slotState.buffer = buffer;
  updateSampleSlotRuntime(definition, buffer, label);

  if (definition.type === 'loop') {
    replaceSampleSlotLoopSource(
      audioState.context,
      getSampleSlotNodes(audioState.nodes, slotId),
      buffer,
    );
  }

  return buffer
    ? {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        name: shipAudioRuntime[definition.runtimeLabelKey],
      }
    : null;
}

function applySampleSlotNodes(slotId, time, gainScale = 1, smoothing = 0.03) {
  const definition = getSampleSlotDefinition(slotId);
  const slotNodes = getSampleSlotNodes(audioState.nodes, slotId);
  if (!definition || !slotNodes || !audioState.context) {
    return false;
  }

  const filterTypeKey = getSampleSlotPresetKey(slotId, 'FilterType');
  const filterHzKey = getSampleSlotPresetKey(slotId, 'FilterHz');
  const filterQKey = getSampleSlotPresetKey(slotId, 'FilterQ');
  const gainKey = getSampleSlotPresetKey(slotId, 'Gain');

  setNodeType(slotNodes.filter, shipAudioPreset[filterTypeKey], sanitizeFilterType, 'lowpass');
  slotNodes.filter.frequency.setTargetAtTime(Math.max(40, shipAudioPreset[filterHzKey]), time, smoothing);
  slotNodes.filter.Q.setTargetAtTime(shipAudioPreset[filterQKey], time, smoothing);
  slotNodes.gain.gain.setTargetAtTime(Math.max(0, shipAudioPreset[gainKey] * gainScale), time, smoothing);

  if (definition.type === 'loop' && slotNodes.source?.playbackRate?.setTargetAtTime) {
    slotNodes.source.playbackRate.setTargetAtTime(getSampleSlotRate(slotId), time, smoothing);
  }

  return true;
}

function replaceEngineLoopSource(context, nodes, buffer) {
  if (!nodes) return null;

  stopAudioNode(nodes.engineLoopSource);
  nodes.engineLoopSource = null;

  if (!buffer) {
    return null;
  }

  const source = createLoopingBufferSource(context, buffer);
  source.connect(nodes.engineLoopFilter);
  nodes.engineLoopSource = source;
  return source;
}

function createShipAudioNodes(context) {
  const noiseBuffer = audioState.noiseBuffer || createNoiseBuffer(context);
  audioState.noiseBuffer = noiseBuffer;

  const masterGain = context.createGain();
  masterGain.gain.value = 0;

  const masterFilter = context.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.value = shipAudioPreset.masterToneHz;
  masterFilter.Q.value = shipAudioPreset.masterFilterQ;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.18;

  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.76;

  masterGain.connect(masterFilter);
  masterFilter.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(context.destination);

  const engineOscA = context.createOscillator();
  engineOscA.type = 'sawtooth';
  const engineOscB = context.createOscillator();
  engineOscB.type = 'triangle';
  const engineOscC = context.createOscillator();
  engineOscC.type = 'sine';
  const engineOscAGain = context.createGain();
  engineOscAGain.gain.value = 0.5;
  const engineOscBGain = context.createGain();
  engineOscBGain.gain.value = 0.28;
  const engineOscCGain = context.createGain();
  engineOscCGain.gain.value = 0.22;
  const engineFilter = context.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = shipAudioPreset.engineFilterBaseHz;
  engineFilter.Q.value = shipAudioPreset.engineFilterQ;
  const engineGain = context.createGain();
  engineGain.gain.value = 0;
  engineOscA.connect(engineOscAGain);
  engineOscB.connect(engineOscBGain);
  engineOscC.connect(engineOscCGain);
  engineOscAGain.connect(engineFilter);
  engineOscBGain.connect(engineFilter);
  engineOscCGain.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(masterGain);

  const engineLoopFilter = context.createBiquadFilter();
  engineLoopFilter.type = 'lowpass';
  engineLoopFilter.frequency.value = shipAudioPreset.engineLoopFilterBaseHz;
  engineLoopFilter.Q.value = shipAudioPreset.engineLoopFilterQ;
  const engineLoopGain = context.createGain();
  engineLoopGain.gain.value = 0;
  engineLoopFilter.connect(engineLoopGain);
  engineLoopGain.connect(masterGain);
  const engineLoopSource = audioState.engineLoopBuffer
    ? replaceEngineLoopSource(context, { engineLoopSource: null, engineLoopFilter }, audioState.engineLoopBuffer)
    : null;

  const sampleSlots = Object.fromEntries(
    SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS.map((definition) => {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = shipAudioPreset[`${definition.presetPrefix}FilterHz`];
      filter.Q.value = shipAudioPreset[`${definition.presetPrefix}FilterQ`];

      const gain = context.createGain();
      gain.gain.value = 0;
      filter.connect(gain);
      gain.connect(masterGain);

      const slotNodes = {
        filter,
        gain,
        source: null,
      };

      const slotState = getSampleSlotState(definition.id);
      if (definition.type === 'loop' && slotState?.buffer) {
        replaceSampleSlotLoopSource(context, slotNodes, slotState.buffer);
      }

      return [definition.id, slotNodes];
    }),
  );

  const whineOsc = context.createOscillator();
  whineOsc.type = 'triangle';
  const whineOvertoneOsc = context.createOscillator();
  whineOvertoneOsc.type = 'sine';
  const whinePrimaryGain = context.createGain();
  whinePrimaryGain.gain.value = 0.76;
  const whineOvertoneGain = context.createGain();
  whineOvertoneGain.gain.value = 0.24;
  const whineFilter = context.createBiquadFilter();
  whineFilter.type = 'bandpass';
  whineFilter.frequency.value = shipAudioPreset.whineFilterHz;
  whineFilter.Q.value = shipAudioPreset.whineFilterQ;
  const whineGain = context.createGain();
  whineGain.gain.value = 0;
  whineOsc.connect(whinePrimaryGain);
  whineOvertoneOsc.connect(whineOvertoneGain);
  whinePrimaryGain.connect(whineFilter);
  whineOvertoneGain.connect(whineFilter);
  whineFilter.connect(whineGain);
  whineGain.connect(masterGain);

  const turnOsc = context.createOscillator();
  turnOsc.type = 'sawtooth';
  const turnFilter = context.createBiquadFilter();
  turnFilter.type = 'bandpass';
  turnFilter.frequency.value = shipAudioPreset.turnBaseHz;
  turnFilter.Q.value = shipAudioPreset.turnQ;
  const turnPanner = createOptionalPanner(context);
  const turnGain = context.createGain();
  turnGain.gain.value = 0;
  turnOsc.connect(turnFilter);
  turnFilter.connect(turnPanner);
  turnPanner.connect(turnGain);
  turnGain.connect(masterGain);

  const groanNoise = createLoopingNoiseSource(context, noiseBuffer);
  const groanFilter = context.createBiquadFilter();
  groanFilter.type = 'bandpass';
  groanFilter.frequency.value = shipAudioPreset.groanCenterHz;
  groanFilter.Q.value = shipAudioPreset.groanQ;
  const groanPanner = createOptionalPanner(context);
  const groanGain = context.createGain();
  groanGain.gain.value = 0;
  groanNoise.connect(groanFilter);
  groanFilter.connect(groanPanner);
  groanPanner.connect(groanGain);
  groanGain.connect(masterGain);

  const palpitationOsc = context.createOscillator();
  palpitationOsc.type = 'square';
  const palpitationNoise = createLoopingNoiseSource(context, noiseBuffer);
  const palpitationToneGain = context.createGain();
  palpitationToneGain.gain.value = shipAudioPreset.palpitationToneMix;
  const palpitationNoiseGain = context.createGain();
  palpitationNoiseGain.gain.value = shipAudioPreset.palpitationNoiseMix;
  const palpitationFilter = context.createBiquadFilter();
  palpitationFilter.type = 'bandpass';
  palpitationFilter.frequency.value = shipAudioPreset.palpitationFilterHz;
  palpitationFilter.Q.value = shipAudioPreset.palpitationFilterQ;
  const palpitationPulseOsc = context.createOscillator();
  palpitationPulseOsc.type = 'square';
  const palpitationPulseDepth = context.createGain();
  palpitationPulseDepth.gain.value = 0;
  const palpitationPulseBias = context.createConstantSource();
  palpitationPulseBias.offset.value = 0;
  const palpitationVca = context.createGain();
  palpitationVca.gain.value = 0;
  const palpitationGain = context.createGain();
  palpitationGain.gain.value = 0;
  palpitationOsc.connect(palpitationToneGain);
  palpitationNoise.connect(palpitationNoiseGain);
  palpitationToneGain.connect(palpitationFilter);
  palpitationNoiseGain.connect(palpitationFilter);
  palpitationFilter.connect(palpitationVca);
  palpitationVca.connect(palpitationGain);
  palpitationGain.connect(masterGain);
  palpitationPulseOsc.connect(palpitationPulseDepth);
  palpitationPulseDepth.connect(palpitationVca.gain);
  palpitationPulseBias.connect(palpitationVca.gain);

  const boostOsc = context.createOscillator();
  boostOsc.type = 'square';
  const boostFilter = context.createBiquadFilter();
  boostFilter.type = 'bandpass';
  boostFilter.frequency.value = shipAudioPreset.boostFilterHz;
  boostFilter.Q.value = shipAudioPreset.boostFilterQ;
  const boostToneGain = context.createGain();
  boostToneGain.gain.value = shipAudioPreset.boostToneMix;
  const boostNoise = createLoopingNoiseSource(context, noiseBuffer);
  const boostNoiseFilter = context.createBiquadFilter();
  boostNoiseFilter.type = 'highpass';
  boostNoiseFilter.frequency.value = shipAudioPreset.boostNoiseFilterHz;
  const boostNoiseGain = context.createGain();
  boostNoiseGain.gain.value = shipAudioPreset.boostNoiseGain;
  const boostGain = context.createGain();
  boostGain.gain.value = 0;
  boostOsc.connect(boostFilter);
  boostFilter.connect(boostToneGain);
  boostToneGain.connect(boostGain);
  boostNoise.connect(boostNoiseFilter);
  boostNoiseFilter.connect(boostNoiseGain);
  boostNoiseGain.connect(boostGain);
  boostGain.connect(masterGain);

  const scrapeNoise = createLoopingNoiseSource(context, noiseBuffer);
  const scrapeFilter = context.createBiquadFilter();
  scrapeFilter.type = 'bandpass';
  scrapeFilter.frequency.value = shipAudioPreset.scrapeCenterHz;
  scrapeFilter.Q.value = shipAudioPreset.scrapeQ;
  const scrapeGain = context.createGain();
  scrapeGain.gain.value = 0;
  scrapeNoise.connect(scrapeFilter);
  scrapeFilter.connect(scrapeGain);
  scrapeGain.connect(masterGain);

  engineOscA.start();
  engineOscB.start();
  engineOscC.start();
  whineOsc.start();
  whineOvertoneOsc.start();
  turnOsc.start();
  palpitationOsc.start();
  palpitationPulseOsc.start();
  palpitationPulseBias.start();
  boostOsc.start();

  return {
    analyser,
    compressor,
    masterFilter,
    masterGain,
    engineOscA,
    engineOscAGain,
    engineOscB,
    engineOscBGain,
    engineOscC,
    engineOscCGain,
    engineFilter,
    engineGain,
    engineLoopSource,
    engineLoopFilter,
    engineLoopGain,
    sampleSlots,
    whineOsc,
    whineOvertoneOsc,
    whinePrimaryGain,
    whineOvertoneGain,
    whineFilter,
    whineGain,
    turnOsc,
    turnFilter,
    turnPanner,
    turnGain,
    groanNoise,
    groanFilter,
    groanPanner,
    groanGain,
    palpitationOsc,
    palpitationNoise,
    palpitationToneGain,
    palpitationNoiseGain,
    palpitationFilter,
    palpitationPulseOsc,
    palpitationPulseDepth,
    palpitationPulseBias,
    palpitationVca,
    palpitationGain,
    boostOsc,
    boostFilter,
    boostToneGain,
    boostNoise,
    boostNoiseFilter,
    boostNoiseGain,
    boostGain,
    scrapeNoise,
    scrapeFilter,
    scrapeGain,
  };
}

export async function ensureShipAudio() {
  if (audioState.context && audioState.nodes) {
    return audioState.context;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('Web Audio API is not available in this browser.');
  }

  const context = new AudioContextCtor();
  audioState.context = context;
  audioState.nodes = createShipAudioNodes(context);
  audioState.frequencyData = new Uint8Array(audioState.nodes.analyser.frequencyBinCount);
  audioState.waveformData = new Uint8Array(audioState.nodes.analyser.fftSize);
  await ensureDefaultShipAudioLoop();
  await ensureDefaultShipAudioSamples();
  return context;
}

async function ensureDefaultShipAudioLoop() {
  if (!audioState.context || !audioState.nodes || audioState.engineLoopBuffer) {
    return null;
  }

  if (audioState.defaultEngineLoopPromise) {
    return audioState.defaultEngineLoopPromise;
  }

  const selectionVersion = audioState.engineLoopSelectionVersion;
  audioState.defaultEngineLoopPromise = (async () => {
    try {
      const response = await fetch(DEFAULT_ENGINE_LOOP_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch default engine loop (${response.status}).`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await decodeShipAudioLoopBuffer(audioState.context, arrayBuffer);
      if (audioState.engineLoopSelectionVersion !== selectionVersion || audioState.engineLoopBuffer) {
        return null;
      }

      return setEngineLoopBuffer(audioState.context, audioState.nodes, decodedBuffer, DEFAULT_ENGINE_LOOP_LABEL);
    } catch (error) {
      console.warn('Failed to load default ship audio loop', error);
      return null;
    } finally {
      audioState.defaultEngineLoopPromise = null;
    }
  })();

  return audioState.defaultEngineLoopPromise;
}

async function ensureDefaultShipAudioSamples() {
  const slotIds = Object.keys(DEFAULT_SAMPLE_SLOT_ASSETS);
  if (!slotIds.length) {
    return [];
  }

  return Promise.all(slotIds.map((slotId) => ensureDefaultShipAudioSample(slotId)));
}

async function ensureDefaultShipAudioSample(slotId) {
  const definition = getSampleSlotDefinition(slotId);
  const slotState = getSampleSlotState(slotId);
  const asset = DEFAULT_SAMPLE_SLOT_ASSETS[slotId];
  if (!audioState.context || !audioState.nodes || !definition || !slotState || !asset || slotState.buffer) {
    return null;
  }

  const existingPromise = audioState.defaultSampleSlotPromises[slotId];
  if (existingPromise) {
    return existingPromise;
  }

  const selectionVersion = slotState.selectionVersion;
  audioState.defaultSampleSlotPromises[slotId] = (async () => {
    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch default sample for ${slotId} (${response.status}).`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await decodeShipAudioLoopBuffer(audioState.context, arrayBuffer);
      if (slotState.selectionVersion !== selectionVersion || slotState.buffer) {
        return null;
      }

      return setSampleSlotBuffer(slotId, decodedBuffer, asset.label);
    } catch (error) {
      console.warn(`Failed to load default sample for ${slotId}`, error);
      return null;
    } finally {
      delete audioState.defaultSampleSlotPromises[slotId];
    }
  })();

  return audioState.defaultSampleSlotPromises[slotId];
}

export async function loadShipAudioLoopFile(file) {
  if (!(file instanceof File)) {
    throw new Error('A valid audio file is required.');
  }

  audioState.engineLoopSelectionVersion += 1;
  const context = await ensureShipAudio();
  const arrayBuffer = await file.arrayBuffer();
  const decodedBuffer = await decodeShipAudioLoopBuffer(context, arrayBuffer);
  return setEngineLoopBuffer(context, audioState.nodes, decodedBuffer, file.name || 'Custom sample');
}

export function clearShipAudioLoop() {
  audioState.engineLoopSelectionVersion += 1;
  setEngineLoopBuffer(audioState.context, audioState.nodes, null, '');
}

export async function loadShipAudioSampleFile(slotId, file) {
  if (!(file instanceof File)) {
    throw new Error('A valid audio file is required.');
  }

  const definition = getSampleSlotDefinition(slotId);
  const slotState = getSampleSlotState(slotId);
  if (!definition || !slotState) {
    throw new Error(`Unknown sample slot: ${slotId}`);
  }

  slotState.selectionVersion += 1;
  const context = await ensureShipAudio();
  const arrayBuffer = await file.arrayBuffer();
  const decodedBuffer = await decodeShipAudioLoopBuffer(context, arrayBuffer);
  const result = setSampleSlotBuffer(slotId, decodedBuffer, file.name || 'Custom sample');
  if (definition.activeRuntimeKey) {
    shipAudioRuntime[definition.activeRuntimeKey] = true;
  }
  return result;
}

export function clearShipAudioSample(slotId) {
  const slotState = getSampleSlotState(slotId);
  if (!slotState) {
    return false;
  }

  slotState.selectionVersion += 1;
  setSampleSlotBuffer(slotId, null, '');
  return true;
}

export async function triggerShipAudioSample(slotId) {
  const definition = getSampleSlotDefinition(slotId);
  const slotState = getSampleSlotState(slotId);
  if (!definition || !slotState?.buffer) {
    return false;
  }

  const context = await ensureShipAudio();
  if (context.state === 'suspended') {
    await context.resume();
  }

  if (definition.type === 'loop') {
    if (definition.activeRuntimeKey) {
      shipAudioRuntime[definition.activeRuntimeKey] = !shipAudioRuntime[definition.activeRuntimeKey];
      return shipAudioRuntime[definition.activeRuntimeKey];
    }
    return false;
  }

  const slotNodes = getSampleSlotNodes(audioState.nodes, slotId);
  if (!slotNodes) {
    return false;
  }

  applySampleSlotNodes(slotId, context.currentTime, 1, 0.02);
  const source = context.createBufferSource();
  source.buffer = slotState.buffer;
  source.playbackRate.value = getSampleSlotRate(slotId);
  source.connect(slotNodes.filter);
  source.start();
  source.addEventListener('ended', () => {
    stopAudioNode(source);
  }, { once: true });
  return true;
}

export function setShipAudioLoopSampleActive(slotId, active) {
  const definition = getSampleSlotDefinition(slotId);
  if (!definition?.activeRuntimeKey) {
    return false;
  }

  if (!shipAudioRuntime[definition.runtimeLoadedKey] && active) {
    return false;
  }

  shipAudioRuntime[definition.activeRuntimeKey] = Boolean(active);
  return shipAudioRuntime[definition.activeRuntimeKey];
}

export async function resumeShipAudio() {
  const context = await ensureShipAudio();
  if (context.state === 'suspended') {
    await context.resume();
  }
  return context.state;
}

export async function setShipAudioEnabled(enabled) {
  const context = await ensureShipAudio();
  shipAudioRuntime.enabled = Boolean(enabled);

  if (shipAudioRuntime.enabled) {
    await resumeShipAudio();
  }

  const targetGain = shipAudioRuntime.enabled ? shipAudioPreset.masterGain : 0;
  audioState.nodes.masterGain.gain.cancelScheduledValues(context.currentTime);
  audioState.nodes.masterGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.045);
  return shipAudioRuntime.enabled;
}

export function resetShipAudioPreset() {
  Object.assign(shipAudioPreset, createDefaultShipAudioPreset());
}

export function serializeShipAudioPreset() {
  return JSON.stringify(shipAudioPreset, null, 2);
}

export function getShipAudioSpectrum(bucketCount = DEFAULT_BUCKET_COUNT) {
  if (!audioState.nodes?.analyser || !audioState.frequencyData) {
    return [];
  }

  const analyser = audioState.nodes.analyser;
  analyser.getByteFrequencyData(audioState.frequencyData);

  const count = Math.max(1, Math.floor(bucketCount));
  const binsPerBucket = Math.max(1, Math.floor(audioState.frequencyData.length / count));
  const buckets = new Array(count).fill(0);

  for (let bucketIndex = 0; bucketIndex < count; bucketIndex++) {
    const start = bucketIndex * binsPerBucket;
    const end = bucketIndex === count - 1
      ? audioState.frequencyData.length
      : Math.min(audioState.frequencyData.length, start + binsPerBucket);

    let sum = 0;
    const length = Math.max(1, end - start);
    for (let i = start; i < end; i++) {
      sum += audioState.frequencyData[i];
    }

    const normalized = sum / (length * 255);
    buckets[bucketIndex] = Math.sqrt(clamp01(normalized));
  }

  return buckets;
}

export function getShipAudioWaveform(sampleCount = DEFAULT_WAVEFORM_SAMPLES) {
  if (!audioState.nodes?.analyser || !audioState.waveformData) {
    return [];
  }

  const analyser = audioState.nodes.analyser;
  analyser.getByteTimeDomainData(audioState.waveformData);

  const count = Math.max(1, Math.floor(sampleCount));
  const stride = Math.max(1, Math.floor(audioState.waveformData.length / count));
  const waveform = new Array(count).fill(0);

  for (let i = 0; i < count; i++) {
    const sample = audioState.waveformData[Math.min(audioState.waveformData.length - 1, i * stride)];
    waveform[i] = ((sample / 255) * 2) - 1;
  }

  return waveform;
}

export function getShipAudioDebugInfo() {
  const sampleSlots = Object.fromEntries(
    SHIP_AUDIO_SAMPLE_SLOT_DEFINITIONS.map((definition) => [
      definition.id,
      {
        loaded: shipAudioRuntime[definition.runtimeLoadedKey],
        label: shipAudioRuntime[definition.runtimeLabelKey],
        active: definition.activeRuntimeKey ? shipAudioRuntime[definition.activeRuntimeKey] : undefined,
      },
    ]),
  );

  return {
    enabled: shipAudioRuntime.enabled,
    audioContextState: audioState.context?.state || 'none',
    hasContext: Boolean(audioState.context),
    hasNodes: Boolean(audioState.nodes),
    engineLoopLoaded: shipAudioRuntime.engineLoopLoaded,
    engineLoopLabel: shipAudioRuntime.engineLoopLabel,
    sampleSlots,
    telemetry: { ...audioState.smoothedTelemetry },
  };
}

export function updateShipAudio(delta, telemetry = {}) {
  if (!audioState.context || !audioState.nodes) {
    return;
  }

  const dt = clamp(Number.isFinite(delta) ? delta : 0.016, 0.001, 0.08);
  const context = audioState.context;
  const nodes = audioState.nodes;
  const currentTime = context.currentTime;
  const target = sanitizeTelemetry(telemetry);
  const responseHz = Math.max(0.4, shipAudioPreset.responseHz);

  audioState.time += dt;

  audioState.smoothedTelemetry.throttle = smoothValue(audioState.smoothedTelemetry.throttle, target.throttle, responseHz, dt);
  audioState.smoothedTelemetry.speed = smoothValue(audioState.smoothedTelemetry.speed, target.speed, responseHz, dt);
  audioState.smoothedTelemetry.turn = smoothValue(audioState.smoothedTelemetry.turn, target.turn, responseHz * 1.1, dt);
  audioState.smoothedTelemetry.boost = smoothValue(audioState.smoothedTelemetry.boost, target.boost, responseHz * 1.8, dt);
  audioState.smoothedTelemetry.strain = smoothValue(audioState.smoothedTelemetry.strain, target.strain, responseHz * 0.9, dt);
  audioState.smoothedTelemetry.groan = smoothValue(audioState.smoothedTelemetry.groan, target.groan, responseHz * 0.75, dt);
  audioState.smoothedTelemetry.scrape = smoothValue(audioState.smoothedTelemetry.scrape, target.scrape, responseHz * 1.4, dt);
  audioState.smoothedTelemetry.acceleration = smoothValue(audioState.smoothedTelemetry.acceleration, target.acceleration, responseHz * 1.6, dt);
  audioState.smoothedTelemetry.proximity = smoothValue(audioState.smoothedTelemetry.proximity, target.proximity, responseHz * 1.2, dt);

  const throttle = audioState.smoothedTelemetry.throttle;
  const speed = audioState.smoothedTelemetry.speed;
  const turn = audioState.smoothedTelemetry.turn;
  const turnAbs = Math.abs(turn);
  const boost = audioState.smoothedTelemetry.boost;
  const acceleration = audioState.smoothedTelemetry.acceleration;
  const proximity = audioState.smoothedTelemetry.proximity;
  const strain = clamp01(Math.max(audioState.smoothedTelemetry.strain, (turnAbs * 0.58) + (acceleration * 0.42)));
  const groanDrive = clamp01(
    (turnAbs * 0.52) +
    (boost * 0.46) +
    (strain * 0.38) +
    (proximity * 0.14)
  );
  const groanEnergy = clamp01(Math.max(audioState.smoothedTelemetry.groan, groanDrive));
  const scrapeEnergy = clamp01(Math.max(audioState.smoothedTelemetry.scrape, proximity * speed * 0.42));
  const drive = clamp01((speed * 0.72) + (throttle * 0.28));

  const enginePulse = 0.5 + (Math.sin(audioState.time * TAU * (shipAudioPreset.enginePulseRate + (drive * 1.2) + (boost * 1.6))) * 0.5);
  const boostPulse = 0.5 + (Math.sin(audioState.time * TAU * (shipAudioPreset.boostPulseRate + (boost * 2.4))) * 0.5);
  const groanJitter = Math.sin(
    (audioState.time * TAU * shipAudioPreset.groanJitterRate) +
    (Math.sin(audioState.time * 0.83) * shipAudioPreset.groanJitterDepth)
  );
  const vibrato = Math.sin(audioState.time * TAU * shipAudioPreset.whineVibratoRate) * shipAudioPreset.whineVibratoDepth;

  const engineFundamental = shipAudioPreset.engineBaseHz + (drive * shipAudioPreset.engineThrottleHz) + (boost * shipAudioPreset.engineBoostHz) + (acceleration * 12);
  const engineHarmonic = (engineFundamental * shipAudioPreset.engineHarmonicRatio) + shipAudioPreset.engineHarmonicOffsetHz;
  const engineSub = Math.max(18, (engineFundamental * shipAudioPreset.engineSubRatio) + shipAudioPreset.engineSubOffsetHz);
  const engineFilterHz = shipAudioPreset.engineFilterBaseHz + (drive * shipAudioPreset.engineFilterDriveHz) + (boost * 480);
  const engineGain = shipAudioPreset.engineGain
    * (0.34 + (drive * 0.66))
    * (1 + (((enginePulse - 0.5) * 2) * shipAudioPreset.enginePulseDepth));
  const engineMixTotal = Math.max(
    0.001,
    shipAudioPreset.engineFundamentalMix + shipAudioPreset.engineHarmonicMix + shipAudioPreset.engineSubMix,
  );
  const engineLoopRate = clamp(
    shipAudioPreset.engineLoopBaseRate
      + (drive * shipAudioPreset.engineLoopDriveRate)
      + (boost * shipAudioPreset.engineLoopBoostRate)
      + (acceleration * 0.08),
    LOOP_PLAYBACK_RATE_MIN,
    LOOP_PLAYBACK_RATE_MAX,
  );
  const engineLoopFilterHz = shipAudioPreset.engineLoopFilterBaseHz
    + (drive * shipAudioPreset.engineLoopFilterDriveHz)
    + (boost * 720);
  const engineLoopGain = shipAudioRuntime.engineLoopLoaded
    ? shipAudioPreset.engineLoopGain * clamp01(0.24 + (drive * 0.76) + (boost * 0.12))
    : 0;
  const ambientCockpitGain = shipAudioRuntime.ambientCockpitLoaded && shipAudioRuntime.ambientCockpitActive
    ? shipAudioPreset.ambientCockpitGain * clamp01(0.92 - (boost * 0.14) + ((1 - speed) * 0.08))
    : 0;
  const ambientCockpitRate = clamp(
    shipAudioPreset.ambientCockpitBaseRate + (speed * 0.08) + (boost * 0.04),
    LOOP_PLAYBACK_RATE_MIN,
    LOOP_PLAYBACK_RATE_MAX,
  );

  const whineFrequency = shipAudioPreset.whineBaseHz
    + (drive * shipAudioPreset.whineThrottleHz)
    + (turnAbs * shipAudioPreset.whineTurnHz)
    + (boost * shipAudioPreset.whineBoostHz)
    + vibrato;
  const whineOvertoneFrequency = (whineFrequency * shipAudioPreset.whineOvertoneRatio) + shipAudioPreset.whineOvertoneOffsetHz;
  const whineGain = shipAudioPreset.whineGain * clamp01(0.16 + (drive * 0.56) + (turnAbs * 0.22) + (boost * 0.24));
  const whineMixTotal = Math.max(0.001, shipAudioPreset.whinePrimaryMix + shipAudioPreset.whineOvertoneMix);

  const turnFrequency = shipAudioPreset.turnBaseHz + (turnAbs * shipAudioPreset.turnRiseHz) + (boost * 90);
  const turnGain = shipAudioPreset.turnGain * Math.pow(turnAbs, 1.15) * (0.18 + (drive * 0.82));

  const groanFrequency = shipAudioPreset.groanCenterHz
    + (strain * shipAudioPreset.groanTurnHz)
    + (boost * shipAudioPreset.groanBoostHz)
    + (groanJitter * 28);
  const groanGain = shipAudioPreset.groanGain
    * groanEnergy
    * (0.4 + (turnAbs * 0.22) + (boost * 0.18) + (Math.abs(groanJitter) * 0.2));

  const palpitationRate = Math.max(
    0.5,
    shipAudioPreset.palpitationRateHz
      + (drive * shipAudioPreset.palpitationDriveRateHz)
      + (boost * shipAudioPreset.palpitationBoostRateHz)
  );
  const palpitationFrequency = Math.max(
    40,
    shipAudioPreset.palpitationBaseHz
      + (drive * shipAudioPreset.palpitationDriveHz)
      + (boost * 36)
  );
  const palpitationMixTotal = Math.max(
    0.001,
    shipAudioPreset.palpitationToneMix + shipAudioPreset.palpitationNoiseMix,
  );
  const palpitationEnergy = clamp01((drive * 0.84) + (boost * 0.42) + (turnAbs * 0.12));
  const palpitationGain = shipAudioPreset.palpitationGain * palpitationEnergy;

  const boostFrequency = shipAudioPreset.boostOscBaseHz + (boost * shipAudioPreset.boostOscRiseHz) + (boostPulse * 24);
  const boostGain = shipAudioPreset.boostGain * boost * (0.35 + (boostPulse * 0.65));

  const scrapeFrequency = shipAudioPreset.scrapeCenterHz + (turnAbs * 120) + (Math.sin(audioState.time * 9.6) * 70);
  const scrapeGain = shipAudioPreset.scrapeGain * scrapeEnergy;

  const masterToneHz = shipAudioPreset.masterToneHz + (drive * 840) + (boost * 1200);
  const targetMasterGain = shipAudioRuntime.enabled ? shipAudioPreset.masterGain : 0;

  setNodeType(nodes.masterFilter, shipAudioPreset.masterFilterType, sanitizeFilterType, 'lowpass');
  setNodeType(nodes.engineOscA, shipAudioPreset.engineFundamentalType, sanitizeOscillatorType, 'sawtooth');
  setNodeType(nodes.engineOscB, shipAudioPreset.engineHarmonicType, sanitizeOscillatorType, 'triangle');
  setNodeType(nodes.engineOscC, shipAudioPreset.engineSubType, sanitizeOscillatorType, 'sine');
  setNodeType(nodes.engineFilter, shipAudioPreset.engineFilterType, sanitizeFilterType, 'lowpass');
  setNodeType(nodes.engineLoopFilter, shipAudioPreset.engineLoopFilterType, sanitizeFilterType, 'lowpass');
  if (getSampleSlotNodes(nodes, 'ambientCockpit')) {
    setNodeType(
      getSampleSlotNodes(nodes, 'ambientCockpit').filter,
      shipAudioPreset.ambientCockpitFilterType,
      sanitizeFilterType,
      'lowpass',
    );
  }
  setNodeType(nodes.whineOsc, shipAudioPreset.whinePrimaryType, sanitizeOscillatorType, 'triangle');
  setNodeType(nodes.whineOvertoneOsc, shipAudioPreset.whineOvertoneType, sanitizeOscillatorType, 'sine');
  setNodeType(nodes.whineFilter, shipAudioPreset.whineFilterType, sanitizeFilterType, 'bandpass');
  setNodeType(nodes.turnOsc, shipAudioPreset.turnType, sanitizeOscillatorType, 'sawtooth');
  setNodeType(nodes.turnFilter, shipAudioPreset.turnFilterType, sanitizeFilterType, 'bandpass');
  setNodeType(nodes.groanFilter, shipAudioPreset.groanFilterType, sanitizeFilterType, 'bandpass');
  setNodeType(nodes.palpitationOsc, shipAudioPreset.palpitationType, sanitizeOscillatorType, 'square');
  setNodeType(nodes.palpitationFilter, shipAudioPreset.palpitationFilterType, sanitizeFilterType, 'bandpass');
  setNodeType(nodes.boostOsc, shipAudioPreset.boostOscType, sanitizeOscillatorType, 'square');
  setNodeType(nodes.boostFilter, shipAudioPreset.boostFilterType, sanitizeFilterType, 'bandpass');
  setNodeType(nodes.scrapeFilter, shipAudioPreset.scrapeFilterType, sanitizeFilterType, 'bandpass');

  nodes.masterGain.gain.setTargetAtTime(targetMasterGain, currentTime, 0.04);
  nodes.masterFilter.frequency.setTargetAtTime(masterToneHz, currentTime, 0.04);
  nodes.masterFilter.Q.setTargetAtTime(shipAudioPreset.masterFilterQ, currentTime, 0.04);

  nodes.engineOscA.detune.setTargetAtTime(-shipAudioPreset.engineDetuneCents, currentTime, 0.04);
  nodes.engineOscB.detune.setTargetAtTime(shipAudioPreset.engineDetuneCents, currentTime, 0.04);
  nodes.engineOscA.frequency.setTargetAtTime(engineFundamental, currentTime, 0.03);
  nodes.engineOscB.frequency.setTargetAtTime(Math.max(20, engineHarmonic), currentTime, 0.03);
  nodes.engineOscC.frequency.setTargetAtTime(engineSub, currentTime, 0.03);
  nodes.engineOscAGain.gain.setTargetAtTime(engineGain * (shipAudioPreset.engineFundamentalMix / engineMixTotal), currentTime, 0.03);
  nodes.engineOscBGain.gain.setTargetAtTime(engineGain * (shipAudioPreset.engineHarmonicMix / engineMixTotal), currentTime, 0.03);
  nodes.engineOscCGain.gain.setTargetAtTime(engineGain * (shipAudioPreset.engineSubMix / engineMixTotal), currentTime, 0.03);
  nodes.engineFilter.frequency.setTargetAtTime(engineFilterHz, currentTime, 0.04);
  nodes.engineFilter.Q.setTargetAtTime(shipAudioPreset.engineFilterQ, currentTime, 0.04);
  nodes.engineGain.gain.setTargetAtTime(1, currentTime, 0.035);
  nodes.engineLoopFilter.frequency.setTargetAtTime(Math.max(80, engineLoopFilterHz), currentTime, 0.04);
  nodes.engineLoopFilter.Q.setTargetAtTime(shipAudioPreset.engineLoopFilterQ, currentTime, 0.04);
  nodes.engineLoopGain.gain.setTargetAtTime(Math.max(0, engineLoopGain), currentTime, 0.035);
  if (nodes.engineLoopSource?.playbackRate?.setTargetAtTime) {
    nodes.engineLoopSource.playbackRate.setTargetAtTime(engineLoopRate, currentTime, 0.03);
  }

  if (applySampleSlotNodes('ambientCockpit', currentTime, ambientCockpitGain > 0 ? ambientCockpitGain / Math.max(shipAudioPreset.ambientCockpitGain, 0.0001) : 0, 0.04)) {
    const ambientNodes = getSampleSlotNodes(nodes, 'ambientCockpit');
    if (ambientNodes?.source?.playbackRate?.setTargetAtTime) {
      ambientNodes.source.playbackRate.setTargetAtTime(ambientCockpitRate, currentTime, 0.04);
    }
  }

  nodes.whineOsc.frequency.setTargetAtTime(Math.max(30, whineFrequency), currentTime, 0.03);
  nodes.whineOvertoneOsc.frequency.setTargetAtTime(Math.max(30, whineOvertoneFrequency), currentTime, 0.03);
  nodes.whineOvertoneOsc.detune.setTargetAtTime(shipAudioPreset.whineOvertoneDetuneCents, currentTime, 0.03);
  nodes.whinePrimaryGain.gain.setTargetAtTime(shipAudioPreset.whinePrimaryMix / whineMixTotal, currentTime, 0.035);
  nodes.whineOvertoneGain.gain.setTargetAtTime(shipAudioPreset.whineOvertoneMix / whineMixTotal, currentTime, 0.035);
  nodes.whineFilter.frequency.setTargetAtTime(shipAudioPreset.whineFilterHz + (turnAbs * 400) + (boost * 600), currentTime, 0.035);
  nodes.whineFilter.Q.setTargetAtTime(shipAudioPreset.whineFilterQ, currentTime, 0.04);
  nodes.whineGain.gain.setTargetAtTime(Math.max(0, whineGain), currentTime, 0.035);

  nodes.turnOsc.frequency.setTargetAtTime(Math.max(40, turnFrequency), currentTime, 0.03);
  nodes.turnFilter.frequency.setTargetAtTime(Math.max(50, turnFrequency), currentTime, 0.03);
  nodes.turnFilter.Q.setTargetAtTime(shipAudioPreset.turnQ, currentTime, 0.04);
  nodes.turnGain.gain.setTargetAtTime(Math.max(0, turnGain), currentTime, 0.03);
  setPan(nodes.turnPanner, turn * 0.68, currentTime);

  nodes.groanFilter.frequency.setTargetAtTime(Math.max(40, groanFrequency), currentTime, 0.04);
  nodes.groanFilter.Q.setTargetAtTime(shipAudioPreset.groanQ, currentTime, 0.04);
  nodes.groanGain.gain.setTargetAtTime(Math.max(0, groanGain), currentTime, 0.05);
  setPan(nodes.groanPanner, turn * 0.3, currentTime);

  nodes.palpitationOsc.frequency.setTargetAtTime(palpitationFrequency, currentTime, 0.02);
  nodes.palpitationToneGain.gain.setTargetAtTime(shipAudioPreset.palpitationToneMix / palpitationMixTotal, currentTime, 0.03);
  nodes.palpitationNoiseGain.gain.setTargetAtTime(shipAudioPreset.palpitationNoiseMix / palpitationMixTotal, currentTime, 0.03);
  nodes.palpitationFilter.frequency.setTargetAtTime(shipAudioPreset.palpitationFilterHz + (boost * 340), currentTime, 0.03);
  nodes.palpitationFilter.Q.setTargetAtTime(shipAudioPreset.palpitationFilterQ, currentTime, 0.03);
  nodes.palpitationPulseOsc.frequency.setTargetAtTime(palpitationRate, currentTime, 0.02);
  nodes.palpitationPulseDepth.gain.setTargetAtTime(Math.max(0, palpitationGain * 0.5), currentTime, 0.02);
  nodes.palpitationPulseBias.offset.setTargetAtTime(Math.max(0, palpitationGain * 0.5), currentTime, 0.02);
  nodes.palpitationGain.gain.setTargetAtTime(1, currentTime, 0.03);

  nodes.boostOsc.frequency.setTargetAtTime(Math.max(30, boostFrequency), currentTime, 0.03);
  nodes.boostFilter.frequency.setTargetAtTime(shipAudioPreset.boostFilterHz + (boost * 600), currentTime, 0.03);
  nodes.boostFilter.Q.setTargetAtTime(shipAudioPreset.boostFilterQ, currentTime, 0.03);
  nodes.boostToneGain.gain.setTargetAtTime(shipAudioPreset.boostToneMix, currentTime, 0.03);
  nodes.boostNoiseFilter.frequency.setTargetAtTime(shipAudioPreset.boostNoiseFilterHz, currentTime, 0.03);
  nodes.boostNoiseGain.gain.setTargetAtTime(shipAudioPreset.boostNoiseGain, currentTime, 0.04);
  nodes.boostGain.gain.setTargetAtTime(Math.max(0, boostGain), currentTime, 0.025);

  nodes.scrapeFilter.frequency.setTargetAtTime(Math.max(180, scrapeFrequency), currentTime, 0.025);
  nodes.scrapeFilter.Q.setTargetAtTime(shipAudioPreset.scrapeQ, currentTime, 0.03);
  nodes.scrapeGain.gain.setTargetAtTime(Math.max(0, scrapeGain), currentTime, 0.02);
}
