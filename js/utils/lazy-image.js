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
  }, { rootMargin: "400px 800px 400px 800px" });
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
