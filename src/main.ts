import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

interface Note {
  name: string
  frequency: number
  octave: number
}

interface Instrument {
  name: string
  notes: Note[]
  strings: string[]
  description: string
}

const instruments: Instrument[] = [
  {
    name: 'Guitar',
    description: 'EADGBE',
    notes: [
      { name: 'E', frequency: 82.41, octave: 2 },
      { name: 'A', frequency: 110.0, octave: 2 },
      { name: 'D', frequency: 146.83, octave: 3 },
      { name: 'G', frequency: 196.0, octave: 3 },
      { name: 'B', frequency: 246.94, octave: 3 },
      { name: 'E', frequency: 329.63, octave: 4 },
    ],
    strings: ['6', '5', '4', '3', '2', '1'],
  },
  {
    name: 'Ukulele',
    description: 'GCEA',
    notes: [
      { name: 'G', frequency: 392.0, octave: 4 },
      { name: 'C', frequency: 261.63, octave: 4 },
      { name: 'E', frequency: 329.63, octave: 4 },
      { name: 'A', frequency: 440.0, octave: 4 },
    ],
    strings: ['4', '3', '2', '1'],
  },
  {
    name: 'Bass',
    description: 'EADG',
    notes: [
      { name: 'E', frequency: 41.2, octave: 1 },
      { name: 'A', frequency: 55.0, octave: 1 },
      { name: 'D', frequency: 73.42, octave: 2 },
      { name: 'G', frequency: 98.0, octave: 2 },
    ],
    strings: ['4', '3', '2', '1'],
  },
  {
    name: 'Violin',
    description: 'GDAE',
    notes: [
      { name: 'G', frequency: 196.0, octave: 3 },
      { name: 'D', frequency: 293.66, octave: 3 },
      { name: 'A', frequency: 440.0, octave: 4 },
      { name: 'E', frequency: 659.25, octave: 5 },
    ],
    strings: ['4', '3', '2', '1'],
  },
]

const TUNING_TOLERANCE = 2
const SMOOTHING_WINDOW = 10
const MIN_CONFIDENCE = 0.3
const UPDATE_THROTTLE_MS = 80
const MIN_FREQUENCY = 40
const MAX_FREQUENCY = 1200
const YIN_THRESHOLD = 0.1
const SAMPLE_RATE = 16000
const MIN_SAMPLES = 1024
const HARMONIC_TOLERANCE_CENTS = 50
const PITCH_HISTORY_MAX = 30

const L = {
  W: 576,
  H: 288,
}

const C = {
  NONE: 0,
  RED: 1,
  GREEN: 2,
  YELLOW: 3,
  BLUE: 4,
  GRAY: 5,
  PURPLE: 6,
  ORANGE: 7,
  CYAN: 8,
  PINK: 9,
  WHITE: 10,
}

type TunerVisualState = 'no_signal' | 'detecting' | 'tuning' | 'close' | 'tuned' | 'wrong_string'
const TunerVisualState = {
  NO_SIGNAL: 'no_signal' as TunerVisualState,
  DETECTING: 'detecting' as TunerVisualState,
  TUNING: 'tuning' as TunerVisualState,
  CLOSE: 'close' as TunerVisualState,
  TUNED: 'tuned' as TunerVisualState,
  WRONG_STRING: 'wrong_string' as TunerVisualState,
}

class TunerState {
  private currentInstrument = 0
  private currentString = 0
  private tunedStrings: boolean[] = []
  private frequencyHistory: number[] = []
  private pitchCentsHistory: (number | null)[] = []
  private inInstrumentSelect = true

  constructor() {
    this.resetTunedStrings()
  }

  getCurrentInstrument() { return this.currentInstrument }
  setCurrentInstrument(i: number) {
    const c = instruments.length
    this.currentInstrument = ((i % c) + c) % c
  }

