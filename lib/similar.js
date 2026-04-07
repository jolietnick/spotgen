const Artist = require('./artist')
const Queue = require('./queue')
const Top = require('./top')

/**
 * Similar entry.
 * @constructor
 * @param {SpotifyWebApi} spotify - Spotify web API.
 * @param {string} entry - The artist to search for.
 * @param {string} [id] - The Spotify ID, if known.
 */
function Similar (spotify, entry, id, trackLimit, artistLimit) {
  /**
   * Array of related artists.
   */
  this.artists = null

  /**
   * Number of artists to fetch.
   */
  this.artistLimit = 20

  /**
   * Entry string.
   */
  this.entry = null

  /**
   * Spotify ID.
   */
  this.id = ''

  /**
   * Number of tracks to fetch per artist.
   */
  this.trackLimit = 5

  /**
   * Spotify request handler.
   */
  this.spotify = null

  this.entry = entry.trim()
  this.id = id
  this.spotify = spotify
  this.trackLimit = trackLimit || this.trackLimit
  this.artistLimit = artistLimit || this.artistLimit
}

/**
 * Create a queue of tracks.
 * @return {Promise | Queue} A queue of tracks.
 */
Similar.prototype.createQueue = function () {
  const artists = this.artists.map((artist) => {
    return new Top(this.spotify, this.entry, artist.id, this.limit)
  })
  let queue = new Queue(artists)
  queue = queue.slice(0, this.artistLimit)
  return queue.dispatch().then(function (result) {
    return result.interleave()
  })
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of tracks.
 */
Similar.prototype.dispatch = function () {
  return this.searchArtists().then(() => {
    return this.getArtistRelatedArtists()
  }).then(() => {
    return this.createQueue()
  })
}

/**
 * Search for artist.
 * @return {Promise} A Promise to perform the action.
 */
Similar.prototype.searchArtists = function () {
  const artist = new Artist(this.spotify, this.entry)
  return artist.searchArtists().then((artist) => {
    this.id = artist.id
  })
}

/**
 * Search for related artists.
 * @return {Promise} A Promise to perform the action.
 */
Similar.prototype.getArtistRelatedArtists = function () {
  return this.spotify.getArtistRelatedArtists(this.id).then((response) => {
    this.artists = response.body.artists
    return this
  })
}

module.exports = Similar
