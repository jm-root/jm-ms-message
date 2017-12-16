const cluster = require('cluster')
const log = require('jm-log4js')
const event = require('jm-event')
const MS = require('jm-ms-core')
var ms = new MS()
const logger = log.getLogger('jm-ms-message')

var message = function (opts) {
  opts = opts || {}
  var app = this

  var model = {
    subscribe: function (opts, cb) {
      if (!opts.session) return cb(null, null)
      var session = opts.session
      var channel = opts.data.channel
      logger.debug('subscribe, session id:%s channel:%s', session.id, channel)
      if (channel) {
        session.on(channel, function (msg) {
          session.send(msg, function (err) {
            if(err) logger.debug('send subscribed message fail. session id:%s channel:%s msg:%s', session.id, channel, msg)
          })
        })
      }
      cb(null, {ret: true})
    },

    unsubscribe: function (opts, cb) {
      if (!opts.session) return cb(null, null)
      var session = opts.session
      var channel = opts.data.channel
      logger.debug('unsubscribe, session id:%s channel:%s', session.id, channel)
      if (channel) {
        session.off(channel)
      }
      cb(null, {ret: true})
    },

    broadcast: function (opts, cb) {
      if (cluster.isWorker) {
        opts.type = 'message'
        process.send(opts)
        if (cb) cb(null, {ret: true})
      } else {
        this.publish(opts, cb)
      }
    },

    publish: function (opts, cb) {
      var channel = opts.data.channel
      var msg = JSON.stringify({type: 'message', data: opts.data})
      var userId = opts.data.msg.userId
      var wss = app.servers['ws']
      if (wss) {
        for (var i in wss.sessions) {
          var session = wss.sessions[i]
          if (userId) {
            if (session.userId === userId) session.emit(channel, msg)
          } else {
            session.emit(channel, msg)
          }
        }
      }
      if (cb) cb(null, {ret: true})
    },

    router: function (opts) {
      var router = ms.router()
      router.add('/subscribe', 'post', function (opts, cb, next) {
        model.subscribe(opts, cb)
      })
      router.add('/unsubscribe', 'post', function (opts, cb, next) {
        model.unsubscribe(opts, cb)
      })
      router.add('/publish', 'post', function (opts, cb, next) {
        model.publish(opts, cb)
      })
      router.add('/broadcast', 'post', function (opts, cb, next) {
        model.broadcast(opts, cb)
      })
      return router
    }

  }
  event.enableEvent(model)

  if (cluster.isWorker) {
    process.on('message', function (msg) {
      if (typeof msg === 'object') {
        if (msg.type === 'message') {
          model.publish(msg)
        }
      }
    })
  }

  return model
}

if (typeof global !== 'undefined' && global) {
  global.jm || (global.jm = {})
  let jm = global.jm
  if (jm.ms) {
    jm.ms.message = message
  }
}

module.exports = message
