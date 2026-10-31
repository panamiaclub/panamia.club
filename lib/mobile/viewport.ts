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
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
  };
}

export function trackNativeViewport(): () => void {
  const root = document.documentElement;
  const properties = ['--native-viewport-height', '--native-viewport-top'];
  const previous = properties.map((name) => root.style.getPropertyValue(name));
  const hadKeyboard = root.hasAttribute('data-native-keyboard');
  const stop = observeVisualViewport(({ height, offsetTop }) => {
    root.style.setProperty(properties[0], `${height}px`);
    root.style.setProperty(properties[1], `${offsetTop}px`);
    root.toggleAttribute(
      'data-native-keyboard',
      window.innerHeight - height - offsetTop > 100
    );
  });

  return () => {
    stop();
    properties.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index]);
      else root.style.removeProperty(name);
    });
    root.toggleAttribute('data-native-keyboard', hadKeyboard);
  };
}
