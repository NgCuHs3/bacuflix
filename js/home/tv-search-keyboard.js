const KEY_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"]
];

const QUICK_TAGS = [
  "Tiên hiệp",
  "Cổ trang",
  "Hành động",
  "Hoạt hình",
  "Hàn Quốc",
  "Tổng tài"
];

export function createTvSearchKeyboard(container, callbacks) {
  const panel = document.createElement("aside");
  panel.className = "tv-keyboard-panel";
  panel.setAttribute("aria-label", "Bàn phím tìm kiếm TV");
  panel.hidden = true;

  let currentValue = "";
  let isOpenState = false;
  let activeSection = "grid"; // "actions" | "grid" | "tags" | "footer"
  let actionCol = 0; // 0: space, 1: backspace, 2: clear
  let gridRow = 1; // Default to Q row
  let gridCol = 0;
  let tagIndex = 0;

  // Header with live query preview
  const header = document.createElement("div");
  header.className = "tv-kb-header";

  const headerTop = document.createElement("div");
  headerTop.className = "tv-kb-header-top";

  const badge = document.createElement("span");
  badge.className = "tv-kb-badge";
  badge.textContent = "BÀN PHÍM TV (QWERTY)";

  const hint = document.createElement("span");
  hint.className = "tv-kb-hint";
  hint.textContent = "← Chọn phim · Back để đóng";

  headerTop.appendChild(badge);
  headerTop.appendChild(hint);

  const previewBox = document.createElement("div");
  previewBox.className = "tv-kb-preview";

  const previewIcon = document.createElement("span");
  previewIcon.className = "tv-kb-preview-icon";
  previewIcon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

  const previewContent = document.createElement("div");
  previewContent.className = "tv-kb-preview-content";

  const previewText = document.createElement("span");
  previewText.className = "tv-kb-preview-text";

  const cursor = document.createElement("span");
  cursor.className = "tv-kb-cursor";
  cursor.setAttribute("aria-hidden", "true");

  const previewPlaceholder = document.createElement("span");
  previewPlaceholder.className = "tv-kb-preview-placeholder";
  previewPlaceholder.textContent = "Nhập tên phim, diễn viên...";

  previewContent.appendChild(previewText);
  previewContent.appendChild(cursor);
  previewContent.appendChild(previewPlaceholder);

  previewBox.appendChild(previewIcon);
  previewBox.appendChild(previewContent);

  header.appendChild(headerTop);
  header.appendChild(previewBox);

  // Top utility actions: Space, Backspace, Clear
  const actionsRow = document.createElement("div");
  actionsRow.className = "tv-kb-actions";

  const spaceBtn = document.createElement("button");
  spaceBtn.type = "button";
  spaceBtn.className = "tv-kb-key tv-kb-action-key";
  spaceBtn.innerHTML = '<span class="tv-kb-action-icon">␣</span><span>Dấu cách</span>';
  spaceBtn.setAttribute("aria-label", "Dấu cách");

  const backspaceBtn = document.createElement("button");
  backspaceBtn.type = "button";
  backspaceBtn.className = "tv-kb-key tv-kb-action-key";
  backspaceBtn.innerHTML = '<span class="tv-kb-action-icon">⌫</span><span>Xóa</span>';
  backspaceBtn.setAttribute("aria-label", "Xóa ký tự");

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "tv-kb-key tv-kb-action-key";
  clearBtn.innerHTML = '<span class="tv-kb-action-icon">✕</span><span>Xóa hết</span>';
  clearBtn.setAttribute("aria-label", "Xóa toàn bộ");

  const actionButtons = [spaceBtn, backspaceBtn, clearBtn];
  actionButtons.forEach(function (btn, idx) {
    btn.addEventListener("focus", function () {
      activeSection = "actions";
      actionCol = idx;
    });
    actionsRow.appendChild(btn);
  });

  spaceBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    appendChar(" ");
  });

  backspaceBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    backspace();
  });

  clearBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    clearAll();
  });

  // Main QWERTY character rows
  const keysGrid = document.createElement("div");
  keysGrid.className = "tv-kb-qwerty";
  const gridButtons = [];

  KEY_ROWS.forEach(function (rowChars, rIdx) {
    const rowEl = document.createElement("div");
    rowEl.className = "tv-kb-row";
    const rowArr = [];
    rowChars.forEach(function (ch, cIdx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tv-kb-key tv-kb-char-key";
      btn.textContent = ch.toUpperCase();
      btn.dataset.char = ch;
      btn.dataset.row = String(rIdx);
      btn.dataset.col = String(cIdx);
      btn.addEventListener("focus", function () {
        activeSection = "grid";
        gridRow = rIdx;
        gridCol = cIdx;
      });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        appendChar(ch);
      });
      rowEl.appendChild(btn);
      rowArr.push(btn);
    });
    keysGrid.appendChild(rowEl);
    gridButtons.push(rowArr);
  });

  // Quick Suggestion Tags
  const tagsSection = document.createElement("div");
  tagsSection.className = "tv-kb-tags-section";

  const tagsLabel = document.createElement("p");
  tagsLabel.className = "tv-kb-tags-label";
  tagsLabel.textContent = "Từ khóa phổ biến";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "tv-kb-tags";
  const tagButtons = [];

  QUICK_TAGS.forEach(function (tag, idx) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tv-kb-tag";
    btn.textContent = tag;
    btn.addEventListener("focus", function () {
      activeSection = "tags";
      tagIndex = idx;
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setQuery(tag, true);
    });
    tagsWrap.appendChild(btn);
    tagButtons.push(btn);
  });

  tagsSection.appendChild(tagsLabel);
  tagsSection.appendChild(tagsWrap);

  // Footer Close / Done button
  const footer = document.createElement("div");
  footer.className = "tv-kb-footer";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "tv-kb-submit-btn";
  submitBtn.textContent = "Xem kết quả phim";
  submitBtn.addEventListener("focus", function () {
    activeSection = "footer";
  });
  submitBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (callbacks && typeof callbacks.onSubmit === "function") {
      callbacks.onSubmit(currentValue);
    }
  });

  footer.appendChild(submitBtn);

  panel.appendChild(header);
  panel.appendChild(actionsRow);
  panel.appendChild(keysGrid);
  panel.appendChild(tagsSection);
  panel.appendChild(footer);
  container.appendChild(panel);

  function updatePreviewUI() {
    if (currentValue && currentValue.length > 0) {
      previewText.textContent = currentValue;
      previewText.hidden = false;
      previewPlaceholder.hidden = true;
    } else {
      previewText.textContent = "";
      previewText.hidden = true;
      previewPlaceholder.hidden = false;
    }
  }

  updatePreviewUI();

  function setQuery(val, notify) {
    currentValue = val || "";
    updatePreviewUI();
    if (notify && callbacks && typeof callbacks.onChange === "function") {
      callbacks.onChange(currentValue);
    }
  }

  function appendChar(ch) {
    if (ch === " " && (!currentValue || currentValue.endsWith(" "))) {
      return;
    }
    setQuery(currentValue + ch, true);
  }

  function backspace() {
    if (!currentValue) {
      return;
    }
    setQuery(currentValue.slice(0, -1), true);
  }

  function clearAll() {
    if (!currentValue) {
      return;
    }
    setQuery("", true);
  }

  function focusCurrentTarget() {
    if (!isOpenState) {
      return;
    }
    if (activeSection === "actions") {
      const target = actionButtons[Math.max(0, Math.min(actionButtons.length - 1, actionCol))];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "grid") {
      const r = Math.max(0, Math.min(gridButtons.length - 1, gridRow));
      const c = Math.max(0, Math.min(gridButtons[r].length - 1, gridCol));
      gridRow = r;
      gridCol = c;
      const target = gridButtons[r][c];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "tags") {
      const target = tagButtons[Math.max(0, Math.min(tagButtons.length - 1, tagIndex))];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "footer") {
      submitBtn.focus({ preventScroll: true });
    }
  }

  function open(initialValue, focusKey) {
    if (typeof initialValue === "string") {
      currentValue = initialValue;
      updatePreviewUI();
    }
    isOpenState = true;
    panel.hidden = false;
    panel.classList.add("is-open");
    container.classList.add("is-keyboard-open");
    if (focusKey) {
      activeSection = "grid";
      gridRow = 1; // Row 1: Q W E R T Y U I O P
      gridCol = 0; // 'Q'
      focusCurrentTarget();
    }
  }

  function close() {
    if (!isOpenState) {
      return;
    }
    isOpenState = false;
    panel.classList.remove("is-open");
    panel.hidden = true;
    container.classList.remove("is-keyboard-open");
    if (callbacks && typeof callbacks.onClose === "function") {
      callbacks.onClose();
    }
  }

  function onKeyDown(event, key) {
    if (!isOpenState) {
      return false;
    }

    if (key.isBack || key.isEscape) {
      close();
      return true;
    }

    if (key.isSelect) {
      const active = document.activeElement;
      if (active && panel.contains(active) && typeof active.click === "function") {
        active.click();
        return true;
      }
      focusCurrentTarget();
      return true;
    }

    const dir = key.direction;
    if (!dir) {
      if (event && event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        appendChar(event.key);
        return true;
      }
      if (event && event.key === "Backspace") {
        backspace();
        return true;
      }
      return false;
    }

    if (activeSection === "actions") {
      if (dir === "left") {
        if (actionCol > 0) {
          actionCol -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (actionCol < actionButtons.length - 1) {
          actionCol += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (callbacks && typeof callbacks.onMoveUpToHeader === "function") {
          callbacks.onMoveUpToHeader();
        }
        return true;
      }
      if (dir === "down") {
        activeSection = "grid";
        gridRow = 0;
        gridCol = Math.min(KEY_ROWS[0].length - 1, actionCol * 3 + 1);
        focusCurrentTarget();
        return true;
      }
    } else if (activeSection === "grid") {
      const rowLen = KEY_ROWS[gridRow].length;
      if (dir === "left") {
        if (gridCol > 0) {
          gridCol -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (gridCol < rowLen - 1) {
          gridCol += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (gridRow > 0) {
          const prevLen = KEY_ROWS[gridRow - 1].length;
          const offset = Math.floor((prevLen - rowLen) / 2);
          gridRow -= 1;
          gridCol = Math.max(0, Math.min(prevLen - 1, gridCol + offset));
          focusCurrentTarget();
        } else {
          activeSection = "actions";
          actionCol = Math.min(2, Math.floor((gridCol / rowLen) * 3));
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "down") {
        if (gridRow < KEY_ROWS.length - 1) {
          const nextLen = KEY_ROWS[gridRow + 1].length;
          const offset = Math.floor((rowLen - nextLen) / 2);
          gridRow += 1;
          gridCol = Math.max(0, Math.min(nextLen - 1, gridCol - offset));
          focusCurrentTarget();
        } else {
          activeSection = "tags";
          tagIndex = Math.min(2, Math.floor((gridCol / rowLen) * 3));
          focusCurrentTarget();
        }
        return true;
      }
    } else if (activeSection === "tags") {
      const tagCols = 3;
      const tRow = Math.floor(tagIndex / tagCols);
      const tCol = tagIndex % tagCols;

      if (dir === "left") {
        if (tCol > 0) {
          tagIndex -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (tCol < tagCols - 1 && tagIndex + 1 < tagButtons.length) {
          tagIndex += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (tRow > 0) {
          tagIndex -= tagCols;
          focusCurrentTarget();
        } else {
          activeSection = "grid";
          gridRow = KEY_ROWS.length - 1;
          const bottomRowLen = KEY_ROWS[gridRow].length;
          gridCol = Math.min(bottomRowLen - 1, tCol * 2 + 1);
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "down") {
        if (tRow === 0 && tagIndex + tagCols < tagButtons.length) {
          tagIndex += tagCols;
          focusCurrentTarget();
        } else {
          activeSection = "footer";
          focusCurrentTarget();
        }
        return true;
      }
    } else if (activeSection === "footer") {
      if (dir === "left") {
        if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "up") {
        activeSection = "tags";
        tagIndex = 3;
        focusCurrentTarget();
        return true;
      }
    }

    return true;
  }

  return {
    element: panel,
    isOpen: function () {
      return isOpenState;
    },
    open,
    close,
    setValue: function (val) {
      setQuery(val, false);
    },
    focusFirstKey: function () {
      if (!isOpenState) {
        open(currentValue, true);
      } else {
        focusCurrentTarget();
      }
    },
    contains: function (el) {
      return Boolean(el && panel.contains(el));
    },
    onKeyDown,
    destroy: function () {
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}
