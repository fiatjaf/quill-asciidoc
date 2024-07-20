import { Delta as QDelta } from 'quill/core.js'

type Delta = InstanceType<typeof QDelta.default>

export function convert(delta: Delta): string {
  let lines = []
  let current = ''

  for (let o = 0; o < delta.ops.length; o++) {
    let op = delta.ops[o]
    console.log('op', op)

    const { insert, attributes } = op
    if (insert === '\n' && attributes) {
      // block
      if (attributes.header) {
        current = '='.repeat(attributes.header as number) + ' ' + current
      } else if (attributes.blockquote) {
        current = '> ' + current
      } else if (attributes.list) {
        let r = ((attributes?.indent as number) ?? 0) + 1
        switch (attributes.list) {
          case 'bullet':
            current = '*'.repeat(r) + ' ' + current
            break
          case 'checked':
            current = '*'.repeat(r) + ' [x] ' + current
            break
          case 'unchecked':
            current = '*'.repeat(r) + ' [ ] ' + current
            break
          case 'ordered':
            current = '.'.repeat(r) + ' ' + current
            break
          default:
            console.warn('unexpected list type', op)
        }
        lines.push(current)
        current = ''
      }
    } else if (typeof insert === 'string') {
      // inline
      let spl = insert.split('\n')
      current += spl[0]
      for (let s = 1; s < spl.length; s++) {
        let line = spl[s]
        lines.push(current)
        current = line
      }

      if (attributes?.bold) {
        current = '*' + current + '*'
        let next = delta.ops[o + 1]
        if (
          lines[lines.length - 1].match(/\p{L}$/u) /* ends with letter */ ||
          (typeof next?.insert === 'string' && next.insert.match(/^\p{L}/u)) /* starts with letter*/
        ) {
          current = '*' + current + '*'
        }
      } else if (attributes?.italic) {
        current = '_' + current + '_'
        let next = delta.ops[o + 1]
        if (
          lines[lines.length - 1].match(/\p{L}$/u) /* ends with letter */ ||
          (typeof next?.insert === 'string' && next.insert.match(/^\p{L}/u)) /* starts with letter*/
        ) {
          current = '_' + current + '_' // double the syntax so it is unconstrained
        }
      } else if (attributes?.code) {
        current = '`' + current + '`'
      }
    } else if (insert?.image) {
      // image
      lines.push(current)
      lines.push(`image::${insert.image as string}[]`)
      current = ''
    } else if (insert?.thematic_break) {
      // <hr> (not a native quill feature)
      lines.push(current)
      lines.push("'''")
      current = ''
    } else if (insert?.mention) {
      // nostr mention (not a native quill feature)
      current = current + (insert.mention as { id: string }).id
    } else {
      // this should never happen
      console.warn('unexpected condition happened, "insert" is empty:', op)
      continue
    }
  }

  return lines.join('\n')
}
