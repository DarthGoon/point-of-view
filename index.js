'use strict'

const fp = require('fastify-plugin')
const readFile = require('fs').readFile
const join = require('path').join
const HLRU = require('hashlru')
const supportedEngines = ['ejs', 'pug', 'handlebars', 'marko']

function fastifyView (fastify, opts, next) {
  if (!opts.engine) {
    next(new Error('Missing engine'))
    return
  }

  const type = Object.keys(opts.engine)[0]
  if (supportedEngines.indexOf(type) === -1) {
    next(new Error(`'${type}' not yet supported, PR? :)`))
    return
  }

  const engine = opts.engine[type]
  const options = opts.options || {}
  const templatesDir = join(process.cwd(), opts.templates || './')
  const lru = HLRU(opts.maxCache || 100)
  const prod = process.env.NODE_ENV === 'production'

  fastify.decorateReply('view', type === 'marko' ? viewMarko : view)

  function view (page, data) {
    if (!page || !data) {
      this.send(new Error('Missing data'))
      return
    }

    const toHtml = lru.get(page)

    if (toHtml && prod) {
      this.header('Content-Type', 'text/html').send(toHtml(data))
      return
    }

    readFile(join(templatesDir, page), 'utf8', readCallback(this, page, data))
  }

  function readCallback (that, page, data) {
    return function _readCallback (err, html) {
      if (err) {
        that.send(err)
        return
      }

      lru.set(page, engine.compile(html, options))
      that.header('Content-Type', 'text/html').send(lru.get(page)(data))
    }
  }

  function viewMarko (page, data, opts) {
    if (!page || !data) {
      this.send(new Error('Missing data'))
      return
    }

    const template = engine.load(join(templatesDir, page))

    if (opts && opts.stream) {
      this.send(template.stream(data))
    } else {
      template.renderToString(data, send(this))
    }

    function send (that) {
      return function _send (err, html) {
        if (err) return that.send(err)
        that.header('Content-Type', 'text/html').send(html)
      }
    }
  }

  next()
}

module.exports = fp(fastifyView, '>=0.13.1')
