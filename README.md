<p align="center">
  <img src="Brand/peacock-skip-for-safari-icon.svg" width="152" alt="Peacock Skip for Safari logo">
</p>

<h1 align="center">Peacock Skip for Safari</h1>

<p align="center"><strong>Automatic skipping. Zero tracking. Built for Safari.</strong></p>

<p align="center">
  A small macOS extension that keeps Peacock playback moving without sending your viewing activity anywhere.
</p>

<p align="center">
  <a href="https://github.com/foleykyle01/peacock-skip-for-safari/releases/latest/download/Peacock-Skip-for-Safari.dmg"><strong>Download for macOS</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/foleykyle01/peacock-skip-for-safari/releases/latest">Release notes</a>
  &nbsp;·&nbsp;
  <a href="PRIVACY.md">Privacy</a>
</p>

<p align="center">
  <code>macOS 13+</code>&nbsp;&nbsp;<code>Apple silicon + Intel</code>&nbsp;&nbsp;<code>MIT</code>
</p>

---

## Built to stay out of the way

Peacock Skip for Safari handles the repetitive playback controls and then disappears into the browser. Configure it once from the toolbar; the button can be removed afterward without disabling the extension.

| Handles | What it does |
| --- | --- |
| **Intros and recaps** | Activates Peacock's visible skip controls automatically. |
| **Next episode** | Continues when Peacock presents the next-episode prompt. |
| **Ad breaks** | Advances a detected countdown once per ad break when seeking is available, with short standalone ads as a fallback when no timer appears. |
| **Your preferences** | Lets you turn each behavior on or off independently. |

## Install in under a minute

**[Download the signed and notarized disk image →](https://github.com/foleykyle01/peacock-skip-for-safari/releases/latest/download/Peacock-Skip-for-Safari.dmg)**

1. Open the disk image and drag **Peacock Skip for Safari** to **Applications**.
2. Open the app once, then choose **Safari → Settings → Extensions**.
3. Enable **Peacock Skip for Safari** and allow access to Peacock when Safari asks.

The download is signed with an Apple Developer ID and notarized by Apple. The toolbar button is optional after configuration: Control-click Safari's toolbar, choose **Customize Toolbar**, and remove it.

## Privacy

The extension has no analytics, telemetry, trackers, accounts, remote configuration, advertising SDKs, background service worker, or external service. It stores only four on/off preferences using Safari's local extension storage.

During playback, the content script reads a small set of Peacock page elements and the current video position so it can click visible controls or advance a detected ad. That information is used transiently on the page and is never retained or transmitted by the extension.

See [PRIVACY.md](PRIVACY.md) for the complete data boundary.

| Runs on | Stores locally | Sends externally |
| --- | --- | --- |
| Peacock pages only | Four on/off preferences | Nothing |

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Saves the four feature toggles locally on the Mac. |
| `*.peacocktv.com` | Lets the content script recognize and operate Peacock playback controls. |

No permission grants access to unrelated websites.

## Build from source

1. Open `Peacock Skip for Safari/Peacock Skip for Safari.xcodeproj` in Xcode.
2. Select your Apple development team for both the app and extension targets. If needed, replace the sample bundle identifiers with identifiers owned by your team.
3. Build and run the **Peacock Skip for Safari** scheme.
4. Open **Safari → Settings → Extensions** and enable **Peacock Skip for Safari**.
5. Allow access to Peacock when Safari asks.

## How it works

Safari injects three small scripts only on Peacock pages. `preferences.js` owns the local settings, `playback.js` contains tested timing calculations, and `content.js` watches the page for playback-interface changes and keyboard seeks. The extension clicks Peacock's own intro, recap, and next-episode controls. For detected ads, it seeks once near the end of a visible countdown without changing the playback rate. If keyboard seeking starts an ad without rendering the countdown, it can use the remaining duration of a short standalone ad video as a fallback. Paused playback is left alone, and if Safari or Peacock rejects a seek, playback remains unchanged.

The host macOS app exists only to install and manage the Safari web extension. It does not perform playback automation and does not have an outgoing-network entitlement.

## Development checks

Before publishing a change:

```sh
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/preferences.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/playback.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/content.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/popup.js"
node --test Tests/playback.test.js Tests/content.test.js
xcodebuild -project "Peacock Skip for Safari/Peacock Skip for Safari.xcodeproj" -scheme "Peacock Skip for Safari" -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

## License and trademark

The source in this repository is available under the [MIT License](LICENSE).

Peacock is a trademark of NBCUniversal Media, LLC. Peacock Skip for Safari is an independent project and is not affiliated with, endorsed by, or sponsored by Peacock or NBCUniversal.
