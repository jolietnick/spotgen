const Album = require('./album')
const Queue = require('./queue')
const Track = require('./track')
const sort = require('./sort')

/**
 * Create a playlist collection.
 * @constructor
 * @param {SpotifyWebApi} [spotify] - Spotify web API.
 */
function Collection (spotify) {
  /**
   * Playlist alternating.
   */
  this.alternating = null

  /**
   * List of entries.
   */
  this.entries = new Queue()

  /**
   * Output format.
   * May be `csv`, `list`, `log` or `uri` (the default).
   */
  this.format = 'uri'

  /**
   * Playlist grouping.
   */
  this.grouping = null

  /**
   * Last.fm user.
   */
  this.lastfmUser = null

  /**
   * Playlist order.
   */
  this.ordering = null

  /**
   * Whether to reverse the playlist order.
   */
  this.reverse = false

  /**
   * Whether to shuffle the playlist.
   */
  this.shuffle = false

  /**
   * Whether to remove duplicates.
   */
  this.unique = true

  /**
   * Spotify request handler.
   */
  this.spotify = spotify
}

/**
 * Add an entry to the end of the collection queue.
 * @param {Track | Album | Artist} entry -
 * The entry to add.
 */
Collection.prototype.add = function (entry) {
  this.entries.add(entry)
}

/**
 * Alternate the collection entries.
 */
Collection.prototype.alternate = function () {
  if (this.alternating) {
    return this.getProperty(this.alternating).then(() => {
      return this.entries.alternate((track) => {
        const prop = track[this.alternating] + ''
        return prop.toLowerCase()
      })
    })
  } else {
    return Promise.resolve(this.entries)
  }
}

/**
 * Remove duplicate entries.
 * @return {Promise | Collection} - Itself.
 */
Collection.prototype.dedup = function () {
  if (this.unique) {
    return this.entries.dedup()
  }
  return Promise.resolve(this.entries)
}

/**
 * Dispatch all the entries in the collection.
 * @return {Promise | Queue} A queue of results.
 */
Collection.prototype.dispatch = function () {
  return this.getTracks().then(() => {
    return this.dedup()
  }).then(() => {
    return this.order()
  }).then(() => {
    return this.group()
  }).then(() => {
    return this.alternate()
  }).then(() => {
    return this.reorder()
  })
}

/**
 * Dispatch all the entries in the collection
 * and return the track listing.
 * @param {string} [format] - The output format.
 * May be `csv`, `list`, `log` or `uri` (the default).
 * @return {Promise | string} A newline-separated list
 * of Spotify URIs.
 */
Collection.prototype.execute = function (format) {
  this.format = format || this.format
  return this.dispatch().then(() => {
    return this.output()
  })
}

/**
 * Iterate over the collection's entries.
 * @param {Function} fn - An iterator function.
 * Takes the current entry as input.
 */
Collection.prototype.forEach = function (fn) {
  return this.entries.forEach(fn)
}

/**
 * Iterate over the collection's valid entries.
 * @param {Function} fn - An iterator function.
 * Takes the current entry as input.
 */
Collection.prototype.forEachEntry = function (fn) {
  return this.forEach(function (entry) {
    if ((entry instanceof Track || entry instanceof Album) &&
        entry.uri) {
      return fn(entry)
    }
  })
}

/**
 * Iterate over the collection's valid track.
 * @param {Function} fn - An iterator function.
 * Takes the current entry as input.
 */
Collection.prototype.forEachTrack = function (fn) {
  return this.forEach(function (entry) {
    if (entry instanceof Track && entry.uri) {
      return fn(entry)
    }
  })
}

/**
 * Fetch Last.fm metadata of each collection entry.
 * @return {Promise | Queue} A queue of results.
 */
Collection.prototype.getLastfm = function () {
  return this.entries.forEachPromise((entry) => {
    return entry.getLastfm(this.lastfmUser)
  })
}

/**
 * Get a property for all entries.
 */
Collection.prototype.getProperty = function (prop) {
  return this.entries.forEachPromise(function (entry) {
    return entry.getProperty(prop)
  })
}

