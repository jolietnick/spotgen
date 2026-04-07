/* global jQuery:true */
/* exported jQuery */

const http = require('./http')
const util = require('./util')
const URI = require('urijs')
const $ = require('jquery')
jQuery = $

/**
 * Create a web scraper.
 * @constructor
 * @param {string} uri - The URI of the web page to scrape.
 */
function WebScraper (uri, count, parser) {
  /**
   * Number of pages to fetch.
   */
  this.count = 0

  /**
   * Parser instance to handle the generator string.
   */
  this.parser = null

  /**
   * The URI of the first page to fetch.
   */
  this.uri = uri

  this.count = count || this.count
  this.parser = parser
}

function parseRedditCommentLines (block) {
  // First assumption: links usually point to track references.
  const links = block.find('a')
  if (links.length > 0) {
    let linkLines = ''
    links.each(function () {
      const txt = $(this).text()
      if (!txt.match(/https?:/gi)) {
        linkLines += util.stripNoise(txt) + '\n'
      }
    })
    return linkLines
  }

  const body = block.text()
  const sentences = body.split('.')
  if (sentences.length > 1) {
    return util.stripNoise(sentences[0]) + '\n'
  }

  const bodyLines = body.split('\n')
  if (bodyLines.length > 1) {
    return util.stripNoise(bodyLines[0]) + '\n'
  }

  return util.stripNoise(body) + '\n'
}

/**
 * Scrape a web page.
 *
 * This function inspects the host of the web page and invokes an
 * appropriate scraping function. The scraping functions are written
 * in the following manner: they take the web page URI as input,
 * fetch the page, and return a generator string as output (wrapped
 * in a Promise). Schematically:
 *
 *           web page:                      generator string:
 *     +-------------------+                   (Promise):
 *     | track1 by artist1 |    scraping
 *     +-------------------+    function    artist1 - track1
 *     | track2 by artist2 |    =======>    artist2 - track2
 *     +-------------------+                artist3 - track3
 *     | track3 by artist3 |
 *     +-------------------+
 *
 * In the example above, the scraping function converts a table of
 * tracks to a generator string on the form `ARTIST - TRACK`. If the
 * input were an albums chart, then the output would be a string of
 * `#album` commands instead. In other words, the scraping function
 * should extract the *meaning* of the web page and express it as
 * input to the generator.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} count - Number of pages to fetch.
 * @return {Promise | string} A generator string.
 */
WebScraper.prototype.scrape = function (uri, count) {
  const domain = URI(uri).domain()
  if (domain === 'last.fm') {
    return this.lastfm(uri, count)
  } else if (domain === 'pitchfork.com') {
    return this.pitchfork(uri, count)
  } else if (domain === 'rateyourmusic.com') {
    return this.rateyourmusic(uri, count)
  } else if (domain === 'reddit.com') {
    return this.reddit(uri, count)
  } else if (domain === 'youtube.com') {
    return this.youtube(uri)
  } else {
    return this.webpage(uri)
  }
}

/**
 * Create a queue of tracks.
 * @param {string} result - A newline-separated list of tracks.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.createQueue = function (result) {
  const collection = this.parser.parse(result)
  return collection.dispatch()
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of results.
 */
WebScraper.prototype.dispatch = function () {
  return this.scrape(this.uri, this.count).then((result) => {
    return this.createQueue(result)
  })
}

