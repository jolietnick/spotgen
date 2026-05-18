const base64 = require('base-64')
const defaults = require('./defaults')
const http = require('./http')

function accessTokenFrom (token) {
  if (token && typeof token === 'object') {
    return token.accessToken || token.access_token || ''
  }
  return token || ''
}

function refreshTokenFrom (token) {
  if (token && typeof token === 'object') {
    return token.refreshToken || token.refresh_token || ''
  }
  return ''
}

function expiresAtFrom (token) {
  if (token && typeof token === 'object') {
    return token.expiresAt || token.expires_at || 0
  }
  return 0
}

function randomString (length) {
  const root = typeof globalThis !== 'undefined' ? globalThis : {}
  const cryptoObj = root.crypto || (root.window ? root.window.crypto : null)
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('A secure browser crypto API is required for Spotify login.')
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  cryptoObj.getRandomValues(bytes)
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

function base64UrlEncode (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  const root = typeof globalThis !== 'undefined' ? globalThis : {}
  const encoded = typeof root.btoa === 'function'
    ? root.btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64')
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function codeChallenge (verifier) {
  const root = typeof globalThis !== 'undefined' ? globalThis : {}
  const cryptoObj = root.crypto || (root.window ? root.window.crypto : null)
  if (!cryptoObj || !cryptoObj.subtle || typeof root.TextEncoder !== 'function') {
    return Promise.reject(new Error('A browser with Web Crypto support is required for Spotify login.'))
  }

  const bytes = new root.TextEncoder().encode(verifier)
  return cryptoObj.subtle.digest('SHA-256', bytes).then(function (digest) {
    return base64UrlEncode(new Uint8Array(digest))
  })
}

/**
 * Create a Spotify authentication handler.
 * @constructor
 * @param {string} [clientId] - Client ID.
 * @param {string} [clientKey] - Client secret key.
 * @param {string|Object} [token] - Access token, or PKCE token session.
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
  this.token = accessTokenFrom(token)

  /**
   * Refresh token for Authorization Code with PKCE.
   */
  this.refreshTokenValue = refreshTokenFrom(token)

  /**
   * Access token expiry timestamp.
   */
  this.expiresAt = expiresAtFrom(token)
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
 * Create a Spotify Authorization Code with PKCE login target.
 *
 * @param {string} uri - Redirect URI.
 * @param {string} [scopes] - A space-separated list of scopes.
 * @param {string} [state] - CSRF protection state.
 * @return {Promise | Object} Login URL plus PKCE verifier and state.
 */
SpotifyAuth.prototype.authorizationCodePKCEFlowURI = function (uri, scopes, state) {
  const verifier = randomString(64)
  state = state || randomString(32)

  return codeChallenge(verifier).then((challenge) => {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: uri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    })
    if (scopes) {
      params.set('scope', scopes)
    }

    return {
      url: 'https://accounts.spotify.com/authorize?' + params.toString(),
      verifier,
      state
    }
  })
}

/**
 * Exchange an authorization code for a token.
 *
 * @param {string} code - Authorization code from Spotify.
 * @param {string} verifier - PKCE code verifier.
 * @param {string} uri - Redirect URI.
 * @return {Promise | JSON} An access token response.
 */
SpotifyAuth.prototype.authorizationCodePKCEFlow = function (code, verifier, uri) {
  return http('https://accounts.spotify.com/api/token', {
    method: 'POST',
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: uri,
      client_id: this.clientId,
      code_verifier: verifier
    }
  })
}

/**
 * Refresh a PKCE access token.
 *
 * @param {string} refreshToken - Spotify refresh token.
 * @return {Promise | JSON} An access token response.
 */
SpotifyAuth.prototype.authorizationCodePKCERefresh = function (refreshToken) {
  return http('https://accounts.spotify.com/api/token', {
    method: 'POST',
    form: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    }
  })
}

SpotifyAuth.prototype.cacheTokenResponse = function (response) {
  const accessToken = response ? response.access_token : ''
  if (accessToken) {
    this.token = accessToken
    this.refreshTokenValue = response.refresh_token || this.refreshTokenValue
    this.expiresAt = Date.now() + Math.max((response.expires_in || 0) - 60, 0) * 1000
  }
  return this.token
}

/**
 * Refresh the bearer access token.
 *
 * @return {Promise | string} A new bearer access token,
 * or the empty string if not available.
 */
SpotifyAuth.prototype.refreshToken = function () {
  if (this.refreshTokenValue) {
    return this.authorizationCodePKCERefresh(this.refreshTokenValue).then((response) => {
      return this.cacheTokenResponse(response)
    })
  }

  return this.clientsCredentialsFlow().then((response) => {
    return this.cacheTokenResponse(response)
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