  getCurrentString() { return this.currentString }
  setCurrentString(i: number) {
    const c = instruments[this.currentInstrument].notes.length
    this.currentString = ((i % c) + c) % c
  }

  getTunedStrings() { return [...this.tunedStrings] }
  setTunedString(i: number, t: boolean) {
    if (i >= 0 && i < this.tunedStrings.length) this.tunedStrings[i] = t
  }
  areAllStringsTuned() { return this.tunedStrings.every(t => t) }

  getFrequencyHistory() { return [...this.frequencyHistory] }
  addFrequency(f: number) {
    this.frequencyHistory.push(f)
    if (this.frequencyHistory.length > SMOOTHING_WINDOW) this.frequencyHistory.shift()
  }
  clearFrequencyHistory() { this.frequencyHistory.length = 0 }

  getPitchCentsHistory() { return [...this.pitchCentsHistory] }
  addPitchCents(cents: number | null) {
    this.pitchCentsHistory.push(cents)
    if (this.pitchCentsHistory.length > PITCH_HISTORY_MAX) this.pitchCentsHistory.shift()
  }
  clearPitchCentsHistory() { this.pitchCentsHistory.length = 0 }

  isInInstrumentSelect() { return this.inInstrumentSelect }
  setInInstrumentSelect(v: boolean) { this.inInstrumentSelect = v }

  resetTunedStrings() {
    const c = instruments[this.currentInstrument].notes.length
    this.tunedStrings = Array(c).fill(false)
    this.frequencyHistory.length = 0
    this.pitchCentsHistory.length = 0
  }

  getInstrument() { return instruments[this.currentInstrument] }
  getTargetNote() { return instruments[this.currentInstrument].notes[this.currentString] }
  findNextUntunedString(startFrom: number): number {
    const count = instruments[this.currentInstrument].notes.length
    for (let i = startFrom; i < count; i++) {
      if (!this.tunedStrings[i]) return i
    }
    for (let i = 0; i < startFrom; i++) {
      if (!this.tunedStrings[i]) return i
    }
    return 0
  }
}

const state = new TunerState()
let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>> | null = null
let lastUpdateTime = 0
let audioUnsubscribe: (() => void) | null = null
let lastAudioProcessTime = 0

function getNoteDistance(f1: number, f2: number): number {
  return 1200 * Math.log2(f1 / f2)
}

function findClosestNote(frequency: number, instrument: Instrument): { note: Note; index: number; cents: number } | null {
  if (instrument.notes.length === 0) return null
  let closestIndex = 0
  let minCents = Math.abs(getNoteDistance(frequency, instrument.notes[0].frequency))
  for (let i = 1; i < instrument.notes.length; i++) {
    const cents = Math.abs(getNoteDistance(frequency, instrument.notes[i].frequency))
    if (cents < minCents) { minCents = cents; closestIndex = i }
  }
  return {
    note: instrument.notes[closestIndex],
    index: closestIndex,
    cents: getNoteDistance(frequency, instrument.notes[closestIndex].frequency),
  }
}

function isHarmonicMatch(detectedFreq: number, targetFreq: number): boolean {
  const ratio = detectedFreq / targetFreq

  if (ratio < 0.75) {
    const subHarmonicFreq = targetFreq * 0.5
    const cents = Math.abs(getNoteDistance(detectedFreq, subHarmonicFreq))
    return cents <= HARMONIC_TOLERANCE_CENTS
  }

  const nearestHarmonic = Math.round(ratio)

  if (nearestHarmonic === 1) {
    const cents = Math.abs(getNoteDistance(detectedFreq, targetFreq))
    return cents <= HARMONIC_TOLERANCE_CENTS
  }

  const harmonicFreq = targetFreq * nearestHarmonic
  const cents = Math.abs(getNoteDistance(detectedFreq, harmonicFreq))
  return cents <= HARMONIC_TOLERANCE_CENTS
}

