/* global jQuery:true */
/* exported jQuery */
const $ = require('jquery')
jQuery = $
require('bootstrap')

const Generator = require('../lib/generator')
const SpotifyAuth = require('../lib/auth')

const AUTH_STORAGE_KEY = 'spotgen.spotifyAuth'
const PKCE_STORAGE_KEY = 'spotgen.spotifyPkce'
const TEXTAREA_STORAGE_KEY = 'spotgen.textarea'
const WEB_CLIENT_ID = '5a6dd5372d8b4bf6b093880413b8baae'

function browserStorage () {
  return window.sessionStorage || window.localStorage
}

function redirectUri () {
  return window.location.href.split('#')[0].split('?')[0]
}

function setLog (message) {
  $('.log').text(message || '')
}

function getTextarea () {
  return $('#generator-input').length ? $('#generator-input') : $('textarea')
}

function getButton () {
  return $('.create-btn').length ? $('.create-btn') : $('a.btn')
}

function storedSession () {
  const raw = browserStorage().getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    browserStorage().removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

function storeSession (session) {
  browserStorage().setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

function clearSession () {
  browserStorage().removeItem(AUTH_STORAGE_KEY)
}

function sessionFromResponse (response, previous) {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token || (previous ? previous.refreshToken : ''),
    expiresAt: Date.now() + Math.max((response.expires_in || 0) - 60, 0) * 1000
  }
}

function validSession (session) {
  return session && session.accessToken && session.expiresAt && Date.now() < session.expiresAt
}

async function refreshSession (session) {
  if (!session || !session.refreshToken) {
    return null
  }

  const auth = new SpotifyAuth(WEB_CLIENT_ID, null, session)
  const response = await auth.authorizationCodePKCERefresh(session.refreshToken)
  const nextSession = sessionFromResponse(response, session)
  storeSession(nextSession)
  return nextSession
}

async function activeSession () {
  const session = storedSession()
  if (validSession(session)) {
    return session
  }

  try {
    return await refreshSession(session)
  } catch (error) {
    clearSession()
    return null
  }
}

async function startLogin () {
  const auth = new SpotifyAuth(WEB_CLIENT_ID)
  const login = await auth.authorizationCodePKCEFlowURI(redirectUri())
  browserStorage().setItem(PKCE_STORAGE_KEY, JSON.stringify({
    verifier: login.verifier,
    state: login.state
  }))
  window.location.assign(login.url)
}

async function completeLogin () {
  const params = new URLSearchParams(window.location.search || '')
  const error = params.get('error')
  if (error) {
    window.history.replaceState(null, document.title, redirectUri())
    throw new Error('Spotify login failed: ' + error)
  }

  const code = params.get('code')
  if (!code) {
    return null
  }

  const stored = browserStorage().getItem(PKCE_STORAGE_KEY)
  browserStorage().removeItem(PKCE_STORAGE_KEY)
  if (!stored) {
    throw new Error('Spotify login state is missing. Sign in again.')
  }

  const pkce = JSON.parse(stored)
  if (params.get('state') !== pkce.state) {
    throw new Error('Spotify login state did not match. Sign in again.')
  }

  const auth = new SpotifyAuth(WEB_CLIENT_ID)
  const response = await auth.authorizationCodePKCEFlow(code, pkce.verifier, redirectUri())
  const session = sessionFromResponse(response)
  storeSession(session)
  window.history.replaceState(null, document.title, redirectUri())
  return session
}

function resetCreateButton () {
  const button = getButton()
  button.text('Create Playlist')
  button.removeClass('disabled')
  button.removeClass('active')
  button.mouseleave()
  button.tooltip('enable')
}

function insertPlaylist () {
  resetCreateButton()
  const str = $(this).find('pre').text()
  const callback = function () {
    getTextarea().val(str)
    getTextarea().focus()
    setTimeout(function () {
      getButton().mouseover()
    }, 1000)
  }
  if ($('html').scrollTop() === 0) {
    callback()
  } else {
    $('html, body').stop().animate({ scrollTop: 0 }, '500', 'swing', callback)
  }
  return false
}

async function generate () {
  const textarea = getTextarea()
  const button = getButton()
  const input = textarea.val().trim()

  if (!input) {
    setLog('Input is required.')
    return false
  }

  const session = await activeSession()
  if (!session || !session.accessToken) {
    window.localStorage.setItem(TEXTAREA_STORAGE_KEY, textarea.val())
    await startLogin()
    return false
  }

  button.text('Creating Playlist ...')
  button.addClass('active')
  button.addClass('disabled')
  button.mouseleave()
  button.tooltip('disable')

  try {
    const generator = new Generator(input, WEB_CLIENT_ID, null, session)
    const result = await generator.generate()
    button.removeClass('disabled')
    textarea.val(result)
    textarea.focus()
    textarea.select()
    if (result === '') {
      resetCreateButton()
      setLog('')
    } else {
      button.text('Created Playlist')
      setLog('Copy and paste the above into a new Spotify playlist.')
    }
  } catch (error) {
    resetCreateButton()
    const message = (error && error.message) ? error.message : 'Generation failed.'
    setLog(message)
  }
  return false
}

function clickCreate (event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault()
  }
  generate()
  return false
}

$(function () {
  const button = getButton()

  $('.thumbnail a').on('click', insertPlaylist)
  $('.clear-btn').on('click', function () {
    getTextarea().val('')
    setLog('')
    resetCreateButton()
  })
  button.on('click', clickCreate)
  button.tooltip()
  button.attr('href', '#')
  getTextarea().focus()

  completeLogin().then(function () {
    const saved = window.localStorage.getItem(TEXTAREA_STORAGE_KEY)
    if (saved) {
      window.localStorage.removeItem(TEXTAREA_STORAGE_KEY)
      getTextarea().val(saved)
      generate()
    }
  }).catch(function (error) {
    resetCreateButton()
    const message = (error && error.message) ? error.message : 'Spotify login failed.'
    setLog(message)
  })
})
