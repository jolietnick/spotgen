const csvStringify = require('csv-stringify/lib/sync')
const defaults = require('./defaults')
const lastfm = require('./lastfm')(defaults.api)
const sort = require('./sort')
const util = require('./util')

function numberToString (num) {
  return (Number.isInteger(num) && (num >= 0)) ? num : ''
}

function trimTrackTitle (str) {
  str = util.toAscii(str)
  str = util.stripPunctuation(str)
  str = util.stripWhitespace(str)
  str = str.toLowerCase()
  return str
}

/**
 * Create track entry.
 * @constructor
 * @param {SpotifyWebApi} spotify - Spotify web API.
 * @param {string} entry - The track to search for.
 * @param {string} [id] - The Spotify ID, if known.
 */
function Track (spotify, entry, artist, name, album, id) {
  /**
   * Album name.
   */
  this.album = ''

  /**
   * Track artists, separated by `,`.
   */
  this.artist = ''

  /**
   * Array of track artists.
   */
  this.artists = null

  /**
   * Entry string.
   */
  this.entry = ''

  /**
   * Spotify ID.
   */
  this.id = ''

  /**
   * Last.fm global playcount.
   */
  this.lastfm = null

  /**
   * Last.fm global playcount.
   */
  this.lastfmGlobal = null

  /**
   * Last.fm personal playcount.
   */
  this.lastfmPersonal = null

  /**
   * Main track artist.
   */
  this.mainArtist = ''

  /**
   * Track name.
   */
  this.name = ''

  /**
   * Spotify popularity.
   */
  this.popularity = null

  /**
   * Spotify request handler.
   */
  this.spotify = null

  /**
   * Full track name on the form `Artist - Title`.
   */
  this.title = ''

  /**
   * Spotify URI
   * (a string on the form `spotify:track:xxxxxxxxxxxxxxxxxxxxxx`).
   */
  this.uri = ''

  this.entry = entry.trim()
  this.name = name
  this.artist = artist
  this.album = album
  this.id = id
  this.spotify = spotify
}

/**
 * Clone a JSON response.
 * @param {Object} response - The response.
 */
Track.prototype.clone = function (response) {
  for (const prop in response) {
    if (response.hasOwnProperty(prop)) {
      this[prop] = response[prop]
    }
  }
  if (response.album &&
      response.album.name) {
    this.album = response.album.name
  }
  if (response.artists) {
    this.artists = response.artists.map(function (artist) {
      return artist.name.trim()
    })
    this.artist = this.artists.join(', ')
    this.mainArtist = this.artists[0]
  }
  if (this.mainArtist && this.name) {
    this.title = this.mainArtist + ' - ' + this.name
  } else {
    this.title = this.name
  }
}

/**
 * Track data in CSV format, with the following fields:
 *
 * Spotify URI,
 * Track Name,
 * Artist Name,
 * Album Name,
 * Disc Number,
 * Track Number,
 * Track Duration,
 * Spotify popularity,
 * Last.fm rating
 *
 * @return {string} Track data in CSV format.
 */
Track.prototype.csv = function () {
  return csvStringify([[
    this.uri,
    this.name,
    this.artist,
    this.album,
    numberToString(this.disc_number),
    numberToString(this.track_number),
    numberToString(this.duration_ms),
    numberToString(this.popularity),
    numberToString(this.lastfm)
  ]]).trim()
}

/**
 * Dispatch entry.
 * @return {Promise | Track} Itself.
 */
Track.prototype.dispatch = function () {
  return this.getURI().then(() => {
    return this
  })
}

/**
 * Whether this track is equal to another track.
 * @param {Track} track - The track to compare against.
 * @return {boolean} `true` if the tracks are equal,
 * `false` otherwise.
 */
Track.prototype.equals = function (track) {
  return this.uri && track.uri && this.uri === track.uri
}

/**
 * Get track audio features.
 *
 * [Reference](https://developer.spotify.com/web-api/get-audio-features/).
 *
 * @return {Promise | Track} Itself.
 */
