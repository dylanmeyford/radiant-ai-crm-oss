import { z } from 'zod';

export type TranscriptFormat = 'json' | 'krisp' | 'granola' | 'vtt' | 'plain' | 'unknown';

export interface NormalizedSegment {
  speaker: string;
  start?: number; // milliseconds
  end?: number; // milliseconds
  text: string;
}

export interface NormalizedTranscript {
  transcript: NormalizedSegment[];
  metadata?: {
    originalFormat: TranscriptFormat;
    normalizedAt: string;
  };
}

const timeToMs = (time: string): number | undefined => {
  // Supports mm:ss or hh:mm:ss
  const parts = time.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => p === '' || Number.isNaN(Number(p)))) {
    return undefined;
  }

  const nums = parts.map((p) => Number(p));
  const [hours, minutes, seconds] =
    nums.length === 3 ? nums : ([0, nums[0], nums[1]] as [number, number, number]);

  return ((hours * 3600 + minutes * 60 + seconds) || 0) * 1000;
};

const normalizeJson = (parsed: any): NormalizedTranscript | null => {
  if (!parsed) return null;

  const fromTranscriptArray = parsed.transcript && Array.isArray(parsed.transcript);
  const fromCaptionsArray = parsed.captions && Array.isArray(parsed.captions);

  if (!fromTranscriptArray && !fromCaptionsArray) return null;

  const segmentsSource = fromTranscriptArray ? parsed.transcript : parsed.captions;
  const schema = z.array(
    z.object({
      speaker: z.string().optional(),
      speaker_id: z.union([z.number(), z.string()]).optional(),
      start: z.number().optional(),
      startTime: z.number().optional(),
      time: z.number().optional(),
      end: z.number().optional(),
      endTime: z.number().optional(),
      sentence: z.string().optional(),
      text: z.string().optional(),
    })
  );

  const safe = schema.safeParse(segmentsSource);
  if (!safe.success) return null;

  const speakerMap = new Map<string | number, string>();
  let speakerCounter = 1;

  const transcript: NormalizedSegment[] = safe.data
    .map((item) => {
      const rawSpeaker = item.speaker ?? item.speaker_id ?? `Speaker ${speakerCounter}`;
      if (!speakerMap.has(rawSpeaker)) {
        speakerMap.set(rawSpeaker, typeof rawSpeaker === 'string' ? rawSpeaker : `Speaker ${speakerCounter}`);
        speakerCounter += 1;
      }
      const speaker = speakerMap.get(rawSpeaker) || 'Unknown';

      const startRaw = item.start ?? item.startTime ?? item.time;
      const endRaw = item.end ?? item.endTime;

      const start =
        typeof startRaw === 'number'
          ? startRaw >= 10000
            ? startRaw
            : Math.round(startRaw * 1000)
          : undefined;
      const end =
        typeof endRaw === 'number'
          ? endRaw >= 10000
            ? endRaw
            : Math.round(endRaw * 1000)
          : undefined;

      const text = (item.text ?? item.sentence ?? '').trim();
      if (!text) return null;

      return { speaker, start, end, text };
    })
    .filter(Boolean) as NormalizedSegment[];

  return {
    transcript,
    metadata: {
      originalFormat: 'json',
      normalizedAt: new Date().toISOString(),
    },
  };
};

const normalizeKrisp = (raw: string): NormalizedTranscript | null => {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const headerRegex = /^(.+?)\s*\|\s*(\d{1,2}:\d{2}(?::\d{2})?)$/;
  const transcript: NormalizedSegment[] = [];

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(headerRegex);
    if (!headerMatch) {
      i += 1;
      continue;
    }

    const speaker = headerMatch[1].trim() || 'Unknown';
    const start = timeToMs(headerMatch[2]);
    const textLines: string[] = [];

    i += 1;
    while (i < lines.length && !headerRegex.test(lines[i])) {
      textLines.push(lines[i]);
      i += 1;
    }

    const text = textLines.join(' ').trim();
    if (text) {
      transcript.push({ speaker, start, text });
    }
  }

  if (transcript.length === 0) return null;

  return {
    transcript,
    metadata: {
      originalFormat: 'krisp',
      normalizedAt: new Date().toISOString(),
    },
  };
};

