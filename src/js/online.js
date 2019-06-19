import { EventEmitter } from './utils.js'

const { AjaxAdapter,
        Client,
        CodeMirrorAdapter,
        EditorClient,
        Selection,
        SocketIOAdapter,
        TextOperation,
        UndoManager,
        WrappedOperation } = ot


const socket = io()

let cm
const state = {
  isIdle: true
}

function sendOperationEach(revision, operation) {
  socket.emit('edit', revision, JSON.stringify(operation))
}

function init(data) {
  const { id, revision, initDoc } = data
  const client = new Client(revision)
  const channel = new EventEmitter()

  const textarea = document.getElementById('editor')
  textarea.value = initDoc
  cm = CodeMirror.fromTextArea(textarea, {
    lineNumbers: true,
  })
  cm.setSize(null, (12 * 1.6) + 'em')

  client.sendOperation = function(revision, operation) {
    console.log('send op', id, revision, operation)

    sendOperationEach(revision, operation)
  }

  client.applyOperation = function(operation) {
    console.log('apply op', id, operation)
    state.isIdle = false
    CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cm)
    state.isIdle = true
  }

  cm.on('changes', function(cm, changes) {
    if (!state.isIdle) return
    const operationUnwrapped = CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm)[0]
    const operation = new WrappedOperation(operationUnwrapped, {
      creator: id,
      id: 'operation' + Math.floor(Math.random() * 1e9),
    })
    client.applyClient(operation)
  })

  socket.on('ack', (revision, opJSON) => {
    const { wrapped, meta } = JSON.parse(opJSON)
    const textOperation = TextOperation.fromJSON(wrapped)
    const wrappedOperation = new WrappedOperation(textOperation, meta)
    console.log('ack', revision, wrappedOperation)
    channel.emit('receive', wrappedOperation)
  })

  channel.on('receive', operation => {
    if (operation.meta.creator == id) {
      setTimeout(() => client.serverAck(), 0)
    } else {
      setTimeout(() => client.applyServer(operation), 0)
    }
  })
}

socket.emit('start', function (data) {
  init(data)
})
