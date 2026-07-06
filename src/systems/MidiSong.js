// Minimal Standard MIDI File parser: extracts a flat, time-sorted note list
// (seconds) so AudioManager can play a .mid through its Web Audio synth.
// Handles format 0/1, running status, and tempo changes; ignores everything
// that isn't a note or tempo event.

function readVLQ(buf, pos) {
  let value = 0;
  let p = pos;
  for (;;) {
    const b = buf[p++];
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) break;
  }
  return [value, p];
}

// Returns { notes: [{ time, dur, midi, velocity, track }], duration }
export function parseMidi(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (String.fromCharCode(...buf.slice(0, 4)) !== 'MThd') throw new Error('not a MIDI file');
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12); // ticks per quarter note (SMPTE unsupported)

  const tempoEvents = [{ tick: 0, usPerQn: 500000 }]; // default 120 BPM
  const rawNotes = []; // { tick, durTicks, midi, velocity, track }

  let pos = 14;
  for (let track = 0; track < trackCount; track++) {
    if (String.fromCharCode(...buf.slice(pos, pos + 4)) !== 'MTrk') break;
    const length = view.getUint32(pos + 4);
    let p = pos + 8;
    const end = p + length;
    pos = end;

    let tick = 0;
    let runningStatus = 0;
    const open = new Map(); // midi note -> { tick, velocity }

    while (p < end) {
      let delta;
      [delta, p] = readVLQ(buf, p);
      tick += delta;

      let status = buf[p];
      if (status & 0x80) p++;
      else status = runningStatus; // running status reuses the previous one

      if (status === 0xff) {
        const type = buf[p++];
        let len;
        [len, p] = readVLQ(buf, p);
        if (type === 0x51 && len === 3) {
          tempoEvents.push({ tick, usPerQn: (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2] });
        }
        p += len;
        continue; // meta events don't set running status
      }
      if (status === 0xf0 || status === 0xf7) {
        let len;
        [len, p] = readVLQ(buf, p);
        p += len;
        continue;
      }

      runningStatus = status;
      const kind = status & 0xf0;
      if (kind === 0x90 && buf[p + 1] > 0) {
        open.set(buf[p], { tick, velocity: buf[p + 1] });
        p += 2;
      } else if (kind === 0x80 || kind === 0x90) {
        const started = open.get(buf[p]);
        if (started) {
          rawNotes.push({
            tick: started.tick,
            durTicks: Math.max(tick - started.tick, 1),
            midi: buf[p],
            velocity: started.velocity,
            track,
          });
          open.delete(buf[p]);
        }
        p += 2;
      } else if (kind === 0xc0 || kind === 0xd0) {
        p += 1;
      } else {
        p += 2; // 0xA0 aftertouch, 0xB0 CC, 0xE0 pitch bend
      }
    }
  }

  // tick -> seconds via the tempo map
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const toSeconds = (tick) => {
    let seconds = 0;
    let lastTick = 0;
    let usPerQn = tempoEvents[0].usPerQn;
    for (const ev of tempoEvents) {
      if (ev.tick >= tick) break;
      seconds += ((ev.tick - lastTick) / division) * (usPerQn / 1e6);
      lastTick = ev.tick;
      usPerQn = ev.usPerQn;
    }
    return seconds + ((tick - lastTick) / division) * (usPerQn / 1e6);
  };

  const notes = rawNotes
    .map((n) => ({
      time: toSeconds(n.tick),
      dur: toSeconds(n.tick + n.durTicks) - toSeconds(n.tick),
      midi: n.midi,
      velocity: n.velocity / 127,
      track: n.track,
    }))
    .sort((a, b) => a.time - b.time);

  const duration = notes.length ? Math.max(...notes.map((n) => n.time + n.dur)) + 0.4 : 0;
  return { notes, duration };
}

export async function loadMidi(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}`);
  return parseMidi(await res.arrayBuffer());
}
