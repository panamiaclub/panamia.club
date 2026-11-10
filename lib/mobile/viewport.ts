export function observeVisualViewport(
  onChange: (viewport: VisualViewport) => void
): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  const update = () => {
    // Pinch zoom must not resize the application around the zoomed viewport.
    if (viewport.scale === 1) onChange(viewport);
  };
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}

export function trackNativeViewport(): () => void {
  const root = document.documentElement;
  const properties = ['--native-viewport-height', '--native-viewport-top'];
  const previous = properties.map((name) => root.style.getPropertyValue(name));
  const hadKeyboard = root.hasAttribute('data-native-keyboard');
  let layoutWidth = window.innerWidth;
  let availableHeight = window.innerHeight;
  const update = ({ height, offsetTop }: VisualViewport) => {
    const editing = document.activeElement?.matches(':read-write');
    if (!editing || window.innerWidth !== layoutWidth) {
      layoutWidth = window.innerWidth;
      availableHeight = window.innerHeight;
    } else {
      // WKWebView can shrink innerHeight along with the visual viewport.
      availableHeight = Math.max(availableHeight, window.innerHeight);
    }
    root.style.setProperty(properties[0], `${height}px`);
    root.style.setProperty(properties[1], `${offsetTop}px`);
    root.toggleAttribute(
      'data-native-keyboard',
      availableHeight - height - offsetTop > 100
    );
  };
  const stop = observeVisualViewport(update);
  const onFocus = () => {
    const viewport = window.visualViewport;
    if (viewport?.scale === 1) update(viewport);
  };
  document.addEventListener('focusin', onFocus);

  return () => {
    stop();
    document.removeEventListener('focusin', onFocus);
    properties.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index]);
      else root.style.removeProperty(name);
    });
    root.toggleAttribute('data-native-keyboard', hadKeyboard);
  };
}
