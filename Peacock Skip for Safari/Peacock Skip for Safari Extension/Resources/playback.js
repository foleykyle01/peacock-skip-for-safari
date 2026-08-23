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

        // Peacock's whole-second countdown can be slightly ahead of the media
        // clock. Keep enough of the ad boundary intact that a seek cannot land
        // in the first beat of the program.
        const buffer = Math.min(2, Math.max(1, remaining * 0.1))
        const proposedJump = remaining - buffer
        const durationLimit = Number.isFinite(duration)
            ? Math.max(0, duration - currentTime - 0.1)
            : proposedJump

        return Math.max(0, Math.min(proposedJump, durationLimit))
    }

    function shortAdRemaining({ currentTime, duration, maximumDuration = 180 }) {
        if (!Number.isFinite(currentTime)
            || !Number.isFinite(duration)
            || duration <= currentTime
            || duration > maximumDuration) {
            return 0
        }

        return duration - currentTime
    }

    const playback = Object.freeze({ countdownSeconds, adJump, shortAdRemaining })
    globalThis.PeacockSkipPlayback = playback

    if (typeof module === "object" && module.exports) {
        module.exports = playback
    }
})()