/**
 * Dispatch the entries in the collection.
 * @return {Promise} A Promise to perform the action.
 */
Collection.prototype.getTracks = function () {
  return this.entries.dispatch().then((queue) => {
    this.entries = queue.flatten()
    return this.entries
  })
}

/**
 * Group the collection entries.
 */
Collection.prototype.group = function () {
  if (this.grouping) {
    return this.getProperty(this.grouping).then(() => {
      return this.entries.group((track) => {
        const prop = track[this.grouping] + ''
        return prop.toLowerCase()
      })
    })
  } else {
    return Promise.resolve(this.entries)
  }
}

/**
 * Log information about the collection.
 */
Collection.prototype.log = function () {
  const log = this.toLog()
  if (log) {
    console.log('\n' + log)
  }
}

/**
 * Order the collection entries.
 * @return {Promise} A Promise to perform the action.
 */
Collection.prototype.order = function () {
  if (this.ordering === 'lastfm') {
    return this.getLastfm().then(() => {
      return this.entries.sort(sort.lastfm)
    })
  } else if (this.ordering) {
    return this.getProperty(this.ordering).then(() => {
      return this.entries.sort((a, b) => {
        const x = a[this.ordering]
        const y = b[this.ordering]
        if (typeof x === 'string') {
          if (x < y) {
            return -1
          }
          if (x > y) {
            return 1
          }
          return 0
        } else {
          if (x < y) {
            return 1
          }
          if (x > y) {
            return -1
          }
          return 0
        }
      })
    })
  } else {
    return Promise.resolve(this.entries)
  }
}

/**
 * Output the contents of the collection.
 * @param {string} [format] - The output format.
 * May be `csv`, `list`, `log` or `uri` (the default).
 * @return {string} A newline-separated list of Spotify URIs.
 */
Collection.prototype.output = function (format) {
  format = format || this.format
  this.log()
  if (format === 'array') {
    return this.toArray()
  } else if (format === 'csv') {
    return this.toCSV()
  } else if (format === 'list') {
    return this.toList()
  } else if (format === 'log') {
    return this.toLog()
  } else if (format === 'queue') {
    return this.entries
  } else {
    return this.toURIs()
  }
}

/**
 * Reverse the order of the entries.
 * @return {Promise | Collection} - Itself.
 */
Collection.prototype.reorder = function () {
  if (this.reverse) {
    return this.entries.reverse()
  } else if (this.shuffle) {
    return this.entries.shuffle()
  }
  return Promise.resolve(this.entries)
}

/**
 * Convert the collection to an array of strings.
 * @return {string} An array of Spotify URIs.
 */
Collection.prototype.toArray = function () {
  return this.toURIs().split('\n')
}

/**
 * Convert the collection to CSV format.
 * @return {string} A newline-separated list of comma-separated values.
 */
Collection.prototype.toCSV = function () {
  let result = 'sep=,\n'
  this.forEachTrack(function (track) {
    result += track.csv() + '\n'
  })
  return result.trim()
}

/**
 * Convert the collection to a string.
 * @return {string} A newline-separated list of track titles.
 */
Collection.prototype.toList = function () {
  let result = ''
  this.forEachTrack(function (track) {
    result += track.title + '\n'
  })
  return result.trim()
}

/**
 * Produce a log string.
 * @return {string} A newline-separated list of track information.
 */
Collection.prototype.toLog = function () {
  let result = ''
  const prop = this.ordering || 'popularity'
  this.forEachTrack(function (track) {
    let line = track.title || track.uri
    if (line) {
      if (track.hasOwnProperty(prop) &&
          track[prop] !== null) {
        line += ' (' + prop + ': ' + track[prop] + ')'
      }
      result += line + '\n'
    }
  })
  return result.trim()
}

/**
 * Convert the collection to a string.
 * @return {string} A newline-separated list of Spotify URIs.
 */
Collection.prototype.toURIs = function () {
  let result = ''
  this.forEachTrack(function (track) {
    result += track.uri + '\n'
  })
  return result.trim()
}

module.exports = Collection