function detectPitchYIN(pcmData: Uint8Array, sampleRate: number = SAMPLE_RATE): { frequency: number; confidence: number } | null {
  try {
    if (pcmData.length < MIN_SAMPLES * 2 || pcmData.length % 2 !== 0) {
      console.warn('YIN: invalid PCM data length:', pcmData.length)
      return null
    }

    const samples: number[] = []
    for (let i = 0; i < pcmData.length; i += 2) {
      const s = (pcmData[i + 1] << 8) | pcmData[i]
      samples.push(s > 32767 ? s - 65536 : s)
    }
    const n = samples.length

    const maxPeriod = Math.floor(sampleRate / MIN_FREQUENCY)
    const minPeriod = Math.floor(sampleRate / MAX_FREQUENCY)

    const diff = new Float64Array(maxPeriod)
    for (let tau = 0; tau < maxPeriod; tau++) {
      let sum = 0
      const limit = n - tau
      for (let i = 0; i < limit; i++) {
        const d = samples[i] - samples[i + tau]
        sum += d * d
      }
      diff[tau] = sum
    }

    const cmnd = new Float64Array(maxPeriod)
    cmnd[0] = 1
    let runningSum = 0
    for (let tau = 1; tau < maxPeriod; tau++) {
      runningSum += diff[tau]
      cmnd[tau] = diff[tau] / (runningSum / tau)
    }

    let minTau = -1
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (cmnd[tau] < YIN_THRESHOLD) {
        if (tau + 1 < maxPeriod && cmnd[tau] < cmnd[tau + 1]) {
          minTau = tau
          break
        }
      }
    }

    if (minTau < 0) {
      let minVal = Infinity
      for (let tau = minPeriod; tau < maxPeriod; tau++) {
        if (cmnd[tau] < minVal) {
          minVal = cmnd[tau]
          minTau = tau
        }
      }
    }

    if (minTau <= 0) return null

    let betterTau = minTau
    if (minTau > 0 && minTau + 1 < maxPeriod) {
      const alpha = cmnd[minTau - 1]
      const beta = cmnd[minTau]
      const gamma = cmnd[minTau + 1]
      const denom = alpha - 2 * beta + gamma
      if (Math.abs(denom) > 1e-10) {
        const p = 0.5 * (alpha - gamma) / denom
        if (!isNaN(p) && isFinite(p) && Math.abs(p) < 1) {
          betterTau = minTau + p
        }
      }
    }

    const frequency = sampleRate / betterTau
    const confidence = 1 - cmnd[minTau]

    if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) return null

    return { frequency, confidence }
  } catch (e) { console.error('YIN error:', e); return null }
}

function addAndSmoothFrequency(newFreq: number): number {
  state.addFrequency(newFreq)
  const history = state.getFrequencyHistory()
  if (history.length === 0) return newFreq
  const sorted = [...history].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const filtered = history.filter(f => Math.abs(f - median) / median < 0.08)
  if (filtered.length === 0) return median
  return filtered.reduce((a, b) => a + b, 0) / filtered.length
}

function buildPitchScope(centsHistory: (number | null)[]): string {
  const plotWidth = 16
  const height = 7
  const maxCents = 20
  const centerRow = Math.floor(height / 2)
  const labelWidth = 2
  const width = labelWidth + plotWidth

  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '))

  for (let col = labelWidth; col < width; col++) {
    grid[centerRow][col] = '-'
  }

  const startIdx = Math.max(0, centsHistory.length - plotWidth)
  const visibleHistory = centsHistory.slice(startIdx)

  for (let i = 0; i < visibleHistory.length; i++) {
    const col = labelWidth + (plotWidth - visibleHistory.length) + i
    const cents = visibleHistory[i]

    if (cents === null) continue

    const clamped = Math.max(-maxCents, Math.min(maxCents, cents))
    const rowOffset = Math.round((clamped / maxCents) * centerRow)
    const row = centerRow - rowOffset

    const isTuned = Math.abs(cents) <= TUNING_TOLERANCE
    const char = isTuned ? '*' : '.'

    if (row >= 0 && row < height) {
      grid[row][col] = char
    }
  }

  grid[0][0] = '+'
  grid[centerRow][0] = '0'
  grid[height - 1][0] = '-'

  const lines: string[] = []
  for (let row = 0; row < height; row++) {
    let line = ''
    for (let col = 0; col < width; col++) {
      line += grid[row][col]
    }
    lines.push(line)
  }

  return lines.join('\n')
}

