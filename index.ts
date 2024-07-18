import Quill from 'quill'
import Block from 'quill/blots/block.js'
import { Delta, Delta as QDelta } from 'quill/core.js'

type Delta = InstanceType<typeof QDelta.default>

export default class {
  constructor(el: any, options: any) {
    const Keyboard = Quill.import('modules/keyboard') as any
    class CustomKeyboard extends Keyboard {
      static DEFAULTS = {
        ...Keyboard.DEFAULTS,
        bindings: {
          ...Keyboard.DEFAULTS.bindings,
          ['list autofill']: undefined, // disable auto-lists
        },
      }
    }
    Quill.register('modules/keyboard', CustomKeyboard)

    const quill = new Quill(el, options)
    const bound = handleTextChange.bind(null, quill)
    quill.on('text-change', bound)

    return quill
  }
}

function handleTextChange(quill: Quill, delta: Delta, _old: any, source: string) {
  if (source !== 'user') return

  let ops = delta.ops
  let offset = 0

  if (delta.ops[0].retain) {
    offset = delta.ops[0].retain as number
    ops = ops.slice(1)
  }

  if (ops[0].insert) {
    const ins = ops[0].insert as string

    // split all the lines of the input
    const multilines = ins.split('\n')
    for (let m = 0; m < multilines.length; m++) {
      // go one by one
      let lineLength = multilines[m].length
      if (lineLength > 0) {
        // skipping empty lines
        let [line, inlineOffset] = quill.getLine(offset) as [Block, number]

        const lineStart = offset - inlineOffset
        let lineText = line.domNode.textContent as string
        for (let f = 0; f < formats.length; f++) {
          let { pattern, apply } = formats[f]
          let lineOffset = 0 // this will be advanced as we find matches so we don't look in the same place twice

          // for each format we will go through the entire text (line)
          while (true) {
            let match = pattern.exec(lineText.substring(lineOffset))
            if (!match) {
              // nothing found, we can move on to the next format
              break
            }
            let format = quill.getFormat(lineStart + lineOffset + match.index)
            if (format['code-block'] || format['code']) {
              break
            }

            let charsDeleted = apply(quill, match, lineStart, lineText)
            lineText = line.domNode.textContent as string // update lineText since apply() has modified it
            lineOffset += match[0].length - charsDeleted
            offset -= charsDeleted // we must keep track this to adjust the offsets as we modify the text
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

const formats = [
  {
    name: 'header',
    pattern: /^(={1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, _lineText: string): number {
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, lineStart + 1, 'header', match[1].length - 1)
      return match[1].length
    },
  },
  {
    name: 'unordered list',
    pattern: /^(\*{1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, _lineText: string): number {
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, lineStart + 1, { list: 'bullet', indent: match[1].length - 1 - 1 })
      return match[1].length
    },
  },
  {
    name: 'checklist',
    pattern: /^(\*{1,6} )(\[([*x ])\] )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, _lineText: string): number {
      let charsToDelete = match[1].length + match[2].length
      quill.deleteText(lineStart, charsToDelete)
      quill.formatLine(lineStart, lineStart + 1, {
        list: match[3] === ' ' ? 'unchecked' : 'checked',
        indent: match[1].length - 1 - 1,
      })
      return charsToDelete
    },
  },
  {
    name: 'ordered list',
    pattern: /^(\.{1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, _lineText: string): number {
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, lineStart + 1, { list: 'ordered', indent: match[1].length - 1 - 1 })
      return match[1].length
    },
  },
  {
    name: 'line quote',
    pattern: /^> \S+/u,
    apply(quill: Quill, _match: RegExpExecArray, lineStart: number, _lineText: string): number {
      quill.deleteText(lineStart, 2)
      quill.formatLine(lineStart, lineStart + 1, 'blockquote', true)
      return 2
    },
  },
  {
    name: 'code block',
    pattern: /^----$/,
    apply(quill: Quill, _match: RegExpExecArray, lineStart: number, lineText: string): number {
      let cursor = quill.getSelection()!
      let isAtLineEnd = lineText.length === cursor.index - lineStart
      if (isAtLineEnd) {
        let [prev, inlineOffset] = quill.getLine(lineStart - 1)
        if (prev) {
          let match = /^\[(source|quote)?(,([^\]]+))?\]$/.exec(prev.domNode.textContent!)
          if (match) {
            switch (match[1]) {
              case 'quote':
                // not supported
                return 0
              case 'source':
              case undefined:
              case '':
                // assume it's source code
                quill.deleteText(lineStart - 1 - inlineOffset, lineStart - 1)
            }
          }
        }

        quill.deleteText(lineStart, 4)

        cursor = quill.getSelection()!
        quill.formatLine(cursor.index, cursor.index, 'code-block', true)
      }
      return 0
    },
  },
  {
    name: 'inline code',
    pattern: /([^`\p{L}]|^)`([^`]+)`([^`\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, lineText: string): number {
      advanceCursor(quill, lineStart, lineText)
      quill.formatText(lineStart + match.index + match[1].length + 1, match[2].length, 'code', true)
      quill.deleteText(lineStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(lineStart + match.index + match[1].length, 1)
      return 2
    },
  },
  {
    name: 'constrained bold',
    pattern: /([^*\p{L}]|^)\*([^*]+)\*([^*\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, lineText: string): number {
      advanceCursor(quill, lineStart, lineText)
      quill.formatText(lineStart + match.index + match[1].length + 1, match[2].length, 'bold', true)
      quill.deleteText(lineStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(lineStart + match.index + match[1].length, 1)
      return 2
    },
  },
  {
    name: 'unconstrained bold',
    pattern: /([^*]|^)\*{2}([^*]+)\*{2}([^*]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, lineText: string): number {
      advanceCursor(quill, lineStart, lineText)
      quill.formatText(lineStart + match.index + match[1].length + 2, match[2].length, 'bold', true)
      quill.deleteText(lineStart + match.index + match[1].length + 2 + match[2].length, 2)
      quill.deleteText(lineStart + match.index + match[1].length, 2)
      return 4
    },
  },
  {
    name: 'constrained italic',
    pattern: /([^_\p{L}]|^)_([^_]+)_([^_\p{L}]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, lineText: string): number {
      advanceCursor(quill, lineStart, lineText)
      quill.formatText(lineStart + match.index + match[1].length + 1, match[2].length, 'italic', true)
      quill.deleteText(lineStart + match.index + match[1].length + 1 + match[2].length, 1)
      quill.deleteText(lineStart + match.index + match[1].length, 1)
      return 2
    },
  },
  {
    name: 'unconstrained italic',
    pattern: /([^_]|^)_{2}([^_]+)_{2}([^_]|$)/u,
    apply(quill: Quill, match: RegExpExecArray, lineStart: number, lineText: string): number {
      advanceCursor(quill, lineStart, lineText)
      quill.formatText(lineStart + match.index + match[1].length + 2, match[2].length, 'italic', true)
      quill.deleteText(lineStart + match.index + match[1].length + 2 + match[2].length, 2)
      quill.deleteText(lineStart + match.index + match[1].length, 2)
      return 4
    },
  },
]

function advanceCursor(quill: Quill, lineStart: number, lineText: string) {
  let cursor = quill.getSelection()!
  let isAtLineEnd = lineText.length === cursor.index - lineStart
  if (isAtLineEnd) {
    // we're at the end of the line, so add a space so we don't keep inside the formatting block
    quill.insertText(cursor.index, ' ')
    quill.setSelection(cursor.index + 1)
  }
}
