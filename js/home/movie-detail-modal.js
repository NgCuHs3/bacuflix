import { isFavorite, toggleFavorite } from "../services/favorites-service.js";
import { fallbackPoster } from "../config/catalog-sources.js";

function cleanHtmlContent(html) {
  if (!html) {
    return "Chưa có mô tả nội dung cho phim này.";
  }
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "Chưa có mô tả nội dung.";
}

export function createMovieDetailModal(parentContainer, kkphimApi, options) {
  const overlay = document.createElement("div");
  overlay.className = "movie-detail-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Chi tiết phim");

  const modal = document.createElement("div");
  modal.className = "movie-detail-modal";
  overlay.appendChild(modal);

  let disposed = false;
  let currentMovie = null;
  let detailData = null;
  let activeServerIndex = 0;
  let focusableElements = [];
  let currentFocusIndex = 0;

  function updateFocusables() {
    focusableElements = Array.from(modal.querySelectorAll('button:not([disabled]), [tabindex="0"]'));
  }

  function setFocus(index) {
    updateFocusables();
    if (!focusableElements.length) {
      return;
    }
    currentFocusIndex = Math.max(0, Math.min(focusableElements.length - 1, index));
    focusableElements[currentFocusIndex].focus();
  }

  function renderLoading(movie) {
    modal.innerHTML = "" +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-loading">' +
        '<div class="loader-spinner" aria-hidden="true">' +
          '<svg class="spinner-svg" viewBox="0 0 50 50">' +
            '<circle class="spinner-track" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
            '<circle class="spinner-circle" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
          '</svg>' +
        '</div>' +
        '<p class="movie-detail-loading-text">Đang tải thông tin phim "' + (movie.title || "") + '"...</p>' +
      '</div>';

    const closeBtn = modal.querySelector(".movie-detail-close");
    closeBtn.addEventListener("click", close);
    closeBtn.focus();
  }

  function renderError(message) {
    modal.innerHTML = "" +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-error">' +
        '<p class="movie-detail-error-message">' + (message || "Không thể tải thông tin phim.") + '</p>' +
        '<button type="button" class="movie-detail-btn movie-detail-btn-retry">Thử lại</button>' +
      '</div>';

    const closeBtn = modal.querySelector(".movie-detail-close");
    closeBtn.addEventListener("click", close);
    const retryBtn = modal.querySelector(".movie-detail-btn-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        loadDetail(currentMovie.slug);
      });
      retryBtn.focus();
    }
  }

  function renderDetail(data) {
    detailData = data;
    const movie = data.movie;
    const episodes = data.episodes || [];
    const favActive = isFavorite(movie.slug);

    let badgesHtml = "";
    if (movie.quality) {
      badgesHtml += '<span class="movie-badge badge-quality">' + movie.quality + '</span>';
    }
    if (movie.year) {
      badgesHtml += '<span class="movie-badge badge-year">' + movie.year + '</span>';
    }
    if (movie.lang) {
      badgesHtml += '<span class="movie-badge badge-lang">' + movie.lang + '</span>';
    }
    if (movie.episodeCurrent) {
      badgesHtml += '<span class="movie-badge badge-episode">' + movie.episodeCurrent + '</span>';
    }

    const descText = cleanHtmlContent(movie.content);

    // Server tabs HTML
    let serverTabsHtml = "";
    if (episodes.length > 0) {
      serverTabsHtml = '<div class="movie-detail-servers" role="tablist" aria-label="Danh sách server">';
      episodes.forEach(function (srv, idx) {
        const isActive = idx === activeServerIndex;
        serverTabsHtml += '<button type="button" class="movie-server-tab' + (isActive ? ' is-active' : '') + '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" data-server-index="' + idx + '">' + (srv.server_name || ('Server ' + (idx + 1))) + '</button>';
      });
      serverTabsHtml += '</div>';
    }

    // Episode list HTML
    const currentServer = episodes[activeServerIndex] || episodes[0];
    const serverData = (currentServer && Array.isArray(currentServer.server_data)) ? currentServer.server_data : [];

    let episodesHtml = "";
    if (serverData.length > 0) {
      episodesHtml = '<div class="movie-detail-episodes-grid" role="group" aria-label="Danh sách tập">';
      serverData.forEach(function (ep, epIdx) {
        episodesHtml += '<button type="button" class="movie-episode-btn" data-ep-index="' + epIdx + '" data-m3u8="' + (ep.link_m3u8 || '') + '" data-embed="' + (ep.link_embed || '') + '" data-ep-name="' + (ep.name || '') + '">' + (ep.name || ('Tập ' + (epIdx + 1))) + '</button>';
      });
      episodesHtml += '</div>';
    } else {
      episodesHtml = '<p class="movie-episodes-empty">Chưa có tập phim nào trên server này.</p>';
    }

    modal.innerHTML = "" +
      '<div class="movie-detail-backdrop">' +
        '<img class="movie-backdrop-img" src="' + (movie.poster || fallbackPoster) + '" alt="" aria-hidden="true">' +
        '<div class="movie-backdrop-gradient"></div>' +
      '</div>' +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-body">' +
        '<div class="movie-detail-poster-wrap">' +
          '<img class="movie-detail-poster" src="' + (movie.poster || fallbackPoster) + '" alt="' + (movie.title || '') + '">' +
        '</div>' +
        '<div class="movie-detail-info">' +
          '<h1 class="movie-detail-title">' + (movie.title || '') + '</h1>' +
          (movie.originTitle ? '<h2 class="movie-detail-origin">' + movie.originTitle + '</h2>' : '') +
          '<div class="movie-detail-badges">' + badgesHtml + '</div>' +
          '<p class="movie-detail-desc">' + descText + '</p>' +
          '<div class="movie-detail-actions">' +
            '<button type="button" class="movie-detail-btn movie-detail-fav-btn' + (favActive ? ' is-favorite' : '') + '" aria-pressed="' + (favActive ? 'true' : 'false') + '">' +
              '<span class="fav-icon">' + (favActive ? '♥' : '♡') + '</span> ' +
              '<span class="fav-label">' + (favActive ? 'Đã yêu thích' : 'Thêm vào yêu thích') + '</span>' +
            '</button>' +
          '</div>' +
          '<div class="movie-detail-section-title">Chọn tập phim:</div>' +
          serverTabsHtml +
          '<div class="movie-episodes-container">' + episodesHtml + '</div>' +
        '</div>' +
      '</div>';

    // Bind Close
    const closeBtn = modal.querySelector(".movie-detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }

    // Bind Favorite toggle
    const favBtn = modal.querySelector(".movie-detail-fav-btn");
    if (favBtn) {
      favBtn.addEventListener("click", function () {
        const nowFav = toggleFavorite(movie);
        favBtn.classList.toggle("is-favorite", nowFav);
        favBtn.setAttribute("aria-pressed", nowFav ? "true" : "false");
        const iconSpan = favBtn.querySelector(".fav-icon");
        const labelSpan = favBtn.querySelector(".fav-label");
        if (iconSpan) {
          iconSpan.textContent = nowFav ? "♥" : "♡";
        }
        if (labelSpan) {
          labelSpan.textContent = nowFav ? "Đã yêu thích" : "Thêm vào yêu thích";
        }
        if (options && typeof options.onFavoritesChanged === "function") {
          options.onFavoritesChanged(movie, nowFav);
        }
      });
    }

    // Bind Server tabs
    const serverTabs = modal.querySelectorAll(".movie-server-tab");
    serverTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const newIdx = parseInt(tab.dataset.serverIndex, 10);
        if (newIdx !== activeServerIndex) {
          activeServerIndex = newIdx;
          renderDetail(detailData);
        }
      });
    });

    // Bind Episode buttons
    const episodeBtns = modal.querySelectorAll(".movie-episode-btn");
    episodeBtns.forEach(function (epBtn) {
      epBtn.addEventListener("click", function () {
        const epIndex = parseInt(epBtn.dataset.epIndex, 10);
        const epObj = serverData[epIndex];
        if (!epObj) {
          return;
        }
        const m3u8Url = epObj.link_m3u8 || epObj.link_embed;
        if (!m3u8Url) {
          alert("Tập phim này hiện không có đường dẫn phát.");
          return;
        }

        const serverName = currentServer ? currentServer.server_name : "Vietsub";
        const playbackMovie = {
          id: movie.slug + "-" + (epObj.slug || epIndex),
          slug: movie.slug,
          seriesTitle: movie.title,
          episodeName: epObj.name,
          title: movie.title + " - " + epObj.name,
          poster: movie.poster,
          m3u8: m3u8Url,
          fallbackEmbed: epObj.link_embed || "",
          playbackEnabled: true,
          source: "KKPhim · " + serverName,
          episodesList: serverData.map(function (item, idx) {
            return {
              index: idx,
              name: item.name,
              slug: item.slug || String(idx),
              m3u8: item.link_m3u8 || item.link_embed,
              fallbackEmbed: item.link_embed || ""
            };
          }),
          currentEpisodeIndex: epIndex,
          serverName: serverName
        };

        close();
        if (options && typeof options.onSelectEpisode === "function") {
          options.onSelectEpisode(playbackMovie);
        }
      });
    });

    // Set initial focus: first episode button, or favorite button if no episodes
    const firstEp = modal.querySelector(".movie-episode-btn");
    if (firstEp) {
      firstEp.focus();
    } else if (favBtn) {
      favBtn.focus();
    } else if (closeBtn) {
      closeBtn.focus();
    }
  }

  function loadDetail(slug) {
    renderLoading(currentMovie);
    kkphimApi.getMovieDetail(slug).then(function (data) {
      if (disposed) {
        return;
      }
      renderDetail(data);
    }).catch(function (error) {
      if (disposed) {
        return;
      }
      renderError(error.message || "Không thể tải thông tin chi tiết phim.");
    });
  }

  function open(movie) {
    currentMovie = movie;
    activeServerIndex = 0;
    detailData = null;
    parentContainer.appendChild(overlay);
    loadDetail(movie.slug);
  }

  function close() {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (options && typeof options.onClose === "function") {
      options.onClose();
    }
  }

  function onKeyDown(event, key) {
    if (key.isBack || key.isEscape) {
      close();
      return true;
    }

    if (key.direction === "left" || key.direction === "right" || key.direction === "up" || key.direction === "down") {
      updateFocusables();
      if (!focusableElements.length) {
        return true;
      }
      const activeEl = document.activeElement;
      let currentIndex = focusableElements.indexOf(activeEl);
      if (currentIndex === -1) {
        setFocus(0);
        return true;
      }

      // If on close button
      const closeBtn = modal.querySelector(".movie-detail-close");
      const favBtn = modal.querySelector(".movie-detail-fav-btn");
      const serverTabs = Array.from(modal.querySelectorAll(".movie-server-tab"));
      const episodeBtns = Array.from(modal.querySelectorAll(".movie-episode-btn"));
      const epContainer = modal.querySelector(".movie-episodes-container");

      function ensureEpVisible(btn) {
        if (!btn || !epContainer) return;
        const cRect = epContainer.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        if (bRect.top < cRect.top) {
          epContainer.scrollTop -= (cRect.top - bRect.top + 10);
        } else if (bRect.bottom > cRect.bottom) {
          epContainer.scrollTop += (bRect.bottom - cRect.bottom + 10);
        }
      }

      function getGridCols() {
        if (episodeBtns.length < 2) return 1;
        const firstTop = episodeBtns[0].offsetTop;
        for (let i = 1; i < episodeBtns.length; i++) {
          if (episodeBtns[i].offsetTop > firstTop) {
            return i;
          }
        }
        return episodeBtns.length;
      }

      if (key.direction === "down") {
        if (activeEl === closeBtn || activeEl === favBtn) {
          if (serverTabs.length > 0) {
            serverTabs[0].focus();
          } else if (episodeBtns.length > 0) {
            episodeBtns[0].focus();
            ensureEpVisible(episodeBtns[0]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          if (episodeBtns.length > 0) {
            episodeBtns[0].focus();
            ensureEpVisible(episodeBtns[0]);
          }
          return true;
        } else if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          const cols = getGridCols();
          let nextIdx = epIdx + cols;
          if (nextIdx >= episodeBtns.length) {
            const currentRow = Math.floor(epIdx / cols);
            const maxRow = Math.floor((episodeBtns.length - 1) / cols);
            if (currentRow < maxRow) {
              nextIdx = episodeBtns.length - 1;
            } else {
              return true;
            }
          }
          episodeBtns[nextIdx].focus();
          ensureEpVisible(episodeBtns[nextIdx]);
          return true;
        }
      } else if (key.direction === "up") {
        if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          const cols = getGridCols();
          const nextIdx = epIdx - cols;
          if (nextIdx >= 0) {
            episodeBtns[nextIdx].focus();
            ensureEpVisible(episodeBtns[nextIdx]);
          } else if (serverTabs.length > 0) {
            serverTabs[Math.min(activeServerIndex, serverTabs.length - 1)].focus();
          } else if (favBtn) {
            favBtn.focus();
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          if (favBtn) {
            favBtn.focus();
          } else if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        } else if (activeEl === favBtn) {
          if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        }
      } else if (key.direction === "left") {
        if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          if (epIdx > 0) {
            episodeBtns[epIdx - 1].focus();
            ensureEpVisible(episodeBtns[epIdx - 1]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          const sIdx = serverTabs.indexOf(activeEl);
          if (sIdx > 0) {
            serverTabs[sIdx - 1].focus();
          }
          return true;
        } else {
          const delta = -1;
          const nextIdx = currentIndex + delta;
          if (nextIdx >= 0 && nextIdx < focusableElements.length) {
            focusableElements[nextIdx].focus();
          }
          return true;
        }
      } else if (key.direction === "right") {
        if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          if (epIdx < episodeBtns.length - 1) {
            episodeBtns[epIdx + 1].focus();
            ensureEpVisible(episodeBtns[epIdx + 1]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          const sIdx = serverTabs.indexOf(activeEl);
          if (sIdx < serverTabs.length - 1) {
            serverTabs[sIdx + 1].focus();
          }
          return true;
        } else {
          const delta = 1;
          const nextIdx = currentIndex + delta;
          if (nextIdx >= 0 && nextIdx < focusableElements.length) {
            focusableElements[nextIdx].focus();
          }
          return true;
        }
      }
    }

    if (key.isSelect) {
      const activeEl = document.activeElement;
      if (activeEl && typeof activeEl.click === "function") {
        activeEl.click();
        return true;
      }
    }

    return false;
  }

  function destroy() {
    disposed = true;
    close();
  }

  return {
    open: open,
    close: close,
    isOpen: function () {
      return Boolean(overlay.parentNode);
    },
    onKeyDown: onKeyDown,
    destroy: destroy
  };
}
