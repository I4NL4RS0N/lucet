import { useState } from 'react'
import { useLucet, useThread, Composer as LucetComposer, Button } from 'lucet-react'

/** Thin wrapper over the library composer, holding only draft text. */
export function Composer() {
  const lucet = useLucet()
  const thread = useThread()
  const [text, setText] = useState('')

  return (
    <LucetComposer
      value={text}
      onChange={setText}
      onSubmit={() => {
        const value = text.trim()
        setText('')
        void lucet.submit(value)
      }}
      lockedBy={thread.composer.locked ? thread.composer.lockedBy : null}
      streaming={thread.status === 'streaming'}
      onStop={() => lucet.abort()}
      toolbar={<Button variant="ghost">Sonnet 4.6</Button>}
    />
  )
}
