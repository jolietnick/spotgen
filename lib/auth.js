const base64 = require('base-64')
const defaults = require('./defaults')
const http = require('./http')

/**
 * Create a Spotify authentication handler.
 * @constructor
 * @param {string} [clientId] - Client ID.
 * @param {string} [clientKey] - Client secret key.
 * @param {string} [token] - Access token (if already authenticated).
 */
function SpotifyAuth (clientId, clientKey, token) {
  /**
   * Client ID.
   */
  this.clientId = clientId || defaults.id

  /**
   * Client secret key.
   */
  this.clientKey = clientKey || defaults.key

  /**
   * Access token.
   */
  this.token = token || ''

  /**
   * Access token expiry timestamp.
   */
  this.expiresAt = 0
}

/**
 * Authenticate with the Client Credentials Flow.
 *
 * This flow is app-only and suitable for catalog lookups and audio
 * features.
 *
 * @param {string} clientId - Client ID.
 * @param {string} clientKey - Client secret key.
 * @return {Promise | JSON} An access token response.
 */
SpotifyAuth.prototype.clientsCredentialsFlow = function (clientId, clientKey) {
  clientId = clientId || this.clientId
  clientKey = clientKey || this.clientKey
  const auth = 'Basic ' + base64.encode(clientId + ':' + clientKey)
  const uri = 'https://accounts.spotify.com/api/token'
  return http(uri, {
    method: 'POST',
    headers: {
      Authorization: auth
    },
    form: {
      grant_type: 'client_credentials'
    }
  })
}

/**
 * Refresh the bearer access token.
 *
 * @return {Promise | string} A new bearer access token,
 * or the empty string if not available.
 */
SpotifyAuth.prototype.refreshToken = function () {
  return this.clientsCredentialsFlow().then((response) => {
    const accessToken = response ? response.access_token : ''
    if (accessToken) {
      this.token = response.access_token
      this.expiresAt = Date.now() + ((response.expires_in || 0) * 1000)
    }
    return this.token
  })
}

/**
 * Obtain a bearer access token.
 *
 * @return {Promise | string} A bearer access token,
 * or the empty string if not available.
 */
SpotifyAuth.prototype.getToken = function () {
  if (this.token && (!this.expiresAt || Date.now() < this.expiresAt)) {
    return Promise.resolve(this.token)
  } else {
    return this.refreshToken()
  }
}

module.exports = SpotifyAuth
