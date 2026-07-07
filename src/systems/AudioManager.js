// Fully procedural audio: every sound effect is synthesized with the Web
// Audio API and the music is a small generative chiptune sequencer — the game
// ships zero audio files.
//
// The AudioContext is created lazily on the first user gesture (browser
// autoplay policy). Music has two moods: 'calm' (menu / build phase) and
// 'tense' (wave active) — the same progression with extra layers faded in.

const NOTE = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196,
  A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392,
  A4: 440, C5: 523.25, E5: 659.25, A5: 880 };

// chord progression: Am — F — C — G (roots + arp notes per bar)
const PROGRESSION = [
  { root: NOTE.A2, chord: [NOTE.A3, NOTE.C4, NOTE.E4], arp: [NOTE.A4, NOTE.C5, NOTE.E5, NOTE.C5] },
  { root: NOTE.F3 / 2, chord: [NOTE.F3, NOTE.A3, NOTE.C4], arp: [NOTE.F4, NOTE.A4, NOTE.C5, NOTE.A4] },
  { root: NOTE.C3, chord: [NOTE.G3, NOTE.C4, NOTE.E4], arp: [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.C5] },
  { root: NOTE.G3 / 2, chord: [NOTE.G3, NOTE.D4, NOTE.G4 / 2 * 2], arp: [NOTE.G4, NOTE.D4 * 2, NOTE.G4, NOTE.D4 * 2] },
];

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.lastPlayed = {}; // per-sfx throttle timestamps
    this.mood = 'calm';
    this.musicPlaying = false;
    // optional MIDI songs that replace the generative music per mood;
    // each track keeps its own loop position ({ notes, duration } from
    // MidiSong.parseMidi plus scheduler state)
    this.tracks = {
      calm: { song: null, startTime: null, index: 0 },
      tense: { song: null, startTime: null, index: 0 },
    };

    settings.onChange((key, value) => {
      if (!this.ctx) return;
      if (key === 'musicVolume') this.musicGain.gain.value = value * 0.5;
      if (key === 'sfxVolume') this.sfxGain.gain.value = value;
    });
  }

  // must be called from a user-gesture handler at least once
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.settings.get('musicVolume') * 0.5;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.settings.get('sfxVolume');
    this.sfxGain.connect(this.master);

    // tense-only music layers live behind their own fader
    this.tenseGain = this.ctx.createGain();
    this.tenseGain.gain.value = 0;
    this.tenseGain.connect(this.musicGain);
    // calm-only pad layer fader
    this.calmGain = this.ctx.createGain();
    this.calmGain.gain.value = 1;
    this.calmGain.connect(this.musicGain);
  }

  // ---- tiny synth helpers ---------------------------------------------------

  _env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.001, t + attack + decay);
  }

  _tone(dest, t, { type = 'square', freq = 440, glideTo = null, attack = 0.005, peak = 0.2, decay = 0.15 }) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
    this._env(gain, t, attack, peak, decay);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  _noise(dest, t, { peak = 0.25, decay = 0.2, filterFrom = 1200, filterTo = 200 }) {
    const dur = decay + 0.05;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, t);
    filter.frequency.exponentialRampToValueAtTime(filterTo, t + decay);
    const gain = this.ctx.createGain();
    this._env(gain, t, 0.003, peak, decay);
    src.connect(filter).connect(gain).connect(dest);
    src.start(t);
    src.stop(t + dur);
  }

  // ---- SFX -------------------------------------------------------------------

  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < 35) return; // anti-clip throttle
    this.lastPlayed[name] = now;

    const t = this.ctx.currentTime;
    const out = this.sfxGain;
    switch (name) {
      case 'shoot_single':
        this._tone(out, t, { type: 'square', freq: 620, glideTo: 280, peak: 0.12, decay: 0.07 });
        break;
      case 'shoot_splash':
        this._tone(out, t, { type: 'sine', freq: 130, glideTo: 45, peak: 0.3, decay: 0.18 });
        this._noise(out, t, { peak: 0.1, decay: 0.08, filterFrom: 900, filterTo: 300 });
        break;
      case 'shoot_slow':
        this._tone(out, t, { type: 'triangle', freq: 880, glideTo: 1500, peak: 0.1, decay: 0.12 });
        break;
      case 'shoot_flame':
        // breathy whoosh: filtered noise + a low airy tone
        this._noise(out, t, { peak: 0.14, decay: 0.16, filterFrom: 2200, filterTo: 500 });
        this._tone(out, t, { type: 'sawtooth', freq: 160, glideTo: 90, peak: 0.08, decay: 0.14 });
        break;
      case 'explosion':
        this._noise(out, t, { peak: 0.32, decay: 0.3, filterFrom: 800, filterTo: 90 });
        this._tone(out, t, { type: 'sine', freq: 90, glideTo: 40, peak: 0.25, decay: 0.25 });
        break;
      case 'death':
        this._tone(out, t, { type: 'square', freq: 300, glideTo: 70, peak: 0.12, decay: 0.1 });
        break;
      case 'gold':
        this._tone(out, t, { type: 'square', freq: 1175, peak: 0.07, decay: 0.05 });
        this._tone(out, t + 0.055, { type: 'square', freq: 1760, peak: 0.07, decay: 0.07 });
        break;
      case 'place':
        this._noise(out, t, { peak: 0.18, decay: 0.09, filterFrom: 500, filterTo: 150 });
        this._tone(out, t + 0.02, { type: 'triangle', freq: 220, peak: 0.15, decay: 0.1 });
        break;
      case 'upgrade':
        [523.25, 659.25, 880].forEach((f, i) =>
          this._tone(out, t + i * 0.07, { type: 'square', freq: f, peak: 0.1, decay: 0.1 }));
        break;
      case 'sell':
        this._tone(out, t, { type: 'square', freq: 660, peak: 0.09, decay: 0.07 });
        this._tone(out, t + 0.08, { type: 'square', freq: 440, peak: 0.09, decay: 0.12 });
        break;
      case 'wave_start':
        this._tone(out, t, { type: 'sawtooth', freq: 220, peak: 0.16, decay: 0.35 });
        this._tone(out, t, { type: 'sawtooth', freq: 277, peak: 0.16, decay: 0.35 });
        this._tone(out, t + 0.18, { type: 'sawtooth', freq: 330, peak: 0.14, decay: 0.4 });
        break;
      case 'base_hit':
        this._tone(out, t, { type: 'sawtooth', freq: 420, glideTo: 200, peak: 0.2, decay: 0.22 });
        this._noise(out, t, { peak: 0.15, decay: 0.15, filterFrom: 1500, filterTo: 400 });
        break;
      case 'ui_click':
        this._tone(out, t, { type: 'square', freq: 800, peak: 0.05, decay: 0.03 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this._tone(out, t + i * 0.15, { type: 'square', freq: f, peak: 0.14, decay: i === 3 ? 0.5 : 0.14 }));
        break;
      case 'lose':
        [392, 311.13, 233.08].forEach((f, i) =>
          this._tone(out, t + i * 0.25, { type: 'sawtooth', freq: f, peak: 0.16, decay: i === 2 ? 0.7 : 0.22 }));
        break;
    }
  }

  // ---- generative music --------------------------------------------------------

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0; // 16th-note steps, 16 per bar, 4 bars per progression loop
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.stepDur = 60 / 112 / 4; // 112 BPM, 16th notes
    this._schedulerId = setInterval(() => this._schedule(), 25);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this._schedulerId) clearInterval(this._schedulerId);
    this._schedulerId = null;
  }

  // Load a .mid to play (looped) instead of the generative music for a mood.
  // Fire-and-forget; generative music remains the fallback per mood.
  setTenseSong(song) {
    this.tracks.tense.song = song;
    this.tracks.tense.startTime = null;
  }

  setCalmSong(song) {
    this.tracks.calm.song = song;
    this.tracks.calm.startTime = null;
  }

  setMood(mood) {
    this.mood = mood;
    // both songs restart from the top on the next mood switch
    this.tracks.calm.startTime = null;
    this.tracks.tense.startTime = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tenseGain.gain.cancelScheduledValues(t);
    this.calmGain.gain.cancelScheduledValues(t);
    this.tenseGain.gain.linearRampToValueAtTime(mood === 'tense' ? 1 : 0, t + 1.5);
    // with a tense song loaded, the calm layers duck out fully during waves
    // so the two tempos never fight
    const calmTense = this.tracks.tense.song ? 0 : 0.5;
    this.calmGain.gain.linearRampToValueAtTime(mood === 'tense' ? calmTense : 1, t + 1.5);
  }

  _schedule() {
    if (!this.musicPlaying || this.ctx.state !== 'running') return;
    const track = this.tracks[this.mood];
    const songActive = !!track.song;
    // lookahead scheduling keeps timing sample-accurate without a tight loop
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      if (!songActive) this._playStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += this.stepDur;
    }
    if (songActive) {
      const dest = this.mood === 'tense' ? this.tenseGain : this.calmGain;
      this._scheduleSong(track, dest, this.ctx.currentTime + 0.12);
    }
  }

  // Schedule a track's MIDI notes (looped) into the given mood fader.
  _scheduleSong(track, dest, lookaheadEnd) {
    const { notes, duration } = track.song;
    if (!notes.length) return;
    if (track.startTime === null) {
      track.startTime = this.ctx.currentTime + 0.05;
      track.index = 0;
    }
    for (;;) {
      if (track.index >= notes.length) {
        track.startTime += duration; // loop
        track.index = 0;
      }
      const n = notes[track.index];
      const t = track.startTime + n.time;
      if (t >= lookaheadEnd) break;
      track.index++;
      if (t < this.ctx.currentTime) continue; // missed while tab was hidden
      const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
      // voice by register: low notes get a warm triangle bass, the rest the
      // chiptune square lead
      const bass = n.midi < 52;
      this._tone(dest, t, {
        type: bass ? 'triangle' : 'square',
        freq,
        attack: 0.008,
        peak: (bass ? 0.16 : 0.07) * (0.35 + 0.65 * n.velocity),
        decay: Math.min(Math.max(n.dur, 0.08), 1.2),
      });
    }
  }

  _playStep(step, t) {
    const bar = Math.floor(step / 16);
    const beat = step % 16;
    const { root, chord, arp } = PROGRESSION[bar];

    // bass: root on beats 0 and 8, fifth-ish on 12 (always on)
    if (beat === 0 || beat === 8) {
      this._tone(this.musicGain, t, { type: 'triangle', freq: root, peak: 0.16, decay: this.stepDur * 6 });
    } else if (beat === 12) {
      this._tone(this.musicGain, t, { type: 'triangle', freq: root * 1.5, peak: 0.12, decay: this.stepDur * 3 });
    }

    // calm pad: soft chord tones at bar start
    if (beat === 0) {
      for (const f of chord) {
        this._tone(this.calmGain, t, { type: 'triangle', freq: f, attack: 0.3, peak: 0.045, decay: this.stepDur * 14 });
      }
    }

    // tense arp: driving 8th-note arpeggio + noise-hat 16ths
    if (beat % 2 === 0) {
      const f = arp[(beat / 2) % arp.length];
      this._tone(this.tenseGain, t, { type: 'square', freq: f, peak: 0.05, decay: this.stepDur * 1.6 });
    }
    if (beat % 4 === 2) {
      this._noise(this.tenseGain, t, { peak: 0.03, decay: 0.03, filterFrom: 8000, filterTo: 6000 });
    }
  }
}
