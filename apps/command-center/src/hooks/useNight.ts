import { useEffect, useState } from 'react';

const isNight = () => {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'night' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Whether the night theme is showing, from the Appearance setting or the OS. */
export function useNight() {
  const [night, setNight] = useState(isNight);
  useEffect(() => {
    const update = () => setNight(isNight());
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return night;
}
