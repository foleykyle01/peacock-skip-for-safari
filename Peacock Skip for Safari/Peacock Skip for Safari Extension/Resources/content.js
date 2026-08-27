(() => {
    "use strict"

    const UI = Object.freeze({
        intro: '[aria-label="Skip Intro"]',
        recap: '[aria-label="Skip Recap"]',
        nextEpisode: '[data-testid="autobinge-card"], [data-test-id="autobinge-card"], .playback-binge__card',
        countdown: '[data-testid="countdown"], [data-test-id="countdown"], .countdown__remaining-time, .ad-countdown__remaining-time',
        adEvidence: '[aria-label*="advertisement" i], [data-testid="overlay"][data-visible="true"], [data-test-id="overlay"][data-visible="true"], [data-testid="ad-overlay" i], [data-test-id="ad-overlay" i], [data-testid="ad-container" i], [data-test-id="ad-container" i], [data-testid^="ad-" i], [data-test-id^="ad-" i], .ad-overlay, .ad-container, [class*="ad-countdown"], [class*="adBreakActive"]',
        dismiss: '[aria-label="Dismiss"], [label="Dismiss"]',
        resume: '[aria-label="Resume"], [label="Resume"]',
    })

    const clicked = new WeakSet()
    const watchedVideos = new WeakSet()
    const AD_SESSION_RESET_DELAY = 1500
    const AD_POLL_INTERVAL = 500
    // Match Chrome 1.1.38's 50 ms pause-and-resume seek commit.
    const SEEK_COMMIT_DELAY = 50
    let preferences = PeacockSkipPreferences.DEFAULTS
    let scanTimer = null
    let adPollTimer = null
    let adPollInterval = null
    let followUpTimers = []
    let ownedResume = null
    let activeAdSession = null
    let adInactiveSince = 0

    function isVisible(element) {
        if (!element) {
            return false
        }

        const style = getComputedStyle(element)
        return element.getAttribute("aria-hidden") !== "true"
            && style.display !== "none"
            && style.visibility !== "hidden"
            && element.getClientRects().length > 0
    }

    function isActionable(element) {
        return isVisible(element) && !element.disabled && !clicked.has(element)
    }

    function firstVisible(selector) {
        return Array.from(document.querySelectorAll(selector)).find(isVisible) ?? null
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

    function cancelOwnedResume() {
        if (!ownedResume) {
            return
        }

        clearTimeout(ownedResume.timer)
        ownedResume = null
    }

    function setAdPolling(enabled, interval = AD_POLL_INTERVAL) {
        if (enabled && adPollTimer !== null && adPollInterval !== interval) {
            clearInterval(adPollTimer)
            adPollTimer = null
            adPollInterval = null
        }

        if (enabled && adPollTimer === null) {
            adPollInterval = interval
            adPollTimer = setInterval(scanPage, interval)
        } else if (!enabled && adPollTimer !== null) {
            clearInterval(adPollTimer)
            adPollTimer = null
            adPollInterval = null
        }
    }

    function commitSeek(video, shouldResume) {
        if (!shouldResume) {
            return
        }

        cancelOwnedResume()
        try {
            video.pause()
        } catch {
            return
        }

        const timer = setTimeout(() => {
            if (ownedResume?.video !== video || ownedResume.timer !== timer) {
                return
            }

            ownedResume = null
            video.play().catch(() => {})
        }, SEEK_COMMIT_DELAY)
        ownedResume = { video, timer }
    }

    function sessionFor(video) {
        if (!activeAdSession || activeAdSession.video !== video) {
            activeAdSession = { video, actionTaken: false }
        }

        return activeAdSession
    }

    function handleInactiveAdState() {
        const now = Date.now()

        if (!activeAdSession) {
            setAdPolling(false)
            return
        }

        if (adInactiveSince === 0) {
            adInactiveSince = now
        }

        if (now - adInactiveSince < AD_SESSION_RESET_DELAY) {
            setAdPolling(true)
            return
        }

        activeAdSession = null
        adInactiveSince = 0
        setAdPolling(false)
    }

    function scheduleSeekFollowUps() {
        for (const timer of followUpTimers) {
            clearTimeout(timer)
        }

        followUpTimers = [0, 250, 750, 1500, 3000].map((delay) => (
            setTimeout(scanPage, delay)
        ))
    }

    function watchVideo(video) {
        if (!video || watchedVideos.has(video)) {
            return
        }

        watchedVideos.add(video)
        for (const eventName of ["durationchange", "loadedmetadata", "seeking", "seeked"]) {
            video.addEventListener(eventName, scheduleSeekFollowUps, { passive: true })
        }
    }

    function shortAdRemaining(video) {
        if (!video) {
            return 0
        }

        return PeacockSkipPlayback.shortAdRemaining({
            currentTime: video.currentTime,
            duration: video.duration,
        })
    }

    function selectAdVideo() {
        const videos = Array.from(document.querySelectorAll("video"))
        return videos.find((video) => !video.paused) ?? videos[0] ?? null
    }

    function handleDetectedAd() {
        const countdown = firstVisible(UI.countdown)
        const adEvidence = firstVisible(UI.adEvidence)
        const adIsActive = Boolean(countdown || adEvidence)

        if (!adIsActive) {
            handleInactiveAdState()
            return
        }

        // Chrome 1.1.38 intentionally seeks Peacock's active stitched timeline.
        // The countdown is the boundary signal; duration alone is only a
        // fallback for legacy ads rendered as a separate short video.
        const video = selectAdVideo()
        if (!video) {
            setAdPolling(true)
            return
        }

        watchVideo(video)

        // Do not seek, accelerate, dismiss, or resume anything while the user
        // has Peacock paused. Polling lets the same ad be handled after the user
        // explicitly resumes playback without the extension owning play state.
        if (video.paused) {
            setAdPolling(true)
            return
        }

        adInactiveSince = 0
        const adSession = sessionFor(video)

        activateFirst(UI.dismiss)
        activateFirst(UI.resume)

        const countdownRemaining = PeacockSkipPlayback.countdownSeconds(countdown?.textContent)
        const mediaRemaining = shortAdRemaining(video)
        const remaining = countdownRemaining || mediaRemaining

        // One seek is enough for a visible ad break. Peacock can leave the same
        // overlay mounted after that seek; acting on it again is what caused the
        // extension to carry playback into the program.
        if (adSession.actionTaken) {
            setAdPolling(true)
            return
        }

        // A long-form stitched timeline requires a real countdown. Without one,
        // only a short standalone ad supplies enough timing evidence to seek.
        if (remaining <= 0) {
            setAdPolling(true)
            return
        }

        const jump = PeacockSkipPlayback.adJump({
            remaining,
            currentTime: video.currentTime,
            duration: video.duration,
        })

        adSession.actionTaken = true
        if (jump <= 0.25) {
            setAdPolling(true)
            return
        }

        setAdPolling(true)

        try {
            const shouldResume = !video.paused
            video.currentTime += jump
            commitSeek(video, shouldResume)
        } catch {
            // Leave playback unchanged if WebKit or Peacock rejects the seek.
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
            handleDetectedAd()
        } else {
            cancelOwnedResume()
            activeAdSession = null
            adInactiveSince = 0
            setAdPolling(false)
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
            attributeFilter: ["aria-label", "class", "data-test-id", "data-testid", "data-visible", "src", "style"],
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

    document.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            scheduleSeekFollowUps()
        }
    }, true)

    addEventListener("pagehide", () => {
        cancelOwnedResume()
        activeAdSession = null
        adInactiveSince = 0
        setAdPolling(false)
    })

    async function start() {
        try {
            preferences = await PeacockSkipPreferences.read()
        } catch {
            preferences = PeacockSkipPreferences.DEFAULTS
        }

        observePage()
        watchVideo(document.querySelector("video"))
        scheduleScan()
    }

    start()
})()
