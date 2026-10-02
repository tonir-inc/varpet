/** Small, deliberately link-free Markdown subset (v1's designerMarkdown). Escapes all input before markup. */
export function markdownHtml(value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const inline = (text: string) => text.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  return escaped.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n')
    if (lines.every((line) => /^\s*[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`
    if (lines.every((line) => /^\s*\d+[.)] /.test(line))) return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+[.)] /, ''))}</li>`).join('')}</ol>`
    return `<p>${lines.map((line) => /^#{1,3} /.test(line) ? `<strong>${inline(line.replace(/^#{1,3} /, ''))}</strong>` : inline(line)).join('<br>')}</p>`
  }).join('')
}

export function Markdown({ text, className = 'designer-message-copy' }: { text: string; className?: string }) {
  // Safe: markdownHtml escapes the text before adding its own tags, and emits no links or attributes.
  return <div className={className} dangerouslySetInnerHTML={{ __html: markdownHtml(text) }} />
}
