import '../styles/engineLab.css';
import { Pane } from 'tweakpane';
import { addShipAudioPane } from './audio/shipAudioPane.js';
import {
  clearShipAudioSample,
  clearShipAudioLoop,
  getShipAudioDebugInfo,
  getShipAudioSpectrum,
  getShipAudioWaveform,
  loadShipAudioLoopFile,
  loadShipAudioSampleFile,
  setShipAudioEnabled,
  setShipAudioLoopSampleActive,
  shipAudioRuntime,
  updateShipAudio,
} from './audio/shipAudio.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smoothValue(current, target, responseHz, delta) {
  const dt = Math.max(0.001, Number.isFinite(delta) ? delta : 0.016);
  const rate = Math.max(0.001, responseHz);
  const blend = 1 - Math.exp(-rate * dt);
  return current + ((target - current) * blend);
}

function createFileInput(id) {
  const input = document.createElement('input');
  input.id = id;
  input.type = 'file';
  input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
  input.hidden = true;
  document.body.appendChild(input);
  return input;
}

function formatLoopLabel(label) {
  const value = String(label || '').trim();
  if (!value || value === 'No sample loaded') {
    return 'No sample';
  }
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

const panelContainer = document.getElementById('panel-container');
const scopeCanvas = document.getElementById('engine-lab-scope');
const loopReadoutEl = document.getElementById('engine-lab-loop-readout');
const ambientReadoutEl = document.getElementById('engine-lab-ambient-readout');
const throttleReadoutEl = document.getElementById('engine-lab-throttle-readout');
const turnReadoutEl = document.getElementById('engine-lab-turn-readout');
const boostReadoutEl = document.getElementById('engine-lab-boost-readout');
const loadLoopButton = document.getElementById('engine-lab-load-loop');
const clearLoopButton = document.getElementById('engine-lab-clear-loop');
const loadAmbientButton = document.getElementById('engine-lab-load-ambient');
const clearAmbientButton = document.getElementById('engine-lab-clear-ambient');
const toggleAmbientButton = document.getElementById('engine-lab-toggle-ambient');
const toastEl = document.getElementById('engine-lab-toast');
const scopeContext = scopeCanvas?.getContext('2d');

const loopFileInput = createFileInput('engine-lab-loop-input');
const ambientFileInput = createFileInput('engine-lab-ambient-input');

const holdState = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  groan: false,
};

const simulatorState = {
  idleThrottle: 0.12,
  throttleRise: 6.2,
  throttleFall: 3.6,
  turnResponse: 8.2,
  speedResponse: 4.4,
  boostResponse: 10.5,
  groanAssist: 0.24,
  scrapeBias: 0.04,
  proximityBias: 0.1,
  cruiseBias: 0.08,
};

const motionState = {
  throttle: simulatorState.idleThrottle,
  speed: simulatorState.cruiseBias,
  turn: 0,
  boost: 0,
  groan: 0,
  acceleration: 0,
  strain: 0,
  proximity: simulatorState.proximityBias,
  scrape: simulatorState.scrapeBias,
};

let pane = null;
let toastTimeout = 0;
let lastFrameAt = performance.now();

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 1800);
}

async function armAudioFromInteraction() {
  const info = getShipAudioDebugInfo();
  if (shipAudioRuntime.enabled && info.audioContextState === 'running') return;
  try {
    await setShipAudioEnabled(true);
    pane?.refresh?.();
    showToast('Ship audio armed.');
  } catch (error) {
    console.error('Failed to arm engine lab audio', error);
    showToast('Audio could not start. Check the console.');
  }
}

function updateLoopActionState() {
  if (clearLoopButton) {
    clearLoopButton.disabled = !shipAudioRuntime.engineLoopLoaded;
  }
}

function updateAmbientActionState() {
  const ambientLoaded = shipAudioRuntime.ambientCockpitLoaded;
  const ambientActive = shipAudioRuntime.ambientCockpitActive;
  if (clearAmbientButton) {
    clearAmbientButton.disabled = !ambientLoaded;
  }
  if (toggleAmbientButton) {
    toggleAmbientButton.disabled = !ambientLoaded;
    toggleAmbientButton.classList.toggle('active', ambientActive);
    const helper = toggleAmbientButton.querySelector('span');
    if (helper) {
      helper.textContent = ambientLoaded
        ? (ambientActive ? 'currently on' : 'currently off')
        : 'load ambient first';
    }
  }
}

function updateControlHighlights() {
  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.getAttribute('data-control');
    button.classList.toggle('active', Boolean(control && holdState[control]));
  });
}

