import { EventEmitter } from './utils.js'
import { Server as MockedServer } from './mocked-server.js'

const { AjaxAdapter,
        Client,
        CodeMirrorAdapter,
        EditorClient,
        Selection,
        SocketIOAdapter,
        TextOperation,
        UndoManager,
        WrappedOperation } = ot


const client = new ot.Client(0)
const peer = new ot.Client(0)
const server = new MockedServer('')
console.log(client)
console.log(server)

const cm = CodeMirror.fromTextArea(document.getElementById('editor'), {
  lineNumbers: true,
})
cm.setSize(null, (6 * 1.6) + 'em')

// will be removed when demo
const cmDebug = CodeMirror.fromTextArea(document.getElementById('editor-debug'), {
  lineNumbers: true
})

const changesPanel = document.getElementById('changes-panel')

const opToHtml = operation => {
  const { meta } = operation
  const { baseLength, targetLength, ops } = operation.wrapped
  const opText = ops.map(opDesc => {
    if (typeof opDesc == 'number') {
      if (opDesc > 0) {
        return `Retain(${opDesc})`
      }
      return `Delete(${-opDesc})`
    }
    if (typeof opDesc == 'string') {
      const dispStr = opDesc.replace(/\n/g, '\\n')
      return `Insert("${dispStr}")`
    }
    console.warn('Unreachable... :(')
    return null
  })

  const el = document.createElement('div')
  el.textContent = `${meta.creator}: [${baseLength} -> ${targetLength}]` + opText
  return el
}

const opBuffer = []
const networkChannel = new EventEmitter()
const peerChannel = new EventEmitter()

const state = {
  isIdle: true
}
const statePeer = {
  isIdle: true
}

function sendToServer(operation) {
  setTimeout(() => {
    [networkChannel, peerChannel].forEach(ch => {
      ch.emit('receive', operation)
    })
  }, 1000)
}

client.sendOperation = function (revision, operation) {
  console.log('sendOp A', revision, operation)
  const resp = server.receiveOperation(revision, operation)

  changesPanel.prepend(opToHtml(operation))
  sendToServer(resp)
}

client.applyOperation = function (operation) {
  console.log('applyOp A', operation)
  state.isIdle = false
  CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cm)
  state.isIdle = true
}


peer.sendOperation = function (revision, operation) {
  console.log('sendOp B', revision, operation)
  const resp = server.receiveOperation(revision, operation)

  changesPanel.prepend(opToHtml(operation))
  sendToServer(resp)
}

peer.applyOperation = function (operation) {
  console.log('applyOp B', operation)
  statePeer.isIdle = false
  CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cmDebug)
  statePeer.isIdle = true
}

// networkChannel.on('send', operation => {
//   changesPanel.prepend(opToHtml(operation))
//   peerChannel.emit('receive', operation)
// })

networkChannel.on('receive', operation => {
  // statePeer.isIdle = false
  // CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cm)
  // statePeer.isIdle = true
  setTimeout(() => {
    if (operation.meta.creator == 'A') {
      return client.serverAck();
    } else {
      return client.applyServer(operation);
    }
  }, 2000)
})

peerChannel.on('receive', operation => {
  setTimeout(() => {
    if (operation.meta.creator == 'B') {
      return peer.serverAck();
    } else {
      return peer.applyServer(operation);
    }
  }, 2000)
})

cm.on('changes', function(cm, changes) {
  if (!state.isIdle) return
  const operation = new WrappedOperation(CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm)[0], {
    creator: 'A',
    id: 'operation' + Math.random() * 1000,
  });
  client.applyClient(operation)
})

cmDebug.on('changes', function(cm, changes) {
  if (!statePeer.isIdle) return
  const operation = new WrappedOperation(CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm)[0], {
    creator: 'B',
    id: 'operationxxx',
  });
  peer.applyClient(operation)
})
