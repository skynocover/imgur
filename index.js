addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const setCache = async (name, data) => await Images.put(name, data)
const getCache = async name => await Images.get(name)

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request) {
  let list = []
  let newlist = []
  let jsonObject = null
  let cacheUrl = null
  let id = null

  let res = { errorCode: 0 }
  switch (request.method) {
    case 'POST':
      const uint8Arrray = await request.arrayBuffer()
      const parts = [...parseMimeMultipart(uint8Arrray)]
      if (parts.length === 0) {
        return new Response('No parts!')
      }

      const idbuff = uint8Arrray.slice(
        parts[0].index,
        parts[0].index + parts[0].length,
      )

      const id = String.fromCharCode.apply(null, new Uint8Array(idbuff))

      const blob = uint8Arrray.slice(
        parts[1].index,
        parts[1].index + parts[1].length,
      )

      var binary = ''
      var bytes = new Uint8Array(blob)
      var len = bytes.byteLength
      for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
      }

      await setCache(id, btoa(binary))

      return new Response(JSON.stringify(res), { status: 200 })

    case 'GET':
      const url = new URL(request.url)
      const { pathname } = url
      let path = pathname.substring(1)

      let base64code = await getCache(path)

      var binary_string = atob(base64code)
      var len = binary_string.length
      var bytes = new Uint8Array(len)
      for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i)
      }

      return new Response(bytes.buffer, {
        headers: { 'Content-Type': 'image/jpeg' },
      })

    case 'PUT':
      jsonObject = await request.json()

      cacheUrl = new URL(request.url)
      id = cacheUrl.pathname.slice(1)

      list = await getCache()
      newlist = list.map(item => {
        if (item.id == id) {
          console.log('catch!')
          item = jsonObject
        }
        return { ...item }
      })
      await setCache(newlist)
      return new Response(res, { status: 200 })

    case 'DELETE':
      cacheUrl = new URL(request.url)
      id = cacheUrl.pathname.slice(1)

      list = await getCache()
      list.map(item => console.log(item))
      newdata = list.filter(item => item.id != id)
      await setCache(newdata)
      return new Response('Hello worker delete!', { status: 200 })

    default:
      res.errorCode = 100
      res.errorMessage = 'WrongMethod'
      return new Response(res, { status: 404 })
  }
}

function* parseMimeMultipart(/** @type {Uint8Array} */ uint8Array) {
  const textDecoder = new TextDecoder()
  /** @typedef {{ name: string; values: string[]; }} Header */
  /** @typedef {{ type: 'boundary'; boundary: string; }} Boundary */
  /** @typedef {{ type: 'header-name'; boundary: string; name: string; headers: Header[]; }} HeaderName */
  /** @typedef {{ type: 'header-value'; boundary: string; name: string; value: string; values: string[]; headers: Header[]; }} HeaderValue */
  /** @typedef {{ type: 'content'; boundary: string; headers: Headers[]; index: number; length: number; }} Content */
  /** @type {Boundary | HeaderName | HeaderValue | Content} */
  let state = { type: 'boundary', boundary: '' }
  let index = 0
  let line = 0
  let column = 0
  for (; index < uint8Array.byteLength; index++) {
    const character = textDecoder.decode(uint8Array.slice(index, index + 1))
    if (character === '\n') {
      line++
      column = 0
    }

    column++

    switch (state.type) {
      case 'boundary': {
        // Check Windows newlines
        if (character === '\r') {
          if (
            textDecoder.decode(uint8Array.slice(index + 1, index + 2)) !== '\n'
          ) {
            throw new Error(
              `At ${index} (${line}:${column}): found an incomplete Windows newline.`,
            )
          }

          break
        }

        if (character === '\n') {
          state = {
            type: 'header-name',
            boundary: state.boundary,
            name: '',
            value: '',
            headers: [],
          }
          break
        }

        state.boundary += character
        break
      }
      case 'header-name': {
        // Check Windows newlines
        if (character === '\r') {
          if (
            textDecoder.decode(uint8Array.slice(index + 1, index + 2)) !== '\n'
          ) {
            throw new Error(
              `At ${index} (${line}:${column}): found an incomplete Windows newline.`,
            )
          }

          break
        }

        if (character === '\n') {
          if (state.name === '') {
            state = {
              type: 'content',
              boundary: state.boundary,
              headers: state.headers,
              index: index + 1,
              length: 0,
            }
            break
          } else {
            throw new Error(
              `At ${index} (${line}:${column}): a newline in a header name '${state.name}' is not allowed.`,
            )
          }
        }

        if (character === ':') {
          state = {
            type: 'header-value',
            boundary: state.boundary,
            name: state.name,
            value: '',
            values: [],
            headers: state.headers,
          }
          break
        }

        state.name += character
        break
      }
      case 'header-value': {
        // Check Windows newlines
        if (character === '\r') {
          if (
            textDecoder.decode(uint8Array.slice(index + 1, index + 2)) !== '\n'
          ) {
            throw new Error(
              `At ${index} (${line}:${column}): found an incomplete Windows newline.`,
            )
          }

          break
        }

        if (character === ';') {
          state.values.push(state.value)
          state.value = ''
          break
        }

        if (character === ' ') {
          // Ignore white-space prior to the value content
          if (state.value === '') {
            break
          }
        }

        if (character === '\n') {
          state.values.push(state.value)
          state = {
            type: 'header-name',
            boundary: state.boundary,
            name: '',
            value: '',
            headers: [
              { name: state.name, values: state.values },
              ...state.headers,
            ],
          }
          break
        }

        state.value += character
        break
      }
      case 'content': {
        // If the newline is followed by the boundary, then the content ends
        if (
          character === '\n' ||
          (character === '\r' &&
            textDecoder.decode(uint8Array.slice(index + 1, index + 2)) === '\n')
        ) {
          if (character === '\r') {
            index++
          }

          const boundaryCheck = textDecoder.decode(
            uint8Array.slice(
              index + '\n'.length,
              index + '\n'.length + state.boundary.length,
            ),
          )
          if (boundaryCheck === state.boundary) {
            const conclusionCheck = textDecoder.decode(
              uint8Array.slice(
                index + '\n'.length + state.boundary.length,
                index + '\n'.length + state.boundary.length + '--'.length,
              ),
            )
            if (conclusionCheck === '--') {
              index += '\n'.length + state.boundary.length + '--'.length
              yield {
                headers: state.headers,
                index: state.index,
                length: state.length,
              }

              if (index !== uint8Array.byteLength) {
                const excess = uint8Array.slice(index)
                if (
                  textDecoder.decode(excess) === '\n' ||
                  textDecoder.decode(excess) === '\r\n'
                ) {
                  return
                }

                throw new Error(
                  `At ${index} (${line}:${column}): content is present past the expected end of data ${uint8Array.byteLength}.`,
                )
              }

              return
            } else {
              yield {
                headers: state.headers,
                index: state.index,
                length: state.length,
              }
              state = { type: 'boundary', boundary: '' }
              break
            }
          }
        }

        state.length++
        break
      }
      default: {
        throw new Error(
          `At ${index} (${line}:${column}): invalid state ${JSON.stringify(
            state,
          )}.`,
        )
      }
    }
  }

  if (state.type !== 'content') {
    throw new Error(
      `At ${index} (${line}:${column}): expected content state, got ${JSON.stringify(
        state,
      )}.`,
    )
  }
}
