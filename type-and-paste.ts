import Quill from 'quill'
import Block from 'quill/blots/block.js'
import { Delta as QDelta } from 'quill/core.js'

type Delta = InstanceType<typeof QDelta.default>

export function handleTextChange(quill: Quill, delta: Delta, _old: any, source: string) {
  if (source !== 'user') return

  let ops = delta.ops
  let offset = 0

  if (delta.ops[0].retain) {
    offset = delta.ops[0].retain as number
    ops = ops.slice(1)
  }

  if (ops.length === 0) return

  if (ops[0].insert) {
    const ins = ops[0].insert as string

    // split all the lines of the input
    const multilines = ins.split('\n')
    let inCodeBlock = false

    for (let m = 0; m < multilines.length; m++) {
      // go one by one
      let lineLength = multilines[m].length
      if (lineLength > 0) {
        // skipping empty lines
        const [line, inlineOffset] = quill.getLine(offset) as [Block, number]

        const lineStart = offset - inlineOffset
        let lineText = line.domNode.textContent as string

        let justEnteredCodeBlock = false

        for (let f = 0; f < formats.length; f++) {
          if (justEnteredCodeBlock) break // when we enter a codeblock there is nothing else on the line that may interest us

          let { name, pattern, apply } = formats[f]

          if (inCodeBlock && name !== 'exit-codeblock') {
            // when in a codeblock we only support exiting the block, so we skip all other directives
            quill.formatLine(lineStart, lineStart, 'code-block', true)
            continue
          }

          let lineOffset = 0 // this will be advanced as we find matches so we don't look in the same place twice

          // for each format we will go through the entire text (line)
          while (true) {
            let match = pattern.exec(lineText.substring(lineOffset))
            if (!match) {
              // nothing found, we can move on to the next format
              break
            }

            if (name === 'codeblock') {
              inCodeBlock = true
              justEnteredCodeBlock = true
            } else if (name === 'exit-codeblock') {
              inCodeBlock = false
            } else {
              let format = quill.getFormat(lineStart + lineOffset + match.index)
              if (format['code-block'] || format['code']) {
                break
              }
            }

            let [charsDeleted, charsToSkip] = apply(quill, match, lineStart + lineOffset, lineText)

            // we must keep track this to adjust the offsets as we modify the text
            offset -= charsDeleted

            // update lineText since apply() has modified it
            const newLine = quill.getLine(offset + lineLength)[0]
            if (newLine) {
              lineText = newLine!.domNode!.textContent as string // must getLine() again because some reason
              lineOffset += match.index + charsToSkip - charsDeleted // also adjust the offset from where we'll continue to scan
            } else {
              break
            }
          }
        }

        offset += lineLength + 1 // +1 stands for the obligatory ending '\n'

        // if we're in the middle of the past remove formatting from the next line
        if (m < multilines.length - 1) {
          quill.removeFormat(offset, offset + 1)
        }
      } else {
        offset += 1 // when we have skipped a line we just add the obligatory '\n'
      }
    }
  }
}

// the apply() function returns:
// * the number of characters that were deleted from the line
// * the number of characters that should be skipped by the parser

