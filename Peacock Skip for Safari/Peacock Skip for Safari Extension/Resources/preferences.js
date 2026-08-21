(() => {
    "use strict"

    const STORAGE_KEY = "preferences"
    const DEFAULTS = Object.freeze({
        skipIntros: true,
        skipRecaps: true,
        playNextEpisode: true,
        skipAds: true,
    })

    function normalize(value = {}) {
        return {
            skipIntros: typeof value.skipIntros === "boolean" ? value.skipIntros : DEFAULTS.skipIntros,
            skipRecaps: typeof value.skipRecaps === "boolean" ? value.skipRecaps : DEFAULTS.skipRecaps,
            playNextEpisode: typeof value.playNextEpisode === "boolean" ? value.playNextEpisode : DEFAULTS.playNextEpisode,
            skipAds: typeof value.skipAds === "boolean" ? value.skipAds : DEFAULTS.skipAds,
        }
    }

    function read() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }

                const stored = result?.[STORAGE_KEY]
                const preferences = normalize(stored)

                if (!stored) {
                    write(preferences).then(() => resolve(preferences), reject)
                    return
                }

                resolve(preferences)
            })
        })
    }

    function write(preferences) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                [STORAGE_KEY]: normalize(preferences),
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }

                resolve()
            })
        })
    }

    globalThis.PeacockSkipPreferences = Object.freeze({
        STORAGE_KEY,
        DEFAULTS,
        normalize,
        read,
        write,
    })
})()
