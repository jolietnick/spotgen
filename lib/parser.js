const eol = require('eol')
const Album = require('./album')
const Artist = require('./artist')
const Collection = require('./collection')
const Playlist = require('./playlist')
const Similar = require('./similar')
const Top = require('./top')
const Track = require('./track')
const WebScraper = require('./scraper')

/**
 * Create a parser.
 * @param {string} [token] - Access token.
 * @param {SpotifyWebApi} [spotify] - Spotify web API.
 * @constructor
 */
function Parser (token, handler) {
  /**
   * Spotify request handler.
   */
  this.spotify = handler
}

function parseLimit (value) {
  return Number.parseInt(value)
}

function splitTabSeparatedTrack (line) {
  const tabSeparated = /([^\t]*)\t-\t([^\t]*)(\t-\t([^\t]*))?/i.exec(line)
  if (tabSeparated) {
    return { artist: tabSeparated[1], title: tabSeparated[2], album: tabSeparated[4] }
  }

  // Common free-text format: "Artist - Title"
  const dashSeparated = /^(.*?)\s+-\s+(.*)$/i.exec(line)
  if (dashSeparated) {
    return { artist: dashSeparated[1], title: dashSeparated[2], album: null }
  }

  return null
}

function handleOrdering (collection, line) {
  const match = /^#(sort|order)\s*by\s+([^\s/:]*)(?:[\s/:]+([^\s]*))?/i.exec(line)
  if (!match) {
    return false
  }

  collection.ordering = match[2].toLowerCase()
  collection.lastfmUser = match[3]
  return true
}

function handleGrouping (collection, line) {
  const match = /^#group\s*by\s+(.*)/i.exec(line)
  if (!match) {
    return false
  }

  collection.grouping = match[1].toLowerCase()
  return true
}

function handleAlternating (collection, line) {
  const match = /^#(alternate|interleave)\s*BY\s+(.*)/i.exec(line)
  if (!match) {
    return false
  }

  collection.alternating = match[2].toLowerCase()
  return true
}

function handleCollectionFlags (collection, line) {
  if (/^#(dup(licates?)?|nonunique|nondistinct)/i.exec(line)) {
    collection.unique = false
    return true
  }
  if (/^#reverse/i.exec(line)) {
    collection.reverse = true
    return true
  }
  if (/^#shuffle/i.exec(line)) {
    collection.shuffle = true
    return true
  }
  if (/^#(unique|distinct)/i.exec(line)) {
    collection.unique = true
    return true
  }
  if (/^#dedup/i.exec(line)) {
    collection.unique = false
    return true
  }
  if (/^#(csv|cvs)/i.exec(line)) {
    collection.format = 'csv'
    return true
  }

  return false
}

function handleComment (line) {
  return /^##/i.exec(line) ||
         /^#extm3u/i.exec(line) ||
         /^sep=,/i.exec(line)
}

function handleAlbum (parser, collection, line) {
  const match = /^#album(id)?(\d*)\s+(.+)/i.exec(line)
  if (!match) {
    return false
  }

  const raw = match[3]
  const tabParts = /^([^\t]*)\t-\t(.*)$/i.exec(raw)
  const dashParts = /^(.*?)\s+-\s+(.*)$/i.exec(raw)
  let albumName = ''
  let artistName

  if (tabParts) {
    albumName = tabParts[1]
    artistName = tabParts[2]
  } else if (dashParts) {
    albumName = dashParts[1]
    artistName = dashParts[2]
  }

  const album = new Album(parser.spotify, raw, albumName, artistName, null, parseLimit(match[2]))

  if (match[1]) {
    album.fetchTracks = false
  }

  collection.add(album)
  return true
}

function handleArtistTopSimilar (parser, collection, line) {
  let match = /^#artist(\d*)\s+(.*)/i.exec(line)
  if (match) {
    collection.add(new Artist(parser.spotify, match[2], null, parseLimit(match[1])))
    return true
  }

  match = /^#top(\d*)\s+(.*)/i.exec(line)
  if (match) {
    collection.add(new Top(parser.spotify, match[2], null, parseLimit(match[1])))
    return true
  }

  match = /^#similar(\d*)\s+(.*)/i.exec(line)
  if (match) {
    collection.add(new Similar(parser.spotify, match[2], null, parseLimit(match[1])))
    return true
  }

  return false
}

