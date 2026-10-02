'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon, IconButton } from './icons'

export const MAX_IMAGES = 4
const ACCEPT = 'image/jpeg,image/png,image/webp'

/** A picture as a JPEG data URL the agent can read: at most 1600 px on the long side, under `limit` bytes. */
export async function shrinkPicture(file: Blob, limit = 900 * 1024): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPEG, PNG or WebP picture.')
  const bitmap = await createImageBitmap(file)
  try {
    for (const [side, quality] of [[1600, 0.86], [1280, 0.82], [1024, 0.78], [800, 0.72]] as const) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) break
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', quality)
      if (Math.ceil((url.length - url.indexOf(',') - 1) * 3 / 4) <= limit) return url
    }
  } finally { bitmap.close() }
  throw new Error('That picture is too large even after resizing; try a smaller one.')
}

export function Composer({ busy, images, onImages, onSubmit, onStop, placeholder = 'Ask anything', noun = 'designer', attach = true, initial = '', onTextChange, autoFocus = false }: {
  busy: boolean
  images: string[]
  onImages: (images: string[]) => void
  /** Returns whether the text was taken (sent or queued). */
  onSubmit: (text: string) => boolean
  /** Returns a queued message that was not sent, to put back in the box. */
  onStop: () => string
  placeholder?: string
  noun?: string
  attach?: boolean
  initial?: string
  /** Every change of the typed text, so the owner can keep it across remounts. */
  onTextChange?: (text: string) => void
  /** Focus the box with the caret at the end on mount. */
  autoFocus?: boolean
}) {
  const [text, setTextState] = useState(initial)
  const textChanged = useRef(onTextChange)
  textChanged.current = onTextChange
  const setText = (value: string) => { setTextState(value); textChanged.current?.(value) }
  // A remounted composer starts at the kept text: size the box to it.
  useEffect(() => {
    const element = input.current
    if (initial) grow(element)
    if (autoFocus && element) { element.focus(); element.setSelectionRange(element.value.length, element.value.length) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const files = useRef<HTMLInputElement>(null)

  const grow = (element: HTMLTextAreaElement | null) => {
    if (!element) return
    element.style.height = 'auto'
    if (element.value) element.style.height = `${Math.min(element.scrollHeight + 2, 160)}px`
  }
  const setValue = (value: string) => { setText(value); requestAnimationFrame(() => grow(input.current)) }
  const submit = () => {
    if (!text.trim()) return
    if (onSubmit(text)) setValue('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() }
  }
  const onFiles = async (list: FileList | null) => {
    const chosen = [...(list ?? [])]
    if (files.current) files.current.value = ''
    if (!chosen.length) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) { setNotice(`At most ${MAX_IMAGES} pictures per message.`); return }
    try {
      const added = await Promise.all(chosen.slice(0, room).map((file) => shrinkPicture(file)))
      onImages([...images, ...added])
      setNotice(chosen.length > room ? `Only the first ${room} picture${room === 1 ? '' : 's'} were added.` : '')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That picture could not be read.')
    }
  }

  return (
    <div className="designer-composer">
      {images.length ? (
        <ul className="designer-attachments" aria-label="Pictures to send">
          {images.map((image, index) => (
            <li className="designer-attachment" key={index}>
              <img src={image} alt={`Picture ${index + 1} to send`} />
              <IconButton name="close" label="Remove the picture" className="designer-attachment-clear"
                onClick={() => onImages(images.filter((_, other) => other !== index))} />
            </li>
          ))}
          <li className="designer-attachment-note">Sent with your message</li>
        </ul>
      ) : null}
      <form className="designer-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label htmlFor={`${noun}-request`} className="designer-visually-hidden">Message your {noun}</label>
        <div className="designer-input">
          <textarea id={`${noun}-request`} ref={input} rows={1} maxLength={20000} value={text} required
            placeholder={busy ? 'Queue your next message' : placeholder}
            onChange={(event) => { setText(event.target.value); grow(event.target) }} onKeyDown={onKeyDown} />
          <div className="designer-actions">
            {attach ? (
              <>
                <input ref={files} type="file" className="designer-attach-input" accept={ACCEPT} multiple hidden
                  onChange={(event) => { void onFiles(event.target.files) }} />
                <IconButton name="image" label="Attach a picture" className="designer-attach" onClick={() => files.current?.click()}
                  disabled={images.length >= MAX_IMAGES} />
              </>
            ) : null}
            {busy ? (
              <>
                <button type="submit" className="designer-icon-button designer-send" aria-label="Queue" title="Queue" hidden><Icon name="send" /></button>
                <IconButton name="stop" label={`Stop the ${noun}`} className="designer-cancel" onClick={() => {
                  const unsent = onStop()
                  if (unsent) setValue(text.trim() ? `${unsent}\n\n${text}` : unsent)
                  input.current?.focus()
                }} />
              </>
            ) : <IconButton type="submit" name="send" label="Send" className="designer-send" />}
          </div>
        </div>
      </form>
      <small className="designer-compose-hint" role={notice ? 'alert' : undefined}>
        {notice || (busy ? 'Enter queues your message · Shift+Enter for a new line' : 'Enter to send · Shift+Enter for a new line')}
      </small>
    </div>
  )
}