function buildTunerMeter(cents: number | null): { pointerLine: string; scaleLine: string; state: TunerVisualState } {
  const maxCents = 50
  const meterWidth = 15
  const centerPos = Math.floor(meterWidth / 2)

  if (cents === null) {
    const pointerLine = '<·········>'
    const scaleLine = '-50 0 +50'
    return { pointerLine, scaleLine, state: TunerVisualState.NO_SIGNAL }
  }

  const absCents = Math.abs(cents)
  let visualState: TunerVisualState
  if (absCents <= TUNING_TOLERANCE) {
    visualState = TunerVisualState.TUNED
  } else if (absCents <= 10) {
    visualState = TunerVisualState.CLOSE
  } else {
    visualState = TunerVisualState.TUNING
  }

  const clamped = Math.max(-maxCents, Math.min(maxCents, cents))
  const offset = Math.round((clamped / maxCents) * centerPos)
  const arrowPos = centerPos + offset

  let pointerLine = ''
  for (let i = 0; i < meterWidth; i++) {
    if (i === arrowPos) {
      if (absCents <= TUNING_TOLERANCE) {
        pointerLine += '*'
      } else if (cents > 0) {
        pointerLine += '<'
      } else {
        pointerLine += '>'
      }
    } else if (i === centerPos) {
      pointerLine += '|'
    } else if (i === 0) {
      pointerLine += '<'
    } else if (i === meterWidth - 1) {
      pointerLine += '>'
    } else {
      pointerLine += '.'
    }
  }

  const scaleLine = '-50 0 +50'

  return { pointerLine, scaleLine, state: visualState }
}

function buildStringProgress(
  instrument: Instrument,
  currentString: number,
  tunedStrings: boolean[],
): { stringLines: string; progressBar: string; progressPercent: number } {
  const lines: string[] = []

  for (let i = 0; i < instrument.strings.length; i++) {
    const isCurrent = i === currentString
    const isTuned = tunedStrings[i]
    const note = instrument.notes[i]

    const prefix = isCurrent ? '>' : ' '
    const statusIcon = isTuned ? '●' : '○'
    const stringNum = instrument.strings[i]
    const noteName = `${note.name}${note.octave}`

    const line = `${prefix}${statusIcon}${stringNum}${noteName}`
    lines.push(line)
  }

  const tunedCount = tunedStrings.filter(t => t).length
  const total = instrument.strings.length

  return {
    stringLines: lines.join('\n'),
    progressBar: `${tunedCount}/${total}`,
    progressPercent: Math.round((tunedCount / total) * 100),
  }
}

function getTuningBorderColor(cents: number | null, isTuned: boolean, isWrongString: boolean = false): number {
  if (isTuned) return C.GREEN
  if (cents === null) return isWrongString ? C.PURPLE : C.GRAY
  const absCents = Math.abs(cents)
  if (absCents <= TUNING_TOLERANCE) return C.GREEN
  if (absCents <= 10) return C.YELLOW
  if (absCents <= 25) return C.ORANGE
  return C.RED
}

