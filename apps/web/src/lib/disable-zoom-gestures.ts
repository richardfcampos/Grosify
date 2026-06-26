// iOS Safari ignora `user-scalable=no` no viewport, então o pinch-zoom e o
// double-tap-zoom ainda passam. Bloqueia os gestos pra a PWA parecer app nativo.
//   - gesturestart/change/end: pinch (eventos proprietários do WebKit)
//   - double-tap: dois toques em < 300ms são tratados como zoom; preventDefault mata
export function disableZoomGestures(): void {
  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('gestureend', prevent, { passive: false });

  let lastTouch = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
}
