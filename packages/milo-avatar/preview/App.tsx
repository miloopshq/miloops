import { RECOMMENDED_STYLE, type MiloStyleId } from '../src/milo';
import { WORDMARK } from './content';
import { Banner } from './views/Banner';
import { BrandSquare } from './views/BrandSquare';
import { Demo } from './views/Demo';
import { Favicon } from './views/Favicon';
import { Lockup } from './views/Lockup';
import { Options } from './views/Options';
import { Playground } from './views/Playground';
import { States } from './views/States';

export function App() {
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
  const variant = (q.get('variant') as MiloStyleId) || RECOMMENDED_STYLE;
  if (view === 'options') return <Options />;
  if (view === 'states') return <States variant={variant} />;
  if (view === 'demo') return <Demo variant={variant} />;
  if (view === 'square') return <BrandSquare n={Number(q.get('n') || 512)} />;
  if (view === 'favicon') return <Favicon px={Number(q.get('px') || 64)} />;
  if (view === 'lockup')
    return <Lockup w={Number(q.get('w') || 960)} h={Number(q.get('h') || 240)} wordmark={q.get('wordmark') || WORDMARK} />;
  if (view === 'banner')
    return (
      <Banner
        w={Number(q.get('w') || 1280)}
        h={Number(q.get('h') || 640)}
        layout={(q.get('layout') as 'card' | 'header') || 'card'}
        url={q.get('url') || undefined}
        wordmark={q.get('wordmark') || WORDMARK}
      />
    );
  return <Playground />;
}
