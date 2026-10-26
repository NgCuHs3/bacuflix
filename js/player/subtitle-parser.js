function parseTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const millis = parseInt(match[4].padEnd(3, "0").slice(0, 3), 10);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }
  const shortMatch = trimmed.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})/);
  if (shortMatch) {
    const minutes = parseInt(shortMatch[1], 10);
    const seconds = parseInt(shortMatch[2], 10);
    const millis = parseInt(shortMatch[3].padEnd(3, "0").slice(0, 3), 10);
    return minutes * 60 + seconds + millis / 1000;
  }
  return null;
}

export function formatVttTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00:00.000";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const millis = Math.floor((seconds - total) * 1000);

  const hh = hours < 10 ? "0" + hours : String(hours);
  const mm = minutes < 10 ? "0" + minutes : String(minutes);
  const ss = secs < 10 ? "0" + secs : String(secs);
  const ms = millis < 10 ? "00" + millis : (millis < 100 ? "0" + millis : String(millis));

  return hh + ":" + mm + ":" + ss + "." + ms;
}

export function stripSubtitleHtml(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseSrt(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return [];
  }

  const clean = rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const blocks = clean.split(/\n\s*\n+/);
  const cues = [];

  blocks.forEach(function (block, blockIndex) {
    const lines = block.split("\n").map(function (line) {
      return line.trim();
    }).filter(Boolean);

    if (!lines.length) {
      return;
    }

    let timeLineIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].indexOf("-->") !== -1) {
        timeLineIndex = index;
        break;
      }
    }

    if (timeLineIndex === -1) {
      return;
    }

    const timeParts = lines[timeLineIndex].split("-->");
    if (timeParts.length !== 2) {
      return;
    }

    const start = parseTimestamp(timeParts[0]);
    const endRaw = timeParts[1].trim().split(/\s+/)[0];
    const end = parseTimestamp(endRaw);

    if (start === null || end === null || end <= start) {
      return;
    }

    const dialogueLines = lines.slice(timeLineIndex + 1);
    const dialogue = dialogueLines.map(stripSubtitleHtml).filter(Boolean).join("\n");

    if (dialogue) {
      cues.push({
        id: blockIndex + 1,
        start: start,
        end: end,
        text: dialogue
      });
    }
  });

  cues.sort(function (a, b) {
    return a.start - b.start;
  });

  return cues;
}

export function srtToWebVtt(srtContent) {
  const cues = parseSrt(srtContent);
  const output = ["WEBVTT\n"];

  cues.forEach(function (cue, index) {
    output.push(
      String(index + 1) + "\n" +
      formatVttTimestamp(cue.start) + " --> " + formatVttTimestamp(cue.end) + "\n" +
      cue.text + "\n"
    );
  });

  return output.join("\n");
}

export function findActiveCues(cues, currentTime) {
  if (!Array.isArray(cues) || !cues.length || typeof currentTime !== "number" || currentTime < 0) {
    return [];
  }

  const active = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (cue.start <= currentTime && currentTime <= cue.end) {
      active.push(cue);
    } else if (cue.start > currentTime) {
      break;
    }
  }

  return active;
}

export function getActiveSubtitleText(cues, currentTime) {
  const active = findActiveCues(cues, currentTime);
  if (!active.length) {
    return "";
  }
  return active.map(function (cue) {
    return cue.text;
  }).join("\n");
}
