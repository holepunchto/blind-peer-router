class BlindPeerRouterError extends Error {
  constructor(msg, code, fn = BlindPeerRouterError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'BlindPeerRouterError'
  }

  static OVERLOADED() {
    return new BlindPeerRouterError(
      'The blind peer router is overloaded',
      'OVERLOADED',
      BlindPeerRouterError.OVERLOADED
    )
  }
}

module.exports = BlindPeerRouterError
