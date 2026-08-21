# Peacock Skip for Safari

**Automatic skipping. Zero tracking. Built for Safari.**

Peacock Skip for Safari is a lightweight macOS Safari extension that handles common playback interruptions on Peacock. It runs entirely inside Safari on your Mac and does not collect or transmit viewing activity, account information, or website content.

## Download

**[Download the latest signed and notarized release](https://github.com/foleykyle01/peacock-skip-for-safari/releases/latest/download/Peacock-Skip-for-Safari.dmg)**

Requires macOS 13 or later and Safari. The download is signed with an Apple Developer ID and notarized by Apple.

1. Open the downloaded disk image and drag **Peacock Skip for Safari** to **Applications**.
2. Open the app once, then choose **Safari → Settings → Extensions**.
3. Enable **Peacock Skip for Safari** and allow access to Peacock when Safari asks.

## Features

- Skip intro prompts.
- Skip recap prompts.
- Continue to the next episode.
- Advance through detected ad countdowns when Peacock permits seeking.
- Turn every behavior on or off from a compact Safari toolbar popup.

## Privacy

The extension has no analytics, telemetry, trackers, accounts, remote configuration, advertising SDKs, background service worker, or external service. It stores only four on/off preferences using Safari's local extension storage.

During playback, the content script reads a small set of Peacock page elements and the current video position so it can click visible controls or advance a detected ad. That information is used transiently on the page and is never retained or transmitted by the extension.

See [PRIVACY.md](PRIVACY.md) for the complete data boundary.

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

The toolbar button is optional after configuration. To hide it, Control-click Safari's toolbar, choose **Customize Toolbar**, and remove the button. The enabled extension will continue working on Peacock.

## How it works

Safari injects three small scripts only on Peacock pages. `preferences.js` owns the local settings, `playback.js` contains tested timing calculations, and `content.js` watches the page for playback-interface changes and keyboard seeks. The extension clicks Peacock's own intro, recap, and next-episode controls. For detected ads, it seeks near the end of a visible countdown. If keyboard seeking starts an ad without rendering the countdown, it uses the duration of a short ad video or temporarily accelerates a server-enforced ad, then restores the user's normal playback speed.

The host macOS app exists only to install and manage the Safari web extension. It does not perform playback automation and does not have an outgoing-network entitlement.

## Development checks

Before publishing a change:

```sh
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/preferences.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/playback.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/content.js"
node --check "Peacock Skip for Safari/Peacock Skip for Safari Extension/Resources/popup.js"
node --test Tests/playback.test.js
xcodebuild -project "Peacock Skip for Safari/Peacock Skip for Safari.xcodeproj" -scheme "Peacock Skip for Safari" -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

## License and trademark

The source in this repository is available under the [MIT License](LICENSE).

Peacock is a trademark of NBCUniversal Media, LLC. Peacock Skip for Safari is an independent project and is not affiliated with, endorsed by, or sponsored by Peacock or NBCUniversal.