const normalizeGranola = (raw: string): NormalizedTranscript | null => {
  // Example lines: "Me: text" / "Them: text"
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const transcript: NormalizedSegment[] = [];
  let currentTimeMs = 0;

  for (const line of lines) {
    const match = line.match(/^(Me|Them)\s*:\s*(.+)$/i);
    if (!match) continue;
    const speaker = match[1].toLowerCase() === 'me' ? 'Me' : 'Them';
    const text = match[2].trim();
    if (!text) continue;

    transcript.push({ speaker, start: currentTimeMs, text });
    currentTimeMs += 5000; // increment 5s for lack of timestamps
  }

  if (transcript.length === 0) return null;

  return {
    transcript,
    metadata: {
      originalFormat: 'granola',
      normalizedAt: new Date().toISOString(),
    },
  };
};

const normalizeVtt = (raw: string): NormalizedTranscript | null => {
  if (!raw.includes('-->')) return null;

  const lines = raw.split('\n');
  const transcript: NormalizedSegment[] = [];

  let currentSpeaker = 'Unknown';
  let currentText = '';
  let currentStart: number | undefined;

  const flush = () => {
    const text = currentText.trim();
    if (!text) return;
    transcript.push({ speaker: currentSpeaker, start: currentStart, text });
    currentText = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'WEBVTT' || trimmed.startsWith('NOTE')) continue;

    const timestampMatch = trimmed.match(
      /(\d{2}):(\d{2}):(\d{2}(?:\.\d{3})?)\s*-->\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d{3})?)/
    );
    if (timestampMatch) {
      flush();
      const [, h1, m1, s1] = timestampMatch;
      const startSeconds = Number(h1) * 3600 + Number(m1) * 60 + Number(s1);
      currentStart = Math.round(startSeconds * 1000);
      continue;
    }

    const speakerMatch = trimmed.match(/<v\s+([^>]+)>/i);
    if (speakerMatch) {
      const speakerLabel = speakerMatch[1].trim();
      currentSpeaker = speakerLabel || 'Unknown';
      currentText += ` ${trimmed.replace(/<v\s+[^>]+>/, '').replace(/<\/v>/, '').trim()}`;
      continue;
    }

    currentText += ` ${trimmed}`;
  }

  flush();

  if (transcript.length === 0) return null;

  return {
    transcript,
    metadata: {
      originalFormat: 'vtt',
      normalizedAt: new Date().toISOString(),
    },
  };
};

const normalizePlain = (raw: string): NormalizedTranscript | null => {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const timestampRegex = /^(\d{2}):(\d{2}):(\d{2})\s+(.+)$/;
  const transcript: NormalizedSegment[] = [];
  let fallbackMs = 0;

  for (const line of lines) {
    const timestampMatch = line.match(timestampRegex);
    if (timestampMatch) {
      const [, hh, mm, ss, rest] = timestampMatch;
      const start =
        (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000;
      const speakerMatch = rest.match(/^([^:]+):\s*(.+)$/);
      if (speakerMatch) {
        const speaker = speakerMatch[1].trim() || 'Unknown';
        const text = speakerMatch[2].trim();
        if (text) {
          transcript.push({ speaker, start, text });
        }
      } else if (rest.trim()) {
        transcript.push({ speaker: 'Unknown', start, text: rest.trim() });
      }
      fallbackMs = start + 5000;
      continue;
    }

    const speakerMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim() || 'Unknown';
      const text = speakerMatch[2].trim();
      if (text) {
        transcript.push({ speaker, start: fallbackMs, text });
        fallbackMs += 5000;
      }
    }
  }

  if (transcript.length === 0) return null;

  return {
    transcript,
    metadata: {
      originalFormat: 'plain',
      normalizedAt: new Date().toISOString(),
    },
  };
};

export const normalizeTranscript = (raw: string): NormalizedTranscript => {
  const trimmed = (raw || '').trim();
  const now = new Date().toISOString();

  if (!trimmed) {
    return { transcript: [], metadata: { originalFormat: 'unknown', normalizedAt: now } };
  }

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    const asJson = normalizeJson(parsed);
    if (asJson) return asJson;
  } catch {
    // not JSON, continue
  }

  const normalizers: Array<[TranscriptFormat, (input: string) => NormalizedTranscript | null]> = [
    ['krisp', normalizeKrisp],
    ['granola', normalizeGranola],
    ['vtt', normalizeVtt],
    ['plain', normalizePlain],
  ];

  for (const [, fn] of normalizers) {
    const result = fn(trimmed);
    if (result) return result;
  }

  // Fallback: wrap raw as a single segment
  return {
    transcript: [{ speaker: 'Unknown', text: trimmed }],
    metadata: { originalFormat: 'unknown', normalizedAt: now },
  };
};

