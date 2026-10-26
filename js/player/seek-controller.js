const DEFAULT_SPEED = {
  initialProgressPerSecond: 0.02,
  accelerationPerSecondSquared: 0.425,
  maximumProgressPerSecond: 1.1
};

export function createSeekController(options) {
  const speed = Object.assign({}, DEFAULT_SPEED, options.speed);
  let frame = 0;
  let holdTimer = 0;
  let direction = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let previewProgress = 0;
  let startProgress = 0;
  let scrubbing = false;
  let moved = false;
  let heldSource = null;
  let pressedKeys = [];
  let disposed = false;

  function cancelFrame() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function animate(timestamp) {
    frame = 0;
    if (!scrubbing || !direction || disposed) {
      return;
    }

    const frameDuration = lastFrame ? Math.max(0, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp;
    const elapsedBeforeFrame = elapsed;
    elapsed += frameDuration;
    const timeToMaximum = Math.max(0, (speed.maximumProgressPerSecond - speed.initialProgressPerSecond) /
      speed.accelerationPerSecondSquared);
    const acceleratedDuration = Math.max(0,
      Math.min(elapsed, timeToMaximum) - Math.min(elapsedBeforeFrame, timeToMaximum));
    const cappedDuration = Math.max(0, frameDuration - acceleratedDuration);
    const distance = speed.initialProgressPerSecond * frameDuration +
      speed.accelerationPerSecondSquared * acceleratedDuration *
      (elapsedBeforeFrame + elapsedBeforeFrame + acceleratedDuration) / 2 +
      speed.maximumProgressPerSecond * cappedDuration;

    previewProgress = Math.max(0, Math.min(1, previewProgress + direction * distance));
    moved = moved || previewProgress !== startProgress;
    options.onPreview(previewProgress, progressToTime(previewProgress));

    if (previewProgress > 0 && previewProgress < 1) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function progressToTime(progress) {
    const range = options.getRange();
    return range.start + progress * (range.end - range.start);
  }

  function begin(nextDirection, source) {
    if (disposed) {
      return;
    }
    const range = options.getRange();
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
      return;
    }

    if (!scrubbing) {
      scrubbing = true;
      previewProgress = Math.max(0, Math.min(1, (options.getCurrentTime() - range.start) / (range.end - range.start)));
      startProgress = previewProgress;
      elapsed = 0;
      lastFrame = 0;
      moved = false;
      heldSource = source || null;
    } else if (source && !heldSource) {
      heldSource = source;
    }

    direction = nextDirection < 0 ? -1 : 1;
    if (!frame && previewProgress > 0 && previewProgress < 1) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function finish(commit) {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    cancelFrame();
    if (!scrubbing) {
      heldSource = null;
      pressedKeys = [];
      return false;
    }

    const finalTime = progressToTime(previewProgress);
    const shouldCommit = commit && moved;
    scrubbing = false;
    direction = 0;
    heldSource = null;
    pressedKeys = [];
    if (shouldCommit) {
      options.onCommit(finalTime);
    } else {
      options.onPreview(previewProgress, finalTime);
    }
    return shouldCommit;
  }

  return {
    pressKey(nextDirection, key) {
      const index = pressedKeys.indexOf(key);
      if (index === -1) {
        pressedKeys.push(key);
      }
      begin(nextDirection, null);
    },
    releaseKey(key) {
      const index = pressedKeys.indexOf(key);
      if (index === -1) {
        return;
      }
      pressedKeys.splice(index, 1);
      if (pressedKeys.length) {
        const lastKey = pressedKeys[pressedKeys.length - 1];
        begin(lastKey === "left" || lastKey === "rewind" ? -1 : 1, null);
      } else {
        finish(true);
      }
    },
    startHold(nextDirection, source, delay) {
      if (scrubbing || holdTimer) {
        return;
      }
      heldSource = source;
      holdTimer = window.setTimeout(function () {
        holdTimer = 0;
        begin(nextDirection, source);
      }, delay);
    },
    releaseHold(source) {
      const wasScrubbing = heldSource === source && scrubbing;
      const wasHolding = heldSource === source && (scrubbing || holdTimer !== 0);
      if (wasHolding) {
        finish(true);
      } else {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
        heldSource = null;
      }
      return wasScrubbing;
    },
    seekBy(seconds) {
      const range = options.getRange();
      if (!range || range.end <= range.start) {
        return;
      }
      options.onCommit(Math.max(range.start, Math.min(range.end, options.getCurrentTime() + seconds)));
    },
    setPreview(progress) {
      if (scrubbing) {
        finish(false);
      }
      const range = options.getRange();
      if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
        return;
      }
      scrubbing = true;
      previewProgress = Math.max(0, Math.min(1, progress));
      startProgress = Math.max(0, Math.min(1,
        (options.getCurrentTime() - range.start) / (range.end - range.start)));
      moved = previewProgress !== startProgress;
      direction = 0;
      heldSource = null;
      options.onPreview(previewProgress, progressToTime(previewProgress));
    },
    commitPreview() {
      finish(true);
    },
    cancel() {
      finish(false);
    },
    isHolding(source) {
      return heldSource === source && (scrubbing || holdTimer !== 0);
    },
    destroy() {
      disposed = true;
      finish(false);
    }
  };
}
