import { inspectSegment } from "./segment-inspector.js";

function isFragment(context) {
  return context && (context.type === "fragment" ||
    context.type === "media-fragment" || context.type === "audio-fragment");
}

export function createSegmentLoader(DefaultLoader) {
  if (typeof DefaultLoader !== "function") {
    throw new Error("The HLS default loader is unavailable.");
  }

  function SegmentLoader(config) {
    this.delegate = new DefaultLoader(config);
    this.context = null;
  }
  Object.defineProperty(SegmentLoader.prototype, "stats", {
    get() {
      return this.delegate.stats;
    }
  });
  SegmentLoader.prototype.load = function (context, config, callbacks) {
    this.context = context;
    if (!isFragment(context)) {
      return this.delegate.load(context, config, callbacks);
    }

    const wrappedCallbacks = Object.create(callbacks);
    wrappedCallbacks.onSuccess = function (response, stats, loadedContext, networkDetails) {
      let inspection;
      try {
        inspection = inspectSegment(response.data);
      } catch (error) {
        console.warn("Rejected malformed wrapped media segment:", error.message);
        callbacks.onError({
          code: 0,
          text: error.message
        }, loadedContext, networkDetails, stats);
        return;
      }
      if (inspection.kind === "png-wrapped-mpeg-ts") {
        response = Object.assign({}, response, { data: inspection.data });
        console.info(
          "Recovered PNG-wrapped MPEG-TS segment (" +
          inspection.pngBytes + " wrapper bytes, " +
          inspection.transportStreamBytes + " media bytes)."
        );
      }
      callbacks.onSuccess(response, stats, loadedContext, networkDetails);
    };
    return this.delegate.load(context, config, wrappedCallbacks);
  };
  SegmentLoader.prototype.abort = function () {
    this.delegate.abort();
  };
  SegmentLoader.prototype.destroy = function () {
    this.delegate.destroy();
    this.delegate = null;
  };
  SegmentLoader.prototype.getResponseHeader = function (name) {
    return this.delegate.getResponseHeader(name);
  };
  return SegmentLoader;
}
