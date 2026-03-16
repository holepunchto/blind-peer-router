function createStats() {
  const latencies = []

  return {
    push(ms) {
      latencies.push(ms)
    },

    report(label) {
      if (!latencies.length) return

      latencies.sort((a, b) => a - b)
      const len = latencies.length
      const sum = latencies.reduce((a, b) => a + b, 0)

      console.log(
        `[${label}] ops=${len}  avg=${(sum / len).toFixed(2)}ms  ` +
          `p50=${latencies[Math.floor(len * 0.5)].toFixed(2)}ms  ` +
          `p95=${latencies[Math.floor(len * 0.95)].toFixed(2)}ms  ` +
          `p99=${latencies[Math.floor(len * 0.99)].toFixed(2)}ms  ` +
          `max=${latencies[len - 1].toFixed(2)}ms  ` +
          `ops/s=${(len / (sum / 1000)).toFixed(0)}`
      )
    },

    reset() {
      latencies.length = 0
    }
  }
}

function hrtimeMs(start) {
  const diff = process.hrtime(start)
  return diff[0] * 1000 + diff[1] / 1e6
}

module.exports = { createStats, hrtimeMs }
