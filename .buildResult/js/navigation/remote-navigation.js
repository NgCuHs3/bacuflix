const MEDIA_KEYS = [
  "MediaPlayPause",
  "MediaPlay",
  "MediaPause",
  "MediaStop",
  "MediaFastForward",
  "MediaRewind",
  "VolumeUp",
  "VolumeDown",
  "VolumeMute"
];

function keyCode(event) {
  return event.keyCode || event.which || 0;
}

export function normalizeRemoteKey(event) {
  const code = keyCode(event);
  const key = event.key;
  let direction = null;

  if (key === "ArrowLeft" || key === "Left" || code === 37) {
    direction = "left";
  } else if (key === "ArrowRight" || key === "Right" || code === 39) {
    direction = "right";
  } else if (key === "ArrowUp" || key === "Up" || code === 38) {
    direction = "up";
  } else if (key === "ArrowDown" || key === "Down" || code === 40) {
    direction = "down";
  }

  return {
    code,
    key,
    direction,
    isRepeat: event.repeat === true,
    isBack: key === "Back" || key === "BrowserBack" || key === "Escape" ||
      key === "XF86Back" || code === 10009 || code === 27 || code === 8,
    isSelect: key === "Enter" || key === " " || code === 13 || code === 32,
    isPlayPause: key === "MediaPlayPause" || code === 10252,
    isPlay: key === "MediaPlay" || code === 415,
    isPause: key === "MediaPause" || code === 19,
    isFastForward: key === "MediaFastForward" || code === 417,
    isRewind: key === "MediaRewind" || code === 412,
    isVolumeUp: key === "VolumeUp" || code === 447,
    isVolumeDown: key === "VolumeDown" || code === 448,
    isVolumeMute: key === "VolumeMute" || code === 449
  };
}

export function focusNext(elements, active, direction) {
  if (!elements.length) {
    return;
  }
  const current = elements.indexOf(active);
  const next = current < 0 ? 0 : (current + (direction === "left" ? -1 : 1) + elements.length) % elements.length;
  elements[next].focus();
}

export function activateFocusedElement(element) {
  if (element && typeof element.click === "function") {
    element.click();
  }
}

export function createRemoteNavigation() {
  let activeScreen = null;

  function onKeyDown(event) {
    if (activeScreen && activeScreen.onKeyDown && activeScreen.onKeyDown(event, normalizeRemoteKey(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onKeyUp(event) {
    if (activeScreen && activeScreen.onKeyUp && activeScreen.onKeyUp(event, normalizeRemoteKey(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);

  if (window.tizen && window.tizen.tvinputdevice) {
    try {
      const supportedNames = window.tizen.tvinputdevice.getSupportedKeys().map(function (item) {
        return item.name;
      });
      const keys = MEDIA_KEYS.filter(function (name) {
        return supportedNames.indexOf(name) !== -1;
      });
      if (keys.length && window.tizen.tvinputdevice.registerKeyBatch) {
        window.tizen.tvinputdevice.registerKeyBatch(keys);
      } else {
        keys.forEach(function (name) {
          window.tizen.tvinputdevice.registerKey(name);
        });
      }
    } catch (error) {
      console.warn("Some media remote keys could not be registered:", error);
    }
  }

  return {
    setScreen(screen) {
      activeScreen = screen;
    },
    destroy() {
      activeScreen = null;
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    }
  };
}