function getTuningStatusText(
  cents: number | null,
  isTuned: boolean,
  targetNote: Note,
  isWrongString: boolean = false,
  wrongStringName: string = '',
): { main: string; sub: string; borderColor: number } {
  if (isTuned) {
    return {
      main: `${targetNote.name}${targetNote.octave}`,
      sub: 'OK',
      borderColor: C.GREEN,
    }
  }

  if (isWrongString) {
    return {
      main: `${targetNote.name}${targetNote.octave}`,
      sub: `!${wrongStringName}`,
      borderColor: C.PURPLE,
    }
  }

  if (cents === null) {
    return {
      main: `${targetNote.name}${targetNote.octave}`,
      sub: 'Play',
      borderColor: C.GRAY,
    }
  }

  const absCents = Math.abs(cents)
  if (absCents <= TUNING_TOLERANCE) {
    return {
      main: `${targetNote.name}${targetNote.octave}`,
      sub: 'OK',
      borderColor: C.GREEN,
    }
  }

  const direction = cents > 0 ? 'UP' : 'DOWN'
  const centsText = `${Math.abs(cents).toFixed(0)}c`

  if (absCents <= 10) {
    return {
      main: `${targetNote.name}${targetNote.octave}`,
      sub: `${direction} ${centsText}`,
      borderColor: C.YELLOW,
    }
  }

  return {
    main: `${targetNote.name}${targetNote.octave}`,
    sub: `${direction} ${centsText}`,
    borderColor: C.RED,
  }
}

function buildStateIndicator(state: TunerVisualState, cents: number | null): string {
  switch (state) {
    case TunerVisualState.NO_SIGNAL:
      return 'Play'
    case TunerVisualState.DETECTING:
      return '...'
    case TunerVisualState.TUNED:
      return 'OK'
    case TunerVisualState.CLOSE:
      return 'Near'
    case TunerVisualState.WRONG_STRING:
      return '!'
    case TunerVisualState.TUNING:
      if (cents !== null) {
        return cents > 0 ? 'UP' : 'DOWN'
      }
      return '...'
    default:
      return ''
  }
}

function buildInstrumentSelectPage(): TextContainerProperty[] {
  const idx = state.getCurrentInstrument()
  const total = instruments.length
  const prev = instruments[((idx - 1) + total) % total]
  const curr = instruments[idx]
  const next = instruments[(idx + 1) % total]

  const boxHeight = 216
  const boxPadding = 2

  function centerContent(name: string, desc: string, strings: string): string {
    const lines = [
      '',
      name,
      desc,
      strings,
      '',
    ]
    return lines.join('\n')
  }

  return [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: L.W, height: L.H,
      borderWidth: 0, borderColor: 0, paddingLength: 0,
      containerID: 1, containerName: 'evt', content: '.', isEventCapture: 1,
    }),
    new TextContainerProperty({
      xPosition: 188, yPosition: 2, width: 300, height: 30,
      borderWidth: 0, borderColor: 0, paddingLength: 0,
      containerID: 2, containerName: 'title', content: 'Select Instrument', isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 16, yPosition: 36, width: 176, height: boxHeight,
      borderWidth: 1, borderColor: 5, paddingLength: boxPadding,
      containerID: 3, containerName: 'left',
      content: centerContent(prev.name, prev.description, prev.strings.join(' ')), isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 200, yPosition: 32, width: 176, height: boxHeight + 8,
      borderWidth: 2, borderColor: 10, paddingLength: boxPadding + 1,
      containerID: 4, containerName: 'center',
      content: centerContent(curr.name, curr.description, curr.strings.join(' ')), isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 392, yPosition: 36, width: 176, height: boxHeight,
      borderWidth: 1, borderColor: 5, paddingLength: boxPadding,
      containerID: 5, containerName: 'right',
      content: centerContent(next.name, next.description, next.strings.join(' ')), isEventCapture: 0,
    }),
    new TextContainerProperty({
      xPosition: 8, yPosition: 258, width: 560, height: 28,
      borderWidth: 0, borderColor: 0, paddingLength: 0,
      containerID: 6, containerName: 'hint',
      content: 'up:prev down:next click:select dbl:back', isEventCapture: 0,
    }),
  ]
}

