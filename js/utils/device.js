export function detectDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "desktop";
  }
  const ua = navigator.userAgent || "";

  // 1. Smart TV detection (Samsung Tizen, LG webOS, Android TV, etc.)
  const isTV = Boolean(
    window.tizen ||
    window.webOS ||
    /SmartTV|Tizen|webOS|HbbTV|NetCast|BRAVIA|Viera|AppleTV|Roku|LargeScreen|GoogleTV|AndroidTV/i.test(ua)
  );
  if (isTV) {
    return "tv";
  }

  // 2. Mobile / Phone detection (Android, iOS, mobile user agents or touch screens under 1024px)
  const isMobile = Boolean(
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua) ||
    (('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) &&
      window.matchMedia && window.matchMedia("(max-width: 1024px)").matches)
  );
  if (isMobile) {
    return "mobile";
  }

  // 3. Desktop / PC
  return "desktop";
}

export const currentDevice = detectDevice();
