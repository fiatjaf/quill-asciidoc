import Quill, { EmitterSource } from 'quill'

import { handleTextChange } from './type-and-paste.ts'
import { convert } from './get-contents.ts'
import { Delta as QDelta } from 'quill/core.js'

type Delta = InstanceType<typeof QDelta.default>

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

  setContents(delta: Delta, source?: EmitterSource) {
    super.setContents(delta, source)
    super.setSelection(0)
    handleTextChange(this, delta, { ops: [] }, 'user')
  }
}
