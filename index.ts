import Quill from 'quill'
import Block from 'quill/blots/block.js'
import { Delta as QDelta } from 'quill/core.js'

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
  console.log('DELTA', ...delta.ops)

  let ops = delta.ops
  let offset = 0

  if (delta.ops[0].retain) {
    offset = delta.ops[0].retain as number
    ops = ops.slice(1)
  }

  if (ops[0].insert) {
    const ins = ops[0].insert as string

    let [line, inlineOffset] = quill.getLine(offset) as [Block, number]
    const lineStart = offset - inlineOffset

    let format = quill.getFormat(offset)
    if (format['code-block'] || format['code']) {
      return
    }

    let lineText = line.domNode.textContent as string

    for (let f = 0; f < formats.length; f++) {
      let { pattern, apply } = formats[f]
      let match = pattern.exec(lineText)
      if (match) {
        apply(quill, lineStart, lineText, match)
      }
    }

    if (ins[0] === '\n') {
      // check previous lines
    }
  }
}

const formats = [
  {
    name: 'header',
    pattern: /^(={1,6} )\w+/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      let cursor = quill.getSelection()!
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, cursor.index, 'header', match[1].length - 1)
    },
  },
  {
    name: 'unordered list',
    pattern: /^(\*{1,6} )\w+/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      let cursor = quill.getSelection()!
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, cursor.index, { list: 'bullet', indent: match[1].length - 1 - 1 })
    },
  },
  {
    name: 'checklist',
    pattern: /^(\*{1,6} )(\[([*x ])\] )\w+/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      let cursor = quill.getSelection()!
      quill.deleteText(lineStart, match[1].length + match[2].length)
      quill.formatLine(lineStart, cursor.index, {
        list: match[3] === ' ' ? 'unchecked' : 'checked',
        indent: match[1].length - 1 - 1,
      })
    },
  },
  {
    name: 'ordered list',
    pattern: /^(\.{1,6} )\w+/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      let cursor = quill.getSelection()!
      quill.deleteText(lineStart, match[1].length)
      quill.formatLine(lineStart, cursor.index, { list: 'ordered', indent: match[1].length - 1 - 1 })
    },
  },
  {
    name: 'constrained bold',
    pattern: /([^*\w]|^)\*(\w+)\*([^*\w]|$)/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      quill.formatText(lineStart + match.index + match[1].length + 1, match[2].length, 'bold', true)
      quill.deleteText(lineStart + match.index + 2 + match[2].length, 1)
      quill.deleteText(lineStart + match.index + match[1].length, 1)
    },
  },
  {
    name: 'unconstrained bold',
    pattern: /([^*]|^)\*{2}(\w+)\*{2}([^*]|$)/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      quill.formatText(lineStart + match.index + match[1].length + 2, match[2].length, 'bold', true)
      quill.deleteText(lineStart + match.index + 3 + match[2].length, 2)
      quill.deleteText(lineStart + match.index + match[1].length, 2)
    },
  },
  {
    name: 'constrained italic',
    pattern: /([^_\w]|^)_(\w+)_([^_\w]|$)/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      quill.formatText(lineStart + match.index + match[1].length + 1, match[2].length, 'italic', true)
      quill.deleteText(lineStart + match.index + 2 + match[2].length, 1)
      quill.deleteText(lineStart + match.index + match[1].length, 1)
    },
  },
  {
    name: 'unconstrained italic',
    pattern: /([^_]|^)\_{2}(\w+)\_{2}([^_]|$)/,
    apply(quill: Quill, lineStart: number, _lineText: string, match: RegExpExecArray) {
      quill.formatText(lineStart + match.index + match[1].length + 2, match[2].length, 'italic', true)
      quill.deleteText(lineStart + match.index + 3 + match[2].length, 2)
      quill.deleteText(lineStart + match.index + match[1].length, 2)
    },
  },
]