function buildTunerPage(): TextContainerProperty[] {
  const instrument = state.getInstrument()
  const currentString = state.getCurrentString()
  const tunedStrings = state.getTunedStrings()
  const targetNote = state.getTargetNote()
  const allTuned = state.areAllStringsTuned()

  if (allTuned) {
    const allTunedContent = [
      'ALL TUNED',
      '',
      instrument.strings.map((_s, i) => tunedStrings[i] ? '*' : 'o').join(' '),
      '',
      instrument.notes.map(n => `${n.name}${n.octave}`).join(' '),
    ].join('\n')

    return [
      new TextContainerProperty({
        xPosition: 0, yPosition: 0, width: L.W, height: L.H,
        borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
        containerID: 1, containerName: 'evt', content: '.', isEventCapture: 1,
      }),
      new TextContainerProperty({
        xPosition: 138, yPosition: 2, width: 300, height: 30,
        borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
        containerID: 2, containerName: 'title',
        content: `${instrument.name} Done`, isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: 88, yPosition: 44, width: 400, height: 160,
        borderWidth: 3, borderColor: C.GREEN, paddingLength: 3,
        containerID: 3, containerName: 'all_tuned',
        content: allTunedContent, isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: 8, yPosition: 258, width: 560, height: 28,
        borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
        containerID: 4, containerName: 'hint',
        content: 'up:back down:restart click:restart dbl:back', isEventCapture: 0,
      }),
    ]
  }

  const history = state.getFrequencyHistory()
  let currentCents: number | null = null
  let detectedString: number | null = null

  if (history.length > 0) {
    const currentFreq = history.at(-1)!
    const result = findClosestNote(currentFreq, instrument)
    if (result) {
      currentCents = result.cents
      detectedString = result.index
    }
  }

  const isDetectingTarget = detectedString === currentString
  const isTuned = tunedStrings[currentString]
  const isWrongString = detectedString !== null && detectedString !== currentString

  let displayCents: number | null = null
  let wrongStringName = ''

  if (isDetectingTarget) {
    displayCents = currentCents
  } else if (isWrongString && detectedString !== null) {
    wrongStringName = `${instrument.notes[detectedString].name}${instrument.notes[detectedString].octave}`
  }

  state.addPitchCents(displayCents)

  const statusInfo = getTuningStatusText(displayCents, isTuned, targetNote, isWrongString, wrongStringName)
  const stringProgress = buildStringProgress(instrument, currentString, tunedStrings)

  const mainBorderColor = getTuningBorderColor(displayCents, isTuned, isWrongString)

  const pitchScope = buildPitchScope(state.getPitchCentsHistory())

  const centerContent = [
    `${targetNote.name}${targetNote.octave}`,
    '',
    statusInfo.sub,
    '',
    displayCents !== null ? `${displayCents > 0 ? '+' : ''}${displayCents.toFixed(0)}c` : '--',
  ].join('\n')

  return [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: L.W, height: L.H,
      borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
      containerID: 1, containerName: 'evt', content: '.', isEventCapture: 1,
    }),

    new TextContainerProperty({
      xPosition: 138, yPosition: 2, width: 300, height: 30,
      borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
      containerID: 2, containerName: 'title',
      content: `${instrument.name} ${targetNote.name}${targetNote.octave}`, isEventCapture: 0,
    }),

    new TextContainerProperty({
      xPosition: 8, yPosition: 36, width: 176, height: 216,
      borderWidth: 1, borderColor: C.GRAY, paddingLength: 2,
      containerID: 3, containerName: 'strings',
      content: `${stringProgress.stringLines}\n${stringProgress.progressBar}`, isEventCapture: 0,
    }),

    new TextContainerProperty({
      xPosition: 196, yPosition: 36, width: 176, height: 216,
      borderWidth: 1, borderColor: mainBorderColor, paddingLength: 2,
      containerID: 4, containerName: 'center',
      content: centerContent, isEventCapture: 0,
    }),

    new TextContainerProperty({
      xPosition: 384, yPosition: 36, width: 184, height: 216,
      borderWidth: 1, borderColor: mainBorderColor, paddingLength: 2,
      containerID: 5, containerName: 'scope',
      content: pitchScope, isEventCapture: 0,
    }),

    new TextContainerProperty({
      xPosition: 8, yPosition: 258, width: 560, height: 28,
      borderWidth: 0, borderColor: C.NONE, paddingLength: 0,
      containerID: 6, containerName: 'hint',
      content: 'up:prev down:next click:next dbl:back', isEventCapture: 0,
    }),
  ]
}

