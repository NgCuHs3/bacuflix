const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const wwwDir = path.join(root, "www");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

const assetsToCopy = [
  "index.html",
  "icon.png",
  "css",
  "js",
  "data"
];

for (const item of assetsToCopy) {
  copyRecursive(path.join(root, item), path.join(wwwDir, item));
}

console.log("Prepared Capacitor webDir at ./www with BACUFlix web assets.");
