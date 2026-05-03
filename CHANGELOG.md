# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-03

### Added
- Pitch scope visualization: time-domain waveform showing pitch deviation history
- Y-axis scale markers (+20/0/-20 cents) on pitch scope
- Pitch cents history tracking in TunerState
- String progress fraction display (e.g., "2/4" instead of percentage bar)
- Full UP/DOWN direction indicators (replaced DN abbreviation)

### Changed
- Frequency smoothing outlier threshold: 5% -> 8% for better noise tolerance
- UI layout optimized for EvenRealities 576×288 screen
- Center panel simplified to show target note, direction, and deviation only
- 1-level instrument select: improved vertical centering

### Fixed
- Text overflow in instrument selection boxes
- Pitch scope overflow on 2-level tuning interface
- Event container initialization for EvenRealities simulator
- Box height variable reference error

## [1.0.0] - 2026-05-03

### Added
- Complete code quality improvements
- Unit test coverage for core algorithms (getNoteDistance, findClosestNote, detectPitchYIN, smoothFrequency)
- ESLint and Prettier configuration
- State management class (TunerState)
- UI layout constants
- Error handling and boundary checks
- updateDisplay throttling (100ms)
- Complete test suite (vitest)

### Changed
- Refactored global variables to modular state management
- Extracted UI layout values to constant configuration
- Optimized smoothFrequency using state class
- Improved event handling logic

### Fixed
- Bridge variable initialization timing
- Array access safety with at() method
- Audio processing error handling
- UI update performance issues

## [0.0.0] - 2026-05-02

### Added
- Initial version
- Four instruments (Guitar, Ukulele, Bass, Violin)
- YIN algorithm pitch detection
- Frequency smoothing
- Visual tuning interface
