const express = require('express')
const Generator = require('../lib/generator')
const pkg = require('../package.json')

function createApp () {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  // Keep local FE dev simple.
  app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  app.get('/api/health', function (req, res) {
    res.json({
      status: 'ok',
      service: 'spotgen-api'
    })
  })

  app.get('/api/version', function (req, res) {
    res.json({
      name: pkg.name,
      version: pkg.version,
      express: require('express/package.json').version
    })
  })

  app.post('/api/generate', async function (req, res) {
    const body = req.body || {}
    const input = typeof body.input === 'string' ? body.input : ''
    const format = typeof body.format === 'string' && body.format.trim() ? body.format.trim() : undefined
    const token = typeof body.token === 'string' ? body.token : undefined
    const market = typeof body.market === 'string' && body.market.trim() ? body.market.trim() : undefined

    if (!input.trim()) {
      res.status(400).json({
        error: 'input is required'
      })
      return
    }

    const logs = []
    const originalLog = console.log

    try {
      console.log = function (...args) {
        const message = args.map(String(part)).join(' ')
        logs.push(message)
      }

      const generator = new Generator(input, null, null, token)
      if (market) {
        generator.spotify.market = market
      }

      const output = await generator.generate(format)
      res.json({
        output: output || '',
        format: generator.format || format || 'uri',
        logs
      })
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
        logs
      })
    } finally {
      console.log = originalLog
    }
  })

  return app
}

module.exports = createApp
