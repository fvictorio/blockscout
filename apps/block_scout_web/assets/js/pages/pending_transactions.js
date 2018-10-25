import $ from 'jquery'
import _ from 'lodash'
import URI from 'urijs'
import humps from 'humps'
import numeral from 'numeral'
import socket from '../socket'
import { updateAllAges } from '../lib/from_now'
import { batchChannel, initRedux, listMorph } from '../utils'

const BATCH_THRESHOLD = 10

export const initialState = {
  beyondPageOne: null,
  channelDisconnected: false,
  pendingTransactions: [],
  pendingTransactionHashesBatch: [],

  newPendingTransactions: [],
  transactionHashes: [],
  pendingTransactionCount: null
}

export function reducer (state = initialState, action) {
  switch (action.type) {
    case 'PAGE_LOAD': {
      return Object.assign({}, state, {
        beyondPageOne: action.beyondPageOne,
        pendingTransactionCount: numeral(action.pendingTransactionCount).value(),
        pendingTransactions: action.pendingTransactions
      })
    }
    case 'CHANNEL_DISCONNECTED': {
      return Object.assign({}, state, {
        channelDisconnected: true
      })
    }
    case 'RECEIVED_NEW_TRANSACTION': {
      if (state.channelDisconnected) return state

      return Object.assign({}, state, {
        pendingTransactionHashesBatch: _.without(state.pendingTransactionHashesBatch, action.msg.transactionHash),
        pendingTransactionCount: state.pendingTransactionCount - 1,
        pendingTransactions: _.filter(state.pendingTransactions, ({ transactionHash }) => transactionHash !== action.msg.transactionHash)
      })
    }
    case 'RECEIVED_NEW_PENDING_TRANSACTION_BATCH': {
      if (state.channelDisconnected) return state

      const pendingTransactionCount = state.pendingTransactionCount + action.msgs.length

      if (state.beyondPageOne) return Object.assign({}, state, { pendingTransactionCount })

      if (!state.pendingTransactionHashesBatch.length && action.msgs.length < BATCH_THRESHOLD) {
        return Object.assign({}, state, {
          pendingTransactions: [
            ...action.msgs.reverse(),
            ...state.pendingTransactions,
          ],
          pendingTransactionCount
        })
      } else {
        return Object.assign({}, state, {
          pendingTransactionHashesBatch: [
            ..._.map(action.msgs, 'transactionHash'),
            ...state.pendingTransactionHashesBatch
          ],
          pendingTransactionCount
        })
      }
    }
    default:
      return state
  }
}

const $transactionPendingListPage = $('[data-page="transaction-pending-list"]')
if ($transactionPendingListPage.length) {
  initRedux(reducer, {
    main (store) {
      store.dispatch({
        type: 'PAGE_LOAD',
        pendingTransactionCount: $('[data-selector="transaction-pending-count"]').text(),
        beyondPageOne: !!humps.camelizeKeys(URI(window.location).query(true)).insertedAt,
        pendingTransactions: $('[data-selector="transaction-tile"]').map((index, el) => ({
          transactionHash: el.dataset.transactionHash,
          transactionHtml: el.outerHTML
        })).toArray()
      })
      const transactionsChannel = socket.channel(`transactions:new_transaction`)
      transactionsChannel.join()
      transactionsChannel.onError(() => store.dispatch({ type: 'CHANNEL_DISCONNECTED' }))
      transactionsChannel.on('transaction', (msg) =>
        store.dispatch({ type: 'RECEIVED_NEW_TRANSACTION', msg: humps.camelizeKeys(msg) })
      )
      const pendingTransactionsChannel = socket.channel(`transactions:new_pending_transaction`)
      pendingTransactionsChannel.join()
      pendingTransactionsChannel.onError(() => store.dispatch({ type: 'CHANNEL_DISCONNECTED' }))
      pendingTransactionsChannel.on('pending_transaction', batchChannel((msgs) =>
        store.dispatch({ type: 'RECEIVED_NEW_PENDING_TRANSACTION_BATCH', msgs: humps.camelizeKeys(msgs) }))
      )
    },
    render (state, oldState) {
      const $channelBatching = $('[data-selector="channel-batching-message"]')
      const $channelBatchingCount = $('[data-selector="channel-batching-count"]')
      const $channelDisconnected = $('[data-selector="channel-disconnected-message"]')
      const $pendingTransactionsList = $('[data-selector="transactions-pending-list"]')
      const $pendingTransactionsCount = $('[data-selector="transaction-pending-count"]')

      if (state.channelDisconnected) $channelDisconnected.show()
      if (oldState.pendingTransactionCount !== state.pendingTransactionCount) {
        $pendingTransactionsCount.empty().append(numeral(state.pendingTransactionCount).format())
      }
      if (state.pendingTransactionHashesBatch.length) {
        $channelBatching.show()
        $channelBatchingCount[0].innerHTML = numeral(state.pendingTransactionHashesBatch.length).format()
      } else {
        $channelBatching.hide()
      }

      const oldElements = $pendingTransactionsList.find('[data-selector="transaction-tile"]').get()
      const newElements = _.map(state.pendingTransactions, 'transactionHtml').map((el) => $(el)[0])

      listMorph(oldElements, newElements, { key: 'dataset.transactionHash' })
    }
  })
}
