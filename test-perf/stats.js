let startTime = process.hrtime()

function createStats() {
  let ops = []
  let flushes = []

  return {
    pushOp(ms) {
      ops.push(ms)
    },

    pushFlush(ms) {
      flushes.push(ms)
    },

    report(label) {
      if (ops.length) {
        printLine(`[${label}] op`, ops)
      }
      if (flushes.length) {
        printLine(`[${label}] flush`, flushes)
      }
    },

    reset() {
      ops = []
      flushes = []
      startTime = process.hrtime()
    }
  }
}

function printLine(prefix, latencies) {
  latencies.sort((a, b) => a - b)
  const len = latencies.length
  const sum = latencies.reduce((a, b) => a + b, 0)
  const totalTime =  hrtimeMs(startTime)
  const opsPerSec = 1000 * latencies.length / totalTime

  console.log(
    `${prefix}  n=${len}  avg=${(sum / len).toFixed(2)}ms  ` +
      `p50=${latencies[Math.floor(len * 0.5)].toFixed(2)}ms  ` +
      `p95=${latencies[Math.floor(len * 0.95)].toFixed(2)}ms  ` +
      `p99=${latencies[Math.floor(len * 0.99)].toFixed(2)}ms  ` +
      `max=${latencies[len - 1].toFixed(2)}ms  ` +
      `ops/s=${opsPerSec}`
  )
}

function hrtimeMs(start) {
  const diff = process.hrtime(start)
  return diff[0] * 1000 + diff[1] / 1e6
}

module.exports = { createStats, hrtimeMs }