async function updateDisplay(force = false) {
  if (!bridge) return
  const now = Date.now()
  if (!force && now - lastUpdateTime < UPDATE_THROTTLE_MS) {
    setTimeout(() => updateDisplay(true), UPDATE_THROTTLE_MS - (now - lastUpdateTime))
    return
  }
  lastUpdateTime = now
  try {
    const textObjects = state.isInInstrumentSelect() ? buildInstrumentSelectPage() : buildTunerPage()
    await bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: textObjects.length, textObject: textObjects }))
  } catch (error) {
    console.error('Display update failed:', error)
  }
}

function handleInstrumentSelectEvent(eventType: number) {
  const idx = state.getCurrentInstrument()

  switch (eventType) {
    case OsEventTypeList.SCROLL_TOP_EVENT:
      state.setCurrentInstrument(idx - 1)
      void updateDisplay(true)
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      state.setCurrentInstrument(idx + 1)
      void updateDisplay(true)
      break
    case OsEventTypeList.CLICK_EVENT:
      state.resetTunedStrings()
      state.setCurrentString(0)
      state.setInInstrumentSelect(false)
      void updateDisplay(true)
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      void bridge?.shutDownPageContainer(0)
      break
  }
}

function handleTunerPageEvent(eventType: number) {
  const allTuned = state.areAllStringsTuned()
  const currentString = state.getCurrentString()

  if (allTuned) {
    switch (eventType) {
      case OsEventTypeList.SCROLL_TOP_EVENT:
        state.setInInstrumentSelect(true)
        state.resetTunedStrings()
        state.setCurrentString(0)
        void updateDisplay(true)
        break
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      case OsEventTypeList.CLICK_EVENT:
        state.resetTunedStrings()
        state.setCurrentString(0)
        void updateDisplay(true)
        break
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        state.setInInstrumentSelect(true)
        state.resetTunedStrings()
        state.setCurrentString(0)
        void updateDisplay(true)
        break
    }
    return
  }

  switch (eventType) {
    case OsEventTypeList.SCROLL_TOP_EVENT:
      state.setCurrentString(currentString - 1)
      state.clearFrequencyHistory()
      state.clearPitchCentsHistory()
      void updateDisplay(true)
      break
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      state.setCurrentString(currentString + 1)
      state.clearFrequencyHistory()
      state.clearPitchCentsHistory()
      void updateDisplay(true)
      break
    case OsEventTypeList.CLICK_EVENT: {
      const next = state.findNextUntunedString(currentString + 1)
      state.setCurrentString(next)
      state.clearFrequencyHistory()
      state.clearPitchCentsHistory()
      void updateDisplay(true)
      break
    }
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      state.setInInstrumentSelect(true)
      state.resetTunedStrings()
      state.setCurrentString(0)
      void updateDisplay(true)
      break
  }
}

