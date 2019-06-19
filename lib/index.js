const path = require('path')

const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

const Server = require('./server')
const TextOperation = require('./text-operation')
const WrappedOperation = require('./wrapped-operation')


app.use(express.static(path.join(__dirname, '..', 'src')))

const initDoc = `Hello world from server
Owo`

const otServer = new Server(initDoc)

const users = new Set

io.on('connection', function(socket) {
  console.log('socket client connection: ', socket.id)

  socket.on('start', ack => {
    console.log('start')
    const userId = '' + Math.floor(Math.random() * 1e12)
    // users.add(userId)

    console.log(otServer)

    ack({
      id: userId,
      revision: otServer.operations.length,
      initDoc: otServer.document,
    })
  })

  socket.on('edit', (revision, opJSON) => {
    const {wrapped, meta} = JSON.parse(opJSON)
    const textOperation = TextOperation.fromJSON(wrapped)
    const wrappedOperation = new WrappedOperation(textOperation, meta)
    try {
      const resp = otServer.receiveOperation(revision, wrappedOperation)
      console.log('resp', resp)
      // ack(rev, resp)
      io.emit('ack', revision, JSON.stringify(resp))
    } catch (err) {
      console.log('edit error', err)
    }
  })
});

http.listen(3000, () => {
  console.log('Listening on 3000')
})
