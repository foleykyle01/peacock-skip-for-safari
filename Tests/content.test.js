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

test("seeks only once while Peacock keeps the ad overlay visible", async () => {
    let currentTime = 10
    let seekCount = 0
    let nextTimerId = 1
    let intervalCallback = null
    const timeouts = new Map()
    const windowListeners = new Map()

    const video = {
        duration: 100,
        paused: false,
        playbackRate: 1,
        addEventListener() {},
        play() { return Promise.resolve() },
    }
    Object.defineProperty(video, "currentTime", {
        get() { return currentTime },
        set(value) {
            currentTime = value
            seekCount += 1
        },
    })

    const visibleElement = {
        disabled: false,
        textContent: "30",
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
                return selector === "video" ? video : null
            },
            querySelectorAll(selector) {
                if (selector.includes('[data-testid="countdown"]')) {
                    return [visibleElement]
                }
                if (selector.includes('[data-testid="ad-overlay"')) {
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
    initialScan()
    assert.equal(seekCount, 1)

    assert.equal(typeof intervalCallback, "function")
    intervalCallback()
    intervalCallback()
    assert.equal(seekCount, 1)

    windowListeners.get("pagehide")()
})