function handlePlaylistCommands (parser, collection, line) {
  let match = /^#playlist(\d*)\s+([0-9a-z]+)[\s/:]+([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Playlist(parser.spotify, line, match[2], match[3], parseLimit(match[1])))
    return true
  }

  match = /^#playlist(\d*)\s+(.*)/i.exec(line)
  if (match) {
    collection.add(new Playlist(parser.spotify, match[2], null, null, parseLimit(match[1])))
    return true
  }

  return false
}

function handleExtInf (parser, collection, line, lines) {
  const match = /^#EXTINF(?::\d+,(.+))?/i.exec(line)
  if (!match) {
    return false
  }

  if (match[1]) {
    collection.add(new Track(parser.spotify, match[1]))
    if (lines.length > 0 && !/^#/.exec(lines[0])) {
      lines.shift()
    }
  }

  return true
}

function handleSpotifyRefs (parser, collection, line) {
  let match = /spotify:artist:([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Artist(parser.spotify, line, match[1]))
    return true
  }

  match = /^(\d+ )?https?:\/\/(.*\.)?spotify\.com\/(.*\/)*artist\/(.*\/)*([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Artist(parser.spotify, line, match[5], parseLimit(match[1])))
    return true
  }

  match = /spotify:album:([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Album(parser.spotify, line, null, null, match[1]))
    return true
  }

  match = /^(\d+ )?https?:\/\/(.*\.)?spotify\.com\/(.*\/)*album\/(.*\/)*([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Album(parser.spotify, line, null, null, match[5], parseLimit(match[1])))
    return true
  }

  match = /spotify:user:([0-9a-z]+):playlist:([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Playlist(parser.spotify, line, match[1], match[2]))
    return true
  }

  match = /^(\d+ )?https?:\/\/(.*\.)?spotify\.com\/(.*\/)*user\/([0-9a-z]+)\/playlist\/([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Playlist(parser.spotify, line, match[4], match[5], parseLimit(match[1])))
    return true
  }

  match = /spotify:track:([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Track(parser.spotify, line, null, null, null, match[1]))
    return true
  }

  match = /^(\d+ )?https?:\/\/(.*\.)?spotify\.com\/(.*\/)*([0-9a-z]+)/i.exec(line)
  if (match) {
    collection.add(new Track(parser.spotify, line, null, null, null, match[4]))
    return true
  }

  return false
}

function handleWebScraper (collection, line, parser) {
  const match = /^(\d+ )?(https?:.*)/i.exec(line)
  if (!match) {
    return false
  }

  collection.add(new WebScraper(match[2], parseLimit(match[1]), parser))
  return true
}

function handleTrackByTab (parser, collection, line) {
  const track = splitTabSeparatedTrack(line)
  if (!track) {
    return false
  }

  collection.add(new Track(parser.spotify, line, track.artist, track.title, track.album))
  return true
}

function parseLine (parser, collection, line, lines) {
  if (handleOrdering(collection, line)) return
  if (handleGrouping(collection, line)) return
  if (handleAlternating(collection, line)) return
  if (handleCollectionFlags(collection, line)) return
  if (handleComment(line)) return
  if (handleAlbum(parser, collection, line)) return
  if (handleArtistTopSimilar(parser, collection, line)) return
  if (handlePlaylistCommands(parser, collection, line)) return
  if (handleExtInf(parser, collection, line, lines)) return
  if (handleSpotifyRefs(parser, collection, line)) return
  if (handleWebScraper(collection, line, parser)) return
  if (handleTrackByTab(parser, collection, line)) return

  if (line) {
    collection.add(new Track(parser.spotify, line))
  }
}

/**
 * Parse a string and create a playlist collection.
 * @param {string} [str] - A newline-separated string of
 * entries on the form `title - artist`. May also contain
 * `#album`, `#artist`, `#order` and `#group` commands.
 * @return {Collection} A playlist collection.
 */
Parser.prototype.parse = function (str) {
  const collection = new Collection(this.spotify)
  str = str.trim()
  if (str) {
    const lines = eol.split(str)
    while (lines.length > 0) {
      const line = lines.shift().trim()
      parseLine(this, collection, line, lines)
    }
  }
  return collection
}

module.exports = Parser
