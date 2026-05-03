import { describe, it, expect, beforeEach } from 'vitest'
import {
  getNoteDistance,
  findClosestNote,
  addAndSmoothFrequency,
  isHarmonicMatch,
  detectPitchYIN,
  resetTunedStrings,
  setCurrentInstrument,
  getCurrentInstrument,
  setCurrentString,
  getCurrentString,
  getTunedStrings,
  setInInstrumentSelect,
  getInInstrumentSelect,
  getFrequencyHistory,
  getPitchCentsHistory,
  addPitchCents,
  clearPitchCentsHistory,
  TUNING_TOLERANCE,
  SMOOTHING_WINDOW,
  MIN_CONFIDENCE,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  SAMPLE_RATE,
  MIN_SAMPLES,
  PITCH_HISTORY_MAX,
  buildTunerMeter,
  buildPitchScope,
  buildStringProgress,
  getTuningBorderColor,
  getTuningStatusText,
  buildStateIndicator,
  TunerVisualState,
} from './main'

describe('getNoteDistance', () => {
  it('should return 0 for identical frequencies', () => {
    expect(getNoteDistance(440, 440)).toBe(0)
  })

  it('should return 1200 for octave difference', () => {
    expect(getNoteDistance(440, 220)).toBeCloseTo(1200, 0)
    expect(getNoteDistance(220, 440)).toBeCloseTo(-1200, 0)
  })

  it('should return correct cents for perfect fifth', () => {
    const fifth = Math.pow(2, 7 / 12)
    const cents = getNoteDistance(440 * fifth, 440)
    expect(cents).toBeCloseTo(700, 0)
  })
})

describe('findClosestNote', () => {
  const testInstrument = {
    name: 'Guitar',
    notes: [
      { name: 'E', frequency: 82.41, octave: 2 },
      { name: 'A', frequency: 110.0, octave: 2 },
      { name: 'D', frequency: 146.83, octave: 3 },
      { name: 'G', frequency: 196.0, octave: 3 },
    ],
    strings: ['4', '3', '2', '1'],
    description: 'Test',
  }

  it('should find exact match', () => {
    const result = findClosestNote(110.0, testInstrument)
    expect(result).not.toBeNull()
    expect(result!.note.name).toBe('A')
    expect(result!.cents).toBeCloseTo(0, 1)
  })

  it('should find closest note within tolerance', () => {
    const result = findClosestNote(108, testInstrument)
    expect(result).not.toBeNull()
    expect(result!.note.name).toBe('A')
    expect(result!.cents).toBeCloseTo(-31.7, 0)
  })

  it('should return null for empty instrument', () => {
    const emptyInstrument = { ...testInstrument, notes: [] }
    expect(findClosestNote(440, emptyInstrument)).toBeNull()
  })
})

describe('isHarmonicMatch', () => {
  it('should match exact frequency', () => {
    expect(isHarmonicMatch(440, 440)).toBe(true)
  })

  it('should match 2x harmonic', () => {
    expect(isHarmonicMatch(880, 440)).toBe(true)
  })

  it('should match 0.5x harmonic', () => {
    expect(isHarmonicMatch(220, 440)).toBe(true)
  })

  it('should not match far frequency', () => {
    expect(isHarmonicMatch(500, 440)).toBe(false)
  })

  it('should not match negative harmonic', () => {
    expect(isHarmonicMatch(-440, 440)).toBe(false)
  })
})

