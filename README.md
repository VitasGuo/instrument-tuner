# Instrument Tuner

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/yourusername/instrument-tuner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-76%20passing-brightgreen.svg)]()

A chromatic instrument tuner application designed for **EvenRealities smart glasses** (576×288 screen). Supports Guitar, Ukulele, Bass, and Violin with real-time pitch detection and visualization.

## Features

- **4 Instruments**: Guitar, Ukulele, Bass, Violin
- **YIN Algorithm**: Real-time pitch detection (40-1200Hz)
- **Harmonic Matching**: Automatic string identification via overtone analysis
- **Pitch Scope Visualization**: Time-domain waveform showing pitch deviation history
- **Frequency Smoothing**: Median filtering with outlier rejection for stable readings
- **Per-string Tuning**: Track progress individually

## Screenshots

### Instrument Selection
Select your instrument from the carousel interface.

### Tuning Interface
- **Left Panel**: String progress (e.g., `2/4`) and tuning status
- **Center Panel**: Target note, tuning direction (UP/DOWN), and deviation in cents
- **Right Panel**: Real-time pitch scope with ±20 cents range

## Tech Stack

- TypeScript 5.8
- Vite 8.0
- Vitest 3.2 (76 tests)
- EvenRealities SDK 0.0.10
- ESLint + Prettier

## Installation

```bash
npm install
```

## Development

```bash
# Start dev server with simulator
npm run dev

# Run tests
npm run test:run

# Build for production
npm run build

# Lint
npm run lint

# Format
npm run format
```

## Usage

1. **Select Instrument**: Use up/down to browse, click to select
2. **Select String**: Scroll to choose which string to tune
3. **Play Note**: Pluck the string - the app detects pitch automatically
4. **Follow Direction**: Adjust tuning peg based on UP/DOWN indicator
5. **Green = Tuned**: When the note turns green, move to next string

## Architecture

```
src/
  main.ts          # Core application logic
  main.test.ts     # Unit tests (76 tests)
```

### Key Components

| Function | Purpose |
|----------|---------|
| `detectPitchYIN` | YIN algorithm for fundamental frequency detection |
| `findClosestNote` | Match detected frequency to instrument strings |
| `isHarmonicMatch` | Identify strings via overtone/harmonic relationships |
| `addAndSmoothFrequency` | Median filter with 8% outlier rejection |
| `buildPitchScope` | Time-domain pitch deviation visualization |
| `TunerState` | Centralized state management |

## Algorithm Details

### YIN Pitch Detection
- CMND (Cumulative Mean Normalized Difference) for periodicity estimation
- Parabolic interpolation for sub-sample accuracy
- Frequency range: 40-1200Hz
- Sample rate: 16kHz

### Frequency Smoothing
- Sliding window median filter (5 samples)
- Outlier rejection threshold: 8% deviation from median
- Averaging of filtered samples for output

### Harmonic Matching
- Detects octave relationships (2x, 0.5x)
- 50 cent tolerance for harmonic identification
- Helps identify which string is being played

## Supported Instruments

| Instrument | Tuning | Strings |
|-----------|--------|---------|
| Guitar | EADGBE | 6 |
| Ukulele | GCEA | 4 |
| Bass | EADG | 4 |
| Violin | GDAE | 4 |

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT License - see [LICENSE](LICENSE)

## Acknowledgments

- YIN algorithm based on [de Cheveigné & Kawahara (2002)](https://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf)
- Built for EvenRealities G1 smart glasses
