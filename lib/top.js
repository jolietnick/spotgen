const Artist = require('./artist')
const Queue = require('./queue')
const sort = require('./sort')
const Track = require('./track')

/**
 * Top entry.
 * @constructor
 * @param {SpotifyWebApi} spotify - Spotify web API.
 * @param {string} entry - The artist to search for.
 * @param {string} [id] - The Spotify ID, if known.
 * @param {string} [limit] - The number of tracks to fetch.
 */
function Top (spotify, entry, id, limit) {
  /**
   * Entry string.
   */
  this.entry = null

  /**
   * Spotify ID.
   */
  this.id = ''

  /**
   * Number of tracks to fetch.
   */
  this.limit = null

  /**
   * Top tracks.
   */
  this.tracks = null

  /**
   * Spotify request handler.
   */
  this.spotify = null

  this.entry = entry.trim()
  this.id = id
  this.limit = limit
  this.spotify = spotify
}

/**
 * Create a queue of tracks.
 * @param {JSON} response - A JSON response object.
 * @return {Promise | Queue} A queue of tracks.
 */
Top.prototype.createQueue = function () {
  const tracks = this.tracks.map((item) => {
    const track = new Track(this.spotify, this.entry)
    track.clone(item)
    return track
  })
  let trackQueue = new Queue(tracks)
  if (this.limit) {
    trackQueue = trackQueue.slice(0, this.limit)
  }
  return trackQueue
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of tracks.
 */
Top.prototype.dispatch = function () {
  return this.searchArtists().then(() => {
    return this.getArtistTopTracks()
  }).then(() => {
    return this.createQueue()
  })
}

/**
 * Fetch top tracks.
 * @return {Promise | JSON} A JSON response.
 */
Top.prototype.getArtistTopTracks = function (country = 'US') {
  return this.spotify.getArtistTopTracks(this.id, country).then((response) => {
    sort(response.body.tracks, sort.popularity)
    this.tracks = response.body.tracks
    return this
  })
}

/**
 * Search for the artist's ID if not known.
 * @return {Promise} A Promise to perform the action.
 */
Top.prototype.searchArtists = function () {
  if (this.id) {
    return Promise.resolve(this)
  } else {
    const artist = new Artist(this.spotify, this.entry)
    return artist.searchArtists().then((artist) => {
      this.id = artist.id
      return this
    })
  }
}

module.exports = Top
