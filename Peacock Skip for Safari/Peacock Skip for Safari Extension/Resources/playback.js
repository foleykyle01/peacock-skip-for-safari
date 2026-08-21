(() => {
    "use strict"

    function countdownSeconds(text) {
        const match = String(text ?? "").match(/\b(\d{1,2})(?::(\d{2}))?\b/)
        if (!match) {
            return 0
        }

        if (match[2] === undefined) {
            return Number(match[1])
        }

        return (Number(match[1]) * 60) + Number(match[2])
    }

    function adJump({ remaining, currentTime, duration }) {
        if (!Number.isFinite(remaining) || remaining <= 0.75) {
            return 0
        }

        const buffer = Math.min(1, Math.max(0.25, remaining * 0.08))
        const proposedJump = remaining - buffer
        const durationLimit = Number.isFinite(duration)
            ? Math.max(0, duration - currentTime - 0.1)
            : proposedJump

        return Math.max(0, Math.min(proposedJump, durationLimit))
    }

    const playback = Object.freeze({ countdownSeconds, adJump })
    globalThis.PeacockSkipPlayback = playback

    if (typeof module === "object" && module.exports) {
        module.exports = playback
    }
})()
