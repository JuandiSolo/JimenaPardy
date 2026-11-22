/**
 * Módulo compartido para renderizar contenido de preguntas (texto, imagen, mixto)
 * Usado por moderador (editor + preview) y tablero (presentación)
 */

export type ClueContent = {
  content_type: 'text' | 'image' | 'mixed'
  question_text: string
  image_path: string | null
  image_alt: string | null
}

export type RenderOptions = {
  /** Ancho máximo del contenedor (px) */
  maxWidth?: number
  /** Alto máximo del contenedor (px) */
  maxHeight?: number
  /** Para editor: mostrar fondo cuadriculado en transparencias */
  showCheckerboard?: boolean
  /** Para editor: modo interactivo (click para cambiar) */
  interactive?: boolean
  /** Callback al click en imagen (editor) */
  onImageClick?: () => void
}

/**
 * Genera HTML para el contenido de una pregunta
 */
export function renderQuestionContent(clue: ClueContent, options: RenderOptions = {}): string {
  const {
    maxWidth = '100%',
    maxHeight = '100%',
    showCheckerboard = false,
    interactive = false,
    onImageClick,
  } = options

  const checkerboardStyle = showCheckerboard
    ? `background-image:
        linear-gradient(45deg, #1a2a5a 25%, transparent 25%),
        linear-gradient(-45deg, #1a2a5a 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1a2a5a 75%),
        linear-gradient(-45deg, transparent 75%, #1a2a5a 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;`
    : ''

  const interactiveStyle = interactive ? 'cursor: pointer;' : ''
  const clickHandler = interactive && onImageClick ? `onclick="this.dispatchEvent(new CustomEvent('question-image-click'))"` : ''

  // Construir URL de imagen: local (/images/...) o Supabase Storage
  const imageUrl = clue.image_path
    ? (clue.image_path.startsWith('http') || clue.image_path.startsWith('/')
      ? clue.image_path  // Ya es URL absoluta o ruta local /images/...
      : `https://wvaplnmcllwpioamgpct.supabase.co/storage/v1/object/public/question-images/${clue.image_path}`)
    : null

  switch (clue.content_type) {
    case 'image':
      if (!imageUrl) {
        return `<div class="question-media placeholder" style="width:${maxWidth};height:${maxHeight};${checkerboardStyle}${interactiveStyle}display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;">${interactive ? 'Click para añadir imagen' : 'Sin imagen'}</div>`
      }
      const imgErrorHandler = `this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%231a2a5a" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="12" fill="%23666" text-anchor="middle"%3EImagen no disponible%3C/text%3E%3C/svg%3E';this.alt='Imagen no cargada';`
      return `
        <div class="question-media" style="width:${maxWidth};max-height:${maxHeight};${checkerboardStyle}${interactiveStyle}${clickHandler}" data-content-type="image">
          <img src="${imageUrl}" alt="${clue.image_alt || 'Pregunta'}" loading="lazy" onerror="${imgErrorHandler}" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
        </div>
      `

    case 'mixed':
      if (!imageUrl) {
        return `<div class="question-media mixed" style="width:${maxWidth};max-height:${maxHeight};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
          <div class="placeholder" style="${checkerboardStyle}width:100%;height:60%;display:flex;align-items:center;justify-content:center;color:var(--muted);">${interactive ? 'Click para añadir imagen' : 'Sin imagen'}</div>
          <div class="question-text" style="width:100%;text-align:center;font-family:Anton,Impact,sans-serif;font-size:clamp(18px,3vw,28px);line-height:1.2;color:var(--gold-light);text-shadow:2px 2px #000;">${escapeHtml(clue.question_text) || '<span style="color:var(--muted)">Texto pendiente</span>'}</div>
        </div>`
      }
      const mixedImgErrorHandler = `this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%231a2a5a" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="12" fill="%23666" text-anchor="middle"%3EImagen no disponible%3C/text%3E%3C/svg%3E';this.alt='Imagen no cargada';`
      return `
        <div class="question-media mixed" style="width:${maxWidth};max-height:${maxHeight};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
          <div class="image-wrapper" style="width:100%;height:60%;${checkerboardStyle}display:flex;align-items:center;justify-content:center;overflow:hidden;${interactiveStyle}${clickHandler}" data-content-type="mixed-image">
            <img src="${imageUrl}" alt="${clue.image_alt || 'Pregunta'}" loading="lazy" onerror="${mixedImgErrorHandler}" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
          </div>
          <div class="question-text" style="width:100%;text-align:center;font-family:Anton,Impact,sans-serif;font-size:clamp(18px,3vw,28px);line-height:1.2;color:var(--gold-light);text-shadow:2px 2px #000;">${escapeHtml(clue.question_text) || '<span style="color:var(--muted)">Texto pendiente</span>'}</div>
        </div>
      `

    case 'text':
    default:
      return `
        <div class="question-media text-only" style="width:${maxWidth};max-height:${maxHeight};display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;">
          <div class="question-text" style="font-family:Anton,Impact,sans-serif;font-size:clamp(20px,3.5vw,32px);line-height:1.15;color:var(--gold-light);text-shadow:2px 2px #000;overflow-wrap:anywhere;">${escapeHtml(clue.question_text) || '<span style="color:var(--muted);font-family:Arial,sans-serif;font-size:16px;">Pregunta pendiente</span>'}</div>
        </div>
      `
  }
}

/**
 * Crea elemento DOM para el contenido (para uso programático)
 */
export function createQuestionContentElement(clue: ClueContent, options: RenderOptions = {}): HTMLElement {
  const container = document.createElement('div')
  container.className = 'question-content-renderer'
  container.innerHTML = renderQuestionContent(clue, options)

  // Manejar click en imagen para editor
  if (options.interactive && options.onImageClick) {
    const media = container.querySelector('.question-media')
    if (media) {
      media.addEventListener('click', (e) => {
        // Solo trigger si click en área de imagen (no en texto)
        const target = e.target as HTMLElement
        if (target.tagName === 'IMG' || target.classList.contains('image-wrapper') || target.classList.contains('placeholder')) {
          options.onImageClick?.()
        }
      })
    }
  }

  return container
}

/**
 * Actualiza contenido en vivo (para Realtime updates sin re-render completo)
 */
export function updateQuestionContentElement(
  element: HTMLElement,
  clue: ClueContent,
  options: RenderOptions = {}
): void {
  element.innerHTML = renderQuestionContent(clue, options)

  if (options.interactive && options.onImageClick) {
    const media = element.querySelector('.question-media')
    if (media) {
      media.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (target.tagName === 'IMG' || target.classList.contains('image-wrapper') || target.classList.contains('placeholder')) {
          options.onImageClick?.()
        }
      })
    }
  }
}

/**
 * Escape HTML para prevenir XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Obtiene datos de contenido desde un objeto clue (row de BD)
 */
export function getClueContent(clue: any): ClueContent {
  return {
    content_type: clue.content_type || 'text',
    question_text: clue.question_text || '',
    image_path: clue.image_path || null,
    image_alt: clue.image_alt || null,
  }
}