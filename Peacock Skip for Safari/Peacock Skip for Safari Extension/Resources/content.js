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
    let preferences = PeacockSkipPreferences.DEFAULTS
    let scanTimer = null
    let adPollTimer = null
    let followUpTimers = []
    let acceleratedPlayback = null
    let lastAdAction = { element: null, timestamp: 0 }

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

    function setAdPolling(enabled) {
        if (enabled && adPollTimer === null) {
            adPollTimer = setInterval(scanPage, 750)
        } else if (!enabled && adPollTimer !== null) {
            clearInterval(adPollTimer)
            adPollTimer = null
        }
    }

    function accelerateAd(video) {
        if (acceleratedPlayback?.video !== video) {
            restorePlaybackRate()
            acceleratedPlayback = {
                video,
                originalRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
            }
        }

        try {
            video.playbackRate = 16
        } catch {
            try {
                video.playbackRate = 4
            } catch {
                return
            }
        }

        if (video.paused) {
            video.play().catch(() => {})
        }
        setAdPolling(true)
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
            restorePlaybackRate()
            setAdPolling(false)
            return
        }

        activateFirst(UI.dismiss)
        activateFirst(UI.resume)

        const countdownRemaining = PeacockSkipPlayback.countdownSeconds(countdown?.textContent)
        const remaining = countdownRemaining || PeacockSkipPlayback.shortAdRemaining({
            currentTime: video.currentTime,
            duration: video.duration,
        })

        const actionElement = countdown ?? adEvidence ?? video
        const now = Date.now()
        if (lastAdAction.element === actionElement && now - lastAdAction.timestamp < 1200) {
            return
        }

        const jump = PeacockSkipPlayback.adJump({
            remaining,
            currentTime: video.currentTime,
            duration: video.duration,
        })

        if (jump <= 0.25) {
            accelerateAd(video)
            lastAdAction = { element: actionElement, timestamp: now }
            return
        }

        restorePlaybackRate()
        setAdPolling(true)
        lastAdAction = { element: actionElement, timestamp: now }

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
