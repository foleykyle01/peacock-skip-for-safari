(() => {
    "use strict"

    const controls = Object.freeze({
        skipRecaps: "Recaps",
        skipIntros: "Intros",
        playNextEpisode: "NextEpisode",
        skipAds: "SkipAds",
    })

    let preferences = PeacockSkipPreferences.DEFAULTS

    function render() {
        for (const [key, id] of Object.entries(controls)) {
            document.getElementById(id).checked = preferences[key]
        }
    }

    async function updatePreference(key, checked) {
        preferences = PeacockSkipPreferences.normalize({
            ...preferences,
            [key]: checked,
        })
        await PeacockSkipPreferences.write(preferences)
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            preferences = await PeacockSkipPreferences.read()
        } catch {
            preferences = PeacockSkipPreferences.DEFAULTS
        }

        render()

        for (const [key, id] of Object.entries(controls)) {
            document.getElementById(id).addEventListener("change", (event) => {
                updatePreference(key, event.currentTarget.checked).catch(() => {})
            })
        }
    })
})()
