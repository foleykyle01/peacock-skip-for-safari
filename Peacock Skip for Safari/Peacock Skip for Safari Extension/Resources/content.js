(() => {
    "use strict"

    const UI = Object.freeze({
        intro: '[aria-label="Skip Intro"]',
        recap: '[aria-label="Skip Recap"]',
        nextEpisode: '[data-testid="autobinge-card"], [data-test-id="autobinge-card"], .playback-binge__card',
        countdown: '[data-testid="countdown"], [data-test-id="countdown"], .countdown__remaining-time, .ad-countdown__remaining-time',
        adEvidence: '[aria-label*="advertisement" i], [data-testid="ad-overlay" i], [data-test-id="ad-overlay" i], [data-testid="ad-container" i], [data-test-id="ad-container" i], [data-testid^="ad-" i], [data-test-id^="ad-" i], .ad-overlay, .ad-container, [class*="ad-countdown"]',
        dismiss: '[aria-label="Dismiss"], [label="Dismiss"]',
        resume: '[aria-label="Resume"], [label="Resume"]',
    })

    const clicked = new WeakSet()
    const watchedVideos = new WeakSet()
    const AD_SESSION_RESET_DELAY = 1500
    const AD_POLL_INTERVAL = 500
    const ACCELERATED_AD_POLL_INTERVAL = 100
    const PLAYBACK_RATE_RESTORE_WINDOW = 1.5
    let preferences = PeacockSkipPreferences.DEFAULTS
    let scanTimer = null
    let adPollTimer = null
    let adPollInterval = null
    let followUpTimers = []
    let acceleratedPlayback = null
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

    function restorePlaybackRate() {
        if (!acceleratedPlayback) {
            return
        }

        try {
            acceleratedPlayback.video.playbackRate = acceleratedPlayback.originalRate
        } catch {
            // The ad video may already have been removed from the page.
        }

        acceleratedPlayback = null
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

    function accelerateAd(video) {
        if (acceleratedPlayback?.video !== video) {
            restorePlaybackRate()
            acceleratedPlayback = {
                video,
                originalRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
                lastCurrentTime: video.currentTime,
            }
        }

        try {
            video.playbackRate = 4
        } catch {
            return
        }

        if (video.paused) {
            video.play().catch(() => {})
        }
        setAdPolling(true, ACCELERATED_AD_POLL_INTERVAL)
    }

    function sessionFor(video) {
        if (!activeAdSession || activeAdSession.video !== video) {
            restorePlaybackRate()
            activeAdSession = { video, actionTaken: false }
        }

        return activeAdSession
    }

    function handleInactiveAdState() {
        const now = Date.now()
        restorePlaybackRate()

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

    function handleDetectedAd() {
        const video = document.querySelector("video")
        watchVideo(video)

        const countdown = firstVisible(UI.countdown)
        const adEvidence = firstVisible(UI.adEvidence)
        const adIsActive = Boolean(countdown || adEvidence)

        if (!video || !adIsActive) {
            handleInactiveAdState()
            return
        }

        adInactiveSince = 0
        const adSession = sessionFor(video)

        activateFirst(UI.dismiss)
        activateFirst(UI.resume)

        const countdownRemaining = PeacockSkipPlayback.countdownSeconds(countdown?.textContent)
        const remaining = countdownRemaining || PeacockSkipPlayback.shortAdRemaining({
            currentTime: video.currentTime,
            duration: video.duration,
        })

        if (acceleratedPlayback?.video === video) {
            const playbackRestarted = video.currentTime + 0.25 < acceleratedPlayback.lastCurrentTime
            acceleratedPlayback.lastCurrentTime = video.currentTime

            if (playbackRestarted || (remaining > 0 && remaining <= PLAYBACK_RATE_RESTORE_WINDOW)) {
                restorePlaybackRate()
            }
        }

        // One seek is enough for a visible ad break. Peacock can leave the same
        // overlay mounted after that seek; acting on it again is what caused the
        // extension to carry playback into the program.
        if (adSession.actionTaken) {
            setAdPolling(
                true,
                acceleratedPlayback ? ACCELERATED_AD_POLL_INTERVAL : AD_POLL_INTERVAL,
            )
            return
        }

        // Wait for a real countdown or short ad duration. Blindly accelerating
        // a long-form video while stale ad UI is visible can skip program time.
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
            restorePlaybackRate()
            setAdPolling(true)
            return
        }

        restorePlaybackRate()
        setAdPolling(true)

        try {
            video.currentTime += jump
            if (!video.paused) {
                video.play().catch(() => {})
            }
        } catch {
            // A server-enforced ad rejected seeking, so finish it at high speed instead.
            accelerateAd(video)
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
            restorePlaybackRate()
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
        restorePlaybackRate()
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
