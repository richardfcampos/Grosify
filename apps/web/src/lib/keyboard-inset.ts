// Mede o teclado virtual via VisualViewport e expõe no <html>:
//   --kb  = altura do teclado (px)  → as folhas (bottom sheet) sobem acima dele
//   --vvh = altura visível (px)     → as folhas limitam a altura à área visível
// iOS Safari não reposiciona elementos `position: fixed` quando o teclado abre — o
// teclado cobre a folha e some com o campo de busca. Isto resolve via CSS vars.
export function trackKeyboardInset(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', `${kb}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
