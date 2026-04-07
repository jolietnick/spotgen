/* global jQuery:true, localStorage, URLSearchParams */
/* exported jQuery */
const $ = require('jquery')
jQuery = $
require('bootstrap')
const Generator = require('../lib/generator')
const SpotifyAuth = require('../lib/auth')

const MODE_CONFIG = {
  track: {
    placeholder: 'ARTIST - TITLE',
    hint: 'Track mode: write one line per track using "ARTIST - TITLE".',
    fields: [
      { id: 'artist', label: 'Artist', required: true, placeholder: 'Beach House' },
      { id: 'title', label: 'Title', required: true, placeholder: 'Walk in the Park' }
    ],
    buildLine: function (values) {
      return values.artist + ' - ' + values.title
    },
    accepts: function (line) {
      return /^(spotify:track:[0-9a-z]+)$/i.test(line) ||
        /^(https?:\/\/(open|play)\.spotify\.com\/(.*\/)*track\/([0-9a-z]+))/i.test(line) ||
        /^(.*?)\s+-\s+(.*)$/i.test(line)
    }
  },
  album: {
    placeholder: '#album ARTIST - ALBUM',
    hint: 'Album mode: use "#album ARTIST - ALBUM".',
    fields: [
      { id: 'artist', label: 'Artist', required: true, placeholder: 'Biosphere' },
      { id: 'album', label: 'Album', required: true, placeholder: 'Substrata' },
      { id: 'limit', label: 'Limit', required: false, placeholder: 'optional, eg 5' }
    ],
    buildLine: function (values) {
      const suffix = values.limit ? values.limit : ''
      return '#album' + suffix + ' ' + values.artist + ' - ' + values.album
    },
    accepts: function (line) {
      return /^#album(id)?\d*\s+.+$/i.test(line) ||
        /^(spotify:album:[0-9a-z]+)$/i.test(line) ||
        /^(https?:\/\/(open|play)\.spotify\.com\/(.*\/)*album\/([0-9a-z]+))/i.test(line)
    }
  },
  top: {
    placeholder: '#top ARTIST or #top5 ARTIST',
    hint: 'Top mode: use "#top ARTIST" or "#topN ARTIST".',
    fields: [
      { id: 'artist', label: 'Artist', required: true, placeholder: 'Aphex Twin' },
      { id: 'limit', label: 'Limit', required: false, placeholder: 'optional, eg 10' }
    ],
    buildLine: function (values) {
      const suffix = values.limit ? values.limit : ''
      return '#top' + suffix + ' ' + values.artist
    },
    accepts: function (line) {
      return /^#top\d*\s+.+$/i.test(line)
    }
  },
  similar: {
    placeholder: '#similar ARTIST or #similar10 ARTIST',
    hint: 'Similar mode: use "#similar ARTIST" or "#similarN ARTIST".',
    fields: [
      { id: 'artist', label: 'Artist', required: true, placeholder: 'Moby' },
      { id: 'limit', label: 'Limit', required: false, placeholder: 'optional, eg 10' }
    ],
    buildLine: function (values) {
      const suffix = values.limit ? values.limit : ''
      return '#similar' + suffix + ' ' + values.artist
    },
    accepts: function (line) {
      return /^#similar\d*\s+.+$/i.test(line)
    }
  },
  artist: {
    placeholder: '#artist ARTIST or #artist20 ARTIST',
    hint: 'Artist mode: use "#artist ARTIST" or "#artistN ARTIST".',
    fields: [
      { id: 'artist', label: 'Artist', required: true, placeholder: 'Beach House' },
      { id: 'limit', label: 'Limit', required: false, placeholder: 'optional, eg 20' }
    ],
    buildLine: function (values) {
      const suffix = values.limit ? values.limit : ''
      return '#artist' + suffix + ' ' + values.artist
    },
    accepts: function (line) {
      return /^#artist\d*\s+.+$/i.test(line) ||
        /^(spotify:artist:[0-9a-z]+)$/i.test(line) ||
        /^(https?:\/\/(open|play)\.spotify\.com\/(.*\/)*artist\/([0-9a-z]+))/i.test(line)
    }
  },
  playlist: {
    placeholder: '#playlist owner:playlistId',
    hint: 'Playlist mode: use "#playlist owner:playlistId" or playlist URL/URI.',
    fields: [
      { id: 'owner', label: 'Owner', required: true, placeholder: 'redditlistentothis' },
      { id: 'playlistId', label: 'Playlist ID', required: true, placeholder: '6TMNC59e1TuFFE48tJ9V2D' },
      { id: 'limit', label: 'Limit', required: false, placeholder: 'optional, eg 25' }
    ],
    buildLine: function (values) {
      const suffix = values.limit ? values.limit : ''
      return '#playlist' + suffix + ' ' + values.owner + ':' + values.playlistId
    },
    accepts: function (line) {
      return /^#playlist\d*\s+[0-9a-z]+[\s/:]+[0-9a-z]+$/i.test(line) ||
        /^(spotify:user:[0-9a-z]+:playlist:[0-9a-z]+)$/i.test(line) ||
        /^(https?:\/\/(open|play)\.spotify\.com\/(.*\/)*user\/([0-9a-z]+)\/playlist\/([0-9a-z]+))/i.test(line)
    }
  }
}

