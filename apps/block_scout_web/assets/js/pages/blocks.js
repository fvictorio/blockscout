import $ from 'jquery'
import _ from 'lodash'
import URI from 'urijs'
import humps from 'humps'
import socket from '../socket'
import { updateAllAges } from '../lib/from_now'
import { buildFullBlockList, initRedux, slideDownBefore, skippedBlockListBuilder, listMorph } from '../utils'

export const initialState = {
  beyondPageOne: null,
  channelDisconnected: false,
  blocks: []
}

export function reducer (state = initialState, action) {
  switch (action.type) {
    case 'PAGE_LOAD': {
      return Object.assign({}, state, {
        beyondPageOne: action.beyondPageOne,
        blocks: action.blocks
      })
    }
    case 'CHANNEL_DISCONNECTED': {
      return Object.assign({}, state, {
        channelDisconnected: true
      })
    }
    case 'RECEIVED_NEW_BLOCK': {
      if (state.channelDisconnected || state.beyondPageOne) return state

      return Object.assign({}, state, {
          blocks: [
            action.msg,
            ...state.blocks
          ]
        })
    }
    default:
      return state
  }
}

const $blockListPage = $('[data-page="block-list"]')
if ($blockListPage.length) {
  initRedux(reducer, {
    main (store) {
      const state = store.dispatch({
        type: 'PAGE_LOAD',
        beyondPageOne: !!humps.camelizeKeys(URI(window.location).query(true)).blockNumber,
        blocks: $('[data-selector="block-tile"]').map((index, el) => ({
          blockNumber: parseInt(el.dataset.blockNumber),
          blockHtml: el.outerHTML
        })).toArray()
      })
      if (!state.beyondPageOne) {
        const blocksChannel = socket.channel(`blocks:new_block`, {})
        blocksChannel.join()
        blocksChannel.onError(() => store.dispatch({ type: 'CHANNEL_DISCONNECTED' }))
        blocksChannel.on('new_block', (msg) =>
          store.dispatch({ type: 'RECEIVED_NEW_BLOCK', msg: humps.camelizeKeys(msg) })
        )
      }
    },
    render (state, oldState) {
      const $channelDisconnected = $('[data-selector="channel-disconnected-message"]')
      const $blocksList = $('[data-selector="blocks-list"]')

      if (state.channelDisconnected) $channelDisconnected.show()

      const oldElements = $blocksList.find('[data-selector="block-tile"]').get()
      const newElements = _.map(state.blocks, 'blockHtml').map((el) => $(el)[0])

      listMorph(oldElements, newElements, { key: 'dataset.blockNumber' })
    }
  })
}

function placeHolderBlock (blockNumber) {
  return `
    <div class="my-3" style="height: 98px;" data-selector="place-holder" data-block-number="${blockNumber}">
      <div
        class="tile tile-type-block d-flex align-items-center fade-up"
        style="height: 98px;"
      >
        <span class="loading-spinner-small ml-1 mr-4">
          <span class="loading-spinner-block-1"></span>
          <span class="loading-spinner-block-2"></span>
        </span>
        <div>
          <div class="tile-title">${blockNumber}</div>
          <div>${window.localized['Block Processing']}</div>
        </div>
      </div>
    </div>
  `
}
