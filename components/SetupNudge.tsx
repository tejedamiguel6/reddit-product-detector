/**
 * A small, one-off prompt shown when a page has comments worth analysing but
 * no AI is ready. Without it a new user sees nothing happen at all.
 *
 * Deliberately quiet: at most once a day, and "Don't show again" is permanent.
 */

import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { onNoProvider } from '@/utils/product-detector';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function SetupNudge() {
  const portalTarget = useContext(PortalTargetContext);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let asked = false;
    const unsubscribe = onNoProvider(async () => {
      if (asked) return; // once per page load
      asked = true;
      try {
        const stored = (await browser.storage.local.get([
          'setupNudgeDismissed',
          'setupNudgeLastShown',
        ])) as { setupNudgeDismissed?: boolean; setupNudgeLastShown?: number };
        if (stored.setupNudgeDismissed) return;
        if (stored.setupNudgeLastShown && Date.now() - stored.setupNudgeLastShown < ONE_DAY_MS) {
          return;
        }
        await browser.storage.local.set({ setupNudgeLastShown: Date.now() });
        setVisible(true);
      } catch {
        // Extension was reloaded mid-page: nothing useful to show
      }
    });
    return unsubscribe;
  }, []);

  if (!portalTarget || !visible) return null;

  const openSetup = () => {
    browser.runtime.sendMessage({ type: 'OPEN_WELCOME' }).catch(() => {});
    setVisible(false);
  };

  const dismissForGood = () => {
    browser.storage.local.set({ setupNudgeDismissed: true }).catch(() => {});
    setVisible(false);
  };

  return createPortal(
    <div className="pd pd-nudge" role="status">
      <p className="pd-nudge-title">Product Detector isn't reading this page yet</p>
      <p className="pd-nudge-text">
        It needs a one-time setup of the AI that finds products in comments.
      </p>
      <div className="pd-nudge-actions">
        <button className="pd-btn" onClick={openSetup}>
          Finish setup
        </button>
        <button className="pd-btn-quiet" onClick={dismissForGood}>
          Don't show again
        </button>
      </div>
    </div>,
    portalTarget
  );
}