Track.prototype.getAudioFeaturesForTrack = function (id) {
  id = id || this.id
  if (this.tempo) {
    return Promise.resolve(this)
  } else {
    return this.spotify.getAudioFeaturesForTrack(id).then((response) => {
      this.clone(response.body)
      // define aliases
      this.unacousticness = 1 - (this.acousticness || 0)
      this.undanceability = 1 - (this.danceability || 0)
      this.unenergy = 1 - (this.energy || 0)
      this.uninstrumentalness = 1 - (this.instrumentalness || 0)
      this.unliveness = 1 - (this.liveness || 0)
      this.unloudness = 1 - (this.loudness || 0)
      this.unspeechiness = 1 - (this.speechiness || 0)
      this.unvalence = 1 - (this.valence || 0)
      return this
    })
  }
}

/**
 * Fetch Last.fm information.
 * @return {Promise | Track} Itself.
 */
Track.prototype.getLastfm = function (user) {
  return this.getProperty('artist').then(() => {
    return this.getProperty('name')
  }).then(() => {
    return lastfm.getInfo(this.artist, this.name, user).then((result) => {
      this.lastfmGlobal = Number.parseInt(result.track.playcount)
      this.lastfmPersonal = Number.parseInt(result.track.userplaycount)
      this.lastfm = this.lastfmPersonal > -1 ? this.lastfmPersonal : this.lastfmGlobal
      return this
    })
  })
}

/**
 * Get track popularity.
 * @return {Promise | integer} The track popularity.
 */
Track.prototype.getPopularity = function () {
  return this.getProperty('popularity')
}

/**
 * Get a track property.
 *
 * If the requested property is not set, this function fetches
 * the missing information from Spotify's web API.
 *
 * @param {string} prop - The property to get.
 * @return {Promise | Object} A value.
 */
Track.prototype.getProperty = function (prop) {
  const fetchProperty = (prop) => {
    if (this[prop]) {
      return Promise.resolve(this[prop])
    } else if (prop === 'lastfm' ||
               prop === 'lastfmGlobal' ||
               prop === 'lastfmPersonal') {
      return this.getLastfm()
    } else if (prop === 'danceability' ||
               prop === 'energy' ||
               prop === 'key' ||
               prop === 'loudness' ||
               prop === 'mode' ||
               prop === 'speechiness' ||
               prop === 'acousticness' ||
               prop === 'instrumentalness' ||
               prop === 'liveness' ||
               prop === 'valence' ||
               prop === 'tempo' ||
               prop === 'time_signature' ||
               prop === 'unacousticness' ||
               prop === 'undanceability' ||
               prop === 'unenergy' ||
               prop === 'uninstrumentalness' ||
               prop === 'unliveness' ||
               prop === 'unloudness' ||
               prop === 'unspeechiness' ||
               prop === 'unvalence') {
      return this.getProperty('id').then(() => {
        return this.getAudioFeaturesForTrack()
      })
    } else if (prop === 'popularity') {
      return this.getProperty('id').then(() => {
        return this.getTrack()
      })
    } else if (prop === 'artist' ||
               prop === 'name' ||
               prop === 'album') {
      if (this.id) {
        return this.getTrack()
      } else {
        return this.searchTracks()
      }
    } else if (prop === 'uri') {
      if (this.id) {
        this.uri = 'spotify:track:' + this.id
      } else {
        return this.searchTracks()
      }
    } else if (prop === 'id') {
      return this.searchTracks()
    }
    return Promise.resolve(this[prop])
  }
  return fetchProperty(prop).then(() => {
    return this[prop]
  })
}

/**
 * Fetch track metadata.
 * @return {Promise | Track} Itself.
 */
Track.prototype.getTrack = function (id) {
  id = id || this.id
  if (Number.isInteger(this.popularity)) {
    return Promise.resolve(this)
  } else {
    return this.spotify.getTrack(id).then((response) => {
      this.clone(response.body)
      return this
    }).catch(() => {
      console.log('COULD NOT FIND: ' + this.entry)
      throw new Error('COULD NOT FIND: ' + this.entry)
    })
  }
}

