import Quill, { EmitterSource, QuillOptions } from 'quill'

import { CustomReader, handleTextChange } from './type-and-paste.ts'
import { convert, CustomConverter } from './get-contents.ts'

export default class extends Quill {
  customReader: CustomReader
  customConverter: CustomConverter

  constructor(el: any, options: QuillOptions & { customReader?: CustomReader; customConverter?: CustomConverter }) {
    const Keyboard = Quill.import('modules/keyboard') as any
    const Link = Quill.import('formats/link') as any

    Quill.register(
      'modules/keyboard',
      class extends Keyboard {
        static DEFAULTS = {
          ...Keyboard.DEFAULTS,
          bindings: {
            ...Keyboard.DEFAULTS.bindings,
            ['list autofill']: undefined, // disable auto-lists
          },
        }
      },
    )

    Quill.register(
      'formats/link',
      class extends Link {
        static PROTOCOL_WHITELIST = [...Link.PROTOCOL_WHITELIST, 'nostr']
      },
    )

    const BlockEmbed = Quill.import('blots/block/embed') as any

    class DividerBlot extends BlockEmbed {
      static blotName = 'divider'
      static tagName = 'hr'
    }

    Quill.register(DividerBlot)

    super(el, options)

    this.customReader = options.customReader || (() => undefined)
    this.customConverter = options.customConverter || (() => {})

    const bound = handleTextChange.bind(null, this)
    this.on('text-change', bound)
  }

  getAsciidoc() {
    return convert(this.getContents(), this.customConverter).trimEnd() + '\n'
  }

  setText(text: string, source?: EmitterSource) {
    super.setText(text, source)
    super.setSelection(0)
    handleTextChange(this, this.getContents(), { ops: [] }, 'user')
  }
}
