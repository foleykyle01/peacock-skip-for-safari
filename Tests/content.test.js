const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const resources = path.join(
    __dirname,
    "..",
    "Peacock Skip for Safari",
    "Peacock Skip for Safari Extension",
    "Resources",
)
const contentSource = fs.readFileSync(path.join(resources, "content.js"), "utf8")
const playback = require(path.join(resources, "playback.js"))

function createVideo({ duration = 100, currentTime = 10, paused = false } = {}) {
    let time = currentTime
    let isPaused = paused
    let seekCount = 0
    let playCount = 0
    let pauseCount = 0

    const video = {
        duration,
        playbackRate: 1,
        addEventListener() {},
        play() {
            playCount += 1
            isPaused = false
            return Promise.resolve()
        },
        pause() {
            pauseCount += 1
            isPaused = true
        },
    }
    Object.defineProperty(video, "paused", {
        get() { return isPaused },
        set(value) { isPaused = value },
    })
    Object.defineProperty(video, "currentTime", {
        get() { return time },
        set(value) {
            time = value
            seekCount += 1
        },
    })

    return {
        video,
        get currentTime() { return time },
        get seekCount() { return seekCount },
        get playCount() { return playCount },
        get pauseCount() { return pauseCount },
    }
}

async function createHarness({ videos, countdownText = "30" }) {
    let nextTimerId = 1
    let intervalCallback = null
    const timeouts = new Map()
    const windowListeners = new Map()

    const visibleElement = {
        disabled: false,
        textContent: countdownText ?? "",
        getAttribute() { return null },
        getClientRects() { return [{}] },
    }

    const context = {
        PeacockSkipPlayback: playback,
        PeacockSkipPreferences: {
            DEFAULTS: {
                skipIntros: false,
                skipRecaps: false,
                playNextEpisode: false,
                skipAds: true,
            },
            STORAGE_KEY: "preferences",
            normalize(value) { return value },
            read() { return Promise.resolve(this.DEFAULTS) },
        },
        chrome: {
            storage: {
                onChanged: { addListener() {} },
            },
        },
        document: {
            documentElement: {},
            addEventListener() {},
            querySelector(selector) {
                return selector === "video" ? videos[0] ?? null : null
            },
            querySelectorAll(selector) {
                if (selector === "video") {
                    return videos
                }
                if (selector.includes('[data-testid="countdown"]')) {
                    return countdownText === null ? [] : [visibleElement]
                }
                if (selector.includes('[data-testid="overlay"]')
                    || selector.includes('[data-testid="ad-overlay"')) {
                    return [visibleElement]
                }
                return []
            },
        },
        MutationObserver: class {
            observe() {}
        },
        getComputedStyle() {
            return { display: "block", visibility: "visible" }
        },
        addEventListener(name, callback) {
            windowListeners.set(name, callback)
        },
        setTimeout(callback) {
            const id = nextTimerId
            nextTimerId += 1
            timeouts.set(id, callback)
            return id
        },
        clearTimeout(id) {
            timeouts.delete(id)
        },
        setInterval(callback) {
            intervalCallback = callback
            return nextTimerId++
        },
        clearInterval() {
            intervalCallback = null
        },
    }

    vm.runInNewContext(contentSource, context)
    await new Promise((resolve) => setImmediate(resolve))

    const initialScan = Array.from(timeouts.values()).at(-1)
    assert.equal(typeof initialScan, "function")

    return {
        initialScan,
        runLatestTimeout() {
            const [id, callback] = Array.from(timeouts.entries()).at(-1) ?? []
            assert.equal(typeof callback, "function")
            timeouts.delete(id)
            callback()
        },
        interval() {
            assert.equal(typeof intervalCallback, "function")
            intervalCallback()
        },
        close() {
            windowListeners.get("pagehide")?.()
        },
    }
}

test("seeks only once while Peacock keeps the ad overlay visible", async () => {
    const ad = createVideo()
    const harness = await createHarness({ videos: [ad.video] })

    harness.initialScan()
    assert.equal(ad.seekCount, 1)
    assert.equal(ad.currentTime, 39)
    assert.equal(ad.pauseCount, 1)
    assert.equal(ad.playCount, 0)

    harness.runLatestTimeout()
    assert.equal(ad.playCount, 1)

    harness.interval()
    harness.interval()
    assert.equal(ad.seekCount, 1)
    assert.equal(ad.playCount, 1)
    harness.close()
})

test("leaves a paused ad untouched until the user resumes playback", async () => {
    const ad = createVideo({ paused: true })
    const harness = await createHarness({ videos: [ad.video] })

    harness.initialScan()
    assert.equal(ad.seekCount, 0)
    assert.equal(ad.playCount, 0)
    assert.equal(ad.video.playbackRate, 1)

    ad.video.paused = false
    harness.interval()
    assert.equal(ad.seekCount, 1)
    assert.equal(ad.playCount, 0)
    assert.equal(ad.pauseCount, 1)
    harness.runLatestTimeout()
    assert.equal(ad.playCount, 1)
    harness.close()
})

test("selects the short ad video instead of the long-form program video", async () => {
    const program = createVideo({ duration: 3600, currentTime: 1315, paused: true })
    const ad = createVideo({ duration: 60, currentTime: 0 })
    const harness = await createHarness({ videos: [program.video, ad.video] })

    harness.initialScan()
    assert.equal(program.seekCount, 0)
    assert.equal(program.currentTime, 1315)
    assert.equal(ad.seekCount, 1)
    assert.equal(ad.currentTime, 29)
    harness.close()
})

test("seeks Peacock's stitched long-form timeline when a countdown is visible", async () => {
    const program = createVideo({ duration: 3600, currentTime: 1315 })
    const harness = await createHarness({ videos: [program.video] })

    harness.initialScan()
    assert.equal(program.seekCount, 1)
    assert.equal(program.currentTime, 1344)
    assert.equal(program.pauseCount, 1)
    assert.equal(program.playCount, 0)
    assert.equal(program.video.playbackRate, 1)

    harness.runLatestTimeout()
    assert.equal(program.playCount, 1)
    harness.interval()
    assert.equal(program.seekCount, 1)
    assert.equal(program.currentTime, 1344)
    assert.equal(program.playCount, 1)
    harness.close()
})

test("does not seek long-form media when ad UI has no countdown", async () => {
    const program = createVideo({ duration: 3600, currentTime: 1315 })
    const harness = await createHarness({ videos: [program.video], countdownText: null })

    harness.initialScan()
    assert.equal(program.seekCount, 0)
    assert.equal(program.currentTime, 1315)
    assert.equal(program.pauseCount, 0)
    assert.equal(program.playCount, 0)
    harness.close()
})

test("leaves a paused long-form ad untouched", async () => {
    const program = createVideo({ duration: 3600, currentTime: 1315, paused: true })
    const harness = await createHarness({ videos: [program.video] })

    harness.initialScan()
    assert.equal(program.seekCount, 0)
    assert.equal(program.currentTime, 1315)
    assert.equal(program.pauseCount, 0)
    assert.equal(program.playCount, 0)
    harness.close()
})

test("cancels an extension-owned resume when the page exits", async () => {
    const ad = createVideo()
    const harness = await createHarness({ videos: [ad.video] })

    harness.initialScan()
    assert.equal(ad.pauseCount, 1)
    harness.close()
    assert.equal(ad.playCount, 0)
})