async function handleLoopFileSelection(file) {
  if (!file) return;

  try {
    await armAudioFromInteraction();
    const result = await loadShipAudioLoopFile(file);
    pane?.refresh?.();
    updateLoopActionState();
    showToast(`Engine loop loaded: ${result.name}`);
  } catch (error) {
    console.error('Failed to load engine lab loop', error);
    showToast('Engine loop load failed. Check the console.');
  } finally {
    loopFileInput.value = '';
  }
}

async function handleAmbientFileSelection(file) {
  if (!file) return;

  try {
    await armAudioFromInteraction();
    const result = await loadShipAudioSampleFile('ambientCockpit', file);
    pane?.refresh?.();
    updateAmbientActionState();
    showToast(`Ambient loop loaded: ${result.name}`);
  } catch (error) {
    console.error('Failed to load ambient cockpit loop', error);
    showToast('Ambient loop load failed. Check the console.');
  } finally {
    ambientFileInput.value = '';
  }
}

function setHold(control, active) {
  if (!Object.prototype.hasOwnProperty.call(holdState, control)) return;
  holdState[control] = active;
  updateControlHighlights();
}

function releaseAllControls() {
  Object.keys(holdState).forEach((key) => {
    holdState[key] = false;
  });
  updateControlHighlights();
}

function buildPane() {
  if (!panelContainer) return;
  panelContainer.classList.remove('hidden');
  pane = new Pane({ title: 'Engine Lab Panel', container: panelContainer });

  const simulatorFolder = pane.addFolder({ title: 'Simulator', expanded: true });
  simulatorFolder.addBinding(simulatorState, 'idleThrottle', { min: 0, max: 0.5, step: 0.01, label: 'Idle' });
  simulatorFolder.addBinding(simulatorState, 'throttleRise', { min: 1, max: 16, step: 0.1, label: 'Rise' });
  simulatorFolder.addBinding(simulatorState, 'throttleFall', { min: 1, max: 12, step: 0.1, label: 'Fall' });
  simulatorFolder.addBinding(simulatorState, 'turnResponse', { min: 1, max: 16, step: 0.1, label: 'Turn Resp' });
  simulatorFolder.addBinding(simulatorState, 'speedResponse', { min: 1, max: 12, step: 0.1, label: 'Speed Resp' });
  simulatorFolder.addBinding(simulatorState, 'boostResponse', { min: 1, max: 18, step: 0.1, label: 'Boost Resp' });
  simulatorFolder.addBinding(simulatorState, 'groanAssist', { min: 0, max: 1, step: 0.01, label: 'Groan Bias' });
  simulatorFolder.addBinding(simulatorState, 'scrapeBias', { min: 0, max: 0.4, step: 0.01, label: 'Scrape Bias' });
  simulatorFolder.addBinding(simulatorState, 'proximityBias', { min: 0, max: 1, step: 0.01, label: 'Proximity' });
  simulatorFolder.addBinding(simulatorState, 'cruiseBias', { min: 0, max: 0.6, step: 0.01, label: 'Cruise' });
  simulatorFolder.addButton({ title: 'Zero Motion' }).on('click', () => {
    motionState.throttle = simulatorState.idleThrottle;
    motionState.speed = simulatorState.cruiseBias;
    motionState.turn = 0;
    motionState.boost = 0;
    motionState.groan = 0;
    motionState.acceleration = 0;
    motionState.strain = 0;
    motionState.proximity = simulatorState.proximityBias;
    motionState.scrape = simulatorState.scrapeBias;
    releaseAllControls();
    showToast('Simulator reset.');
  });

  addShipAudioPane(pane, {
    pane,
    title: 'Ship Audio',
    expanded: true,
    onMessage: showToast,
    sampleSlotIds: ['ambientCockpit'],
    openPageUrl: '',
  });
}

