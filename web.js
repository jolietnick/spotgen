/* global jQuery:true */
/* exported jQuery */
const $ = require('jquery')
jQuery = $
require('bootstrap')

const SpotifyAuth = require('../lib/auth')
const Generator = require('../lib/generator')

function setLog (message) {
  $('.log').text(message || '')
}

function token () {
  const hash = window.location.hash || ''
  const query = hash.startsWith('#') ? hash.slice(1) : hash
  const urlParams = new URLSearchParams(query)
  return urlParams.get('access_token') || ''
}

function hasToken () {
  return token() !== ''
}

function loginUrl (spotify) {
  if (spotify && typeof spotify.implicitGrantFlowURI === 'function') {
    return spotify.implicitGrantFlowURI(window.location.href)
  }

  const redirectUri = window.location.href.split('#')[0]
  const params = new URLSearchParams({
    client_id: spotify && spotify.clientId ? spotify.clientId : '',
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: 'playlist-modify-public playlist-modify-private'
  })
  return 'https://accounts.spotify.com/authorize?' + params.toString()
}

function resetCreateButton () {
  const button = $('.create-btn')
  button.text('Create Playlist')
  button.removeClass('disabled')
  button.removeClass('active')
  button.mouseleave()
  button.tooltip('enable')
}

function generate () {
  const textarea = $('#generator-input')
  const button = $('.create-btn')
  const input = textarea.val().trim()

  if (!input) {
    setLog('Input is required.')
    return false
  }

  const generator = new Generator(input, null, null, token())
  button.text('Creating Playlist ...')
  button.addClass('active')
  button.addClass('disabled')
  button.mouseleave()
  button.tooltip('disable')

  generator.generate().then(function (result) {
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
  }).catch(function (error) {
    resetCreateButton()
    const message = (error && error.message) ? error.message : 'Generation failed.'
    setLog(message)
  })
  return false
}

function clickCreate () {
  if (hasToken()) {
    return generate()
  }
  localStorage.setItem('textarea', $('#generator-input').val())
  return true
}

$(function () {
  const button = $('.create-btn')

  $('.clear-btn').on('click', function () {
    $('#generator-input').val('')
    setLog('')
  })
  button.on('click', clickCreate)
  button.tooltip()
  $('#generator-input').focus()

  if (hasToken()) {
    if (localStorage.getItem('textarea')) {
      $('#generator-input').val(localStorage.getItem('textarea'))
      localStorage.removeItem('textarea')
      generate()
    }
    button.attr('href', '#')
  } else {
    const spotify = new SpotifyAuth()
    button.attr('href', loginUrl(spotify))
  }
})