describe('detectPitchYIN', () => {
  function generateSineWavePCM(frequency: number, sampleRate: number, duration: number): Uint8Array {
    const samples = Math.floor(sampleRate * duration)
    const pcm = new Uint8Array(samples * 2)
    const amplitude = 8000

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate
      const value = Math.sin(2 * Math.PI * frequency * t) * amplitude
      const int16 = Math.max(-32768, Math.min(32767, Math.round(value)))
      const unsigned = int16 < 0 ? int16 + 65536 : int16
      pcm[i * 2] = unsigned & 0xFF
      pcm[i * 2 + 1] = (unsigned >> 8) & 0xFF
    }

    return pcm
  }

  it('should detect frequency of sine wave', () => {
    const testFreq = 440
    const pcm = generateSineWavePCM(testFreq, SAMPLE_RATE, 0.2)
    const result = detectPitchYIN(pcm, SAMPLE_RATE)

    expect(result).not.toBeNull()
    expect(result!.frequency).toBeGreaterThan(testFreq * 0.9)
    expect(result!.frequency).toBeLessThan(testFreq * 1.1)
    expect(result!.confidence).toBeGreaterThan(MIN_CONFIDENCE)
  })

  it('should detect low frequency (E2)', () => {
    const testFreq = 82.41
    const pcm = generateSineWavePCM(testFreq, SAMPLE_RATE, 0.3)
    const result = detectPitchYIN(pcm, SAMPLE_RATE)

    expect(result).not.toBeNull()
    expect(result!.frequency).toBeGreaterThan(testFreq * 0.8)
    expect(result!.frequency).toBeLessThan(testFreq * 1.2)
  })

  it('should return null for invalid PCM data', () => {
    const shortPCM = new Uint8Array(10)
    expect(detectPitchYIN(shortPCM, SAMPLE_RATE)).toBeNull()
  })

  it('should return null for odd-length PCM data', () => {
    const oddPCM = new Uint8Array(2050)
    expect(detectPitchYIN(oddPCM, SAMPLE_RATE)).toBeNull()
  })

  it('should filter out frequencies below MIN_FREQUENCY', () => {
    const pcm = generateSineWavePCM(30, SAMPLE_RATE, 0.3)
    const result = detectPitchYIN(pcm, SAMPLE_RATE)
    if (result) {
      expect(result.frequency).toBeGreaterThanOrEqual(MIN_FREQUENCY)
    }
  })

  it('should filter out frequencies above MAX_FREQUENCY', () => {
    const pcm = generateSineWavePCM(1500, SAMPLE_RATE, 0.2)
    const result = detectPitchYIN(pcm, SAMPLE_RATE)
    if (result) {
      expect(result.frequency).toBeLessThanOrEqual(MAX_FREQUENCY)
    }
  })
})

describe('addAndSmoothFrequency', () => {
  beforeEach(() => {
    resetTunedStrings()
  })

  it('should return first frequency without smoothing', () => {
    const result = addAndSmoothFrequency(440)
    expect(result).toBe(440)
  })

  it('should apply median filtering', () => {
    const frequencies = [440, 445, 441, 444, 442, 600]
    const smoothed = frequencies.map(f => addAndSmoothFrequency(f))
    expect(smoothed[smoothed.length - 1]).toBeLessThan(500)
  })

  it('should not exceed smoothing window size', () => {
    for (let i = 0; i < SMOOTHING_WINDOW + 5; i++) {
      addAndSmoothFrequency(440 + i)
    }
    expect(getFrequencyHistory().length).toBeLessThanOrEqual(SMOOTHING_WINDOW)
  })
})

describe('Tuner State Management', () => {
  beforeEach(() => {
    setCurrentInstrument(0)
    setCurrentString(0)
    resetTunedStrings()
    setInInstrumentSelect(true)
    clearPitchCentsHistory()
  })

  it('should track current instrument', () => {
    expect(getCurrentInstrument()).toBe(0)
    setCurrentInstrument(2)
    expect(getCurrentInstrument()).toBe(2)
  })

  it('should track current string', () => {
    expect(getCurrentString()).toBe(0)
    setCurrentString(3)
    expect(getCurrentString()).toBe(3)
  })

  it('should reset tuned strings', () => {
    const tuned = getTunedStrings()
    tuned[0] = true
    tuned[2] = true
    resetTunedStrings()
    expect(getTunedStrings().every(t => !t)).toBe(true)
  })

  it('should track instrument select mode', () => {
    expect(getInInstrumentSelect()).toBe(true)
    setInInstrumentSelect(false)
    expect(getInInstrumentSelect()).toBe(false)
  })

  it('should track pitch cents history', () => {
    expect(getPitchCentsHistory().length).toBe(0)
    addPitchCents(10)
    addPitchCents(-5)
    expect(getPitchCentsHistory().length).toBe(2)
    expect(getPitchCentsHistory()[0]).toBe(10)
    expect(getPitchCentsHistory()[1]).toBe(-5)
  })

  it('should limit pitch cents history size', () => {
    for (let i = 0; i < PITCH_HISTORY_MAX + 5; i++) {
      addPitchCents(i)
    }
    expect(getPitchCentsHistory().length).toBeLessThanOrEqual(PITCH_HISTORY_MAX)
  })

  it('should clear pitch cents history', () => {
    addPitchCents(10)
    addPitchCents(20)
    clearPitchCentsHistory()
    expect(getPitchCentsHistory().length).toBe(0)
  })

  it('should handle null pitch cents', () => {
    addPitchCents(null)
    addPitchCents(15)
    expect(getPitchCentsHistory()[0]).toBeNull()
    expect(getPitchCentsHistory()[1]).toBe(15)
  })
})

