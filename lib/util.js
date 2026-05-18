const XRegExp = require('xregexp')
const _ = require('lodash')

const util = {}

/**
 * Lightly clean up a string's contents.
 *
 * Use ASCII punctuation when possible and
 * remove excessive whitespace.
 *
 * @param {string} str - A string.
 * @return {string} A new string.
 */
util.normalize = function (str) {
  str = util.replacePunctuation(str)
  str = util.stripWhitespace(str)
  return str
}

/**
 * Get all entries in a Spotify paging object.
 *
 * [Reference](https://developer.spotify.com/web-api/object-model/#paging-object).
 *
 * @param {SpotifyWebApi} [spotify] - Spotify web API.
 * @param {Function} [method] - Method to call.
 * @param {array} args Array of method arguments.
 * @param {Object} [opts] The options supplied to this request.
 * @returns {Promise | JSON} A promise that, if successful,
 * resolves to a JSON object that contains all the entries.
 */
util.paging = function (spotify, method, args, opts, result) {
  opts = opts || {}
  return method.apply(spotify, args.concat([opts])).then(function (response) {
    if (!response) {
      throw response
    }
    if (result) {
      result.body.items = result.body.items.concat(response.body.items)
    } else {
      result = response
    }
    if (response.body.next) {
      opts.offset = result.body.items.length
      return util.paging(spotify, method, args, opts, result)
    } else {
      return result
    }
  })
}

/**
 * Replace Unicode punctuation with their ASCII equivalents.
 *
 * Simplifies "smart quotes", typographical dashes and other
 * characters that might confuse search engines.
 *
 * @param {string} str - A string.
 * @return {string} - A new string.
 */
util.replacePunctuation = function (str) {
  str = str.replaceAll(/[\u2018\u2019\u00b4]/gi, "'")
    .replaceAll(/[\u201c\u201d\u2033]/gi, '"')
    .replaceAll(/[\u2212\u2022\u00b7\u25aa]/gi, '-')
    .replaceAll(/[\u2013\u2015]/gi, '-')
    .replaceAll(/\u2014/gi, '-')
    .replaceAll(/\u2026/gi, '...')
  return str
}

/**
 * Remove string noise.
 *
 * Removes line numbers, time durations and annotations
 * from a song entry.
 *
 * @param {string} str - A string.
 * @return {string} A new string.
 */
util.stripNoise = function (str) {
  str = util.normalize(str)
  str = str.replaceAll(/].*/gi, ']')
    .replaceAll(/\).*/gi, ')')
    .replaceAll(/^\d+\. /gi, '')
    .replaceAll(/\[[^\]]*]/gi, '')
    .replaceAll(/\([^)]*\)/gi, '')
    .replaceAll(/-+/gi, '-')
    .replaceAll(/\.+/gi, '.')
  str = util.stripPunctuation(str, '-\'.')
  str = util.stripWhitespace(str)
  return str
}

/**
 * Remove superfluous punctuation characters.
 *
 * Strips the string of all punctuation characters
 * except the ones specified in `keep` (by default,
 * `-`, `'` and `.`).
 *
 * @param {string} str - A string.
 * @param {string} [keep] - Punctuation characters to keep.
 * @return {string} - A new string.
 */
util.stripPunctuation = function (str, keep = '') {
  keep = _.escapeRegExp(keep)
  if (_.isEmpty(XRegExp)) {
    str = str.replaceAll(new RegExp('[^' + keep + String.raw`\s\w` + ']', 'gi'), '')
  } else {
    str = str.replaceAll(XRegExp('[^' + keep + String.raw`\s\w\pL` + ']', 'gi'), '')
  }
  return str
}

/**
 * Clean up a string's whitespace.
 *
 * Trim the string and remove multiple successive spaces and newlines.
 *
 * @param {string} str - A string.
 * @return {string} A new string.
 */
util.stripWhitespace = function (str, space = String.raw`\s`) {
  str = str || ''
  str = str.trim()
  str = str.replaceAll(new RegExp('[' + space + ']+', 'g'), ' ')
  return str
}

/**
 * Intelligently convert a string to pure ASCII.
 *
 * Replace Unicode characters with their ASCII equivalents as much
 * as possible. Then strip away all remaining Unicode characters.
 *
 * @param {string} str - A string.
 * @return {string} - A new string.
 */
util.toAscii = function (str) {
  str = util.replacePunctuation(str)
  str = _.deburr(str)
  str = str.replaceAll(/[^\w\s-]/gi, '')
  return str.trim()
}

module.exports = util
