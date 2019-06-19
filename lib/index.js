const fs = require('fs')
const path = require('path')

const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

const Server = require('./server')
const TextOperation = require('./text-operation')
const WrappedOperation = require('./wrapped-operation')


app.use(express.static(path.join(__dirname, '..', 'src')))

const defaultDoc = `Hello world from server
Owo`
let initDoc = defaultDoc
try {
  initDoc = fs.readFileSync('doc-backup', 'utf-8')
} catch (_) {}

const otServer = new Server(initDoc)

const users = new Map
const withUserId = m => Array.from(m.values()).filter(x => !!x.userId)

function throttle(func, wait, options) {
  var context, args, result;
  var timeout = null;
  var previous = 0;
  if (!options) options = {};
  var later = function() {
    previous = options.leading === false ? 0 : Date.now();
    timeout = null;
    result = func.apply(context, args);
    if (!timeout) context = args = null;
  };
  return function() {
    var now = Date.now();
    if (!previous && options.leading === false) previous = now;
    var remaining = wait - (now - previous);
    context = this;
    args = arguments;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining);
    }
    return result;
  };
};  // https://stackoverflow.com/questions/27078285/simple-throttle-in-js

function _backup(serv) {
  fs.writeFileSync('doc-backup', serv.document.substring(0, 8192), 'utf-8')
}

const backup = throttle(_backup, 1000 * 60)

io.on('connection', function(socket) {
  console.log('Client connected', socket.id)
  const ip = socket.handshake.address
  users.set(socket.id, {
    ip: ip,
    userId: null,
  })

  socket.on('start', ack => {
    const userId = '' + Math.floor(Math.random() * 1e12)
    users.get(socket.id).userId = userId

    io.emit('userJoined', userId, withUserId(users).length)

    ack({
      id: userId,
      revision: otServer.operations.length,
      initDoc: otServer.document,
    })
  })

  socket.on('edit', (revision, opJSON) => {
    try {
      const {wrapped, meta} = JSON.parse(opJSON)
      const textOperation = TextOperation.fromJSON(wrapped)
      const wrappedOperation = new WrappedOperation(textOperation, meta)
      const resp = otServer.receiveOperation(revision, wrappedOperation)
      backup(otServer)
      io.emit('ack', revision, JSON.stringify(resp))
    } catch (err) {
      console.log('edit error', err)
    }
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id)
    const user = users.get(socket.id)
    if (user && user.userId) {
      const userId = user.userId
      io.emit('userLeft', userId, withUserId(users).length - 1)
    }
    users.delete(socket.id)
  })
});

http.listen(3000, () => {
  console.log('Listening on 3000')
})
