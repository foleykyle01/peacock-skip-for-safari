const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const playback = require(path.join(
    __dirname,
    "..",
    "Peacock Skip for Safari",
    "Peacock Skip for Safari Extension",
    "Resources",
    "playback.js",
))

test("parses second and minute countdowns", () => {
    assert.equal(playback.countdownSeconds("30"), 30)
    assert.equal(playback.countdownSeconds("Ad ends in 1:05"), 65)
    assert.equal(playback.countdownSeconds("Advertisement"), 0)
})

test("matches Chrome 1.1.38's completion buffer", () => {
    assert.equal(playback.adJump({ remaining: 30, currentTime: 10, duration: 100 }), 29)
    assert.equal(playback.adJump({ remaining: 5, currentTime: 10, duration: 100 }), 4.5)
    assert.equal(playback.adJump({ remaining: 1, currentTime: 10, duration: 100 }), 0.9)
})

test("does not seek beyond the video duration", () => {
    assert.equal(playback.adJump({ remaining: 30, currentTime: 95, duration: 100 }), 4.9)
    assert.equal(playback.adJump({ remaining: 0, currentTime: 10, duration: 100 }), 0)
})

test("uses a short ad video's duration when no countdown is rendered", () => {
    assert.equal(playback.shortAdRemaining({ currentTime: 8, duration: 30 }), 22)
    assert.equal(playback.shortAdRemaining({ currentTime: 8, duration: 3600 }), 0)
    assert.equal(playback.shortAdRemaining({ currentTime: 30, duration: 30 }), 0)
})
