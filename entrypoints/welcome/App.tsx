import { useCallback, useEffect, useRef, useState } from 'react';
import { HIGHLIGHT_CSS } from '@/utils/highlight-styles';
import {
  getChromeAIAvailability,
  downloadChromeAI,
  type ChromeAIAvailability,
} from '@/utils/chrome-ai-setup';
import { affiliateEnabled, BUY_ME_A_COFFEE_URL, SUBSTACK_URL } from '@/utils/affiliate';

type KeyProvider = 'openai' | 'anthropic' | 'google';

/** What the setup card should show */
type SetupState =
  | { kind: 'checking' }
  | { kind: 'ready'; via: 'chrome-ai' | 'byok' }
  | { kind: 'downloadable' }
  | { kind: 'downloading'; fraction: number | null }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string };

async function askBackground<T>(message: object): Promise<T | null> {
  try {
    return (await browser.runtime.sendMessage(message)) as T;
  } catch {
    return null; // service worker still waking up
  }
}

export function App() {
  const [setup, setSetup] = useState<SetupState>({ kind: 'checking' });
  const [keyProvider, setKeyProvider] = useState<KeyProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const downloadingRef = useRef(false);

  /** Work out where setup stands, from the page's view and the background's */
  const refresh = useCallback(async () => {
    if (downloadingRef.current) return;

    const availability: ChromeAIAvailability = await getChromeAIAvailability();
    // Ask the background to re-check too: it is the one that runs detection
    const result = await askBackground<{ active: string | null }>({ type: 'REFRESH_PROVIDERS' });
    const active = result?.active ?? null;

    if (active === 'chrome-ai' || active === 'byok') {
      setSetup({ kind: 'ready', via: active });
    } else if (availability === 'available') {
      setSetup({
        kind: 'failed',
        message:
          "Chrome's AI is downloaded, but the extension could not start it. Restarting Chrome usually fixes this.",
      });
    } else if (availability === 'downloadable') {
      setSetup({ kind: 'downloadable' });
    } else if (availability === 'downloading') {
      setSetup({ kind: 'downloading', fraction: null });
    } else {
      setSetup({ kind: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While Chrome downloads in the background (started elsewhere), keep checking
  useEffect(() => {
    if (setup.kind !== 'downloading' || downloadingRef.current) return;
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [setup.kind, refresh]);

  const handleDownload = async () => {
    downloadingRef.current = true;
    setSetup({ kind: 'downloading', fraction: 0 });
    try {
      await downloadChromeAI((fraction) => setSetup({ kind: 'downloading', fraction }));
      downloadingRef.current = false;
      await refresh();
    } catch (error) {
      downloadingRef.current = false;
      setSetup({
        kind: 'failed',
        message: `The download did not start: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const handleSaveKey = async () => {
    const result = await askBackground<{ active: string | null }>({
      type: 'SAVE_BYOK_CONFIG',
      config: { provider: keyProvider, apiKey: apiKey.trim() },
    });
    setKeySaved(true);
    setApiKey('');
    if (result?.active === 'byok') {
      setSetup({ kind: 'ready', via: 'byok' });
    } else {
      await refresh();
    }
  };

  return (
    <main className="page">
      {/* The same highlight styles the extension injects into real threads */}
      <style>{HIGHLIGHT_CSS}</style>

      <header className="hero">
        <div className="brand">
          <img src="/assets/icons/icon-48.png" alt="" width={28} height={28} />
          Product Detector
        </div>
        <h1>See what a thread actually recommends.</h1>
        <p className="lede">
          Product Detector reads the comments on Reddit, Hacker News and Product Hunt, underlines
          every product people name, and keeps a running tally of who recommends it and who warns
          against it.
        </p>
      </header>

      <Demo />

      <section className="section">
        <h2>One thing to set up: the AI that reads the comments</h2>
        <SetupCard setup={setup} onDownload={handleDownload} onRetry={refresh} />

        <details className="own-key">
          <summary>Use your own API key instead</summary>
          <p>
            If Chrome's built-in AI is not available on your computer, or you want faster results,
            you can use your own OpenAI, Anthropic or Google key. It is stored only in this
            browser. Comment text is then sent to that provider, billed to your account.
          </p>
          <div className="key-form">
            <select
              value={keyProvider}
              onChange={(e) => setKeyProvider(e.target.value as KeyProvider)}
              aria-label="AI provider"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeySaved(false);
              }}
              placeholder="Paste your API key"
              aria-label="API key"
              autoComplete="off"
            />
            <button className="button" onClick={handleSaveKey} disabled={!apiKey.trim()}>
              Save key
            </button>
          </div>
          {keySaved && <p className="saved">Key saved. You can change it any time from the toolbar icon.</p>}
        </details>
      </section>

      <section className="section">
        <h2>What leaves your browser</h2>
        <ul className="plain-list">
          <li>
            <strong>With Chrome's built-in AI (the default): nothing.</strong> Comments are
            analysed on your computer.
          </li>
          <li>
            <strong>With your own API key:</strong> the text of comments on the sites you enabled
            goes straight from your browser to the provider you chose. It never passes through a
            server of ours, because there isn't one.
          </li>
          <li>
            <strong>Product pictures are off</strong> unless you add an image-search key in the
            toolbar popup. If you do, the product's name, its category and the forum topic are
            sent to that image search.
          </li>
          <li>
            No account, no analytics, no tracking. The extension only runs on Reddit, Hacker News,
            Product Hunt and sites you add yourself, one at a time.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>How this is funded</h2>
        <p>
          Product Detector is free. Shopping links open a search only when you click them
          {affiliateEnabled()
            ? ', and Amazon links carry an affiliate tag, which is labelled wherever it appears. '
            : ', and none of them are affiliate links. '}
          Nothing is inserted into the pages you read.
        </p>
        {(BUY_ME_A_COFFEE_URL || SUBSTACK_URL) && (
          <p className="support-links">
            {SUBSTACK_URL && (
              <a href={SUBSTACK_URL} target="_blank" rel="noopener noreferrer">
                Read how it was built
              </a>
            )}
            {BUY_ME_A_COFFEE_URL && (
              <a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noopener noreferrer">
                Buy me a coffee
              </a>
            )}
          </p>
        )}
      </section>

      <footer className="footer">
        You can reopen this page from the Product Detector toolbar icon.
      </footer>
    </main>
  );
}

function SetupCard({
  setup,
  onDownload,
  onRetry,
}: {
  setup: SetupState;
  onDownload: () => void;
  onRetry: () => void;
}) {
  if (setup.kind === 'checking') {
    return (
      <div className="setup-card">
        <p className="setup-title">Checking your browser…</p>
      </div>
    );
  }

  if (setup.kind === 'ready') {
    return (
      <div className="setup-card setup-ready">
        <p className="setup-title">
          <span className="dot dot-ok" /> You're set.
        </p>
        <p>
          {setup.via === 'chrome-ai'
            ? "Chrome's built-in AI is ready, so comments are analysed on your computer."
            : 'Your API key is saved and in use.'}{' '}
          Open a thread with a lot of recommendations and scroll.
        </p>
        <div className="try-links">
          <a className="button" href="https://www.reddit.com/r/BuyItForLife/top/?t=month">
            Try it on Reddit
          </a>
          <a className="button button-quiet" href="https://news.ycombinator.com/">
            Hacker News
          </a>
        </div>
      </div>
    );
  }

  if (setup.kind === 'downloadable') {
    return (
      <div className="setup-card">
        <p className="setup-title">Chrome's built-in AI needs a one-time download</p>
        <p>
          It is free and runs on your computer, so the comments you read never leave it. Chrome
          needs about 22 GB of free disk space to install it, and the download can take a while on
          a slow connection. You can keep browsing meanwhile.
        </p>
        <button className="button" onClick={onDownload}>
          Download Chrome's AI
        </button>
      </div>
    );
  }

  if (setup.kind === 'downloading') {
    const percent = setup.fraction === null ? null : Math.round(setup.fraction * 100);
    return (
      <div className="setup-card">
        <p className="setup-title">
          Downloading Chrome's AI{percent === null ? '…' : `: ${percent}%`}
        </p>
        <div
          className={`progress ${percent === null ? 'progress-unknown' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          <div className="progress-fill" style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <p className="muted">
          Chrome keeps downloading if you close this tab. Product Detector starts working on its
          own once it finishes.
        </p>
      </div>
    );
  }

  if (setup.kind === 'failed') {
    return (
      <div className="setup-card">
        <p className="setup-title">
          <span className="dot dot-warn" /> Not ready yet
        </p>
        <p>{setup.message}</p>
        <button className="button button-quiet" onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="setup-card">
      <p className="setup-title">
        <span className="dot dot-warn" /> Chrome's built-in AI isn't available here
      </p>
      <p>
        It needs a recent desktop Chrome (version 138 or later) on a computer with enough memory
        and disk space. Product Detector still works with your own API key, below.
      </p>
      <button className="button button-quiet" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

/**
 * A static sample of what the extension does on a real thread. No AI runs
 * here, and the products are invented so nobody's real product gets a made-up
 * review.
 */
function Demo() {
  return (
    <section className="demo" aria-label="Sample thread">
      <div className="demo-thread">
        <p className="demo-label">Sample thread · made-up products</p>
        <p className="demo-question">Best quiet keyboard for a shared office?</p>

        <div className="demo-comment">
          <span className="demo-author">marlowe_k</span>
          <p>
            Switched to the <span className="pd-highlight pd-positive">Northwind K2</span> last
            spring and my deskmate stopped complaining. Best purchase of the year.
          </p>
        </div>
        <div className="demo-comment">
          <span className="demo-author">tessellate</span>
          <p>
            Second the <span className="pd-highlight pd-positive">Northwind K2</span>. I returned
            the <span className="pd-highlight pd-negative">Brightkey Mini</span> after a week, the
            spacebar rattles.
          </p>
        </div>
        <div className="demo-comment">
          <span className="demo-author">oddparity</span>
          <p>
            Has anyone compared it with the <span className="pd-highlight">Halcyon Tide 65</span>?
            Same price where I live.
          </p>
        </div>
      </div>

      <div className="demo-summary">
        <p className="demo-label">What this thread recommends</p>
        <div className="demo-pick">
          <span className="demo-pick-tag">Top pick</span>
          <strong>Northwind K2</strong>
          <span className="muted">Recommended in 2 of 2 comments</span>
        </div>
        <DemoRow name="Northwind K2" verdict="Recommended" positive={2} negative={0} neutral={0} />
        <DemoRow name="Brightkey Mini" verdict="Warned against" positive={0} negative={1} neutral={0} />
        <DemoRow name="Halcyon Tide 65" verdict="Mentioned" positive={0} negative={0} neutral={1} />
        <p className="demo-legend">
          <span className="pd-highlight pd-positive">recommended</span>{' '}
          <span className="pd-highlight pd-negative">warned against</span>{' '}
          <span className="pd-highlight">just mentioned</span>
        </p>
      </div>
    </section>
  );
}

function DemoRow({
  name,
  verdict,
  positive,
  negative,
  neutral,
}: {
  name: string;
  verdict: string;
  positive: number;
  negative: number;
  neutral: number;
}) {
  return (
    <div className="demo-row">
      <div className="demo-row-head">
        <span>{name}</span>
        <span className="muted">{verdict}</span>
      </div>
      <div className="bar" aria-hidden="true">
        {positive > 0 && <span className="bar-pos" style={{ flexGrow: positive }} />}
        {neutral > 0 && <span className="bar-neu" style={{ flexGrow: neutral }} />}
        {negative > 0 && <span className="bar-neg" style={{ flexGrow: negative }} />}
      </div>
    </div>
  );
}
