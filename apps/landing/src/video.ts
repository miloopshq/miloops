import { $$ } from './dom';

/** Muted loops without controls: play while on screen, pause off screen; reduced motion keeps the poster. */
export function initVideo(reducedMotion: boolean) {
  for (const video of $$<HTMLVideoElement>('video[data-loop]')) {
    if (reducedMotion) {
      video.removeAttribute('autoplay');
      video.pause();
      continue;
    }
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    ).observe(video);
  }
}
