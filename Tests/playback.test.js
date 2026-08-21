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

test("leaves a safety buffer at the end of an ad", () => {
    assert.equal(playback.adJump({ remaining: 30, currentTime: 10, duration: 100 }), 29)
    assert.equal(playback.adJump({ remaining: 5, currentTime: 10, duration: 100 }), 4.6)
})

test("does not seek beyond the video duration", () => {
    assert.equal(playback.adJump({ remaining: 30, currentTime: 95, duration: 100 }), 4.9)
    assert.equal(playback.adJump({ remaining: 0, currentTime: 10, duration: 100 }), 0)
})
