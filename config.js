/*jslint node: true */

// Configuration settings. For node and the browser.

var config = {}

config.isNode = (typeof module !== 'undefined')

config.isProd = config.isNode
  ? (process.env.NODE_ENV === 'production')
  : !/^local/.test(window.location.hostname)

config.siteOrigin = config.isProd
  ? 'http://www.apstudynotes.org'
  : config.isNode
    ? 'http://localhost:' + config.port
    : window.location.origin

config.cdnOrigin = config.isProd
  ? 'http://cdn.apstudynotes.org'
  : '/static'

if (typeof module !== 'undefined') {
  module.exports = config
  require('./util').extend(config, require('./config-node'))
}