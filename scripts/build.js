const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entry = "js/app.js";
const modules = new Map();

function normalizeModule(from, specifier) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
}

function collectModule(moduleId) {
  if (modules.has(moduleId)) {
    return;
  }

  const filePath = path.join(root, moduleId.split("/").join(path.sep));
  let source = fs.readFileSync(filePath, "utf8");
  modules.set(moduleId, "");

  const imports = [];
  source = source.replace(
    /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];\s*$/gm,
    function (statement, names, specifier) {
      const dependency = normalizeModule(moduleId, specifier);
      imports.push(dependency);
      return names.split(",").map(function (name) {
        const binding = name.trim();
        return "var " + binding + " = requireModule(" + JSON.stringify(dependency) +
          ")[" + JSON.stringify(binding) + "];";
      }).join("\n");
    }
  );

  imports.forEach(function (dependency) {
    collectModule(dependency);
  });

  const exports = [];
  source = source.replace(
    /\bexport\s+(const|let|var|function)\s+([A-Za-z_$][\w$]*)/g,
    function (declaration, kind, name) {
      exports.push(name);
      return kind + " " + name;
    }
  );

  modules.set(moduleId, "registerModule(" + JSON.stringify(moduleId) + ", function (requireModule) {\n" +
    source + "\nreturn {" + exports.map(function (name) {
      return name + ": " + name;
    }).join(", ") + "};\n});");
}

collectModule(entry);

const bundle = [
  "(function (global) {",
  "var moduleFactories = {};",
  "var moduleCache = {};",
  "function registerModule(id, factory) { moduleFactories[id] = factory; }",
  "function requireModule(id) {",
  "  if (moduleCache[id]) { return moduleCache[id]; }",
  "  if (!moduleFactories[id]) { throw new Error('Unknown BACUFlix module: ' + id); }",
  "  var exports = moduleFactories[id](requireModule);",
  "  moduleCache[id] = exports;",
  "  return exports;",
  "}",
  Array.from(modules.values()).join("\n"),
  "requireModule(" + JSON.stringify(entry) + ");",
  "})(window);",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "js", "app.bundle.js"), bundle, "utf8");
console.log("Built Tizen-compatible classic-script bundle from " + modules.size + " source modules.");
