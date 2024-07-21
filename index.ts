import Quill, { EmitterSource } from 'quill'

import { handleTextChange } from './type-and-paste.ts'
import { convert } from './get-contents.ts'

export default class extends Quill {
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

    const BlockEmbed = Quill.import('blots/block/embed') as any

    class DividerBlot extends BlockEmbed {
      static blotName = 'divider'
      static tagName = 'hr'
    }

    Quill.register(DividerBlot)

    super(el, options)
    const bound = handleTextChange.bind(null, this)
    this.on('text-change', bound)
  }

  getAsciidoc() {
    return convert(this.getContents()).trimEnd() + '\n'
  }

  setText(text: string, source?: EmitterSource) {
    super.setText(text, source)
    super.setSelection(0)
    handleTextChange(this, this.getContents(), { ops: [] }, 'user')
  }
}
