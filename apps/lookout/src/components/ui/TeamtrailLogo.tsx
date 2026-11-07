import { Logo } from '@teamtrail/scout-avatar';

/** The Teamtrail logo mark, beside the wordmark. */
export function TeamtrailLogo({ size = 40, className }: { size?: number; className?: string }) {
  return <Logo size={size} className={className} />;
}
