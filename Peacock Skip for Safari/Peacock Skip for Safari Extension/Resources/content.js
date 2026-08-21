(() => {
    "use strict"

    const UI = Object.freeze({
        intro: '[aria-label="Skip Intro"]',
        recap: '[aria-label="Skip Recap"]',
        nextEpisode: '[data-testid="autobinge-card"], [data-test-id="autobinge-card"], .playback-binge__card',
        countdown: '[data-testid="countdown"], [data-test-id="countdown"], .countdown__remaining-time, .ad-countdown__remaining-time',
        adEvidence: '[aria-label*="advertisement" i], [data-testid*="ad" i], [data-test-id*="ad" i], .ad-overlay, .ad-container, [class*="ad-countdown"]',
        dismiss: '[aria-label="Dismiss"], [label="Dismiss"]',
        resume: '[aria-label="Resume"], [label="Resume"]',
    })

    const clicked = new WeakSet()
    let preferences = PeacockSkipPreferences.DEFAULTS
    let scanTimer = null
    let lastAdAction = { element: null, timestamp: 0 }

    function isActionable(element) {
        if (!element || clicked.has(element)) {
            return false
        }

        const style = getComputedStyle(element)
        return !element.disabled
            && element.getAttribute("aria-hidden") !== "true"
            && style.display !== "none"
            && style.visibility !== "hidden"
            && element.getClientRects().length > 0
    }

    function activateFirst(selector) {
        const element = Array.from(document.querySelectorAll(selector)).find(isActionable)
        if (!element) {
            return false
        }

        clicked.add(element)
        element.click()
        return true
    }

    function advanceDetectedAd() {
        activateFirst(UI.dismiss)
        activateFirst(UI.resume)

        const countdown = document.querySelector(UI.countdown)
        const video = document.querySelector("video")
        if (!countdown || !video) {
            return
        }

        const adIsVisible = countdown.getClientRects().length > 0
        const hasAdEvidence = countdown.matches(UI.adEvidence) || Boolean(document.querySelector(UI.adEvidence))
        if (!adIsVisible || !hasAdEvidence) {
            return
        }

        const remaining = PeacockSkipPlayback.countdownSeconds(countdown.textContent)

        const now = Date.now()
        if (lastAdAction.element === countdown && now - lastAdAction.timestamp < 1500) {
            return
        }

        const jump = PeacockSkipPlayback.adJump({
            remaining,
            currentTime: video.currentTime,
            duration: video.duration,
        })
        if (jump <= 0.25) {
            return
        }

        lastAdAction = { element: countdown, timestamp: now }

        try {
            video.currentTime += jump
            if (!video.paused) {
                video.play().catch(() => {})
            }
        } catch {
            // Some server-enforced ad streams reject seeking. Leave playback untouched.
        }
    }

    function scanPage() {
        scanTimer = null

        if (preferences.skipIntros) {
            activateFirst(UI.intro)
        }
        if (preferences.skipRecaps) {
            activateFirst(UI.recap)
        }
        if (preferences.playNextEpisode) {
            activateFirst(UI.nextEpisode)
        }
        if (preferences.skipAds) {
            advanceDetectedAd()
        }
    }

    function scheduleScan() {
        if (scanTimer !== null) {
            clearTimeout(scanTimer)
        }
        scanTimer = setTimeout(scanPage, 300)
    }

    function observePage() {
        const observer = new MutationObserver(scheduleScan)
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["aria-label", "class", "data-test-id", "data-testid", "data-visible"],
            characterData: true,
            childList: true,
            subtree: true,
        })
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        const change = changes[PeacockSkipPreferences.STORAGE_KEY]
        if (areaName === "local" && change?.newValue) {
            preferences = PeacockSkipPreferences.normalize(change.newValue)
            scheduleScan()
        }
    })

    async function start() {
        try {
            preferences = await PeacockSkipPreferences.read()
        } catch {
            preferences = PeacockSkipPreferences.DEFAULTS
        }

        observePage()
        scheduleScan()
    }

    start()
})()
