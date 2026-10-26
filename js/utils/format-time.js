export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const formattedSeconds = remainingSeconds < 10 ? "0" + remainingSeconds : String(remainingSeconds);

  if (hours > 0) {
    const formattedMinutes = minutes < 10 ? "0" + minutes : String(minutes);
    return hours + ":" + formattedMinutes + ":" + formattedSeconds;
  }
  return minutes + ":" + formattedSeconds;
}
