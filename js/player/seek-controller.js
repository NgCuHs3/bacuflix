const DEFAULT_SPEED = {
  initialProgressPerSecond: 0.015,
  accelerationPerSecondSquared: 0.035,
  maximumProgressPerSecond: 0.16
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
  let isDirectScrub = false;
  let heldSource = null;
  let pressedKeys = [];
  let disposed = false;
  let lastTapTimestamp = 0;
  let tapCount = 0;

  function cancelFrame() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function progressToTime(progress) {
    const range = options.getRange();
    if (!range) {
      return 0;
    }
    return range.start + progress * (range.end - range.start);
  }

  function animate(timestamp) {
    frame = 0;
    if (!scrubbing || !direction || disposed) {
      return;
    }

    const frameDuration = lastFrame ? Math.min(0.2, Math.max(0, (timestamp - lastFrame) / 1000)) : 0.016;
    lastFrame = timestamp;
    elapsed += frameDuration;

    const currentSpeed = Math.min(
      speed.maximumProgressPerSecond,
      speed.initialProgressPerSecond + speed.accelerationPerSecondSquared * elapsed
    );
    const distance = currentSpeed * frameDuration;

    previewProgress = Math.max(0, Math.min(1, previewProgress + direction * distance));
    moved = moved || previewProgress !== startProgress;

    const range = options.getRange();
    const rangeDuration = (range && Number.isFinite(range.end) && Number.isFinite(range.start)) ?
      Math.max(1, range.end - range.start) : 1;
    const baseStartTime = range ? (range.start + startProgress * rangeDuration) : 0;
    const time = progressToTime(previewProgress);

    const meta = {
      direction: direction,
      isHolding: true,
      elapsed: elapsed,
      percentage: previewProgress * 100,
      deltaSeconds: Math.round(time - baseStartTime),
      targetTime: time
    };
    options.onPreview(previewProgress, time, meta);

    const canContinue = direction > 0 ? previewProgress < 1 : previewProgress > 0;
    if (canContinue) {
      frame = window.requestAnimationFrame(animate);
    }
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
      isDirectScrub = false;
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
    const canMove = direction > 0 ? previewProgress < 1 : previewProgress > 0;
    if (!frame && canMove) {
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

    const range = options.getRange();
    const rangeDuration = (range && Number.isFinite(range.end) && Number.isFinite(range.start)) ?
      Math.max(1, range.end - range.start) : 1;
    const baseStartTime = range ? (range.start + startProgress * rangeDuration) : options.getCurrentTime();

    let shouldCommit = commit;
    let finalTime = progressToTime(previewProgress);
    let isTapAction = false;

    if (commit) {
      if (!isDirectScrub && direction !== 0 && (!moved || elapsed < 0.18)) {
        isTapAction = true;
        const now = Date.now();
        if (now - lastTapTimestamp < 650) {
          tapCount = Math.min(5, tapCount + 1);
        } else {
          tapCount = 1;
        }
        lastTapTimestamp = now;

        const stepMultipliers = [0.01, 0.02, 0.04, 0.06, 0.08];
        const stepPct = stepMultipliers[Math.min(tapCount - 1, stepMultipliers.length - 1)];
        const minStepSeconds = 10 * tapCount;
        const effectiveSeconds = Math.max(minStepSeconds, rangeDuration * stepPct);

        const deltaProgress = effectiveSeconds / rangeDuration;
        previewProgress = Math.max(0, Math.min(1, startProgress + direction * deltaProgress));
        finalTime = progressToTime(previewProgress);
        moved = true;
      } else {
        tapCount = 0;
      }
    }

    const wasDirect = isDirectScrub;
    isDirectScrub = false;
    scrubbing = false;
    const finishedDirection = direction;
    direction = 0;
    heldSource = null;
    pressedKeys = [];

    const meta = {
      direction: finishedDirection,
      isTap: isTapAction,
      tapCount: tapCount,
      percentage: previewProgress * 100,
      deltaSeconds: Math.round(finalTime - baseStartTime),
      targetTime: finalTime,
      isDirect: wasDirect
    };

    if (shouldCommit && (moved || wasDirect)) {
      options.onPreview(previewProgress, finalTime, meta);
      options.onCommit(finalTime, meta);
      return true;
    } else {
      options.onPreview(previewProgress, finalTime, meta);
      return false;
    }
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
      const rangeDuration = range.end - range.start;
      const currentTime = options.getCurrentTime();
      const targetTime = Math.max(range.start, Math.min(range.end, currentTime + seconds));
      const progress = (targetTime - range.start) / rangeDuration;
      const meta = {
        direction: seconds < 0 ? -1 : 1,
        isTap: true,
        percentage: progress * 100,
        deltaSeconds: Math.round(targetTime - currentTime),
        targetTime: targetTime
      };
      if (typeof options.onPreview === "function") {
        options.onPreview(progress, targetTime, meta);
      }
      options.onCommit(targetTime, meta);
    },
    setPreview(progress) {
      if (scrubbing && !isDirectScrub) {
        finish(false);
      }
      const range = options.getRange();
      if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
        return;
      }
      const wasDirect = isDirectScrub;
      scrubbing = true;
      isDirectScrub = true;
      previewProgress = Math.max(0, Math.min(1, progress));
      if (!wasDirect) {
        startProgress = Math.max(0, Math.min(1,
          (options.getCurrentTime() - range.start) / (range.end - range.start)));
      }
      moved = true;
      direction = previewProgress >= startProgress ? 1 : -1;
      elapsed = 0;
      heldSource = null;
      const finalTime = progressToTime(previewProgress);
      const meta = {
        direction: direction,
        percentage: previewProgress * 100,
        deltaSeconds: Math.round(finalTime - (range.start + startProgress * (range.end - range.start))),
        targetTime: finalTime,
        isDirect: true
      };
      options.onPreview(previewProgress, finalTime, meta);
    },
    commitPreview() {
      finish(true);
    },
    cancel() {
      isDirectScrub = false;
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