/**
 * Scrape a Last.fm tracklist.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.lastfm = function (uri, count = 1) {
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      const html = $($.parseHTML(data))
      let lines = ''
      if (uri.match(/\/\+tracks/gi)) {
        // tracks by a single artist
        let header = html.find('header a.library-header-crumb')
        if (header.length === 0) {
          header = html.find('h1.header-title')
        }
        const artist = util.normalize(header.first().text())
        html.find('td.chartlist-name').each(function () {
          lines += artist + '\t-\t' + util.normalize($(this).text()) + '\n'
        })
      } else if (uri.match(/\/\+similar/gi)) {
        // similar artists
        html.find('h3.big-artist-list-title').each(function () {
          lines += '#top ' + util.normalize($(this).text()) + '\n'
        })
      } else if (uri.match(/\/artists/gi)) {
        // list of artists
        html.find('td.chartlist-name').each(function () {
          lines += '#top ' + util.normalize($(this).text()) + '\n'
        })
      } else if (uri.match(/\/albums/gi)) {
        // list of albums
        html.find('td.chartlist-name').each(function () {
          lines += '#album ' + util.normalize($(this).text()) + '\n'
        })
      } else {
        // list of tracks by various artists
        html.find('td.chartlist-name').each(function () {
          const sep = $(this).find('.artist-name-spacer')
          if (sep.length) {
            const artist = util.normalize(sep.prevAll().text())
            const title = util.normalize(sep.nextAll().text())
            lines += artist + '\t-\t' + title + '\n'
          } else {
            const track = $(this).text()
            lines += util.normalize(track) + '\n'
          }
        })
      }
      console.log(util.stripWhitespace(lines, String.raw`\t`) + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        const next = html.find('.pagination-next a')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a Pitchfork list.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.pitchfork = function (uri, count = 0) {
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      const html = $($.parseHTML(data))
      let lines = ''
      html.find('div[class*="artist-work"]').each(function () {
        const artist = util.normalize($(this).find('ul[class*="artist-list"] li:first').text())
        const album = util.normalize($(this).find('h2[class*="work-title"]').text())
        lines += '#album ' + artist + '\t-\t' + album + '\n'
      })
      console.log(util.stripWhitespace(lines, String.raw`\t`) + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        const nextPage = html.find('.fts-pagination__list-item--active').next()
        if (nextPage.length > 0) {
          nextUri = nextPage.find('a').attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a Rate Your Music chart.
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of albums.
 */
WebScraper.prototype.rateyourmusic = function (uri, count = 0) {
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      const html = $($.parseHTML(data))
      let lines = ''
      html.find('div.chart_details').each(function () {
        const artist = util.normalize($(this).find('a.artist').text())
        const album = util.normalize($(this).find('a.album').text())
        lines += '#album ' + artist + '\t-\t' + album + '\n'
      })
      console.log(util.stripWhitespace(lines, String.raw`\t`) + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        const next = html.find('a.navlinknext')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a Reddit forum.
 *
 * Handles post listing and comment threads. Employs Bob Nisco's
 * heuristic for parsing comments.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @param {integer} [count] - The number of pages to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.reddit = function (uri, count = 1) {
  function getPages (nextUri, result, count) {
    nextUri = URI(nextUri).absoluteTo(uri).toString()
    console.log(nextUri + '\n')
    return http(nextUri).then(function (data) {
      const html = $($.parseHTML(data))
      let lines = ''
      if (uri.match(/\/comments\//gi)) {
        // comments thread
        html.find('div.entry div.md').each(function () {
          lines += parseRedditCommentLines($(this))
        })
      } else {
        // post listing
        html.find('a.title').each(function () {
          const track = util.stripNoise($(this).text())
          lines += track + '\n'
        })
      }
      console.log(util.stripWhitespace(lines, String.raw`\t`) + '\n')
      result += lines
      if (count === 1) {
        return result
      } else {
        const next = html.find('.next-button a')
        if (next.length > 0) {
          nextUri = next.attr('href')
          return getPages(nextUri, result, count - 1)
        } else {
          return result
        }
      }
    })
  }
  return getPages(uri, '', count)
}

/**
 * Scrape a web page.
 *
 * This is a fall-back function in case none of the other
 * scraping functions apply.
 *
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.webpage = function (uri) {
  console.log(uri + '\n')
  return http(uri).then(function (data) {
    const html = $($.parseHTML(data))
    let result = ''
    html.find('a').each(function () {
      const track = util.stripNoise($(this).text())
      if (track) {
        result += track + '\n'
      }
    })
    result = result.trim()
    console.log(result + '\n')
    return result
  })
}

/**
 * Scrape a YouTube playlist.
 * @param {string} uri - The URI of the web page to scrape.
 * @return {Promise | string} A newline-separated list of tracks.
 */
WebScraper.prototype.youtube = function (uri) {
  console.log(uri + '\n')
  return http(uri).then(function (data) {
    const html = $($.parseHTML(data))
    let result = ''
    html.find('div.playlist-video-description h4, a.pl-video-title-link').each(function () {
      const track = util.stripNoise($(this).text())
      result += track + '\n'
    })
    result = result.trim()
    console.log(result + '\n')
    return result
  })
}

module.exports = WebScraper
