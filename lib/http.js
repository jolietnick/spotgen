/**
 * Perform a HTTP(S) request.
 *
 * If the script is hosted on a HTTPS server, we cannot perform
 * HTTP requests because of the Same Origin Policy. Therefore,
 * this function falls back to HTTPS if HTTP fails.
 *
 * @param {string} uri - The URI to look up.
 * @param {Object} [options] - Request options.
 * @return {Promise} A promise.
 */
function http (uri, options) {
  return http.get(uri, options).catch(function (err) {
    const message = err + ''
    if (/XHR error/i.exec(message) || /failed to fetch/i.exec(message)) {
      if (/^http:/i.exec(uri)) {
        return http.get(uri.replace(/^http:/i, 'https:'), options)
      } else if (/^https:/i.exec(uri)) {
        return http.get(uri.replace(/^https:/i, 'http:'), options)
      }
    }
    throw toError(err)
  })
}

function toError (reason) {
  if (reason instanceof Error) {
    return reason
  }

  if (typeof reason === 'number') {
    const error = new Error('HTTP request failed with status ' + reason)
    error.status = reason
    return error
  }

  if (reason && typeof reason === 'object') {
    const reasonError = reason.error ? reason.error : {}
    const rawMessage = reasonError.message ||
      reason.error ||
      reason.message
    const message = typeof rawMessage === 'string' ? rawMessage : 'HTTP request failed'
    const error = new Error(message)
    error.details = reason
    return error
  }

  return new Error('HTTP request failed: ' + String(reason))
}

function wait (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function parsePayload (response, text) {
  if (text) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return JSON.parse(text)
    }
  }

  return text
}

/**
 * Perform a HTTP request.
 * @param {string} uri - The URI to look up.
 * @param {Object} [options] - Request options.
 * @return {Promise} A promise.
 */
http.get = function (uri, options) {
  const agent = 'Mozilla/4.0 (compatible; MSIE 5.5; Windows NT 5.0; T312461)'
  options = options || {}
  options.headers = options.headers || {}
  options.headers['User-Agent'] = options.headers['User-Agent'] || agent
  const requestDelay = options.delay || 100
  const requestUri = uri || options.uri
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...options.headers }
  let body = options.body

  if (options.form) {
    body = new URLSearchParams(options.form).toString()
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
  }

  return wait(requestDelay).then(function () {
    return fetch(requestUri, {
      method,
      headers,
      body
    })
  }).then(function (response) {
    return response.text().then(function (text) {
      const payload = parsePayload(response, text)

      if (!response.ok) {
        throw toError(response.status)
      }
      if ((payload ? payload.error : null)) {
        throw toError(payload)
      }

      return payload
    })
  })
}

module.exports = http
