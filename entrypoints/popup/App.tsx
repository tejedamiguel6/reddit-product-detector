import { debug } from '@/utils/log';
import { useEffect, useState } from 'react';
import {
  getSites,
  addSite,
  removeSite,
  toggleSite,
  type SiteConfig,
} from '@/utils/site-settings';
import { BUY_ME_A_COFFEE_URL } from '@/utils/affiliate';
import {
  requestSiteAccess,
  registerSiteScript,
  unregisterSiteScript,
  releaseSiteAccess,
} from '@/utils/dynamic-sites';

type ProviderStatus = {
  available: boolean;
  status: string;
  message?: string;
};

/** What the content script reports about the page in the current tab */
type PageSummary = {
  productCount: number;
  commentsRead: number;
  topPick: string | null;
};

type BYOKConfig = {
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: string;
  model?: string;
};

export function App() {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSite, setNewSite] = useState('');
  const [currentHostname, setCurrentHostname] = useState<string | null>(null);

  // Provider state
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [byokProvider, setBYOKProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [byokKey, setBYOKKey] = useState('');
  const [byokModel, setBYOKModel] = useState('');
  const [byokSaved, setBYOKSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chromeAIDownloading, setChromeAIDownloading] = useState(false);
  const [serperKey, setSerperKey] = useState('');
  const [serperSaved, setSerperSaved] = useState(false);
  const [pageSummary, setPageSummary] = useState<PageSummary | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Load each independently so one failure doesn't block the rest
        const [loadedSites, tabs] = await Promise.all([
          getSites(),
          browser.tabs.query({ active: true, currentWindow: true }),
        ]);
        setSites(loadedSites);
        if (tabs[0]?.url) {
          try {
            setCurrentHostname(new URL(tabs[0].url).hostname);
          } catch { /* Invalid URL */ }
        }

        // What has been found on this page (no answer = not running here)
        if (tabs[0]?.id) {
          browser.tabs
            .sendMessage(tabs[0].id, { type: 'GET_PAGE_SUMMARY' })
            .then((summary) => setPageSummary((summary as PageSummary) ?? null))
            .catch(() => setPageSummary(null));
        }

        // Provider status — may fail if service worker is waking up
        try {
          const providerResult = await browser.runtime.sendMessage({ type: 'GET_PROVIDER_STATUS' });
          debug('[Popup] Provider result:', JSON.stringify(providerResult));
          if (providerResult) {
            const pr = providerResult as { active: string | null; statuses: Record<string, ProviderStatus> };
            setActiveProvider(pr.active);
            setStatuses(pr.statuses || {});
          }
        } catch (err) {
          console.warn('[Popup] Could not get provider status:', err);
        }

        // BYOK config from storage
        try {
          const stored = await browser.storage.local.get(['byokConfig', 'serperApiKey']) as {
            byokConfig?: BYOKConfig;
            serperApiKey?: string;
          };
          if (stored.byokConfig) {
            setBYOKProvider(stored.byokConfig.provider || 'openai');
            setBYOKKey(stored.byokConfig.apiKey || '');
            setBYOKModel(stored.byokConfig.model || '');
          }
          if (stored.serperApiKey) {
            setSerperKey(stored.serperApiKey);
          }
        } catch (err) {
          console.warn('[Popup] Could not load config:', err);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ─── Provider actions ──────────────────────────────────

  const handleSetProvider = async (providerId: string) => {
    const result = await browser.runtime.sendMessage({
      type: 'SET_PROVIDER',
      providerId,
    });
    if (result?.active) {
      setActiveProvider(result.active);
    }
  };

  const handleSaveBYOK = async () => {
    const config: BYOKConfig = {
      provider: byokProvider,
      apiKey: byokKey.trim(),
      model: byokModel.trim() || undefined,
    };

    const result = await browser.runtime.sendMessage({
      type: 'SAVE_BYOK_CONFIG',
      config,
    });

    if (result?.active) {
      setActiveProvider(result.active);
    }

    // Re-fetch statuses
    const statusResult = await browser.runtime.sendMessage({
      type: 'GET_PROVIDER_STATUS',
    });
    if (statusResult) {
      setStatuses(statusResult.statuses || {});
    }

    setBYOKSaved(true);
    setTimeout(() => setBYOKSaved(false), 2000);
  };

  const handleDownloadChromeAI = async () => {
    setChromeAIDownloading(true);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'TRIGGER_CHROME_AI_DOWNLOAD',
      }) as { status: ProviderStatus; active: string | null };

      if (result?.active) {
        setActiveProvider(result.active);
      }
      if (result?.status) {
        setStatuses((prev) => ({ ...prev, 'chrome-ai': result.status }));
      }
    } catch (err) {
      console.error('[Popup] Chrome AI download failed:', err);
    } finally {
      setChromeAIDownloading(false);
    }
  };

  const handleSaveSerper = async () => {
    await browser.storage.local.set({ serperApiKey: serperKey.trim() });
    setSerperSaved(true);
    setTimeout(() => setSerperSaved(false), 2000);
  };

  // ─── Site actions ──────────────────────────────────────

  const handleToggleSite = async (hostname: string) => {
    const updated = await toggleSite(hostname);
    setSites(updated);
    notifyTabs();
  };

  /** Hostnames covered by the manifest's default host permissions */
  const isDefaultSite = (hostname: string) =>
    hostname === 'reddit.com' ||
    hostname.endsWith('.reddit.com') ||
    hostname === 'news.ycombinator.com' ||
    hostname === 'producthunt.com' ||
    hostname.endsWith('.producthunt.com');

  /**
   * For non-default sites: ask the user to grant access to that specific
   * origin (Chrome shows a one-time prompt) and register the content script.
   * Returns false if the user declined.
   */
  const ensureSiteAccess = async (hostname: string): Promise<boolean> => {
    if (isDefaultSite(hostname)) return true;
    const granted = await requestSiteAccess(hostname);
    if (!granted) return false;
    await registerSiteScript(hostname);
    return true;
  };

  const handleAddSite = async () => {
    if (!newSite.trim()) return;

    let hostname = newSite.trim().toLowerCase();
    hostname = hostname.replace(/^https?:\/\//, '');
    hostname = hostname.split('/')[0];

    if (!(await ensureSiteAccess(hostname))) return;

    const updated = await addSite(hostname);
    setSites(updated);
    setNewSite('');
    notifyTabs();
  };

  const handleAddCurrentSite = async () => {
    if (!currentHostname) return;
    if (!(await ensureSiteAccess(currentHostname))) return;
    const updated = await addSite(currentHostname);
    setSites(updated);
    notifyTabs();
  };

  const handleRemoveSite = async (hostname: string) => {
    const updated = await removeSite(hostname);
    setSites(updated);
    if (!isDefaultSite(hostname)) {
      await unregisterSiteScript(hostname);
      await releaseSiteAccess(hostname);
    }
    notifyTabs();
  };

  const notifyTabs = () => {
    browser.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, { type: 'SITES_UPDATED' }).catch(() => {});
        }
      }
    });
  };

  const isCurrentSiteAdded = currentHostname
    ? sites.some(s => s.hostname === currentHostname)
    : false;

  // ─── Status helpers ────────────────────────────────────

  const getStatusDot = (providerId: string) => {
    if (activeProvider === providerId) return 'dot-active';
    const s = statuses[providerId];
    if (!s) return 'dot-unknown';
    if (s.available) return 'dot-available';
    if (s.status === 'downloadable') return 'dot-downloadable';
    if (s.status === 'downloading') return 'dot-downloading';
    return 'dot-unavailable';
  };

  const getStatusLabel = (providerId: string) => {
    if (activeProvider === providerId) return 'Active';
    const s = statuses[providerId];
    if (!s) return 'Unknown';
    if (s.status === 'ready') return 'Available';
    if (s.status === 'downloadable') return 'Download available';
    if (s.status === 'downloading') return 'Downloading...';
    if (s.status === 'not_configured') return 'Not configured';
    if (s.status === 'not_available') return 'Not available';
    if (s.status === 'error') return 'Error';
    return s.status;
  };

  const openWelcome = () => {
    browser.runtime.sendMessage({ type: 'OPEN_WELCOME' }).catch(() => {});
    window.close();
  };

  /** The one thing worth knowing first: is it working on this page? */
  const getPageStatus = (): {
    dot: string;
    title: string;
    detail: string;
    needsSetup?: boolean;
  } => {
    if (!activeProvider) {
      return {
        dot: 'dot-downloadable',
        title: 'Needs a one-time setup',
        detail: "The AI that reads comments isn't ready yet.",
        needsSetup: true,
      };
    }
    const site = currentHostname ? sites.find((s) => s.hostname === currentHostname) : undefined;
    if (!site?.enabled) {
      return {
        dot: 'dot-available',
        title: 'Not active on this site',
        detail: currentHostname
          ? 'Add or switch on this site below to find products here.'
          : 'Open a Reddit or Hacker News thread to use it.',
      };
    }
    if (!pageSummary) {
      return {
        dot: 'dot-active',
        title: 'Active on this site',
        detail: "Reload the page if you don't see anything underlined.",
      };
    }
    const comments = `${pageSummary.commentsRead} comment${pageSummary.commentsRead === 1 ? '' : 's'}`;
    if (pageSummary.productCount === 0) {
      return {
        dot: 'dot-active',
        title: 'Reading this page',
        detail:
          pageSummary.commentsRead > 0
            ? `No products in the ${comments} read so far.`
            : 'Scroll through the comments to start.',
      };
    }
    return {
      dot: 'dot-active',
      title: `${pageSummary.productCount} product${pageSummary.productCount === 1 ? '' : 's'} found on this page`,
      detail: pageSummary.topPick
        ? `Top pick: ${pageSummary.topPick}. From ${comments} read.`
        : `From ${comments} read so far.`,
    };
  };

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <h1>Product Detector</h1>
      <p className="description">See what a thread actually recommends.</p>

      {/* Status for the page in this tab */}
      {(() => {
        const status = getPageStatus();
        return (
          <div className="status-card">
            <span className={`status-dot ${status.dot}`} />
            <div>
              <div className="status-title">{status.title}</div>
              <div className="status-detail">{status.detail}</div>
              {status.needsSetup && (
                <button type="button" className="status-action" onClick={openWelcome}>
                  Finish setup
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Provider status bar */}
      <div className="provider-bar" onClick={() => setShowSettings(!showSettings)}>
        <div className="provider-bar-left">
          <span className={`status-dot ${getStatusDot(activeProvider || '')}`} />
          <span className="provider-bar-label">
            {activeProvider === 'chrome-ai'
              ? "AI: Chrome's built-in, on your device"
              : activeProvider === 'byok'
                ? 'AI: your API key'
                : 'AI: not set up'}
          </span>
        </div>
        <span className="provider-bar-toggle">{showSettings ? '▲' : '▼'}</span>
      </div>

      {/* Provider settings (collapsible) */}
      {showSettings && (
        <div className="provider-settings">
          {/* Chrome AI option */}
          <div
            className={`provider-option ${activeProvider === 'chrome-ai' ? 'provider-active' : ''}`}
            onClick={() => statuses['chrome-ai']?.available && handleSetProvider('chrome-ai')}
          >
            <div className="provider-option-header">
              <span className={`status-dot ${getStatusDot('chrome-ai')}`} />
              <span className="provider-option-name">Built-in AI</span>
              <span className="provider-option-badge">{getStatusLabel('chrome-ai')}</span>
            </div>
            <p className="provider-option-desc">
              {statuses['chrome-ai']?.message || 'Free, on-device detection using Chrome AI.'}
            </p>
            {statuses['chrome-ai']?.status === 'downloadable' && (
              <button
                className="btn-download-chrome-ai"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadChromeAI();
                }}
                disabled={chromeAIDownloading}
              >
                {chromeAIDownloading ? 'Starting download...' : 'Download & Enable (Free)'}
              </button>
            )}
            {statuses['chrome-ai']?.status === 'downloading' && (
              <div className="chrome-ai-progress">
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" />
                </div>
                <span className="progress-text">Downloading model...</span>
              </div>
            )}
          </div>

          {/* BYOK option */}
          <div
            className={`provider-option ${activeProvider === 'byok' ? 'provider-active' : ''}`}
          >
            <div
              className="provider-option-header"
              onClick={() => statuses['byok']?.available && handleSetProvider('byok')}
            >
              <span className={`status-dot ${getStatusDot('byok')}`} />
              <span className="provider-option-name">Your API Key</span>
              <span className="provider-option-badge">{getStatusLabel('byok')}</span>
            </div>

            {/* BYOK config form */}
            <div className="byok-form">
              <select
                className="byok-select"
                value={byokProvider}
                onChange={(e) => setBYOKProvider(e.target.value as BYOKConfig['provider'])}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
              </select>
              <input
                type="password"
                className="byok-input"
                value={byokKey}
                onChange={(e) => setBYOKKey(e.target.value)}
                placeholder="API Key"
              />
              <input
                type="text"
                className="byok-input"
                value={byokModel}
                onChange={(e) => setBYOKModel(e.target.value)}
                placeholder="Model (optional)"
              />
              <button
                className="btn-save-byok"
                onClick={handleSaveBYOK}
                disabled={!byokKey.trim()}
              >
                {byokSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>

          <details className="advanced">
            <summary>Advanced: product pictures</summary>
            {/* Image Search (Serper) */}
            <div className="provider-option">
              <div className="provider-option-header">
                <span className={`status-dot ${serperKey.trim() ? 'dot-active' : 'dot-available'}`} />
                <span className="provider-option-name">Product pictures</span>
                <span className="provider-option-badge">
                  {serperKey.trim() ? 'On' : 'Off'}
                </span>
              </div>
              <p className="provider-option-desc">
                Optional. Add a key from serper.dev, an image search service, to show product pictures in hover cards. The product's name, category and forum topic are sent to it.
              </p>
              <div className="byok-form">
                <input
                  type="password"
                  className="byok-input"
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                  placeholder="Serper API Key (serper.dev)"
                />
                <button
                  className="btn-save-byok"
                  onClick={handleSaveSerper}
                  disabled={!serperKey.trim()}
                >
                  {serperSaved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Quick add current site */}
      {currentHostname && !isCurrentSiteAdded && (
        <div className="current-site-banner">
          <span>Add this site?</span>
          <button onClick={handleAddCurrentSite} className="btn-add-current">
            + {currentHostname}
          </button>
        </div>
      )}

      {/* Sites list */}
      <div className="sites-section">
        <h2>Enabled Sites</h2>
        <ul className="sites-list">
          {sites.map(site => (
            <li key={site.hostname} className="site-item">
              <label className="site-toggle">
                <input
                  type="checkbox"
                  checked={site.enabled}
                  onChange={() => handleToggleSite(site.hostname)}
                />
                <span className="site-name">{site.name}</span>
                <span className="site-hostname">{site.hostname}</span>
              </label>
              <button
                onClick={() => handleRemoveSite(site.hostname)}
                className="btn-remove"
                title="Remove site"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Add new site */}
      <div className="add-site-section">
        <input
          type="text"
          value={newSite}
          onChange={(e) => setNewSite(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSite()}
          placeholder="Add site (e.g., forum.example.com)"
          className="input-site"
        />
        <button onClick={handleAddSite} className="btn-add" disabled={!newSite.trim()}>
          Add
        </button>
      </div>

      <p className="hint">
        Underlines: solid green = recommended, dashed red = warned against, dotted grey = just mentioned.
      </p>

      <div className="footer-links">
        <button type="button" className="link-button" onClick={openWelcome}>
          Setup and privacy
        </button>
        {BUY_ME_A_COFFEE_URL && (
          <a
            className="link-button"
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy me a coffee
          </a>
        )}
      </div>
    </div>
  );
}
