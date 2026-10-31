import { $ } from './dom';

export function initVideo(reducedMotion: boolean) {
  const video = $<HTMLVideoElement>('.hero__video');
  if (!video) return;
  if (reducedMotion) {
    video.removeAttribute('autoplay');
    video.pause();
    return;
  }
  let userPaused = false;
  video.addEventListener('pause', () => {
    if (!document.hidden && video.dataset.autoPaused !== '1') userPaused = true;
  });
  video.addEventListener('play', () => (userPaused = false));
  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        video.dataset.autoPaused = '0';
        if (!userPaused) void video.play().catch(() => {});
      } else if (!video.paused) {
        video.dataset.autoPaused = '1';
        video.pause();
      }
    },
    { threshold: 0.15 },
  ).observe(video);
}
