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

const ACK_LATENCY = 200
const SEND_LATENCY = 200
const BROADCAST_LATENCY = 600

const id = x => x
const deviate = x => x * 3

const changesPanel = document.getElementById('changes-panel')
const cOfflineMode = document.getElementById('c1-offline-mode')
const cRandomLatency = document.getElementById('c2-random-latency')
const cAnnoyWriter = document.getElementById('c3-annoy-writer')

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
      const dispStr = opDesc.replace(/\n/g, '\\n').replace(/\t/g, '\\t')
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
  setTimeout(() => {
    peers.forEach(client => {
      client.channel.emit('receive', operation)
    })
  }, (cRandomLatency.checked ? deviate : id)(BROADCAST_LATENCY))
}

function sendOperationEach(revision, operation) {
  const resp = server.receiveOperation(revision, operation)
  console.log('sendOE', operation)
  changesPanel.prepend(opToHtml(operation))
  sendToServer(revision, resp)
  console.log('sendResp', resp)
}

function setupClient(name, cm, state, initRevision) {
  const client = new Client(initRevision)
  const channel = new EventEmitter()

  client._state = state
  client.opBuffer = []
  client.channel = channel

  client.__flushOpBuffer = function() {
    console.log('flush', name, this)
    this.opBuffer.forEach(([r, o]) => sendOperationEach(r, o))
    this.opBuffer.length = 0
  }

  client.sendOperation = function(revision, operation) {
    console.log('send op', name, revision, operation)

    if (!cOfflineMode.checked) {
      // online; send directly
      sendOperationEach(revision, operation)
    } else {
      client.opBuffer.push([revision, operation])
    }
  }

  client.applyOperation = function(operation) {
    console.log('apply op', name, operation)
    state.isIdle = false
    CodeMirrorAdapter.applyOperationToCodeMirror(operation.wrapped, cm)
    state.isIdle = true
  }

  client.setState = function(newState) {
    // var j, len, oldState, results, transition;
    const oldState = this.state
    this.state = newState

    if (state.isMaster) {

    // if (client._state.isMaster) {
      document.getElementById('mainRevision').textContent = this.revision
    // }
      console.log('state', this.state)
      if (this.state instanceof Client.Synchronized) {
        document.getElementById('mainState').innerHTML = '<span style="color: green">Synchronized</span>'
      } else if (this.state instanceof Client.AwaitingConfirm) {
        document.getElementById('mainState').innerHTML = '<span style="color: purple">Awaiting confirm</span>'
        document.getElementById('mainState').appendChild(opToHtml(this.state.outstanding))
      } else if (this.state instanceof Client.AwaitingWithBuffer) {
        document.getElementById('mainState').innerHTML = '<span style="color: purple">Awaiting with buffer</span>'
        document.getElementById('mainState').appendChild(opToHtml(this.state.outstanding))
        document.getElementById('mainState').appendChild(opToHtml(this.state.buffer))
      } else {
        console.warn('Unknown state')
      }
    }
  }

  cm.on('changes', function(cm, changes) {
    if (!state.isIdle) return
    const operationUnwrapped = CodeMirrorAdapter.operationFromCodeMirrorChanges(changes, cm)[0]
    const operation = new WrappedOperation(operationUnwrapped, {
      creator: name,
      id: 'operation' + Math.floor(Math.random() * 1e9),
    })
    client.applyClient(operation)
  })

  channel.on('receive', operation => {
    if (operation.meta.creator == name) {
      setTimeout(() => client.serverAck(), cRandomLatency.checked ? ACK_LATENCY : 0)
    } else {
      setTimeout(() => client.applyServer(operation), cRandomLatency.checked ? SEND_LATENCY : 0)
    }
  })

  return client
}

const peerNames = 'ABC'.split('')
const initDoc = 'Hello, world!\nInput some text here...'

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

// force update
clientA.setState(clientA.state)

cOfflineMode.addEventListener('input', () => {
  if (!cOfflineMode.checked) {
    console.log('!')
    // flush all pending operations
    peers.forEach(client => client.__flushOpBuffer())
  }
})

setInterval(() => {
  if (cAnnoyWriter.checked) {
    const doc = cmC.getDoc()
    const cursor = doc.getCursor()
    var line = doc.getLine(cursor.line)
    var pos = {
        line: 0,
        ch: 0
    }
    doc.replaceRange('.', pos); // adds a new line
  }
}, 500)