describe('Constants', () => {
  it('should have valid TUNING_TOLERANCE', () => {
    expect(TUNING_TOLERANCE).toBeGreaterThan(0)
    expect(TUNING_TOLERANCE).toBeLessThan(50)
  })

  it('should have valid SMOOTHING_WINDOW', () => {
    expect(SMOOTHING_WINDOW).toBeGreaterThan(0)
    expect(SMOOTHING_WINDOW).toBeLessThan(100)
  })

  it('should have valid MIN_CONFIDENCE', () => {
    expect(MIN_CONFIDENCE).toBeGreaterThan(0)
    expect(MIN_CONFIDENCE).toBeLessThan(1)
  })

  it('should have valid frequency range', () => {
    expect(MIN_FREQUENCY).toBe(40)
    expect(MAX_FREQUENCY).toBe(1200)
    expect(MIN_FREQUENCY).toBeLessThan(MAX_FREQUENCY)
  })

  it('should have valid sample rate', () => {
    expect(SAMPLE_RATE).toBe(16000)
  })

  it('should have valid min samples', () => {
    expect(MIN_SAMPLES).toBe(1024)
  })
})

describe('buildTunerMeter', () => {
  it('should return no_signal state when cents is null', () => {
    const result = buildTunerMeter(null)
    expect(result.state).toBe(TunerVisualState.NO_SIGNAL)
    expect(result.pointerLine).toContain('<')
    expect(result.scaleLine).toContain('0')
  })

  it('should return tuned state when within tolerance', () => {
    const result = buildTunerMeter(0)
    expect(result.state).toBe(TunerVisualState.TUNED)
    expect(result.pointerLine).toContain('*')
  })

  it('should return close state when within 10 cents', () => {
    const result = buildTunerMeter(8)
    expect(result.state).toBe(TunerVisualState.CLOSE)
    expect(result.pointerLine.length).toBe(15)
  })

  it('should return tuning state when more than 10 cents off', () => {
    const result = buildTunerMeter(-25)
    expect(result.state).toBe(TunerVisualState.TUNING)
    expect(result.pointerLine).toContain('>')
  })

  it('should show left arrow for flat notes (positive cents)', () => {
    const result = buildTunerMeter(20)
    expect(result.pointerLine).toContain('<')
  })

  it('should show right arrow for sharp notes (negative cents)', () => {
    const result = buildTunerMeter(-20)
    expect(result.pointerLine).toContain('>')
  })

  it('should clamp to max 50 cents', () => {
    const result = buildTunerMeter(100)
    expect(result.pointerLine).toContain('<')
    expect(result.state).toBe(TunerVisualState.TUNING)
  })

  it('should include scale markers', () => {
    const result = buildTunerMeter(0)
    expect(result.scaleLine).toContain('-50')
    expect(result.scaleLine).toContain('+50')
    expect(result.scaleLine).toContain('0')
  })
})

describe('buildPitchScope', () => {
  it('should show center line when empty history', () => {
    const result = buildPitchScope([])
    expect(result).toContain('-')
  })

  it('should show center line with tuned point', () => {
    const result = buildPitchScope([0])
    expect(result).toContain('*')
  })

  it('should show off-tune point', () => {
    const result = buildPitchScope([15])
    expect(result).toContain('.')
  })

  it('should show different patterns for different cents', () => {
    const tunedResult = buildPitchScope([0, 0, 0])
    const offResult = buildPitchScope([15, 15, 15])
    expect(tunedResult).not.toBe(offResult)
  })

  it('should handle null values in history', () => {
    const result = buildPitchScope([null, 0, null])
    expect(result).toContain('*')
  })

  it('should clamp values beyond ±20 cents', () => {
    const result = buildPitchScope([50])
    expect(result).toContain('.')
  })

  it('should show sliding window of recent history', () => {
    const history = Array(35).fill(10)
    const result = buildPitchScope(history)
    const lines = result.split('\n')
    expect(lines.length).toBe(7)
  })

  it('should show scale markers', () => {
    const result = buildPitchScope([])
    expect(result).toContain('+')
    expect(result).toContain('0')
    expect(result).toContain('-')
  })
})

