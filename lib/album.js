const Queue = require('./queue')
const Track = require('./track')
const sort = require('./sort')
const util = require('./util')

/**
 * Create album entry.
 * @constructor
 * @param {SpotifyWebApi} spotify - Spotify web API.
 * @param {string} entry - The album to search for.
 * @param {string} [id] - The Spotify ID, if known.
 * @param {string} [limit] - The number of tracks to fetch.
 */
function Album (spotify, entry, artist, name, id, limit) {
  /**
   * Entry string.
   */
  this.entry = ''

  /**
   * Whether to fetch tracks.
   */
  this.fetchTracks = true

  /**
   * Spotify ID.
   */
  this.id = ''

  /**
   * Number of albums to fetch.
   */
  this.limit = null

  /**
   * The album name.
   */
  this.name = ''

  /**
   * The album popularity.
   * @return {string} - The album popularity.
   */
  this.popularity = null

  /**
   * Spotify request handler.
   */
  this.spotify = null

  /**
   * Album tracks.
   */
  this.tracks = null

  /**
   * Spotify URI
   * (a string on the form `spotify:album:xxxxxxxxxxxxxxxxxxxxxx`).
   */
  this.uri = ''

  this.entry = entry.trim()
  this.name = name
  this.artist = artist
  this.id = id
  this.limit = limit
  this.spotify = spotify
  this.uri = this.id ? ('spotify:album:' + this.id) : this.uri
}

/**
 * Clone a JSON response.
 * @param {Object} response - The response.
 */
Album.prototype.clone = function (response) {
  for (const prop in response) {
    if (Object.hasOwn(response, prop)) {
      this[prop] = response[prop]
    }
  }
  if (response &&
      response.tracks &&
      response.tracks.items) {
    this.tracks = response.tracks.items
  }
}

/**
 * Create a queue of tracks.
 * @param {JSON} response - A JSON response object.
 * @return {Promise | Queue} A queue of tracks.
 */
Album.prototype.createQueue = function () {
  const tracks = this.tracks.map((item) => {
    const track = new Track(this.spotify, this.entry)
    track.clone(item)
    track.album = this.name
    return track
  })
  let queue = new Queue(tracks)
  if (this.limit) {
    queue = queue.slice(0, this.limit)
  }
  return queue
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of tracks.
 */
Album.prototype.dispatch = function () {
  if (this.fetchTracks) {
    return this.getTracks().then(() => this.createQueue())
  } else {
    return this.searchAlbums()
  }
}

/**
 * Fetch album metadata.
 * @return {Promise | JSON} A JSON response.
 */
Album.prototype.getAlbum = function (id) {
  id = id || this.id
  if (Number.isInteger(this.popularity)) {
    return Promise.resolve(this)
  } else {
    return this.spotify.getAlbum(id).then((response) => {
      this.clone(response.body)
      return this
    }).catch(() => {
      console.log('COULD NOT FIND: ' + this.entry)
      throw new Error('COULD NOT FIND: ' + this.entry)
    })
  }
}

/**
 * Get album popularity.
 * @return {Promise | integer} The track popularity.
 */
Album.prototype.getPopularity = function () {
  if (Number.isInteger(this.popularity)) {
    return Promise.resolve(this.popularity)
  } else {
    return this.getAlbum().then(() => this.popularity)
  }
}

/**
 * Get album tracks.
 * @return {Promise | Album} Itself.
 */
Album.prototype.getTracks = function () {
  if (this.tracks) {
    return Promise.resolve(this)
  } else if (this.id) {
    return this.getAlbum()
  } else {
    return this.searchAlbums().then(() => this.getAlbum())
  }
}

/**
 * Search for album if not known.
 * @param {string} [album] - The album.
 * @param {string} [artist] - The album artist.
 * @return {Promise | JSON} A JSON response, or `null` if not found.
 */
Album.prototype.searchAlbums = function (album, artist) {
  // helper functions
  const search = (albumName, artistName) => {
    let query = albumName.trim()
    if (artistName) {
      query = 'album:"' + albumName.trim() + '"'
      query += ' artist:"' + artistName.trim() + '"'
    }
    return this.spotify.searchAlbums(query).then((response) => {
      if (response &&
          response.body &&
          response.body.albums &&
          response.body.albums.items &&
          response.body.albums.items[0]) {
        // sort results by string similarity
        if (!artistName) {
          sort(response.body.albums.items, sort.similarAlbum(query))
        }
        const albumResponse = response.body.albums.items[0]
        this.clone(albumResponse)
        return this
      } else {
        console.log('COULD NOT FIND: ' + this.entry)
        const error = new Error('COULD NOT FIND: ' + this.entry)
        error.response = response
        throw error
      }
    })
  }

  const searchAlbumArtist = (firstTerm, secondTerm) => {
    return search(firstTerm, secondTerm).catch(() => {
      // swap album and artist and try again
      return search(secondTerm, firstTerm)
    })
  }

  const searchQuery = (query) => {
    const albumArtist = /^(.*?)\s+-\s+(.*)$/i.exec(query)
    const tryByAlbumArtist = albumArtist
      ? searchAlbumArtist(albumArtist[1], albumArtist[2]).catch(() => search(query))
      : search(query)

    return tryByAlbumArtist.catch(() => {
      // try again with simplified search query
      const str = util.toAscii(util.stripNoise(query))
      if (str && str !== query) {
        const normalizedAlbumArtist = /^(.*?)\s+-\s+(.*)$/i.exec(str)
        if (normalizedAlbumArtist) {
          return searchAlbumArtist(normalizedAlbumArtist[1], normalizedAlbumArtist[2]).catch(() => search(str))
        }
        return search(str)
      } else {
        throw new Error('COULD NOT FIND: ' + this.entry)
      }
    }).catch(() => {
      // try again as ID
      if (query.match(/^[0-9a-z]+$/i)) {
        return this.getAlbum(query)
      } else {
        console.log('COULD NOT FIND: ' + this.entry)
        throw new Error('COULD NOT FIND: ' + this.entry)
      }
    })
  }

  // search parameters
  album = album || this.entry
  artist = artist || this.artist

  // perform search
  if (this.id) {
    return Promise.resolve(this)
  } else if (artist) {
    album = this.name
    return searchAlbumArtist(album, artist).catch(() => searchQuery(artist + ' - ' + album))
  } else {
    return searchQuery(album)
  }
}

module.exports = Album
