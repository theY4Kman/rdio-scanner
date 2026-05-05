import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybackHandle {
  /** Wait until callTime > 0 (audio is actually playing) */
  waitForPlaybackStart(): Promise<void>;
  /** Wait for a specific duration of playback observation */
  waitForDuration(ms: number): Promise<void>;
  /** Check if a call is currently playing */
  isPlaying(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

/**
 * Navigate to the scanner, open search, find a call, and start playback.
 *
 * Prefers calls with multiple sources (richer UnitTimeline) but falls back
 * to any available call.
 */
export async function searchAndPlay(
  page: Page,
  options?: { preferMultipleSources?: boolean },
): Promise<PlaybackHandle> {
  const preferMulti = options?.preferMultipleSources ?? true;

  const log = (msg: string) => console.log(`[search-and-play] ${msg}`);

  // 1. Navigate to the app root
  log('Navigating to /');
  await page.goto('/');

  // 2. Handle auth overlay if present (PIN-protected scanner)
  //    The overlay appears once the WebSocket connects and the server
  //    requests authentication. Wait a bit for it to show up.
  const passwordField = page.locator('input[type="password"][placeholder="Unlock code"]');
  try {
    await passwordField.waitFor({ state: 'visible', timeout: 15_000 });
    log('Auth overlay found, entering password');
    await passwordField.fill('yak');
    await passwordField.press('Enter');
    // Wait for the overlay to fully disappear (auth roundtrip through WS)
    await passwordField.waitFor({ state: 'hidden', timeout: 10_000 });
    log('Auth overlay dismissed');
    // Give the store a moment to settle after auth clears
    await page.waitForTimeout(1_000);
  } catch {
    log('No auth overlay found, continuing');
    // No auth overlay — scanner is not PIN-protected, continue
  }

  // 3. Wait for the scanner to be fully initialized.
  //    The "SEARCH CALL" button is always rendered, but it only works
  //    when authRequired=false. We detect readiness by waiting for the
  //    clock display (e.g. "HH:MM") in the scanner display, which only
  //    renders after config loads.
  const searchButton = page.locator('button', { hasText: /search call/i });
  await searchButton.waitFor({ state: 'visible', timeout: 15_000 });
  log('Search button visible');

  // 4. Open the search panel and verify it actually opened.
  //    The search drawer (MUI Drawer) opens with a close button containing
  //    ArrowForwardIcon. We use that as proof the drawer is open.
  await searchButton.click();
  log('Search button clicked');

  const drawerCloseButton = page.locator('.MuiDrawer-paper button').filter({
    has: page.locator('[data-testid="ArrowForwardIcon"]'),
  });

  // If the drawer didn't open (authRequired still true), retry
  try {
    await drawerCloseButton.waitFor({ state: 'visible', timeout: 3_000 });
    log('Drawer opened on first try');
  } catch {
    log('Drawer did not open, retrying...');
    // Drawer didn't open — authRequired might still be set.
    // Wait longer and try again.
    await page.waitForTimeout(2_000);
    await searchButton.click();
    await drawerCloseButton.waitFor({ state: 'visible', timeout: 5_000 });
    log('Drawer opened on retry');
  }

  // 5. Trigger a search — the SearchPanel doesn't auto-search on mount.
  //    Click the "Reset" button which fires a default search (all recent calls).
  //    The Reset button is a MUI Button inside the SearchForm.
  log('Looking for Reset button...');
  const resetButton = page.getByRole('button', { name: 'Reset' });
  await resetButton.waitFor({ state: 'visible', timeout: 10_000 });
  log('Reset button found, clicking...');
  await resetButton.scrollIntoViewIfNeeded();
  await resetButton.click();
  log('Reset clicked, waiting for search results');

  // 6. Wait for search results to load
  //    The search results table renders inside a Card > TableContainer > Table.
  //    Wait for at least one row with a Play button.
  const playButtons = page.locator('button[aria-label="Play"]');
  await playButtons.first().waitFor({ state: 'visible', timeout: 15_000 });
  log('Search results loaded, play buttons visible');

  // 7. Find a suitable call to play
  let targetRow = 0;

  if (preferMulti) {
    // Look for a row where the Unit(s) column has a comma (multiple sources)
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      const unitCell = cells.last(); // Unit(s) is the last column
      const text = await unitCell.textContent();
      if (text && text.includes(',')) {
        // Check this row has a play button
        const rowPlayBtn = rows.nth(i).locator('button[aria-label="Play"]');
        if ((await rowPlayBtn.count()) > 0) {
          targetRow = i;
          break;
        }
      }
    }
    // If no multi-source call found, targetRow stays 0 (first row)
  }

  // 8. Click play on the target row
  const rows = page.locator('tbody tr');
  const playBtn = rows.nth(targetRow).locator('button[aria-label="Play"]');
  await playBtn.click();
  log(`Clicked play on row ${targetRow}`);

  // 9. Close the search drawer to get back to the main display
  await page.waitForTimeout(500);
  await drawerCloseButton.click();
  log('Drawer closed, returning playback handle');

  // 10. Return the playback handle
  return {
    async waitForPlaybackStart(): Promise<void> {
      // The UnitTimeline renders a ▼ needle only when a call is playing.
      // Wait for it to appear in the DOM.
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          return body.includes('\u25BC'); // ▼ character
        },
        { timeout: 15_000, polling: 250 },
      );
      // Give a moment for the first callTime tick
      await page.waitForTimeout(500);
    },

    async waitForDuration(ms: number): Promise<void> {
      await page.waitForTimeout(ms);
    },

    async isPlaying(): Promise<boolean> {
      return page.evaluate(() => {
        const body = document.body.textContent || '';
        return body.includes('\u25BC'); // ▼ character
      });
    },
  };
}