describe('buildStringProgress', () => {
  const testInstrument = {
    name: 'Guitar',
    notes: [
      { name: 'E', frequency: 82.41, octave: 2 },
      { name: 'A', frequency: 110.0, octave: 2 },
      { name: 'D', frequency: 146.83, octave: 3 },
      { name: 'G', frequency: 196.0, octave: 3 },
    ],
    strings: ['4', '3', '2', '1'],
    description: 'Test',
  }

  it('should mark current string with arrow', () => {
    const result = buildStringProgress(testInstrument, 1, [false, false, false, false])
    expect(result.stringLines).toContain('>')
  })

  it('should mark tuned strings with filled circle', () => {
    const result = buildStringProgress(testInstrument, 0, [true, false, false, false])
    expect(result.stringLines).toContain('●')
    expect(result.stringLines).toContain('○')
  })

  it('should include all strings', () => {
    const result = buildStringProgress(testInstrument, 0, [false, false, false, false])
    expect(result.stringLines).toContain('4')
    expect(result.stringLines).toContain('3')
    expect(result.stringLines).toContain('2')
    expect(result.stringLines).toContain('1')
  })

  it('should include note names', () => {
    const result = buildStringProgress(testInstrument, 0, [false, false, false, false])
    expect(result.stringLines).toContain('E2')
    expect(result.stringLines).toContain('A2')
    expect(result.stringLines).toContain('D3')
    expect(result.stringLines).toContain('G3')
  })

  it('should show fraction progress', () => {
    const result = buildStringProgress(testInstrument, 0, [true, true, false, false])
    expect(result.progressBar).toBe('2/4')
    expect(result.progressPercent).toBe(50)
  })

  it('should show full fraction when all tuned', () => {
    const result = buildStringProgress(testInstrument, 0, [true, true, true, true])
    expect(result.progressBar).toBe('4/4')
    expect(result.progressPercent).toBe(100)
  })
})

describe('getTuningBorderColor', () => {
  it('should return green when tuned', () => {
    expect(getTuningBorderColor(null, true)).toBe(2)
  })

  it('should return gray when no signal', () => {
    expect(getTuningBorderColor(null, false)).toBe(5)
  })

  it('should return purple when wrong string', () => {
    expect(getTuningBorderColor(null, false, true)).toBe(6)
  })

  it('should return green when within tolerance', () => {
    expect(getTuningBorderColor(1, false)).toBe(2)
  })

  it('should return yellow when within 10 cents', () => {
    expect(getTuningBorderColor(8, false)).toBe(3)
  })

  it('should return orange when within 25 cents', () => {
    expect(getTuningBorderColor(20, false)).toBe(7)
  })

  it('should return red when far off', () => {
    expect(getTuningBorderColor(40, false)).toBe(1)
  })
})

describe('getTuningStatusText', () => {
  const targetNote = { name: 'A', frequency: 110.0, octave: 2 }

  it('should show tuned status when isTuned is true', () => {
    const result = getTuningStatusText(null, true, targetNote)
    expect(result.main).toBe('A2')
    expect(result.sub).toBe('OK')
    expect(result.borderColor).toBe(2)
  })

  it('should show wrong string status', () => {
    const result = getTuningStatusText(null, false, targetNote, true, 'E2')
    expect(result.sub).toContain('!')
    expect(result.borderColor).toBe(6)
  })

  it('should show play prompt when no signal', () => {
    const result = getTuningStatusText(null, false, targetNote)
    expect(result.main).toBe('A2')
    expect(result.sub).toBe('Play')
    expect(result.borderColor).toBe(5)
  })

  it('should show OK when within tolerance', () => {
    const result = getTuningStatusText(1, false, targetNote)
    expect(result.sub).toBe('OK')
    expect(result.borderColor).toBe(2)
  })

  it('should show UP for flat notes', () => {
    const result = getTuningStatusText(15, false, targetNote)
    expect(result.sub).toContain('UP')
    expect(result.borderColor).toBe(1)
  })

  it('should show DOWN for sharp notes', () => {
    const result = getTuningStatusText(-15, false, targetNote)
    expect(result.sub).toContain('DOWN')
  })

  it('should include cents value', () => {
    const result = getTuningStatusText(15, false, targetNote)
    expect(result.sub).toContain('15')
  })
})

describe('buildStateIndicator', () => {
  it('should show Play for no_signal', () => {
    const result = buildStateIndicator(TunerVisualState.NO_SIGNAL, null)
    expect(result).toBe('Play')
  })

  it('should show OK for tuned state', () => {
    const result = buildStateIndicator(TunerVisualState.TUNED, 0)
    expect(result).toBe('OK')
  })

  it('should show Near for close state', () => {
    const result = buildStateIndicator(TunerVisualState.CLOSE, 5)
    expect(result).toBe('Near')
  })

  it('should show UP for flat tuning state', () => {
    const result = buildStateIndicator(TunerVisualState.TUNING, 20)
    expect(result).toBe('UP')
  })

  it('should show DOWN for sharp tuning state', () => {
    const result = buildStateIndicator(TunerVisualState.TUNING, -20)
    expect(result).toBe('DOWN')
  })

  it('should show ! for wrong_string state', () => {
    const result = buildStateIndicator(TunerVisualState.WRONG_STRING, null)
    expect(result).toBe('!')
  })
})
