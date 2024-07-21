import { Delta as QDelta } from 'quill/core.js'

type Delta = InstanceType<typeof QDelta.default>

type OutputLine = {
  text: string
  openFormats?: (
    | 'constrained-italic'
    | 'unconstrained-italic'
    | 'constrained-bold'
    | 'unconstrained-bold'
    | 'code'
    | 'link'
    | 'superscript'
    | 'subscript'
  )[]
}

export function convert(delta: Delta): string {
  let output: OutputLine[] = []
  let current: OutputLine = { text: '' }

  for (let o = 0; o < delta.ops.length; o++) {
    let op = delta.ops[o]
    const { insert, attributes } = op

    let isBold = false
    let isItalic = false
    let isCode = false
    let isLink = false
    let isSubscript = false
    let isSuperscript = false

    // first close any open formatting section that doesn't continue the current line (read it backwards)
    if (current.openFormats?.length) {
      for (let f = current.openFormats.length - 1; f >= 0; f--) {
        let format = current.openFormats[f]
        switch (format) {
          case 'superscript':
            if (attributes?.script === 'super') {
              isCode = true
            } else {
              current.text += '^'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'subscript':
            if (attributes?.script === 'sub') {
              isCode = true
            } else {
              current.text += '~'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'code':
            if (attributes?.code) {
              isCode = true
            } else {
              current.text += '`'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'link':
            if (attributes?.code) {
              isLink = true
            } else {
              current.text += ']'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'unconstrained-bold':
            if (attributes?.bold) {
              isBold = true
            } else {
              current.text += '**'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'constrained-bold':
            if (attributes?.bold) {
              isBold = true
            } else {
              current.text += '*'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'unconstrained-italic':
            if (attributes?.italic) {
              isItalic = true
            } else {
              current.text += '__'
              current.openFormats!.splice(f, 1)
            }
            break
          case 'constrained-italic':
            if (attributes?.italic) {
              isItalic = true
            } else {
              current.text += '_'
              current.openFormats!.splice(f, 1)
            }
            break
        }
      }
    }

    if ((insert === '\n' || insert === '\n\n') && attributes) {
      // block
      if (attributes.header) {
        current.text = '='.repeat(attributes.header as number) + ' ' + current.text
      } else if (attributes.blockquote) {
        current.text = '> ' + current.text
      } else if (attributes['code-block']) {
        current.text = '[source]\n----\n' + current.text + '\n----'
      } else if (attributes.list) {
        let r = ((attributes?.indent as number) ?? 0) + 1
        switch (attributes.list) {
          case 'bullet':
            current.text = '*'.repeat(r) + ' ' + current.text
            break
          case 'checked':
            current.text = '*'.repeat(r) + ' [x] ' + current.text
            break
          case 'unchecked':
            current.text = '*'.repeat(r) + ' [ ] ' + current.text
            break
          case 'ordered':
            current.text = '.'.repeat(r) + ' ' + current.text
            break
          default:
            console.warn('unexpected list type', op)
        }
      }
      output.push(current)
      if (insert === '\n\n') {
        output.push({ text: '' })
      }
      current = { text: '' }
    } else if (typeof insert === 'string') {
      // inline
      let spl = insert.split('\n')

      if (spl.length > 1) {
        // if there are multiple lines we take that none of them will have any formatting except for the last that may be a block
        for (let s = 0; s < spl.length - 1; s++) {
          current.text += spl[s] // continue from previous op
          output.push(current)
          current = { text: '' }
        }
        // if the last is a block its formatting directive will come in the next op, so we leave it open
        current.text += spl[spl.length - 1]
      } else {
        // otherwise we apply formatting as required
        let line = spl[spl.length - 1]
        let text = ''

        // bold
        if (attributes?.bold) {
          current.openFormats = current.openFormats || []
          // prefix
          if (isBold) {
            // it's already open
          } else {
            // should it be doubled (unconstrained)
            if (current.text.match(/\p{L}$/u) /* previous string ends with letter */) {
              current.openFormats.push('unconstrained-bold')
              text += '**'
            } else {
              let nextWithoutBold: string | null = null
              for (let n = o + 1; n < delta.ops.length; n++) {
                if (delta.ops[n].attributes?.bold) {
                  nextWithoutBold = delta.ops[n].insert as string
                  break
                }
              }

              if (!nextWithoutBold || nextWithoutBold.match(/^\p{L}/u) /* starts with letter*/) {
                current.openFormats.push('unconstrained-bold')
                text += '**'
              } else {
                current.openFormats.push('constrained-bold')
                text += '*'
              }
            }
          }
        }

        // italic
        if (attributes?.italic) {
          current.openFormats = current.openFormats || []
          // prefix
          if (isItalic) {
            // it's already open
          } else {
            // should it be doubled (unconstrained)
            if (current.text.match(/\p{L}$/u) /* previous string ends with letter */) {
              current.openFormats.push('unconstrained-italic')
              text += '__'
            } else {
              let nextWithoutItalic: string | null = null
              for (let n = o + 1; n < delta.ops.length; n++) {
                if (delta.ops[n].attributes?.italic) {
                  nextWithoutItalic = delta.ops[n].insert as string
                  break
                }
              }

              if (!nextWithoutItalic || nextWithoutItalic.match(/^\p{L}/u) /* starts with letter*/) {
                current.openFormats.push('unconstrained-italic')
                text += '__'
              } else {
                current.openFormats.push('constrained-italic')
                text += '_'
              }
            }
          }
        }

        // superscript
        if (attributes?.script === 'super') {
          current.openFormats = current.openFormats || []
          // prefix
          if (isSuperscript) {
            // it's already open
          } else {
            current.openFormats.push('superscript')
            text += '^'
          }
        }

        // subscript
        if (attributes?.script === 'sub') {
          current.openFormats = current.openFormats || []
          // prefix
          if (isSubscript) {
            // it's already open
          } else {
            current.openFormats.push('subscript')
            text += '~'
          }
        }

        // code
        if (attributes?.code) {
          current.openFormats = current.openFormats || []
          // prefix
          if (isCode) {
            // it's already open
          } else {
            current.openFormats.push('code')
            text += '`'
          }
        }

        // link
        if (attributes?.link) {
          current.openFormats = current.openFormats || []
          if (isLink) {
            // it's already open
          } else {
            current.openFormats.push('link')
            let url = attributes.link as string
            line = line === url ? '' : insert // set line to '' because we don't want to output it in this case
            let prefix =
              current.text.match(/\p{L}$/u) /* previous string ends with letter */ ||
              !(url.startsWith('https:') || url.startsWith('http:'))
                ? 'link:'
                : ''
            text = `${prefix}${url}[`
          }
        }

        current.text += text + line
      }
    } else if (insert?.image) {
      // image
      output.push(current)

      let params = ''
      if (attributes?.link) {
        params = `link=${attributes.link}`
      }

      output.push({ text: `image::${insert.image as string}[${params}]` })
      current = { text: '' }
    } else if (insert?.thematic_break) {
      // <hr> (not a native quill feature)
      output.push(current)
      output.push({ text: "'''" })
      current = { text: '' }
    } else if (insert?.mention) {
      // nostr mention (not a native quill feature)
      current.text = current.text + (insert.mention as { id: string }).id
    } else {
      // this should never happen
      console.warn('unexpected condition happened, "insert" is empty:', op)
      continue
    }
  }

  if (current.text.length) output.push(current)

  return output.map(l => l.text).join('\n') + '\n'
}