function bindPointerHold(button, control) {
  if (!button) return;

  const activate = () => {
    void armAudioFromInteraction();
    setHold(control, true);
  };

  const release = () => {
    setHold(control, false);
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    activate();
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

function setupControls() {
  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.getAttribute('data-control');
    if (control) {
      bindPointerHold(button, control);
    }
  });

  window.addEventListener('keydown', (event) => {
    const handled = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyG'];
    if (!handled.includes(event.code)) return;
    event.preventDefault();
    void armAudioFromInteraction();

    if (event.code === 'KeyW') setHold('accelerate', true);
    if (event.code === 'KeyS') setHold('brake', true);
    if (event.code === 'KeyA') setHold('left', true);
    if (event.code === 'KeyD') setHold('right', true);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') setHold('boost', true);
    if (event.code === 'KeyG') setHold('groan', true);
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyW') setHold('accelerate', false);
    if (event.code === 'KeyS') setHold('brake', false);
    if (event.code === 'KeyA') setHold('left', false);
    if (event.code === 'KeyD') setHold('right', false);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') setHold('boost', false);
    if (event.code === 'KeyG') setHold('groan', false);
  });

  window.addEventListener('blur', () => {
    releaseAllControls();
  });

  loadLoopButton?.addEventListener('click', () => {
    loopFileInput.value = '';
    loopFileInput.click();
  });

  clearLoopButton?.addEventListener('click', () => {
    clearShipAudioLoop();
    pane?.refresh?.();
    updateLoopActionState();
    showToast('Engine loop cleared.');
  });

  loadAmbientButton?.addEventListener('click', () => {
    ambientFileInput.value = '';
    ambientFileInput.click();
  });

  clearAmbientButton?.addEventListener('click', () => {
    clearShipAudioSample('ambientCockpit');
    pane?.refresh?.();
    updateAmbientActionState();
    showToast('Ambient loop cleared.');
  });

  toggleAmbientButton?.addEventListener('click', async () => {
    if (!shipAudioRuntime.ambientCockpitLoaded) {
      showToast('Load ambient cockpit first.');
      return;
    }

    try {
      await armAudioFromInteraction();
      const nextActive = !shipAudioRuntime.ambientCockpitActive;
      const active = setShipAudioLoopSampleActive('ambientCockpit', nextActive);
      pane?.refresh?.();
      updateAmbientActionState();
      showToast(active ? 'Ambient cockpit active.' : 'Ambient cockpit muted.');
    } catch (error) {
      console.error('Failed to toggle ambient cockpit loop', error);
      showToast('Ambient toggle failed. Check the console.');
    }
  });

  loopFileInput.addEventListener('change', () => {
    const [file] = Array.from(loopFileInput.files || []);
    void handleLoopFileSelection(file);
  });

  ambientFileInput.addEventListener('change', () => {
    const [file] = Array.from(ambientFileInput.files || []);
    void handleAmbientFileSelection(file);
  });
}

function resizeScope() {
  if (!scopeCanvas || !scopeContext) return;
  const rect = scopeCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  scopeCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  scopeCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  scopeContext.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawScope() {
  if (!scopeCanvas || !scopeContext) return;

  const rect = scopeCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const waveform = getShipAudioWaveform(128);
  const spectrum = getShipAudioSpectrum(56);

  scopeContext.clearRect(0, 0, width, height);

  const bgGradient = scopeContext.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, 'rgba(8, 8, 11, 0.98)');
  bgGradient.addColorStop(1, 'rgba(12, 10, 6, 0.98)');
  scopeContext.fillStyle = bgGradient;
  scopeContext.fillRect(0, 0, width, height);

  scopeContext.strokeStyle = 'rgba(255, 165, 0, 0.14)';
  scopeContext.lineWidth = 1;
  for (let y = 0; y <= 4; y++) {
    const rowY = (height / 4) * y;
    scopeContext.beginPath();
    scopeContext.moveTo(0, rowY);
    scopeContext.lineTo(width, rowY);
    scopeContext.stroke();
  }

  const barWidth = width / Math.max(1, spectrum.length);
  for (let i = 0; i < spectrum.length; i++) {
    const value = spectrum[i] || 0;
    const barHeight = value * (height * 0.64);
    const x = i * barWidth;
    const y = height - barHeight;
    scopeContext.fillStyle = i % 2 === 0 ? 'rgba(255, 165, 0, 0.34)' : 'rgba(245, 243, 239, 0.16)';
    scopeContext.fillRect(x + 1, y, Math.max(1, barWidth - 2), barHeight);
  }

  scopeContext.strokeStyle = 'rgba(245, 243, 239, 0.95)';
  scopeContext.lineWidth = 2;
  scopeContext.beginPath();
  waveform.forEach((value, index) => {
    const x = (index / Math.max(1, waveform.length - 1)) * width;
    const y = (height * 0.5) + (value * height * 0.24);
    if (index === 0) {
      scopeContext.moveTo(x, y);
    } else {
      scopeContext.lineTo(x, y);
    }
  });
  scopeContext.stroke();

  const info = getShipAudioDebugInfo();
  scopeContext.fillStyle = 'rgba(255, 165, 0, 0.78)';
  scopeContext.font = "12px 'SF Mono', 'Fira Code', monospace";
  scopeContext.fillText(`context:${info.audioContextState}`, 16, 20);
  scopeContext.fillText(`engine:${shipAudioRuntime.enabled ? 'armed' : 'muted'}`, 16, 38);
  scopeContext.fillText(`loop:${info.engineLoopLoaded ? formatLoopLabel(info.engineLoopLabel) : 'none'}`, 16, 56);
  scopeContext.fillText(`ambient:${shipAudioRuntime.ambientCockpitLoaded ? formatLoopLabel(shipAudioRuntime.ambientCockpitLabel) : 'none'}`, 16, 74);
}

