function extractLinkDestination(value) {
  const trimmed = value.trim();
  const autolink = trimmed.match(/^<(https:\/\/[^>\s]+)>$/i);
  if (autolink) {
    return autolink[1].trim();
  }
  const markdownLink = trimmed.match(/^\[[^\]]*\]\(\s*<?(https:\/\/[^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)$/i);
  if (markdownLink) {
    return markdownLink[1].trim();
  }
  return trimmed.replace(/^["']|["']$/g, "").trim();
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }
    url.hash = "";
    return url;
  } catch (error) {
    return null;
  }
}

function makeStableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "movie-" + (hash >>> 0).toString(36);
}

function parseMovieBlock(block, entryNumber, options, diagnostics) {
  const fields = Object.create(null);
  block.split(/\r?\n/).forEach(function (line) {
    const match = line.match(/^\s*-\s*(title|poster|m3u8|source)\s*:\s*(.*?)\s*$/i);
    if (match) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  });

  const title = (fields.title || "").replace(/\s+/g, " ").trim();
  const streamUrl = parseHttpsUrl(extractLinkDestination(fields.m3u8 || ""));
  if (!title) {
    diagnostics.push({ entry: entryNumber, message: "Movie entry has no title." });
    return null;
  }
  if (!streamUrl) {
    diagnostics.push({ entry: entryNumber, message: "Movie entry has no valid HTTPS M3U8 URL." });
    return null;
  }

  const posterUrl = parseHttpsUrl(extractLinkDestination(fields.poster || ""));
  if (fields.poster && !posterUrl) {
    diagnostics.push({ entry: entryNumber, message: "Movie poster URL is invalid; using the fallback poster." });
  }
  const source = (fields.source || "").replace(/\s+/g, " ").trim() || streamUrl.hostname;
  return {
    id: makeStableId(streamUrl.href),
    title: title,
    poster: posterUrl ? posterUrl.href : options.fallbackPoster,
    m3u8: streamUrl.href,
    source: source,
    catalogSourceId: options.catalogSourceId,
    playbackEnabled: options.playbackEnabled === true
  };
}

export function parseMovieMarkdown(markdown, options) {
  const settings = Object.assign({
    catalogSourceId: "unknown",
    fallbackPoster: "icon.png",
    playbackEnabled: false
  }, options);
  const diagnostics = [];
  const movies = [];
  const text = typeof markdown === "string" ? markdown.replace(/^\uFEFF/, "") : "";
  const sections = text.split(/^##\s+Movie\s*$/gim);

  if (sections.length < 2) {
    return { movies: movies, diagnostics: [{ entry: 0, message: "No movie entries were found." }] };
  }

  sections.slice(1).forEach(function (block, index) {
    const movie = parseMovieBlock(block, index + 1, settings, diagnostics);
    if (movie) {
      movies.push(movie);
    }
  });

  return { movies: movies, diagnostics: diagnostics };
}