async function main() {
  try {
    bridge = await waitForEvenAppBridge()
    state.resetTunedStrings()

    const initialTextObjects = buildInstrumentSelectPage()
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: initialTextObjects.length, textObject: initialTextObjects }),
    )
    if (result !== 0) { console.error('Failed to create page:', result); return }

    await bridge.audioControl(true)

    audioUnsubscribe = bridge.onEvenHubEvent(event => {
      try {
        if (event.sysEvent) {
          const eventType = event.sysEvent.eventType ?? 0
          if (state.isInInstrumentSelect()) {
            handleInstrumentSelectEvent(eventType)
          } else {
            handleTunerPageEvent(eventType)
          }
        }

        if (event.textEvent) {
          const eventType = event.textEvent.eventType ?? 0
          if (state.isInInstrumentSelect()) {
            handleInstrumentSelectEvent(eventType)
          } else {
            handleTunerPageEvent(eventType)
          }
        }

        if (event.audioEvent && !state.isInInstrumentSelect()) {
          const now = Date.now()
          if (now - lastAudioProcessTime < 30) return
          lastAudioProcessTime = now

          try {
            const pcm = event.audioEvent.audioPcm
            const detection = detectPitchYIN(pcm, SAMPLE_RATE)
            if (detection) {
              console.warn('YIN detected freq:', detection.frequency.toFixed(1), 'Hz, confidence:', detection.confidence.toFixed(3))
              if (detection.confidence > MIN_CONFIDENCE) {
                const smoothedFreq = addAndSmoothFrequency(detection.frequency)
                const instrument = state.getInstrument()
                const targetNote = state.getTargetNote()
                const result = findClosestNote(smoothedFreq, instrument)
                console.warn('Target:', targetNote.name + targetNote.octave, 'Detected:', result?.note.name + result?.note.octave, 'cents:', result?.cents.toFixed(1))

                if (result) {
                  const isTargetExact = result.note.name === targetNote.name && result.note.octave === targetNote.octave
                  const isTargetHarmonic = isHarmonicMatch(smoothedFreq, targetNote.frequency)

                  if (isTargetExact || isTargetHarmonic) {
                    if (Math.abs(result.cents) <= TUNING_TOLERANCE) {
                      state.setTunedString(state.getCurrentString(), true)
                    }
                  }
                }
                void updateDisplay()
              }
            }
          } catch (error) { console.error('Audio error:', error) }
        }
      } catch (error) { console.error('Event error:', error) }
    })

    window.addEventListener('beforeunload', () => {
      try {
        void bridge?.audioControl(false)
        if (audioUnsubscribe) audioUnsubscribe()
      } catch { /* cleanup */ }
    })
  } catch (error) {
    console.error('Init failed:', error)
  }
}

main()

export {
  getNoteDistance, findClosestNote, detectPitchYIN, addAndSmoothFrequency,
  isHarmonicMatch,
  TUNING_TOLERANCE, SMOOTHING_WINDOW, MIN_CONFIDENCE,
  MIN_FREQUENCY, MAX_FREQUENCY, YIN_THRESHOLD, SAMPLE_RATE, MIN_SAMPLES,
  PITCH_HISTORY_MAX,
  state,
  instruments as getInstruments,
  buildTunerMeter, buildPitchScope, buildStringProgress,
  getTuningBorderColor, getTuningStatusText,
  buildStateIndicator,
  TunerVisualState,
}
export function resetTunedStrings() { state.resetTunedStrings() }
export function setCurrentInstrument(i: number) { state.setCurrentInstrument(i) }
export function getCurrentInstrument() { return state.getCurrentInstrument() }
export function setCurrentString(i: number) { state.setCurrentString(i) }
export function getCurrentString() { return state.getCurrentString() }
export function getTunedStrings() { return state.getTunedStrings() }
export function setInInstrumentSelect(v: boolean) { state.setInInstrumentSelect(v) }
export function getInInstrumentSelect() { return state.isInInstrumentSelect() }
export function getFrequencyHistory() { return state.getFrequencyHistory() }
export function getPitchCentsHistory() { return state.getPitchCentsHistory() }
export function addPitchCents(cents: number | null) { state.addPitchCents(cents) }
export function clearPitchCentsHistory() { state.clearPitchCentsHistory() }
