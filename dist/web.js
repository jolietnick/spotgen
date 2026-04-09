/* global jQuery:true */
/* exported jQuery */
const $ = require('jquery')
jQuery = $
require('bootstrap')

function setLog (message) {
  $('.log').text(message || '')
}

function apiBaseUrl () {
  const protocol = window.location.protocol || 'http:'
  const hostname = window.location.hostname || 'localhost'
  return protocol + '//' + hostname + ':3000'
}

function resetCreateButton () {
  const button = $('.create-btn')
  button.text('Create Playlist')
  button.removeClass('disabled')
  button.removeClass('active')
  button.mouseleave()
  button.tooltip('enable')
}

async function generate () {
  const textarea = $('#generator-input')
  const button = $('.create-btn')
  const input = textarea.val().trim()

  if (!input) {
    setLog('Input is required.')
    return false
  }

  button.text('Creating Playlist ...')
  button.addClass('active')
  button.addClass('disabled')
  button.mouseleave()
  button.tooltip('disable')

  try {
    const response = await fetch(apiBaseUrl() + '/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input })
    })
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : 'Generation failed.')
    }
    const result = payload && payload.output ? payload.output : ''
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

function clickCreate () {
  return generate()
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

  button.attr('href', '#')
})