function updateReadouts() {
  const info = getShipAudioDebugInfo();
  const turnPercent = Math.round(Math.abs(motionState.turn) * 100);
  const throttlePercent = Math.round(motionState.throttle * 100);

  if (loopReadoutEl) {
    loopReadoutEl.textContent = info.engineLoopLoaded
      ? formatLoopLabel(info.engineLoopLabel)
      : 'No sample';
  }

  if (ambientReadoutEl) {
    ambientReadoutEl.textContent = shipAudioRuntime.ambientCockpitLoaded
      ? `${formatLoopLabel(shipAudioRuntime.ambientCockpitLabel)}${shipAudioRuntime.ambientCockpitActive ? ' / on' : ' / off'}`
      : 'No sample';
  }

  if (throttleReadoutEl) {
    throttleReadoutEl.textContent = `${throttlePercent}%`;
  }

  if (turnReadoutEl) {
    const direction = motionState.turn < -0.08 ? 'L' : motionState.turn > 0.08 ? 'R' : '';
    turnReadoutEl.textContent = direction ? `${direction} ${turnPercent}%` : `${turnPercent}%`;
  }

  if (boostReadoutEl) {
    boostReadoutEl.textContent = motionState.boost > 0.15 ? 'Charging' : 'Idle';
  }

  updateLoopActionState();
  updateAmbientActionState();
}

function stepSimulation(delta) {
  const previousSpeed = motionState.speed;

  let throttleTarget = simulatorState.idleThrottle;
  if (holdState.accelerate && !holdState.brake) {
    throttleTarget = 1;
  } else if (holdState.brake && !holdState.accelerate) {
    throttleTarget = 0;
  }

  const throttleResponse = motionState.throttle < throttleTarget ? simulatorState.throttleRise : simulatorState.throttleFall;
  motionState.throttle = smoothValue(motionState.throttle, throttleTarget, throttleResponse, delta);

  let turnTarget = 0;
  if (holdState.left && !holdState.right) {
    turnTarget = -1;
  } else if (holdState.right && !holdState.left) {
    turnTarget = 1;
  }
  motionState.turn = smoothValue(motionState.turn, turnTarget, simulatorState.turnResponse, delta);

  const boostTarget = holdState.boost ? 1 : 0;
  motionState.boost = smoothValue(motionState.boost, boostTarget, simulatorState.boostResponse, delta);

  const groanTarget = holdState.groan ? 1 : 0;
  motionState.groan = smoothValue(motionState.groan, groanTarget, 7.4, delta);

  const turnAbs = Math.abs(motionState.turn);
  const speedTarget = clamp01(
    (motionState.throttle * 0.84) +
    simulatorState.cruiseBias +
    (motionState.boost * 0.22) -
    (turnAbs * 0.08)
  );
  motionState.speed = smoothValue(motionState.speed, speedTarget, simulatorState.speedResponse, delta);
  motionState.acceleration = clamp01(Math.abs(motionState.speed - previousSpeed) * 10.5);
  motionState.strain = clamp01((turnAbs * 0.58) + (motionState.speed * 0.28) + (motionState.acceleration * 0.54) + (motionState.boost * 0.24));
  motionState.proximity = clamp01(simulatorState.proximityBias + (turnAbs * 0.12) + (motionState.boost * 0.08));
  motionState.scrape = clamp01(simulatorState.scrapeBias + (motionState.proximity * motionState.speed * 0.34) + (motionState.groan * simulatorState.groanAssist));

  const groanTelemetry = clamp01(
    motionState.groan +
    (turnAbs * 0.52) +
    (motionState.boost * 0.48) +
    (motionState.strain * simulatorState.groanAssist * 0.8)
  );

  updateShipAudio(delta, {
    throttle: motionState.throttle,
    speed: motionState.speed,
    turn: motionState.turn,
    boost: motionState.boost,
    strain: motionState.strain,
    groan: groanTelemetry,
    scrape: motionState.scrape,
    acceleration: motionState.acceleration,
    proximity: motionState.proximity,
  });
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = clamp((now - lastFrameAt) / 1000, 0.001, 0.08);
  lastFrameAt = now;

  stepSimulation(delta);
  updateReadouts();
  drawScope();
}

buildPane();
setupControls();
resizeScope();
updateLoopActionState();
updateAmbientActionState();
animate();

window.addEventListener('resize', resizeScope);

console.log('Engine lab ready at /engine-lab.html');
