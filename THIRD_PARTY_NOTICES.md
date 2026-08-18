# Third-party notices

This document separates open-source software license notices from acknowledgements
for setup data, research documents, external tools, services, and compatibility
formats. Acknowledging a reference source does not imply that its contents are
openly licensed or that TetrisPC received rights beyond those granted by the
source's stated terms.

## Open-source software and development tools

### LZ-String

- Project: [LZ-String](https://github.com/pieroxy/lz-string)
- Author: Pieroxy
- Use in TetrisPC: `src/replay/jstrisLocal/lzString.ts` is a TypeScript
  adaptation of the URI-safe LZ-String decompression algorithm.
- License: MIT License
- Copyright notice: Copyright (c) 2013 pieroxy

### tetris-fumen

- Project: [tetris-fumen](https://github.com/knewjade/tetris-fumen)
- Author and maintainer: knewjade
- Use in TetrisPC: runtime Fumen encoding and decoding dependency.
- License: MIT License
- Upstream copyright notice: Copyright (c) 2019

### solution-finder (SFinder)

- Project: [solution-finder](https://github.com/knewjade/solution-finder)
- Author and maintainer: knewjade
- Use in TetrisPC: offline setup analysis and verification tool; it is not
  included in the browser runtime.
- License: MIT License
- Copyright notice: Copyright (c) 2020 knewjade
- The upstream project also identifies Apache Commons CLI as software distributed
  under the Apache License 2.0. See the upstream repository for that dependency's
  notices.

### sfinder-strict-minimal

- Project: [sfinder-strict-minimal](https://github.com/eight04/sfinder-strict-minimal)
- Author: eight04
- Use in TetrisPC: the browser SFinder integration under
  `src/solver/sfinderPort` includes an ESM adaptation of its graph/minimal-set
  logic.
- License: MIT License
- Upstream copyright notice: Copyright (c) 2021 eight04

### MIT License text

The following license text applies to LZ-String, tetris-fumen,
solution-finder, and sfinder-strict-minimal, together with each project's
copyright notice above.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Setup data and research references

The sources in this section were consulted when researching, transcribing,
normalizing, or validating setup geometry, queue conditions, continuations,
probabilities, terminology, and related metadata. No open-content license was
identified for these sources. They are listed as references and acknowledgements,
not as open-source license grants.

### PC INFO KOREA / Perfect Clear Info Korea

- Website: [Perfect Clear Info Korea](https://www.perfectclearinfokorea.com/)
- Organization: Korean Perfect Clear Association (KPCA)
- Site editing team identified by the site: Bibii (까망고양이 비비), Holifyre
  (홀리파이어), Paback (파백), SingSing7538 (양플), ozsitjl (z), and algebruh.
- Use in TetrisPC: primary reference for multiple cycle-based Perfect Clear setup
  catalogs, advanced setups, QB/OQB conditions, and associated explanations.

### NitenTeria and mww setup document

- Document: [Perfect Clear setup sheet](https://docs.qq.com/sheet/DRmxvWmt3SWxwS2tV)
- Authors: NitenTeria and mww
- Use in TetrisPC: reference database for Perfect Clear setup research and
  cross-checking.

### Algebruh's 7th

- Document: `Algebruh's 7th`
- Author: algebruh
- Use in TetrisPC: source and research reference for seventh-cycle Perfect Clear
  setups, including advanced seventh-cycle material.
- No stable public document URL or explicit public license was identified in the
  retained source provenance.

## External tools, services, and compatibility formats

The projects and services in this section are referenced or used externally.
Their code is not bundled into TetrisPC unless stated elsewhere in this document.

### ezSFinder

- Project: [ezSFinder](https://github.com/cringemoment/ezsfinder)
- Repository owner and publisher: cringemoment
- Upstream README credits: torch, swng, marfung, eight08, and knewjade for the
  underlying code collected or used by the project.
- Use in TetrisPC: external/offline SFinder helper scripts and setup-analysis
  workflow reference.
- License status: the upstream repository does not declare a license. This entry
  is an acknowledgement only and does not assert permission to redistribute its
  code.

### PC Solver / tetra-tools

- Service: [PC Solver](https://wirelyre.github.io/tetra-tools/pc-solver.html)
- Source project: [tetra-tools](https://github.com/wirelyre/tetra-tools)
- Author: wirelyre
- Use in TetrisPC: externally linked Perfect Clear solver; its source is not
  bundled into TetrisPC.
- Upstream license: GNU General Public License, version 3 or, at the user's option,
  any later version (GPL-3.0-or-later).
- Upstream copyright notice: Copyright 2021, `wirelyre`.

### Jstris

- Service: [Jstris](https://jstris.jezevec10.com/)
- Developer: Jezevec10
- Use in TetrisPC: external replay source and compatibility format. The local
  importer implements the explicitly tested Jstris V3 PC Mode replay subset.
  Unsupported future versions fail closed.
- License status: no open-source license for the Jstris service or replay format
  was identified. No Jstris application code is bundled into TetrisPC.
