// Optional hook for the roll number captcha. Not implemented on purpose.
//
// If ETEA gives you an approved way to skip or read the captcha (best: an API or an
// allow-listed server), put it here. Return the code as a string, or null.
// When this returns null (the default), the bot sends the picture and the person types it.
//
// @param {Buffer} image  PNG of the captcha
// @returns {Promise<string|null>}
export async function solveCaptcha(image) { // eslint-disable-line no-unused-vars
  return null;
}