export const formats = [
  {
    name: 'header',
    pattern: /^(={1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, match[1].length)
      quill.formatLine(matchStart, matchStart + 1, 'header', match[1].length - 1)
      return [match[1].length, match[1].length]
    },
  },
  {
    name: 'divider',
    pattern: /^'''$/,
    apply(quill: Quill, _match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, 3)
      quill.insertEmbed(matchStart, 'divider', true)
      return [3, 1]
    },
  },
  {
    name: 'checklist',
    pattern: /^(\*{1,6} )(\[([*x ])\] )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      let charsToDelete = match[1].length + match[2].length
      quill.deleteText(matchStart, charsToDelete)
      quill.formatLine(matchStart, matchStart + 1, {
        list: match[3] === ' ' ? 'unchecked' : 'checked',
        indent: match[1].length - 1 - 1,
      })
      return [charsToDelete, charsToDelete]
    },
  },
  {
    name: 'unordered list',
    pattern: /^(\*{1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, match[1].length)
      quill.formatLine(matchStart, matchStart + 1, { list: 'bullet', indent: match[1].length - 1 - 1 })
      return [match[1].length, match[1].length]
    },
  },
  {
    name: 'ordered list',
    pattern: /^(\.{1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, match[1].length)
      quill.formatLine(matchStart, matchStart + 1, { list: 'ordered', indent: match[1].length - 1 - 1 })
      return [match[1].length, match[1].length]
    },
  },
  {
    name: 'line quote',
    pattern: /^> \S+/u,
    apply(quill: Quill, _match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, 2)
      quill.formatLine(matchStart, matchStart + 1, 'blockquote', true)
      return [2, 2]
    },
  },
  {
    name: 'codeblock',
    pattern: /^\\?----$/,
    apply(quill: Quill, _match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      let [prev, inlineOffset] = quill.getLine(matchStart - 1)
      if (prev) {
        let match = /^\[(source|quote)?(,([^\]]+))?\]$/.exec(prev.domNode.textContent!)
        if (match) {
          switch (match[1]) {
            case 'quote':
              // not supported
              return [4, 4]
            case 'source':
            case undefined:
            case '':
              // assume it's source code and delete the macro "[]" block
              setTimeout(
                (start, length) => {
                  quill.deleteText(start, length) //  - 1)
                },
                150,
                matchStart - 1 - inlineOffset,
                match[0].length + 1,
              )
          }
        }
      }

      let cursor = quill.getSelection()!
      let isAtLineEnd = lineText.length === cursor.index - matchStart
      let deleted: number
      if (isAtLineEnd) {
        // if we're typing this live
        quill.deleteText(matchStart, lineText.length) // delete only 4, leave a line for the user to type
        deleted = lineText.length
      } else {
        // otherwise, if we're pasting
        quill.deleteText(matchStart, lineText.length + 1) // delete the newline, i.e. everything
        deleted = lineText.length + 1
      }

      quill.formatLine(matchStart, matchStart + 1, 'code-block', true)
      return [deleted, 4]
    },
  },
  {
    name: 'exit-codeblock',
    pattern: /^\\?----$/,
    apply(quill: Quill, _match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      quill.deleteText(matchStart, lineText.length + 1)
      quill.removeFormat(matchStart, matchStart)
      return [lineText.length + 1, 4]
    },
  },
  {
    name: 'superscript',
    pattern: /([^^]|^)\^([^^]+)\^([^^]|$)/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 1, match[2].length, { script: 'super' })
      quill.deleteText(matchStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(matchStart + match.index + match[1].length, 1)
      return [2, match[0].length]
    },
  },
  {
    name: 'subscript',
    pattern: /([^~]|^)~([^~]+)~([^~]|$)/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 1, match[2].length, { script: 'sub' })
      quill.deleteText(matchStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(matchStart + match.index + match[1].length, 1)
      return [2, match[0].length]
    },
  },
  {
    name: 'inline code',
    pattern: /([^`\p{L}]|^)`([^`]+)`([^`\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 1, match[2].length, 'code', true)
      quill.deleteText(matchStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(matchStart + match.index + match[1].length, 1)
      return [2, match[0].length]
    },
  },
  {
    name: 'image macro',
    pattern: /\bimage::?([^[]+)\[([^\]]*)\]/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      let url = match[1]
      let attrs = match[2].split(',').map(attr => attr.split('=').map(s => s.trim()))
      quill.deleteText(matchStart + match.index, match[0].length)
      quill.insertEmbed(matchStart + match.index, 'image', url)

      let link = attrs.find(([k]) => k === 'link')
      if (link) {
        quill.formatText(matchStart + match.index, 1, 'link', link[1])
      }

      return [match[0].length - 1, 1 /* the embed is represented by one character */]
    },
  },
  {
    name: 'link macro',
    pattern: /(\b(https?|nostr|link):[^[]+)\[([^\]]*)\]/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      let charsAdvanced = 0
      let charsDeleted = 0

      let cursor = quill.getSelection()!
      let isAtLineEnd = lineText.length === cursor.index - matchStart

      let url = match[1]
      if (url.startsWith('link:')) url = url.substring(5)

      let text = match[3]?.split(',')?.[0]?.trim?.()
      if (text && text.length > 0) {
        // we have text for the anchor, so we must inspect it for formatting syntax
        charsDeleted = match[0].length - text.length
        charsAdvanced = -charsDeleted
      } else {
        // otherwise we just use the url as the text
        charsDeleted = match[0].length - url.length
        charsAdvanced = url.length // and then we don't have to inspect it
        text = url
      }

      quill.deleteText(matchStart + match.index, match[0].length)
      quill.insertText(matchStart + match.index, text, 'link', url)

      setTimeout(() => {
        if (isAtLineEnd) {
          quill.setSelection(matchStart + match.index + text.length)
        }
      }, 230)

      return [charsDeleted, charsAdvanced]
    },
  },
  {
    name: 'raw link',
    pattern: /([^\\"]|^)(<?)\b(https?:(\/\/)?([\w-]+\.)+\w+(:\d{0,5})?(\/([^\/>,\s]?\/?)+)?)\b(>?)([^"]|$)/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      let deletedChars = 0
      // deleted ending >
      quill.deleteText(matchStart + match.index + match[1].length + match[2].length + match[3].length, match[10].length)
      deletedChars += match[10].length
      // delete initial <
      quill.deleteText(matchStart + match.index + match[1].length, match[2].length)
      deletedChars += match[2].length

      // format link
      setTimeout(() => {
        quill.formatText(matchStart + match.index + match[1].length, match[3].length, 'link', match[3])
      }, 230)

      let charsAdvanced = match[1].length + match[3].length
      return [deletedChars, charsAdvanced]
    },
  },
  {
    name: 'unconstrained bold',
    pattern: /([^*]|^)\*{2}([^*]+)\*{2}([^*]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 2, match[2].length, 'bold', true)
      quill.deleteText(matchStart + match.index + match[1].length + 2 + match[2].length, 2)
      quill.deleteText(matchStart + match.index + match[1].length, 2)
      return [4, match[0].length]
    },
  },
  {
    name: 'constrained bold',
    pattern: /([^*\p{L}]|^)\*([^*]+)\*([^*\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 1, match[2].length, 'bold', true)
      quill.deleteText(matchStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(matchStart + match.index + match[1].length, 1)
      return [2, match[0].length]
    },
  },
  {
    name: 'unconstrained italic',
    pattern: /([^_]|^)_{2}([^_]+)_{2}([^_]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 2, match[2].length, 'italic', true)
      quill.deleteText(matchStart + match.index + match[1].length + 2 + match[2].length, 2)
      quill.deleteText(matchStart + match.index + match[1].length, 2)
      return [4, match[0].length]
    },
  },
  {
    name: 'constrained italic',
    pattern: /([^_\p{L}]|^)_([^_]+)_([^_\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, lineText: string): [number, number] {
      advanceCursor(quill, matchStart, lineText)
      quill.formatText(matchStart + match.index + match[1].length + 1, match[2].length, 'italic', true)
      quill.deleteText(matchStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(matchStart + match.index + match[1].length, 1)
      return [2, match[0].length]
    },
  },
]

// ~ utils
function advanceCursor(quill: Quill, matchStart: number, lineText: string) {
  let cursor = quill.getSelection()!
  let isAtLineEnd = lineText.length === cursor.index - matchStart
  if (isAtLineEnd) {
    // we're at the end of the line, so add a space so we don't keep inside the formatting block
    quill.insertText(cursor.index, ' ')
    quill.setSelection(cursor.index + 1)
  }
}