function setLog (message) {
  $('.log').text(message || '')
}

function token () {
  let hash = window.location.hash
  hash = hash.replace(/^#/, '')
  const urlParams = new URLSearchParams(hash)
  if (!urlParams.has('access_token')) {
    return ''
  } else {
    return urlParams.get('access_token')
  }
}

function hasToken () {
  return token() !== ''
}

function activeMode () {
  return $('.mode-btn.active').data('mode')
}

function isGlobalDirective (line) {
  return /^##/i.test(line) ||
    /^#extm3u/i.test(line) ||
    /^#extinf(?::\d+,(.+))?/i.test(line) ||
    /^sep=,/i.test(line) ||
    /^#(sort|order)\s*by\s+([^\s/:]*)(?:[\s/:]+([^\s]*))?/i.test(line) ||
    /^#group\s*by\s+(.*)/i.test(line) ||
    /^#(alternate|interleave)\s*by\s+(.*)/i.test(line) ||
    /^#(dup(licates?)?|nonunique|nondistinct)/i.test(line) ||
    /^#(unique|distinct|dedup)/i.test(line) ||
    /^#reverse/i.test(line) ||
    /^#shuffle/i.test(line) ||
    /^#(csv|cvs)/i.test(line)
}

function validateModeInput (input, mode) {
  const lines = input.split(/\r?\n/)
  const issues = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      continue
    }
    if (isGlobalDirective(line)) {
      continue
    }
    if (!MODE_CONFIG[mode].accepts(line)) {
      issues.push('Line ' + (i + 1) + ': invalid for "' + mode + '" mode -> ' + line)
    }
  }
  return issues
}

function renderModeFields (mode) {
  const cfg = MODE_CONFIG[mode]
  const fields = cfg.fields.map(function (field) {
    const req = field.required ? 'required' : ''
    const reqMark = field.required ? '*' : ''
    return '<label class="mode-field">' +
      '<span>' + field.label + reqMark + '</span>' +
      '<input type="text" class="mode-input" data-field="' + field.id + '" placeholder="' + field.placeholder + '" ' + req + '>' +
      '</label>'
  }).join('')
  $('.mode-fields').html(fields)
  $('.mode-hint').text(cfg.hint)
  $('#generator-input').attr('placeholder', cfg.placeholder)
}

function setMode (mode) {
  $('.mode-btn').removeClass('active')
  $('.mode-btn[data-mode="' + mode + '"]').addClass('active')
  renderModeFields(mode)
  setLog('')
}

function appendLine () {
  const mode = activeMode()
  const cfg = MODE_CONFIG[mode]
  const values = {}
  let hasError = false

  $('.mode-input').each(function () {
    const input = $(this)
    const key = input.data('field')
    const value = input.val().trim()
    values[key] = value
    if (input.prop('required') && !value) {
      hasError = true
    }
  })

  if (values.limit && !/^\d+$/.test(values.limit)) {
    setLog('Limit must be an integer.')
    return false
  }

  if (hasError) {
    setLog('Fill all required mode fields.')
    return false
  }

  const line = cfg.buildLine(values)
  const textarea = $('#generator-input')
  const current = textarea.val().trim()
  const next = current ? (current + '\n' + line) : line
  textarea.val(next)
  $('.mode-input').val('')
  setLog('')
  return false
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
  const mode = activeMode()
  const input = textarea.val().trim()

  if (!input) {
    setLog('Input is required.')
    return false
  }

  const issues = validateModeInput(input, mode)
  if (issues.length > 0) {
    setLog(issues.slice(0, 3).join('\n'))
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
  } else {
    localStorage.setItem('textarea', $('#generator-input').val())
    return true
  }
}

$(function () {
  const button = $('.create-btn')
  const modeButtons = $('.mode-btn')
  const defaultMode = 'track'

  modeButtons.on('click', function () {
    setMode($(this).data('mode'))
  })

  $('.mode-add').on('click', appendLine)
  $('.clear-btn').on('click', function () {
    $('#generator-input').val('')
    setLog('')
  })
  button.on('click', clickCreate)
  button.tooltip()
  setMode(defaultMode)
  $('#generator-input').focus()

  if (hasToken()) {
    if (localStorage.getItem('textarea')) {
      $('#generator-input').val(localStorage.getItem('textarea'))
      localStorage.removeItem('textarea')
      generate()
    }
  } else {
    const spotify = new SpotifyAuth()
    const url = spotify.implicitGrantFlowURI(window.location.href)
    button.attr('href', url)
  }
})
