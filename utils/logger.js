// Code is blatantly borrowed from https://github.com/yilozt/rounded-window-corners/blob/main/src/utils/log.ts

/**
 * Log message Only when debug_mode of settings () is enabled
 */
export const logger = (...args) => {
  console.log (`[TrueColorWindowInvert] ${args}`)
}

/** Always log error message  */
export const loggerError = (err) => {
  console.error (err)
}

/**
 * Get stack message when called this function, this method
 * will be used when monkey patch the code of gnome-shell to skip some
 * function invocations.
 */
export const stackMsg = () => {
  try {
    throw Error ()
  } catch (e) {
    return e?.stack?.trim ()
  }
}
