import { supabase } from '../lib/supabase.js'

// Estado local derivado de Supabase Realtime
let gameId: string | null = null
let categories: string[] = []
let clues: Map<string, any> = new Map()
let teams: Map<string, any> = new Map()
let currentClueId: string | null = null
let phase: string = 'idle'
let prevPhase: string = 'idle'
let winnerTeamId: string | null = null
let introProgress: number = 0

const board = document.getElementById('board') as HTMLElement
const categoryIntro = document.getElementById('category-intro') as HTMLElement
const reveal = document.getElementById('reveal') as HTMLElement
const zoomTile = document.getElementById('zoom-tile') as HTMLElement
const questionText = document.getElementById('question-text') as HTMLElement
const questionPanel = document.getElementById('question-panel') as HTMLElement
const scores = document.getElementById('scores') as HTMLElement

let categoryIndex = -1
let activeCard: HTMLElement | null = null
let introBusy = false
let finishTimer: number
let revealTimer: number

// Obtener gameId de la URL
function getGameIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('game')
}

// Inicializar
async function init() {
  gameId = getGameIdFromUrl()
  if (!gameId) {
    document.body.innerHTML = '<div style="color:white;padding:2rem;text-align:center">Falta parámetro ?game=ID en la URL</div>'
    return
  }

  // Cargar estado inicial
  await loadInitialState()

  // Suscribirse a cambios
  subscribeToChanges()

  // Configurar intro
  setupIntro()
  renderBoard()
  renderScores()
}

async function loadInitialState() {
  const { data, error } = await supabase.rpc('get_game_state', { p_game_id: gameId })
  if (error) throw error

  const state = data as any
  categories = (state.game as any).categories || [
    'Edible Rhyme Time',
    'Books in German',
    '3 "T"s',
    'Chop Chop!',
    'They said it would not last'
  ]

  // Procesar pistas
  ;(state.clues || []).forEach((c: any) => {
    clues.set(c.id, c)
  })

  // Procesar equipos
  ;(state.teams || []).forEach((t: any) => {
    teams.set(t.id, t)
  })

  currentClueId = (state.game as any).current_clue_id
  phase = (state.game as any).phase || 'idle'
  winnerTeamId = (state.game as any).winner_team_id

  // Actualizar headers de categorías en el DOM
  updateCategoryHeaders()
}

function updateCategoryHeaders() {
  const headers = board.querySelectorAll('.h[data-col]')
  headers.forEach((h, i) => {
    h.innerHTML = categories[i]?.replace(/\n/g, '<br>') || `Categoría ${i + 1}`
  })
}