/**
 * Get track URI.
 * @return {Promise | Track} Itself.
 */
Track.prototype.getURI = function () {
  return this.getProperty('uri')
}

/**
 * Whether the track has the given artist.
 * @param {string} artist - The artist.
 * @return {boolean} `true` the track has the artist,
 * `false` otherwise.
 */
Track.prototype.hasArtist = function (artist) {
  artist = artist.trim().toLowerCase()
  for (const i in this.artists) {
    const trackArtist = this.artists[i].toLowerCase().trim()
    if (trackArtist.includes(artist)) {
      return true
    }
  }
  return false
}

/**
 * Search for track.
 * @param {string} [track] - The track.
 * @param {string} [artist] - The track artist.
 * @param {string} [album] - The track album.
 * @return {Promise | Track} Itself.
 */
Track.prototype.searchTracks = function (track, artist, album) {
  // helper functions
  const search = (track, artist, album) => {
    let query = track.trim()
    if (artist || album) {
      query = 'track:"' + track.trim() + '"'
      query += artist ? (' artist:"' + artist.trim() + '"') : ''
      query += album ? (' album:"' + album.trim() + '"') : ''
    }
    return this.spotify.searchTracks(query).then((response) => {
      if (response &&
          response.body &&
          response.body.tracks &&
          response.body.tracks.items &&
          response.body.tracks.items[0]) {
        // Sort results by string similarity. This takes care of some
        // odd cases where a random track from an album of the same name
        // is returned as the first hit.
        if (!artist) {
          sort(response.body.tracks.items, sort.track(query))
        }
        response = response.body.tracks.items[0]
        this.clone(response)
        return this
      } else {
        console.log('COULD NOT FIND: ' + this.entry)
        throw response
      }
    })
  }

  const searchTrackArtist = (title, artist, album) => {
    return search(title, artist, album).catch(() => {
      // swap artist and title and try again
      return search(artist, title, album)
    })
  }

  const searchTrackArtistAlbum = (title, artist, album) => {
    return searchTrackArtist(title, artist, album).catch(() => {
      if (album) {
        // try again without artist
        return searchTrackArtist(title, artist)
      } else {
        throw new Error('COULD NOT FIND: ' + this.entry)
      }
    })
  }

  const searchQuery = (query) => {
    return search(query).catch(() => {
      // try again with simplified search query
      const str = util.toAscii(util.stripNoise(query))
      if (str && str !== query) {
        return search(str)
      } else {
        throw new Error('COULD NOT FIND: ' + this.entry)
      }
    }).catch(() => {
      // try again as ID
      if (query.match(/^[0-9a-z]+$/i)) {
        return this.getTrack(query)
      } else {
        console.log('COULD NOT FIND: ' + this.entry)
        throw new Error('COULD NOT FIND: ' + this.entry)
      }
    })
  }

  // search parameters
  track = track || this.name || this.entry
  artist = artist || this.artist
  album = album || this.album

  // perform search
  if (this.id) {
    return Promise.resolve(this)
  } else if (artist) {
    track = this.name
    return searchTrackArtistAlbum(track, artist, album).catch(() => {
      return searchQuery((artist ? (artist + ' - ') : '') +
                         track +
                         (album ? (' - ' + album) : ''))
    })
  } else {
    return searchQuery(track)
  }
}

/**
 * Whether this track is similar to another track.
 * @param {Track} track - The track to compare against.
 * @return {boolean} `true` if the tracks are similar,
 * `false` otherwise.
 */
Track.prototype.similarTo = function (track) {
  return this.equals(track) ||
    (this.title && track.title &&
     (this.title === track.title ||
      (trimTrackTitle(this.title) !== '' &&
       trimTrackTitle(this.title) === trimTrackTitle(track.title))))
}

/**
 * Full track title.
 * @return {string} The track title.
 */
Track.prototype.toString = function () {
  return this.title || this.name || this.entry || this.id
}

module.exports = Track
