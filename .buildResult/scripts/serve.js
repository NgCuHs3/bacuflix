const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = parseInt(process.env.PORT || process.argv[2] || "8080", 10);
const ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "index.html";
  }

  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

      if (start >= stats.size || end >= stats.size || start > end) {
        res.writeHead(416, {
          "Content-Range": `bytes */${stats.size}`
        });
        res.end();
        return;
      }

      const chunksize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stats.size,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache"
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const addresses = getNetworkAddresses();
  console.log(`BACUFlix server running!`);
  console.log(`  Local:   http://localhost:${PORT}/`);
  addresses.forEach((addr) => {
    console.log(`  Network: http://${addr}:${PORT}/`);
  });
});
