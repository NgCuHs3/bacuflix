const PLACEHOLDER_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
let observer = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") {
    return observer;
  }
  observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) {
        return;
      }
      const img = entry.target;
      observer.unobserve(img);
      const url = img.dataset.lazySrc;
      if (url) {
        delete img.dataset.lazySrc;
        img.src = url;
      }
    });
  }, { rootMargin: "320px 260px 320px 260px" });
  return observer;
}

// Defers loading of an image until it is near the viewport. Works inside
// horizontally scrolling carousels (unlike native loading="lazy" in some WebViews).
export function lazyLoadImage(img, url) {
  if (!img || !url) {
    return;
  }
  const obs = getObserver();
  if (!obs) {
    img.src = url;
    return;
  }
  if (!img.getAttribute("src")) {
    img.src = PLACEHOLDER_SRC;
  }
  img.dataset.lazySrc = url;
  obs.observe(img);
}

export function cancelLazyImage(img) {
  if (!img) {
    return;
  }
  delete img.dataset.lazySrc;
  if (observer) {
    observer.unobserve(img);
  }
}
