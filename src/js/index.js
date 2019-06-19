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


function createSpan(text) {
  const el = document.createElement('span')
  el.textContent = text
  return el
}

const changesPanel = document.getElementById('changes-panel')

const opToHtml = operation => {
  const { meta } = operation
  const { baseLength, targetLength, ops } = operation.wrapped
  const opEl = ops.map(opDesc => {
    if (typeof opDesc == 'number') {
      if (opDesc > 0) {
        const el = createSpan(`Retain(${opDesc})`)
        el.style.color = 'gray'
        return el
      }
      const el = createSpan(`Delete(${-opDesc})`)
      el.style.color = 'red'
      return el
    }
    if (typeof opDesc == 'string') {
      const dispStr = opDesc.replace(/\n/g, '\\n')
      const el = createSpan(`Insert("${dispStr}")`)
      el.style.color = 'blue'
      return el
    }
    console.warn('Unreachable... :(')
    return null
  })

  const elContainer = document.createElement('div')
  elContainer.innerHTML = `<strong><code>${meta.creator}</code></strong>`
  elContainer.append(`: [${baseLength} → ${targetLength}] `)
  opEl.forEach((el, i) => {
    if (i > 0)
      elContainer.append(', ')
    elContainer.appendChild(el)
  })
  return elContainer
}

function sendToServer(revision, operation) {
  peers.forEach(client => {
    if (client._state.isMaster) {
      document.getElementById('mainRevision').textContent = revision
    }
  })
  setTimeout(() => {
    peers.forEach(client => {
      client.channel.emit('receive', operation)
    })
  }, 1000)
}

function setupClient(name, cm, state, initRevision) {
  const client = new Client(initRevision)
  const channel = new EventEmitter()

  client._state = state
  client.channel = channel

  client.sendOperation = function(revision, operation) {
    console.log('send op', name, revision, operation)
    const resp = server.receiveOperation(revision, operation)
    changesPanel.prepend(opToHtml(operation))
    sendToServer(revision, resp)
  }

  client.applyOperation = function(operation) {
    console.log('apply op', name, operation)
    state.isIdle = false
    CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cm)
    state.isIdle = true
  }

  cm.on('changes', function(cm, changes) {
    if (!state.isIdle) return
    const operationUnwrapped = CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm)[0]
    const operation = new WrappedOperation(operationUnwrapped, {
      creator: name,
      id: 'operation' + Math.random() * 1000,
    });
    client.applyClient(operation)
  })

  channel.on('receive', operation => {
    setTimeout(() => {
      if (operation.meta.creator == name) {
        return client.serverAck()
      } else {
        return client.applyServer(operation)
      }
    }, 2000)
  })

  return client
}

const peerNames = 'ABC'.split('')
const initDoc = 'asd'

const server = new MockedServer(initDoc)
const peers = []

const [sA, sB, sC] = peerNames.map(() => ({
  isIdle: true,
}))

const [cmA, cmB, cmC] = peerNames.map(c => {
  const textarea = document.getElementById('editor' + c)
  textarea.value = initDoc
  const cm = CodeMirror.fromTextArea(textarea, {
    lineNumbers: true,
  })
  cm.setSize(null, (6 * 1.6) + 'em')
  return cm
})

sA.isMaster = true


const clientA = setupClient('A', cmA, sA, 0)
const clientB = setupClient('B', cmB, sB, 0)
const clientC = setupClient('C', cmC, sC, 0)

peers.push(clientA, clientB, clientC)
