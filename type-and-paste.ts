import Quill from 'quill'
import Block from 'quill/blots/block.js'
import { Delta as QDelta } from 'quill/core.js'
import quillAsciidoc from './index.ts'

type Delta = InstanceType<typeof QDelta.default>

export type CustomReader = (ins: any) => undefined | string

export function handleTextChange(quill: quillAsciidoc, delta: Delta, _old: any, source: string) {
  if (source !== 'user') return

  let ops = delta.ops
  let initialOffset = 0 // this starts at the first line but it's updated as each line is read in a multine insert

  if (delta.ops[0].retain) {
    initialOffset = delta.ops[0].retain as number
    ops = ops.slice(1)
  }

  if (ops.length === 0) return

  if (ops[0].insert) {
    let ins = ops[0].insert as string

    if (typeof ins !== 'string') {
      let replaced = quill.customReader(ins)
      if (typeof replaced === 'string') {
        // use this as a string and continue parsing
        ins = replaced
      } else {
        // just leave it as is
        return
      }
    }

    // split all the lines of the input
    const multilines = ins.split('\n')
    let inCodeBlock = false

    for (let m = 0; m < multilines.length; m++) {
      let offset = initialOffset // we start at the initial offset, but update the inline offset as we go

      // go one by one (skipping empty lines)
      if (multilines[m].length === 0) {
        initialOffset = initialOffset + 1 // +1 stands for the newline
        continue
      }

      const [line, inlineOffset] = quill.getLine(offset) as [Block, number]

      const lineStart = offset - inlineOffset // in case our initial offset was in the middle of a line
      let lineText = line.domNode.textContent as string

      let justEnteredCodeBlock = false

      for (let f = 0; f < formats.length; f++) {
        if (justEnteredCodeBlock) break // when we enter a codeblock there is nothing else on the line that may interest us

        let { name, pattern, apply } = formats[f]

        if (inCodeBlock && name !== 'exit-codeblock') {
          // when in a codeblock we only support exiting the block, so we skip all other directives
          formatLine(quill, lineStart, { 'code-block': true })
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

          // run the specific formatting code for the match
          let [charsDeleted, charsToSkip] = apply(quill, match, lineStart + lineOffset, lineText)

          // we must keep track this to adjust the offsets as we modify the text
          offset = offset + charsToSkip - charsDeleted

          // update lineText since apply() has modified it
          const updatedLine = quill.getLine(offset)[0]
          if (updatedLine) {
            lineText = updatedLine!.domNode!.textContent as string // must getLine() again because some reason
            lineOffset += match.index + charsToSkip - charsDeleted // also adjust the offset from where we'll continue to scan
          } else {
            break
          }
        }
      }

      // setup the next line's "initial" offset here (use lineStart as that was fixed by inlineOffset)
      initialOffset = lineStart + lineText.length + 1 // +1 stands for the obligatory ending '\n'
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
      formatLine(quill, matchStart, { header: match[1].length - 1 })
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
      formatLine(quill, matchStart, {
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
      formatLine(quill, matchStart, { list: 'bullet', indent: match[1].length - 1 - 1 })
      return [match[1].length, match[1].length]
    },
  },
  {
    name: 'ordered list',
    pattern: /^(\.{1,6} )\S+/u,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, match[1].length)
      formatLine(quill, matchStart, { list: 'ordered', indent: match[1].length - 1 - 1 })
      return [match[1].length, match[1].length]
    },
  },
  {
    name: 'line quote',
    pattern: /^> \S+/u,
    apply(quill: Quill, _match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      quill.deleteText(matchStart, 2)
      formatLine(quill, matchStart, { blockquote: true })
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

      formatLine(quill, matchStart, { 'code-block': true })
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
    name: 'video macro',
    pattern: /\bvideo::?([^[]+)\[([^\]]*)\]/,
    apply(quill: Quill, match: RegExpExecArray, matchStart: number, _lineText: string): [number, number] {
      let url = match[1]
      let attrs = match[2].split(',').map(attr => attr.split('=').map(s => s.trim()))
      quill.deleteText(matchStart + match.index, match[0].length)
      quill.insertEmbed(matchStart + match.index, 'video', url)

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
        charsAdvanced = charsDeleted
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

function formatLine(quill: Quill, index: number, formats: any) {
  let line = quill.getLine(index)[0]
  if (line) {
    quill.updateContents({
      ops: [{ retain: index + line.domNode.textContent!.length }, { insert: '\n', attributes: formats }, { delete: 1 }],
    })
  }
}