function subscribeToChanges() {
  // Suscripción a cambios de la partida
  supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, handleGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` }, handleTeamChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clues', filter: `game_id=eq.${gameId}` }, handleClueChange)
    .subscribe()
}

function handleGameChange(payload: any) {
  const game = payload.new as any
  if (!game) return

  currentClueId = game.current_clue_id
  const newPhase = game.phase || 'idle'
  winnerTeamId = game.winner_team_id
  introProgress = game.intro_progress || 0

  renderBoard()
  renderScores()

  // Detectar salida de intro → finalizar animación
  if (prevPhase === 'intro' && newPhase !== 'intro') {
    const finishIntro = (window as any).finishIntro
    if (finishIntro) {
      finishIntro()
      for (let i = 0; i < 5; i++) {
        const h = board.querySelector(`.h[data-col="${i}"]`)
        if (h) {
          h.classList.add('revealed')
          h.style.color = ''
          h.style.textShadow = ''
        }
      }
      board.classList.remove('intro-hidden')
    }
  }

  prevPhase = newPhase
  phase = newPhase

  if (phase === 'intro') {
    runIntroAnimation()
  } else if (currentClueId && phase !== 'idle' && phase !== 'chooseDouble' && phase !== 'awaitWager') {
    // En Daily Double: NO mostrar pregunta hasta doubleReady (tras apuesta)
    showQuestion(currentClueId)
  } else {
    hideQuestion()
  }
}

function handleTeamChange(payload: any) {
  const team = payload.new as any
  if (!team) return

  if (payload.eventType === 'DELETE') {
    teams.delete(payload.old.id)
  } else {
    teams.set(team.id, team)
  }
  renderScores()
}

function handleClueChange(payload: any) {
  const clue = payload.new as any
  if (!clue) return

  if (payload.eventType === 'DELETE') {
    clues.delete(payload.old.id)
  } else {
    clues.set(clue.id, clue)
  }
  renderBoard()

  if (clue.id === currentClueId && phase !== 'idle') {
    showQuestion(clue.id)
  }
}

function renderBoard() {
  // Limpiar casillas de valores (mantener headers)
  const valueTiles = board.querySelectorAll('.c:not(.h)')
  valueTiles.forEach(t => t.remove())

  const values = [400, 600, 800, 1000]
  values.forEach(value => {
    for (let col = 0; col < 5; col++) {
      const clue = Array.from(clues.values()).find(c => c.column_index === col && c.value === value)
      if (!clue) continue

      const div = document.createElement('div')
      div.className = 'c'
      div.dataset.clueId = clue.id

      const isUsed = clue.state === 'used'
      const isPlaying = clue.id === currentClueId && phase !== 'idle'
      const isWinner = isPlaying && winnerTeamId && clue.id === currentClueId

      if (isUsed) div.classList.add('used')
      if (isPlaying) div.classList.add('playing')
      if (isWinner) div.classList.add('winner')

      const span = document.createElement('span')
      span.className = 'v' + (value === 1000 ? ' k' : '')
      span.textContent = '$' + value
      div.appendChild(span)

      board.appendChild(div)
    }
  })
}

function renderScores() {
  scores.innerHTML = ''
  const allTeams = Array.from(teams.values())

  allTeams.forEach(team => {
    const div = document.createElement('div')
    const isOnline = !!team.active_device_token
    div.className = 'team' + (team.id === winnerTeamId ? ' winner' : '') + (isOnline ? '' : ' offline')

    const nameDiv = document.createElement('div')
    nameDiv.className = 'team-name'
    nameDiv.textContent = team.name
    div.appendChild(nameDiv)

    const scoreDiv = document.createElement('div')
    scoreDiv.className = 'team-score'
    scoreDiv.textContent = team.score.toString()
    div.appendChild(scoreDiv)

    if (!isOnline) {
      const offlineBadge = document.createElement('span')
      offlineBadge.className = 'offline-badge'
      offlineBadge.textContent = 'OFFLINE'
      offlineBadge.style.fontSize = '10px'
      offlineBadge.style.color = '#888'
      offlineBadge.style.marginTop = '4px'
      offlineBadge.style.display = 'block'
      div.appendChild(offlineBadge)
    }

    scores.appendChild(div)
  })
}

// Intro animation - sincronizada con servidor via intro_progress
function setupIntro() {
  const headers = Array.from(board.querySelectorAll('.h[data-col]'))

  // Desactivar click manual (ahora controlado por moderador)
  categoryIntro.onclick = null
  categoryIntro.ontouchstart = null

  function finishIntro() {
    if (introBusy) return
    introBusy = true
    clearTimeout(finishTimer)
    board.classList.remove('intro-hidden')
    categoryIntro.style.opacity = '0'
    setTimeout(() => { categoryIntro.hidden = true; introBusy = false }, 470)
  }

  function revealCategory(index: number) {
    if (introBusy) return
    if (index >= headers.length) { finishIntro(); return }

    introBusy = true
    headers[index].classList.add('revealed')

    const card = document.createElement('div')
    card.className = 'category-card'
    card.innerHTML = headers[index].innerHTML
    categoryIntro.appendChild(card)

    if (index === 0) {
      const headerRect = headers[0].getBoundingClientRect()
      const introRect = categoryIntro.getBoundingClientRect()
      card.style.left = (headerRect.left - introRect.left) + 'px'
      card.style.top = (headerRect.top - introRect.top) + 'px'
      card.style.width = headerRect.width + 'px'
      card.style.height = headerRect.height + 'px'
      card.style.fontSize = '2.65cqw'
      requestAnimationFrame(() => requestAnimationFrame(() => { card.classList.add('full') }))
      setTimeout(() => { activeCard = card; introBusy = false }, 780)
    } else {
      card.classList.add('full')
      card.style.transform = 'translateX(100%)'
      const oldCard = activeCard
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (oldCard) oldCard.style.transform = 'translateX(-100%)'
        card.style.transform = 'translateX(0)'
      }))
      setTimeout(() => {
        if (oldCard) oldCard.remove()
        activeCard = card
        introBusy = false
        if (index === headers.length - 1) finishTimer = setTimeout(finishIntro, 1500)
      }, 730)
    }
  }

  // Exponer para runIntroAnimation
  ;(window as any).revealCategory = revealCategory
  ;(window as any).finishIntro = finishIntro
}

// Ejecutar intro según intro_progress del servidor
function runIntroAnimation() {
  const revealCategory = (window as any).revealCategory
  const finishIntro = (window as any).finishIntro
  if (!revealCategory) return

  // Revelar categorías hasta el progreso actual (siempre)
  for (let i = 0; i < Math.min(introProgress, 5); i++) {
    const header = board.querySelector(`.h[data-col="${i}"]`)
    if (header && !header.classList.contains('revealed')) {
      header.classList.add('revealed')
    }
  }

  // Animar la categoría actual si hay progreso nuevo (1..5)
  if (introProgress > 0 && introProgress <= 5) {
    const currentIndex = introProgress - 1
    const header = board.querySelector(`.h[data-col="${currentIndex}"]`)
    if (header && !header.classList.contains('animated')) {
      header.classList.add('animated')
      revealCategory(currentIndex)
    }
  }

  // NO auto-finalizar en 5. Esperar a que phase cambie (moderador selecciona casilla)
  // Solo limpiar intro-hidden si phase ya no es 'intro' (se maneja en handleGameChange)
}

// Mostrar pregunta (animación zoom)
function showQuestion(clueId: string) {
  if (!reveal.hidden) return

  const clue = clues.get(clueId)
  if (!clue) return

  const tile = board.querySelector(`[data-clue-id="${clueId}"]`) as HTMLElement
  if (!tile) return

  tile.classList.add('used')

  const tileRect = tile.getBoundingClientRect()
  const screenRect = document.querySelector('.screen')!.getBoundingClientRect()

  reveal.classList.remove('show-question')
  reveal.hidden = false
  zoomTile.classList.remove('expanded')
  zoomTile.textContent = '$' + clue.value
  zoomTile.style.left = (tileRect.left - screenRect.left) + 'px'
  zoomTile.style.top = (tileRect.top - screenRect.top) + 'px'
  zoomTile.style.width = tileRect.width + 'px'
  zoomTile.style.height = tileRect.height + 'px'

  questionText.textContent = clue.question_text || 'Pregunta pendiente'

  requestAnimationFrame(() => requestAnimationFrame(() => { zoomTile.classList.add('expanded') }))
  revealTimer = setTimeout(() => { reveal.classList.add('show-question') }, 850)
}

function hideQuestion() {
  clearTimeout(revealTimer)
  reveal.hidden = true
  reveal.classList.remove('show-question')
  zoomTile.classList.remove('expanded')
}

questionPanel.onclick = hideQuestion
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !reveal.hidden) hideQuestion() })

init()