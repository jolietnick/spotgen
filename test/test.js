/* global describe, it */
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
chai.should()

const SpotifyAuth = require('../lib/auth')
const SpotifyWebApi = require('../lib/spotify')
const Artist = require('../lib/artist')
const Album = require('../lib/album')
const Generator = require('../lib/generator')
const Playlist = require('../lib/playlist')
const Queue = require('../lib/queue')
const Similar = require('../lib/similar')
const Track = require('../lib/track')
const Top = require('../lib/top')
const sort = require('../lib/sort')
const util = require('../lib/util')

function compareValues (a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function createStatusError (status) {
  const error = new Error('HTTP request failed with status ' + status)
  error.status = status
  return error
}

describe('Spotify Playlist Generator', function () {
  this.timeout(999999)

  describe('Sorting', function () {
    it('should handle empty lists', function () {
      sort([], function (a, b) {
        return compareValues(a, b)
      }).should.eql([])
    })

    it('should handle singleton lists', function () {
      sort([1], function (a, b) {
        return compareValues(a, b)
      }).should.eql([1])
    })

    it('should stably sort the list', function () {
      sort([1, 4, 2, 8], function (a, b) {
        return compareValues(a, b)
      }).should.eql([1, 2, 4, 8])
    })

    it('should work with an ascending comparison function', function () {
      sort([1, 4, 2, 8], sort.ascending(function (x) {
        return x
      })).should.eql([1, 2, 4, 8])
    })

    it('should work with a descending comparison function', function () {
      sort([1, 4, 2, 8], sort.descending(function (x) {
        return x
      })).should.eql([8, 4, 2, 1])
    })

    it('should preserve the order of duplicate elements', function () {
      sort([[1, 0], [4, 1], [2, 2], [4, 3], [8, 4]], function (a, b) {
        const x = a[0]
        const y = b[0]
        return compareValues(x, y)
      }).should.eql([[1, 0], [2, 2], [4, 1], [4, 3], [8, 4]])
    })
  })

  describe('Utilities', function () {
    it('should clean up search strings', function () {
      util.normalize('  \u201Cshouldn\u2019t\u201D ').should.eql('"shouldn\'t"')
    })

    it('should remove noise', function () {
      util.stripNoise('1. artist - title (5:30)').should.eql('artist - title')
      util.stripNoise('test1 - test2 (string) test3').should.eql('test1 - test2')
    })

    it('should remove extra punctuation characters', function () {
      util.stripPunctuation('\u201Cshouldn\'t\u201D', '\'').should.eql('shouldn\'t')
    })

    it('should convert punctuation to ASCII', function () {
      util.replacePunctuation('\u201Cshouldn\u2019t\u201D').should.eql('"shouldn\'t"')
    })

    it('should convert characters to ASCII', function () {
      util.toAscii('t\u00EAte-\u00E0-t\u00EAte \u2013 d\u00E9tente').should.eql('tete-a-tete - detente')
      util.toAscii('test1 \u25B2 test2').should.eql('test1  test2')
    })

    it('should remove extra whitespace', function () {
      util.stripWhitespace(' test1  - test2 ').should.eql('test1 - test2')
    })
  })

  describe('Auth', function () {
    it('should return an existing token without refreshing', function () {
      const auth = new SpotifyAuth('id', 'secret', 'cached-token')
      auth.expiresAt = Date.now() + 60000

      return auth.getToken().should.eventually.eql('cached-token')
    })

    it('should refresh and cache a token expiration', function () {
      const auth = new SpotifyAuth('id', 'secret')
      auth.clientsCredentialsFlow = function () {
        return Promise.resolve({
          access_token: 'fresh-token',
          expires_in: 3600
        })
      }

      return auth.refreshToken().then(function (token) {
        token.should.eql('fresh-token')
        auth.token.should.eql('fresh-token')
        auth.expiresAt.should.be.above(Date.now())
      })
    })

    it('should not expose the removed implicit grant helpers', function () {
      const auth = new SpotifyAuth('id', 'secret')
      chai.expect(auth.implicitGrantFlow).to.equal(undefined)
      chai.expect(auth.implicitGrantFlowURI).to.equal(undefined)
    })

    it('should retry a request after auth failure', function () {
      const api = new SpotifyWebApi('id', 'secret', 'cached-token')
      let calls = 0
      api.auth.refreshToken = function () {
        return Promise.resolve('refreshed-token')
      }
      api.http = function () {
        calls += 1
        if (calls === 1) {
          return Promise.reject(createStatusError(401))
        }
        return Promise.resolve({ ok: true })
      }

      return api.request('https://api.spotify.com/v1/albums/test').then(function (response) {
        response.should.eql({ ok: true })
        calls.should.eql(2)
      })
    })

    it('should not retry non-auth failures', function () {
      const api = new SpotifyWebApi('id', 'secret', 'cached-token')
      let refreshed = false
      api.auth.refreshToken = function () {
        refreshed = true
        return Promise.resolve('refreshed-token')
      }
      api.http = function () {
        return Promise.reject(createStatusError(500))
      }

      return api.request('https://api.spotify.com/v1/albums/test').then(function () {
        throw new Error('expected request to reject')
      }).catch(function (err) {
        err.should.be.instanceof(Error)
        err.should.have.property('status', 500)
        refreshed.should.eql(false)
      })
    })
  })

  describe('Queue', function () {
    it('should create an empty list', function () {
      const queue = new Queue()
      queue.queue.should.eql([])
    })

    it('should add an entry', function () {
      const entry = new Track(null, 'test')
      const queue = new Queue()
      queue.add(entry)
      queue.should.have.deep.property('queue[0].entry', 'test')
    })

    it('should store entries in the order they are added', function () {
      const foo = new Track(null, 'foo')
      const bar = new Track(null, 'bar')
      const queue = new Queue()
      queue.add(foo)
      queue.add(bar)
      queue.should.have.deep.property('queue[0].entry', 'foo')
      queue.should.have.deep.property('queue[1].entry', 'bar')
    })

    it('should remove duplicates', function () {
      const foo1 = new Track(null, 'foo')
      foo1.title = foo1.entry
      const foo2 = new Track(null, 'foo')
      foo2.title = foo2.entry
      const bar = new Track(null, 'bar')
      bar.title = bar.entry
      const queue = new Queue()
      queue.add(foo1)
      queue.add(foo2)
      queue.add(bar)
      return queue.dedup().then(function (queue) {
        queue.should.have.deep.property('queue[0].entry', 'foo')
        queue.should.have.deep.property('queue[1].entry', 'bar')
      })
    })

    it('should be sortable', function () {
      const foo = new Track(null, 'foo')
      const bar = new Track(null, 'bar')
      const queue = new Queue()
      queue.add(foo)
      queue.add(bar)
      queue.sort()
      queue.should.have.deep.property('queue[0].entry', 'bar')
      queue.should.have.deep.property('queue[1].entry', 'foo')
    })

    it('should be sortable with compare function', function () {
      const foo = new Track(null, 'foo')
      const bar = new Track(null, 'bar')
      const queue = new Queue()
      queue.add(foo)
      queue.add(bar)
      queue.sort(function (a, b) {
        return compareValues(a.entry, b.entry)
      })
      queue.should.have.deep.property('queue[0].entry', 'bar')
      queue.should.have.deep.property('queue[1].entry', 'foo')
    })

    it('should concatenate queues and preserve order', function () {
      const foo = new Track(null, 'foo')
      const bar = new Track(null, 'bar')
      const baz = new Track(null, 'baz')
      const queue1 = new Queue()
      const queue2 = new Queue()
      queue1.add(foo)
      queue1.add(bar)
      queue2.add(baz)
      const queue3 = queue1.concat(queue2)
      queue3.should.have.deep.property('queue[0].entry', 'foo')
      queue3.should.have.deep.property('queue[1].entry', 'bar')
      queue3.should.have.deep.property('queue[2].entry', 'baz')
    })

    it('should group on a property', function () {
      const foo = new Track(null, 'foo')
      const bar = new Track(null, 'bar')
      const baz = new Track(null, 'baz')
      foo.group = '1'
      bar.group = '2'
      baz.group = '1'
      const queue = new Queue()
      queue.add(foo)
      queue.add(bar)
      queue.add(baz)
      queue.group(function (entry) {
        return entry.group
      })
      queue.should.have.deep.property('queue[0].entry', 'foo')
      queue.should.have.deep.property('queue[1].entry', 'baz')
      queue.should.have.deep.property('queue[2].entry', 'bar')
    })
  })

  describe('Track', function () {
    it('should create an empty entry', function () {
      const track = new Track(null, '')
      track.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const track = new Track(null, 'test')
      track.entry.should.eql('test')
    })
  })

  describe('Album', function () {
    it('should create an empty entry', function () {
      const album = new Album(null, '')
      album.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const album = new Album(null, 'Beach House - Depression Cherry')
      album.entry.should.eql('Beach House - Depression Cherry')
    })
  })

  describe('Artist', function () {
    it('should create an empty entry', function () {
      const artist = new Artist(null, '')
      artist.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const artist = new Artist(null, 'Bowery Electric')
      artist.entry.should.eql('Bowery Electric')
    })
  })

  describe('Top', function () {
    it('should create an empty entry', function () {
      const top = new Top(null, '')
      top.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const top = new Top(null, 'Bowery Electric')
      top.entry.should.eql('Bowery Electric')
    })
  })

  describe('Similar', function () {
    it('should create an empty entry', function () {
      const similar = new Similar(null, '')
      similar.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const similar = new Similar(null, 'Bowery Electric')
      similar.entry.should.eql('Bowery Electric')
    })
  })

  describe('Playlist', function () {
    it('should create an empty entry', function () {
      const playlist = new Playlist(null, '')
      playlist.entry.should.eql('')
    })

    it('should create a single entry', function () {
      const playlist = new Playlist(null, 'redditlistentothis:6TMNC59e1TuFFE48tJ9V2D', 'redditlistentothis', '6TMNC59e1TuFFE48tJ9V2D')
      playlist.entry.should.eql('redditlistentothis:6TMNC59e1TuFFE48tJ9V2D')
    })
  })

  describe('Generator', function () {
    it('should create empty playlist when passed empty string', function () {
      const generator = new Generator('')
      generator.should.have.deep.property('collection.entries.queue').that.eql([])
    })

    it('should create a one-entry playlist', function () {
      const generator = new Generator('test')
      generator.should.have.deep.property('collection.entries.queue[0].entry', 'test')
    })

    it('should create a two-entry playlist', function () {
      const generator = new Generator('test1\ntest2')
      generator.should.have.deep.property('collection.entries.queue[0].entry', 'test1')
      generator.should.have.deep.property('collection.entries.queue[1].entry', 'test2')
    })

    it('should ignore empty lines', function () {
      const generator = new Generator('test1\n\n\n\ntest2')
      generator.should.have.deep.property('collection.entries.queue[0].entry', 'test1')
      generator.should.have.deep.property('collection.entries.queue[1].entry', 'test2')
    })

    it('should dispatch a single entry', function () {
      const generator = new Generator('The xx - Test Me')
      return generator.generate('list').then(function (str) {
        str.should.eql('The xx - Test Me')
      })
    })

    it('should not confuse album title with track title', function () {
      const generator = new Generator('Michael Jackson - Off the Wall')
      return generator.generate('list').then(function (str) {
        str.should.eql('Michael Jackson - Off the Wall')
      })
    })

    it('should order tracks by Spotify popularity', function () {
      const generator = new Generator('#order by popularity\ntest1\ntest2')
      generator.should.have.deep.property('collection.entries.queue[0].entry', 'test1')
      generator.should.have.deep.property('collection.entries.queue[1].entry', 'test2')
      generator.should.have.deep.property('collection.ordering', 'popularity')
    })

    it('should order tracks by Last.fm rating', function () {
      const generator = new Generator('#order by lastfm\ntest1\ntest2')
      generator.should.have.deep.property('collection.entries.queue[0].entry', 'test1')
      generator.should.have.deep.property('collection.entries.queue[1].entry', 'test2')
      generator.should.have.deep.property('collection.ordering', 'lastfm')
    })

    it('should create a playlist ordered by Spotify popularity', function () {
      const generator = new Generator('#order by popularity\n' +
                                    'Bowery Electric - Postscript\n' +
                                    'Bowery Electric - Lushlife')
      return generator.generate('list').then(function (str) {
        // External data ordering can change and make this assertion brittle.
        str.should.eql('Bowery Electric - Lushlife\n' +
                       'Bowery Electric - Postscript')
      })
    })

    it('should create an playlist ordered by name', function () {
      const generator = new Generator('#order by name\n' +
                                    'Bowery Electric - Postscript\n' +
                                    'Bowery Electric - Lushlife')
      return generator.generate('list').then(function (str) {
        // External data ordering can change and make this assertion brittle.
        str.should.eql('Bowery Electric - Lushlife\n' +
                       'Bowery Electric - Postscript')
      })
    })

    it('should parse comma-separated values', function () {
      const generator = new Generator(
        'spotify:track:3jZ0GKAZiDMya0dZPrw8zq,Desire Lines,Deerhunter,Halcyon Digest,1,6,404413,,\n' +
          'spotify:track:20DDHYR4vZqDwHyNFLwkXI,Saved By Old Times,Deerhunter,Microcastle,1,10,230226,,')
      return generator.generate().then(function (str) {
        str.should.eql('spotify:track:3jZ0GKAZiDMya0dZPrw8zq\n' +
                       'spotify:track:20DDHYR4vZqDwHyNFLwkXI')
      })
    })

    it('should output comma-separated values', function () {
      const generator = new Generator(
        '#csv\n' +
          'spotify:track:3jZ0GKAZiDMya0dZPrw8zq\n' +
          'spotify:track:20DDHYR4vZqDwHyNFLwkXI')
      return generator.generate().then(function (str) {
        str.should.eql(
          'sep=,\n' +
            'spotify:track:3jZ0GKAZiDMya0dZPrw8zq,,,,,,,,\n' +
            'spotify:track:20DDHYR4vZqDwHyNFLwkXI,,,,,,,,')
      })
    })

    it('should parse extended M3U playlists', function () {
      const generator = new Generator(
        '#EXTM3U\n' +
          '#EXTINF:404,Desire Lines - Deerhunter\n' +
          'Deerhunter/Halcyon Digest/06 Desire Lines.mp3\n' +
          '#EXTINF:230,Saved By Old Times - Deerhunter\n' +
          'Deerhunter/Microcastle/10 Saved By Old Times.mp3')
      return generator.generate('list').then(function (str) {
        str.should.eql('Deerhunter - Desire Lines\n' +
                       'Deerhunter - Saved By Old Times')
      })
    })

    it('should return an array of strings', function () {
      const generator = new Generator('spotify:track:4oNXgGnumnu5oIXXyP8StH\n' +
                                    'spotify:track:7rAjeWkQM6cLqbPjZtXxl2')
      return generator.generate('array').then(function (str) {
        str.should.eql([
          'spotify:track:4oNXgGnumnu5oIXXyP8StH',
          'spotify:track:7rAjeWkQM6cLqbPjZtXxl2'
        ])
      })
    })

    it('should parse track URIs', function () {
      const generator = new Generator('spotify:track:4oNXgGnumnu5oIXXyP8StH\n' +
                                    'spotify:track:7rAjeWkQM6cLqbPjZtXxl2')
      return generator.generate().then(function (str) {
        generator.should.have.deep.property('collection.entries.queue[0]')
          .that.is.instanceof(Track)
        generator.should.have.deep.property('collection.entries.queue[1]')
          .that.is.instanceof(Track)
        str.should.eql('spotify:track:4oNXgGnumnu5oIXXyP8StH\n' +
                       'spotify:track:7rAjeWkQM6cLqbPjZtXxl2')
      })
    })

    it('should parse track links', function () {
      const generator = new Generator('https://open.spotify.com/track/4oNXgGnumnu5oIXXyP8StH\n' +
                                    'https://open.spotify.com/track/7rAjeWkQM6cLqbPjZtXxl2')
      return generator.generate().then(function (str) {
        generator.should.have.deep.property('collection.entries.queue[0]')
          .that.is.instanceof(Track)
        generator.should.have.deep.property('collection.entries.queue[1]')
          .that.is.instanceof(Track)
        str.should.eql('spotify:track:4oNXgGnumnu5oIXXyP8StH\n' +
                       'spotify:track:7rAjeWkQM6cLqbPjZtXxl2')
      })
    })

    it('should parse #album entries', function () {
      const generator = new Generator('#album test')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Album)
    })

    it('should parse album URIs', function () {
      const generator = new Generator('spotify:album:5QIf4hNIAksV1uMCXHVkAZ')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Album)
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('5QIf4hNIAksV1uMCXHVkAZ')
    })

    it('should parse album links', function () {
      const generator = new Generator('https://open.spotify.com/album/5QIf4hNIAksV1uMCXHVkAZ')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Album)
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('5QIf4hNIAksV1uMCXHVkAZ')
    })

    it('should dispatch #album entries', function () {
      const generator = new Generator('#album Beach House - Depression Cherry')
      return generator.generate('list').then(function (str) {
        // External catalog changes can affect this expected first track.
        str.should.match(/^Beach House - Levitation/gi)
      })
    })

    it('should parse #artist entries', function () {
      const generator = new Generator('#artist Bowery Electric')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Artist)
    })

    it('should parse artist URIs', function () {
      const generator = new Generator('spotify:artist:56ZTgzPBDge0OvCGgMO3OY')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Artist)
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('56ZTgzPBDge0OvCGgMO3OY')
    })

    it('should parse artist links', function () {
      const generator = new Generator('https://open.spotify.com/artist/56ZTgzPBDge0OvCGgMO3OY')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Artist)
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('56ZTgzPBDge0OvCGgMO3OY')
    })

    it('should dispatch #artist entries', function () {
      const generator = new Generator('#artist Bowery Electric')
      return generator.generate('list').then(function (str) {
        // External catalog changes can affect this expected first track.
        str.should.match(/^Bowery Electric - Floating World/gi)
      })
    })

    it('should parse #top entries', function () {
      const generator = new Generator('#top Bowery Electric')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Top)
    })

    it('should dispatch #top entries', function () {
      const generator = new Generator('#top Bowery Electric')
      return generator.generate('list').then(function (str) {
        // External catalog changes can affect this expected first track.
        str.should.match(/^Bowery Electric - Floating World/gi)
      })
    })

    it('should parse #similar entries', function () {
      const generator = new Generator('#similar Bowery Electric')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Similar)
    })

    it('should dispatch #similar entries', function () {
      const generator = new Generator('#similar Bowery Electric')
      return generator.generate('list').then(function (str) {
        // External catalog changes can affect this expected first track.
        str.should.match(/^Flying Saucer Attack - My Dreaming Hill/gi)
      })
    })

    it('should parse #playlist entries', function () {
      const generator = new Generator('#playlist redditlistentothis:6TMNC59e1TuFFE48tJ9V2D')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Playlist)
      generator.should.have.deep.property('collection.entries.queue[0].owner.id')
        .that.eql('redditlistentothis')
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('6TMNC59e1TuFFE48tJ9V2D')
    })

    it('should parse playlist URIs', function () {
      const generator = new Generator('spotify:user:redditlistentothis:playlist:6TMNC59e1TuFFE48tJ9V2D')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Playlist)
      generator.should.have.deep.property('collection.entries.queue[0].owner.id')
        .that.eql('redditlistentothis')
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('6TMNC59e1TuFFE48tJ9V2D')
    })

    it('should parse playlist links', function () {
      const generator = new Generator('https://open.spotify.com/user/redditlistentothis/playlist/6TMNC59e1TuFFE48tJ9V2D')
      generator.should.have.deep.property('collection.entries.queue[0]')
        .that.is.instanceof(Playlist)
      generator.should.have.deep.property('collection.entries.queue[0].owner.id')
        .that.eql('redditlistentothis')
      generator.should.have.deep.property('collection.entries.queue[0].id')
        .that.eql('6TMNC59e1TuFFE48tJ9V2D')
    })

    it('should dispatch #playlist entries', function () {
      const generator = new Generator('#playlist redditlistentothis:6TMNC59e1TuFFE48tJ9V2D')
      return generator.generate('list').then(function (str) {
        // Playlist content can change and make this assertion brittle.
        str.should.match(/^Drakkar Nowhere - Higher Now/gi)
      })
    })

    it('should dispatch multiple entries', function () {
      const generator = new Generator('The xx - Test Me\n' +
                                    'Rage Against The Machine - Testify')
      return generator.generate('list').then(function (str) {
        // Search results can change ordering and make this assertion brittle.
        str.should.eql('The xx - Test Me\n' +
                       'Rage Against The Machine - Testify')
      })
    })
  })
})
