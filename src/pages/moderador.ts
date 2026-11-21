import { supabase, getCurrentUser, getSession } from '../lib/supabase.js'
import { renderQuestionContent, getClueContent } from '../lib/questionContent.js'
import { generateCluesForGame, getCategories } from '../lib/staticQuestions.js'

// Elementos DOM
const appShell = document.getElementById('app-shell') as HTMLElement
const loginPage = document.getElementById('login-page') as HTMLElement
const board = document.getElementById('board') as HTMLElement
const progress = document.getElementById('progress') as HTMLElement
const boardNote = document.getElementById('board-note') as HTMLElement
const categoryChip = document.getElementById('category-chip') as HTMLElement
const valueChip = document.getElementById('value-chip') as HTMLElement
const doubleChip = document.getElementById('double-chip') as HTMLElement
const questionDisplay = document.getElementById('question-display') as HTMLElement
const questionNumber = document.getElementById('question-number') as HTMLElement
const editQuestionBtn = document.getElementById('edit-question') as HTMLButtonElement
const statusTitle = document.getElementById('status-title') as HTMLElement
const statusSub = document.getElementById('status-sub') as HTMLElement
const statusBox = document.getElementById('status-box') as HTMLElement
const releaseBtn = document.getElementById('release') as HTMLButtonElement
const correctBtn = document.getElementById('correct') as HTMLButtonElement
const incorrectBtn = document.getElementById('incorrect') as HTMLButtonElement
const backBtn = document.getElementById('back') as HTMLButtonElement
const nextBtn = document.getElementById('next') as HTMLButtonElement
const skipBtn = document.getElementById('skip') as HTMLButtonElement
const hint = document.getElementById('hint') as HTMLElement
const onlineCount = document.getElementById('online-count') as HTMLElement
const teamsContainer = document.getElementById('teams') as HTMLElement
const liveBadge = document.getElementById('live-badge') as HTMLElement
const subtitle = document.getElementById('subtitle') as HTMLElement
const newGameBtn = document.getElementById('new-game') as HTMLButtonElement

// Login
const loginForm = document.getElementById('login-form') as HTMLFormElement
const loginError = document.getElementById('login-error') as HTMLElement

// Modales
const editModal = document.getElementById('edit-modal') as HTMLElement
const questionInput = document.getElementById('question-input') as HTMLTextAreaElement
const saveQuestionBtn = document.getElementById('save-question') as HTMLButtonElement
const scoreModal = document.getElementById('score-modal') as HTMLElement
const scoreTeamName = document.getElementById('score-team-name') as HTMLElement
const scoreInput = document.getElementById('score-input') as HTMLInputElement
const scoreError = document.getElementById('score-error') as HTMLElement
const saveScoreBtn = document.getElementById('save-score') as HTMLButtonElement
const newGameModal = document.getElementById('new-game-modal') as HTMLElement
const newGameError = document.getElementById('new-game-error') as HTMLElement
const confirmNewGameBtn = document.getElementById('confirm-new-game') as HTMLButtonElement
const removeTeamModal = document.getElementById('remove-team-modal') as HTMLElement
const removeTeamNameEl = document.getElementById('remove-team-name') as HTMLElement
const confirmRemoveTeamBtn = document.getElementById('confirm-remove-team') as HTMLButtonElement

// Editor de imágenes
const contentTypeBtns = document.querySelectorAll('.content-type-btn') as NodeListOf<HTMLButtonElement>
const contentPanels = document.querySelectorAll('.content-panel') as NodeListOf<HTMLElement>
const imageFileInput = document.getElementById('image-file-input') as HTMLInputElement
const imageUploadZone = document.getElementById('image-upload-zone') as HTMLElement
const imagePreview = document.getElementById('image-preview') as HTMLElement
const previewImg = document.getElementById('preview-img') as HTMLImageElement
const removeImageBtn = document.getElementById('remove-image-btn') as HTMLButtonElement
const imageUploadLoading = document.getElementById('image-upload-loading') as HTMLElement
const imageUploadError = document.getElementById('image-upload-error') as HTMLElement
const imageAltInput = document.getElementById('image-alt-input') as HTMLInputElement
const mixedImageFileInput = document.getElementById('mixed-image-file-input') as HTMLInputElement
const mixedImageUploadZone = document.getElementById('mixed-image-upload-zone') as HTMLElement
const mixedImagePreview = document.getElementById('mixed-image-preview') as HTMLElement
const mixedPreviewImg = document.getElementById('mixed-preview-img') as HTMLImageElement
const mixedRemoveImageBtn = document.getElementById('mixed-remove-image-btn') as HTMLButtonElement
const mixedImageUploadLoading = document.getElementById('mixed-image-upload-loading') as HTMLElement
const mixedImageUploadError = document.getElementById('mixed-image-upload-error') as HTMLElement
const mixedImageAltInput = document.getElementById('mixed-image-alt-input') as HTMLInputElement
const mixedQuestionInput = document.getElementById('mixed-question-input') as HTMLTextAreaElement

// Estado
let gameId: string | null = null
let categories: string[] = []
let clues: Map<string, any> = new Map()
let teams: Map<string, any> = new Map()
let currentClueId: string | null = null
let phase: string = 'idle'
let winnerTeamId: string | null = null
let doubleTeamId: string | null = null
let wagerAmount: number | null = null
let introProgress: number = 0
let scoreTeamId: string | null = null
let removeTeamId: string | null = null
let isModerator = false
let moderatorDeviceToken: string

// Editor de preguntas con imágenes
let currentEditType: 'text' | 'image' | 'mixed' = 'text'
let selectedImageFile: File | null = null
let selectedMixedImageFile: File | null = null
let isUploadingImage = false
let currentEditingClueId: string | null = null

// Generar token único de dispositivo (persistente en localStorage)
function getModeratorDeviceToken(): string {
  let token = localStorage.getItem('jimenapardy_mod_device_token')
  if (!token) {
    token = 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('jimenapardy_mod_device_token', token)
  }
  return token
}

moderatorDeviceToken = getModeratorDeviceToken()

// Obtener gameId de URL
function getGameIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('game')
}

// Inicializar
async function init() {
  gameId = getGameIdFromUrl()

  // 1. Auth anónimo (identidad de dispositivo)
  const session = await getSession()
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      loginError.textContent = 'Error de conexión: ' + error.message
      return
    }
  }

  setupEventListeners()

  if (gameId) {
    // Hay gameId en URL: intentar restaurar sesión o mostrar login
    const savedMod = localStorage.getItem(`jimenapardy_moderator_${gameId}`)
    if (savedMod) {
      try {
        await registerModeratorDevice()
        await loadGame(gameId)
        return
      } catch { /* ignorar, volver a login */ }
    }
    showLogin()
  } else {
    // Sin gameId: mostrar login primero (pedir nombre/clave), al enviar creará la partida
    showLogin()
  }
}

function showLogin() {
  loginPage.hidden = false
  appShell.hidden = true
  loginError.textContent = ''
  ;(document.getElementById('mod-password') as HTMLInputElement).value = ''
  ;(document.getElementById('mod-name') as HTMLInputElement).focus()
}

function showApp() {
  loginPage.hidden = true
  appShell.hidden = false
}

async function registerModeratorDevice() {
  const { data, error } = await supabase.rpc('register_moderator_device', {
    p_game_id: gameId!,
    p_device_token: moderatorDeviceToken
  })

  if (error) {
    loginError.textContent = 'Error: ' + error.message
    return
  }

  const result = data as any
  if (result.replaced) {
    showReplaceConfirm()
  } else {
    showApp()
  }
}

function showReplaceConfirm() {
  loginPage.hidden = true
  appShell.hidden = true
  // Podríamos agregar un modal de confirmación similar a capitanes
  // Por ahora solo mostramos mensaje en login
  loginError.textContent = 'Otro dispositivo activo. Recarga para continuar como este moderador.'
  loginPage.hidden = false
  appShell.hidden = true
}

async function loadGame(id: string) {
  gameId = id

  const { data, error } = await supabase.rpc('get_game_state', { p_game_id: gameId })
  if (error) throw error

  const state = data as any
  const game = state.game as any

  // Verificar que el usuario actual es el moderador (auth.uid() = moderator_id)
  const user = await getCurrentUser()
  if (game.moderator_id !== user.id) {
    alert('No eres el moderador de esta partida')
    showLogin()
    return
  }

  isModerator = true
  liveBadge.hidden = false
  subtitle.textContent = `Partida ${gameId.slice(0,8)}... — Eres el moderador`

  // Usar categorías del JSON estático
  categories = getCategories()

  ;(state.clues || []).forEach((c: any) => clues.set(c.id, c))
  ;(state.teams || []).forEach((t: any) => teams.set(t.id, t))

  currentClueId = game.current_clue_id
  phase = game.phase || 'idle'
  winnerTeamId = game.winner_team_id
  doubleTeamId = game.double_team_id
  wagerAmount = game.wager_amount

  makeBoard()
  render()
  subscribeToChanges()
}

function subscribeToChanges() {
  supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, handleGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` }, handleTeamChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clues', filter: `game_id=eq.${gameId}` }, handleClueChange)
    .subscribe()
}

function handleGameChange(payload: any) {
  const g = payload.new as any
  if (!g) return

  currentClueId = g.current_clue_id
  phase = g.phase || 'idle'
  winnerTeamId = g.winner_team_id
  doubleTeamId = g.double_team_id
  wagerAmount = g.wager_amount
  introProgress = g.intro_progress || 0

  render()
}

function handleTeamChange(payload: any) {
  const t = payload.new as any
  if (!t) return

  if (payload.eventType === 'DELETE') {
    teams.delete(payload.old.id)
  } else {
    teams.set(t.id, t)
  }
  render()
}

function handleClueChange(payload: any) {
  const c = payload.new as any
  if (!c) return

  if (payload.eventType === 'DELETE') {
    clues.delete(payload.old.id)
  } else {
    clues.set(c.id, c)
  }
  render()
}

function makeBoard() {
  board.innerHTML = ''

  // Headers de categoría
  categories.forEach((name, col) => {
    const div = document.createElement('div')
    div.className = 'category'
    div.textContent = name
    board.appendChild(div)
  })

  // Tiles de valores
  const values = [200, 400, 600, 800, 1000]
  values.forEach(value => {
    for (let col = 0; col < 5; col++) {
      const clue = Array.from(clues.values()).find(c => c.column_index === col && c.value === value)
      if (!clue) continue

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tile' + (clue.is_daily_double ? ' dd' : '')
      btn.textContent = '$' + value
      btn.dataset.clueId = clue.id
      btn.setAttribute('aria-label', `${categories[col]} por $${value}${clue.is_daily_double ? ', Daily Double' : ''}`)

      btn.addEventListener('click', () => selectClue(clue.id))
      board.appendChild(btn)
    }
  })
}

function render() {
  const q = currentClueId ? clues.get(currentClueId) : null
  const isDDWagerPhase = phase === 'chooseDouble' || phase === 'awaitWager'

  // Board tiles
  document.querySelectorAll('.tile').forEach(btn => {
    const clueId = btn.dataset.clueId!
    const clue = clues.get(clueId)
    if (!clue) return

    const played = clue.state === 'used'
    const active = clueId === currentClueId && phase !== 'idle'

    btn.classList.toggle('played', played)
    btn.classList.toggle('active', active && !played)
    btn.disabled = played || (currentClueId && currentClueId !== clueId)
  })

  // Progress
  const playedCount = Array.from(clues.values()).filter(c => c.state === 'used').length
  progress.textContent = `${playedCount} / 25 jugadas`

  // Current question meta
  if (q) {
    categoryChip.textContent = categories[q.column_index]
    valueChip.textContent = `$ ${q.value}`
    doubleChip.hidden = !q.is_daily_double
    questionNumber.textContent = `Casilla ${q.column_index + 1} · $${q.value}`

    if (isDDWagerPhase) {
      // En DD: mostrar estado de apuesta, NO la pregunta
      const dt = teams.get(doubleTeamId!)
      if (phase === 'chooseDouble') {
        questionDisplay.textContent = '★ DAILY DOUBLE — Elige el equipo que lo descubrió'
      } else { // awaitWager
        questionDisplay.textContent = dt ? `★ DAILY DOUBLE — ${dt.name} está apostando (max $${wagerCap})` : '★ DAILY DOUBLE — Esperando apuesta...'
      }
      questionDisplay.classList.add('empty')
      editQuestionBtn.disabled = true
    } else {
      // Usar módulo compartido para renderizar vista previa (texto/imagen/mixto)
      const clueContent = getClueContent(q)
      questionDisplay.innerHTML = renderQuestionContent(clueContent, {
        maxWidth: '100%',
        maxHeight: '200px',
        showCheckerboard: false,
        interactive: false,
      })
      questionDisplay.classList.remove('empty')
      editQuestionBtn.hidden = true // Preguntas vienen de JSON estático, no editables
    }
  } else {
    categoryChip.textContent = 'Sin seleccionar'
    valueChip.textContent = '$ —'
    doubleChip.hidden = true
    questionNumber.textContent = 'Esperando una pregunta'
    questionDisplay.textContent = 'Elige una casilla en el tablero para empezar.'
    questionDisplay.classList.add('empty')
    editQuestionBtn.disabled = true
  }

  // Status box
  updateStatusBox()

  // Controls
  updateControls()

  // Teams
  renderTeams()

  // Hint
  updateHint()
}

function updateStatusBox() {
  statusBox.className = 'status-box'

  if (phase === 'idle') {
    statusTitle.textContent = 'Buzzer bloqueado'
    statusSub.textContent = 'Selecciona una pregunta para comenzar.'
  } else if (phase === 'blocked') {
    statusBox.classList.add('ready')
    statusTitle.textContent = 'Buzzer bloqueado'
    statusSub.textContent = 'Lee la pregunta y después libera el buzzer.'
  } else if (phase === 'intro') {
    statusBox.classList.add('ready')
    statusTitle.textContent = '🎬 Intro del tablero'
    statusSub.textContent = `Revelando categoría ${introProgress}/5. Pulsa "Siguiente categoría" para continuar.`
  } else if (phase === 'chooseDouble') {
    statusBox.classList.add('ready')
    statusTitle.textContent = '★ Daily Double'
    statusSub.textContent = 'Elige el equipo que lo descubrió. Irá directo a apostar (sin buzzer).'
  } else if (phase === 'open') {
    statusBox.classList.add('ready')
    statusTitle.textContent = 'Buzzer liberado'
    statusSub.textContent = 'Esperando al primer equipo que oprima el botón.'
  } else if (phase === 'won') {
    statusBox.classList.add('winner')
    const winner = teams.get(winnerTeamId!)
    statusTitle.textContent = winner ? `${winner.name} ganó el buzzer` : 'Buzzer recibido'
    statusSub.textContent = 'Califica su respuesta. Los demás equipos están bloqueados.'
  } else if (phase === 'wrong') {
    statusBox.classList.add('wrong')
    statusTitle.textContent = 'Respuesta incorrecta'
    statusSub.textContent = 'Casilla retirada. Puntos descontados y buzzer abierto para todos, incluido el equipo que falló.'
  } else if (phase === 'correct') {
    statusBox.classList.add('correct')
    statusTitle.textContent = '¡Respuesta correcta!'
    statusSub.textContent = 'Puntos sumados. Buzzer bloqueado hasta que avances manualmente.'
  } else if (phase === 'awaitWager') {
    statusBox.classList.add('ready')
    const dt = teams.get(doubleTeamId!)
    statusTitle.textContent = 'Esperando apuesta'
    statusSub.textContent = dt ? `${dt.name} debe confirmar el valor de su apuesta.` : 'Equipo pendiente.'
  } else if (phase === 'doubleReady') {
    statusBox.classList.add('winner')
    const dt = teams.get(doubleTeamId!)
    statusTitle.textContent = `Apuesta confirmada: $${wagerAmount}`
    statusSub.textContent = dt ? `${dt.name} responde esta pregunta. Califica su respuesta.` : 'Califica la respuesta.'
  }
}

function updateControls() {
  const q = currentClueId ? clues.get(currentClueId) : null
  const onlineTeams = Array.from(teams.values()).filter(t => t.active_device_token)

  const introCompleted = phase === 'intro' && introProgress === 5

  // Release / Intro / Daily Double assignment
  if (phase === 'idle' && !currentClueId && !introCompleted) {
    // Partida recién creada: botón para iniciar intro
    hideDDTeamSelector()
    releaseBtn.style.display = ''
    releaseBtn.textContent = '▶ Iniciar partida'
    releaseBtn.disabled = false
    releaseBtn.onclick = startIntro
  } else if (phase === 'intro') {
    if (introProgress < 5) {
      releaseBtn.textContent = `Siguiente categoría (${introProgress}/5)`
      releaseBtn.disabled = false
      releaseBtn.onclick = advanceIntro
    } else {
      // introProgress === 5: todas las categorías reveladas, esperar selección de casilla
      releaseBtn.textContent = 'Comenzar: elige una casilla'
      releaseBtn.disabled = true
      releaseBtn.onclick = null
    }
  } else if (phase === 'chooseDouble') {
    // Mostrar selector de equipos en lugar de botón simple
    releaseBtn.style.display = 'none'
    showDDTeamSelector(onlineTeams)
  } else if (phase === 'awaitWager') {
    hideDDTeamSelector()
    releaseBtn.style.display = ''
    releaseBtn.textContent = 'Abrir pantalla de apuesta'
    releaseBtn.disabled = false
    releaseBtn.onclick = releaseBuzzer
  } else if (phase === 'blocked') {
    hideDDTeamSelector()
    releaseBtn.style.display = ''
    releaseBtn.textContent = 'Liberar buzzer'
    releaseBtn.disabled = false
    releaseBtn.onclick = releaseBuzzer
  } else {
    hideDDTeamSelector()
    releaseBtn.style.display = ''
    releaseBtn.textContent = 'Buzzer liberado'
    releaseBtn.disabled = true
    releaseBtn.onclick = null
  }

  // Correct/Incorrect
  const canGrade = phase === 'won' || phase === 'doubleReady'
  correctBtn.disabled = !canGrade
  incorrectBtn.disabled = !canGrade

  // Skip (nadie respondió) - solo cuando buzzer está libre/bloqueado y no hay ganador
  const canSkip = phase === 'open' || phase === 'blocked' || phase === 'chooseDouble'
  skipBtn.disabled = !canSkip

  // Back
  backBtn.disabled = !q || q.state === 'used'

  // Next
  nextBtn.disabled = !q || q.state !== 'used' || phase === 'won' || phase === 'doubleReady'
}

// Selector de equipo para Daily Double
let ddSelectorContainer: HTMLElement | null = null

function showDDTeamSelector(onlineTeams: any[]) {
  hideDDTeamSelector()
  const container = document.createElement('div')
  container.id = 'dd-team-selector'
  container.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;'
  container.innerHTML = '<label style="color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Equipo que descubrió el Daily Double:</label>'

  const select = document.createElement('select')
  select.style.cssText = 'padding:10px;background:#f7f4e9;border:2px solid #151515;color:#111;font-size:17px;'
  select.innerHTML = '<option value="">— Selecciona equipo —</option>'
  onlineTeams.forEach(team => {
    const opt = document.createElement('option')
    opt.value = team.id
    opt.textContent = team.name
    select.appendChild(opt)
  })
  container.appendChild(select)

  const assignBtn = document.createElement('button')
  assignBtn.className = 'btn primary'
  assignBtn.textContent = 'Asignar y abrir apuesta'
  assignBtn.style.marginTop = '8px'
  assignBtn.addEventListener('click', () => {
    if (!select.value) return
    assignDailyDouble(select.value)
  })
  container.appendChild(assignBtn)

  // Insertar después del botón release
  releaseBtn.parentNode!.insertBefore(container, releaseBtn.nextSibling)
  ddSelectorContainer = container
}

function hideDDTeamSelector() {
  if (ddSelectorContainer) {
    ddSelectorContainer.remove()
    ddSelectorContainer = null
  }
  releaseBtn.style.display = ''
}

async function startIntro() {
  const { error } = await supabase.rpc('start_intro', { p_game_id: gameId! })
  if (error) console.error('Error:', error)
}

async function advanceIntro() {
  console.log('advanceIntro called, current introProgress:', introProgress)
  const { data, error } = await supabase.rpc('advance_intro', { p_game_id: gameId! })
  console.log('advance_intro result:', data, error)
  if (error) console.error('Error:', error)
}

async function assignDailyDouble(teamId: string) {
  const { error } = await supabase.rpc('assign_daily_double', {
    p_game_id: gameId!,
    p_team_id: teamId
  })
  if (error) console.error('Error:', error)
  else hideDDTeamSelector()
}

function renderTeams() {
  teamsContainer.innerHTML = ''
  const onlineTeams = Array.from(teams.values()).filter(t => t.active_device_token)

  onlineCount.textContent = `${onlineTeams.length} conectado${onlineTeams.length === 1 ? '' : 's'}`

  onlineTeams.forEach(team => {
    const card = document.createElement('div')
    const isWinnerNow = (phase === 'won' || phase === 'doubleReady') &&
      ((phase === 'won' && team.id === winnerTeamId) || (phase === 'doubleReady' && team.id === doubleTeamId))
    card.className = 'team' + (isWinnerNow ? ' winner' : '')

    const head = document.createElement('div')
    head.className = 'team-top'

    const name = document.createElement('div')
    name.className = 'team-name'
    name.textContent = team.name
    head.appendChild(name)

    const badge = document.createElement('span')
    badge.className = 'online'
    badge.textContent = 'En línea'
    head.appendChild(badge)

    const score = document.createElement('div')
    score.className = 'score'
    score.textContent = team.score.toString()

    const actions = document.createElement('div')
    actions.className = 'team-actions'

    const editBtn = document.createElement('button')
    editBtn.className = 'small-btn'
    editBtn.type = 'button'
    editBtn.textContent = 'Editar puntos'
    editBtn.addEventListener('click', () => openScoreModal(team.id, team.name, team.score))

    const removeBtn = document.createElement('button')
    removeBtn.className = 'small-btn'
    removeBtn.type = 'button'
    removeBtn.textContent = 'Eliminar equipo'
    removeBtn.style.background = '#8d2531'
    removeBtn.style.borderColor = '#f06b77'
    removeBtn.addEventListener('click', () => openRemoveTeamModal(team.id, team.name))

    actions.appendChild(editBtn)
    actions.appendChild(removeBtn)
    card.append(head, score, actions)
    teamsContainer.appendChild(card)
  })
}

function updateHint() {
  if (phase === 'chooseDouble') {
    hint.textContent = 'Daily Double: libera el buzzer; el equipo que gane apostará desde su celular.'
  } else if (phase === 'awaitWager') {
    hint.textContent = 'El capitán del equipo asignado confirma la apuesta en su celular.'
  } else if (phase === 'doubleReady') {
    hint.textContent = 'Daily Double listo: califica la respuesta del equipo apostador.'
  } else {
    hint.textContent = 'Conectado a Supabase. Los equipos entran desde /capitan?game=ID'
  }
}

async function selectClue(clueId: string) {
  if (currentClueId) return

  const { data, error } = await supabase.rpc('select_clue', {
    p_game_id: gameId!,
    p_clue_id: clueId
  })

  if (error) {
    alert('Error: ' + error.message)
    return
  }

  // El estado se actualiza via Realtime
}

async function releaseBuzzer() {
  if (phase === 'awaitWager') {
    await supabase.rpc('release_buzzer', { p_game_id: gameId! })
    return
  }
  if (phase !== 'blocked' && phase !== 'chooseDouble') return

  const { error } = await supabase.rpc('release_buzzer', { p_game_id: gameId! })
  if (error) console.error('release_buzzer error:', error)
}

async function gradeAnswer(correct: boolean) {
  if (phase !== 'won' && phase !== 'doubleReady') return

  const { data, error } = await supabase.rpc('grade_answer', {
    p_game_id: gameId!,
    p_correct: correct
  })

  if (error) console.error('grade_answer error:', error)
}

async function goBack() {
  if (!currentClueId) return
  const clue = clues.get(currentClueId)
  if (clue?.state === 'used') return

  const { error } = await supabase.rpc('cancel_clue', { p_game_id: gameId! })
  if (error) console.error('Error:', error)
}

async function nextQuestion() {
  if (!currentClueId) return
  const clue = clues.get(currentClueId)
  if (clue?.state !== 'used') return
  if (phase === 'won' || phase === 'doubleReady') return

  const { error } = await supabase.rpc('next_question', { p_game_id: gameId! })
  if (error) console.error('Error:', error)
}

async function closeQuestion() {
  if (!currentClueId) return
  if (phase !== 'wrong' && phase !== 'won') return

  const { error } = await supabase.rpc('close_question', { p_game_id: gameId! })
  if (error) console.error('Error:', error)
}

async function skipQuestion() {
  if (!currentClueId) return
  if (phase !== 'open' && phase !== 'blocked' && phase !== 'chooseDouble') return

  const { error } = await supabase.rpc('skip_question', { p_game_id: gameId! })
  if (error) console.error('Error:', error)
}

// Modales
function openScoreModal(id: string, name: string, score: number) {
  scoreTeamId = id
  scoreTeamName.textContent = name
  scoreInput.value = score.toString()
  scoreError.textContent = ''
  showModal(scoreModal)
  scoreInput.focus()
}

async function saveScore() {
  if (!scoreTeamId) return
  const raw = scoreInput.value.trim()
  const points = parseInt(raw, 10)

  if (raw === '' || isNaN(points)) {
    scoreError.textContent = 'Introduce un número entero válido (puede ser negativo).'
    return
  }

  const { data, error } = await supabase.rpc('edit_score', {
    p_game_id: gameId!,
    p_team_id: scoreTeamId,
    p_new_score: points
  })

  if (error) {
    scoreError.textContent = error.message
    return
  }

  closeModal(scoreModal)
}

function openRemoveTeamModal(id: string, name: string) {
  removeTeamId = id
  removeTeamNameEl.textContent = name
  showModal(removeTeamModal)
}

async function confirmRemoveTeam() {
  if (!removeTeamId || !gameId) return

  const { error } = await supabase.rpc('remove_team', {
    p_game_id: gameId!,
    p_team_id: removeTeamId
  })

  if (error) {
    console.error('Error removing team:', error)
    alert('Error: ' + error.message)
  }

  closeModal(removeTeamModal)
  removeTeamId = null
}

// ============================================
// EDITOR DE PREGUNTAS CON IMÁGENES
// ============================================

function setContentType(type: 'text' | 'image' | 'mixed') {
  currentEditType = type

  // Actualizar botones
  contentTypeBtns.forEach(btn => {
    const isActive = btn.dataset.type === type
    btn.classList.toggle('active', isActive)
    if (isActive) {
      btn.style.background = 'var(--gold-light)'
      btn.style.color = '#080808'
      btn.style.borderColor = 'var(--gold-light)'
    } else {
      btn.style.background = '#171e49'
      btn.style.color = 'var(--gold-light)'
      btn.style.borderColor = '#394785'
    }
  })

  // Mostrar/ocultar paneles
  contentPanels.forEach(panel => {
    const panelType = panel.dataset.panel
    panel.style.display = panelType === type ? 'block' : 'none'
  })
}

function setupImageUploadZone(
  zone: HTMLElement,
  fileInput: HTMLInputElement,
  handlers: { onFileSelect: (file: File) => void; onRemove: () => void }
) {
  // Click para abrir selector
  zone.addEventListener('click', (e) => {
    if (e.target === zone || e.target.classList.contains('upload-icon') ||
        e.target.tagName === 'P' || e.target.classList.contains('placeholder')) {
      fileInput.click()
    }
  })

  // Drag & drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.add('dragover')
  })

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('dragover')
  })

  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('dragover')

    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handlers.onFileSelect(file)
    }
  })

  // Input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handlers.onFileSelect(fileInput.files[0])
      fileInput.value = '' // Permitir seleccionar el mismo archivo de nuevo
    }
  })
}

function handleImageFileSelect(file: File, type: 'image' | 'mixed') {
  // Validar tipo
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    showImageError(type, 'Tipo no permitido. Solo PNG, JPEG, WebP')
    return
  }

  // Validar tamaño (5 MB)
  if (file.size > 5 * 1024 * 1024) {
    showImageError(type, 'Archivo muy grande. Máximo 5 MB')
    return
  }

  // Guardar archivo
  if (type === 'image') {
    selectedImageFile = file
  } else {
    selectedMixedImageFile = file
  }

  // Mostrar preview
  const preview = type === 'image' ? imagePreview : mixedImagePreview
  const previewImgEl = type === 'image' ? previewImg : mixedPreviewImg
  const uploadZone = type === 'image' ? imageUploadZone : mixedImageUploadZone
  const errorEl = type === 'image' ? imageUploadError : mixedImageUploadError

  const url = URL.createObjectURL(file)
  previewImgEl.src = url
  preview.style.display = 'block'
  uploadZone.style.padding = '12px'
  errorEl.textContent = ''
}

function handleRemoveImage(type: 'image' | 'mixed') {
  if (type === 'image') {
    selectedImageFile = null
    imagePreview.style.display = 'none'
    previewImg.src = ''
    imageUploadZone.style.padding = '24px'
    imageAltInput.value = ''
    imageUploadError.textContent = ''
  } else {
    selectedMixedImageFile = null
    mixedImagePreview.style.display = 'none'
    mixedPreviewImg.src = ''
    mixedImageUploadZone.style.padding = '24px'
    mixedImageAltInput.value = ''
    mixedImageUploadError.textContent = ''
  }
}

function showImageError(type: 'image' | 'mixed', message: string) {
  const errorEl = type === 'image' ? imageUploadError : mixedImageUploadError
  errorEl.textContent = message
}

function setUploadingState(type: 'image' | 'mixed', uploading: boolean) {
  isUploadingImage = uploading
  const loadingEl = type === 'image' ? imageUploadLoading : mixedImageUploadLoading
  const previewEl = type === 'image' ? imagePreview : mixedImagePreview
  const fileInput = type === 'image' ? imageFileInput : mixedImageFileInput
  const removeBtn = type === 'image' ? removeImageBtn : mixedRemoveImageBtn

  loadingEl.style.display = uploading ? 'block' : 'none'
  previewEl.style.display = uploading ? 'none' : 'block'
  fileInput.disabled = uploading
  removeBtn.disabled = uploading
  saveQuestionBtn.disabled = uploading
}

// Subir imagen a Edge Function
async function uploadImage(file: File, clueId: string): Promise<{ storagePath: string; imageUrl: string } | null> {
  if (!gameId) return null

  const formData = new FormData()
  formData.append('file', file)
  formData.append('gameId', gameId)
  formData.append('clueId', clueId)

  // Obtener token de auth actual
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No hay sesión activa')
  }

  const response = await fetch(
    'https://wvaplnmcllwpioamgpct.supabase.co/functions/v1/upload-question-image',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData,
    }
  )

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Error subiendo imagen')
  }

  return { storagePath: result.storagePath, imageUrl: result.imageUrl }
}

// Eliminar imagen antigua via Edge Function
async function deleteOldImage(storagePath: string) {
  if (!gameId) return

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return

  try {
    await fetch(
      'https://wvaplnmcllwpioamgpct.supabase.co/functions/v1/delete-question-image',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storagePath, gameId }),
      }
    )
  } catch (err) {
    console.warn('Error eliminando imagen antigua:', err)
  }
}

// Guardar pregunta completa (texto + imagen)
async function saveQuestion() {
  if (!currentClueId || !gameId || !currentEditingClueId) return

  saveQuestionBtn.disabled = true
  saveQuestionBtn.textContent = 'Guardando...'

  try {
    let imagePath: string | null = null
    let contentType: 'text' | 'image' | 'mixed' = currentEditType
    let questionText = ''
    let imageAlt = ''

    // Preparar datos según tipo
    switch (currentEditType) {
      case 'text':
        questionText = questionInput.value.trim()
        break

      case 'image':
        if (!selectedImageFile) {
          throw new Error('Selecciona una imagen')
        }
        imageAlt = imageAltInput.value.trim()
        setUploadingState('image', true)
        const uploadResult = await uploadImage(selectedImageFile, currentClueId)
        if (!uploadResult) throw new Error('Error subiendo imagen')
        imagePath = uploadResult.storagePath
        setUploadingState('image', false)
        break

      case 'mixed':
        if (!selectedMixedImageFile) {
          throw new Error('Selecciona una imagen')
        }
        questionText = mixedQuestionInput.value.trim()
        if (!questionText) {
          throw new Error('Escribe el texto para imagen + texto')
        }
        imageAlt = mixedImageAltInput.value.trim()
        setUploadingState('mixed', true)
        const mixedUploadResult = await uploadImage(selectedMixedImageFile, currentClueId)
        if (!mixedUploadResult) throw new Error('Error subiendo imagen')
        imagePath = mixedUploadResult.storagePath
        setUploadingState('mixed', false)
        break
    }

    // Actualizar BD via RPC
    const { data, error } = await supabase.rpc('update_clue_image', {
      p_game_id: gameId!,
      p_clue_id: currentClueId,
      p_image_path: imagePath,
      p_content_type: contentType,
      p_image_alt: imageAlt,
      p_question_text: questionText || null,
    })

    if (error) throw error

    const result = data as any
    if (!result.success) throw new Error(result.error)

    // Limpiar archivo antiguo si existe
    if (result.old_image_path) {
      await deleteOldImage(result.old_image_path)
    }

    closeModal(editModal)
    resetEditModal()
  } catch (err) {
    console.error('Error guardando pregunta:', err)
    alert('Error: ' + err.message)
  } finally {
    saveQuestionBtn.disabled = false
    saveQuestionBtn.textContent = 'Guardar'
  }
}

function resetEditModal() {
  currentEditType = 'text'
  selectedImageFile = null
  selectedMixedImageFile = null
  currentEditingClueId = null

  // Reset UI
  setContentType('text')
  questionInput.value = ''
  imagePreview.style.display = 'none'
  previewImg.src = ''
  imageUploadZone.style.padding = '24px'
  imageAltInput.value = ''
  imageUploadError.textContent = ''
  mixedImagePreview.style.display = 'none'
  mixedPreviewImg.src = ''
  mixedImageUploadZone.style.padding = '24px'
  mixedImageAltInput.value = ''
  mixedImageUploadError.textContent = ''
  mixedQuestionInput.value = ''
}

function openEditModal() {
  if (!currentClueId) return
  const clue = clues.get(currentClueId)
  if (!clue) return

  currentEditingClueId = currentClueId
  resetEditModal()

  // Cargar datos existentes
  const contentType = clue.content_type || 'text'
  const questionText = clue.question_text || ''
  const imagePath = clue.image_path
  const imageAlt = clue.image_alt || ''

  setContentType(contentType)

  switch (contentType) {
    case 'text':
      questionInput.value = questionText
      break

    case 'image':
      if (imagePath) {
        const imageUrl = `https://wvaplnmcllwpioamgpct.supabase.co/storage/v1/object/public/question-images/${imagePath}`
        previewImg.src = imageUrl
        imagePreview.style.display = 'block'
        imageUploadZone.style.padding = '12px'
      }
      imageAltInput.value = imageAlt
      break

    case 'mixed':
      if (imagePath) {
        const imageUrl = `https://wvaplnmcllwpioamgpct.supabase.co/storage/v1/object/public/question-images/${imagePath}`
        mixedPreviewImg.src = imageUrl
        mixedImagePreview.style.display = 'block'
        mixedImageUploadZone.style.padding = '12px'
      }
      mixedImageAltInput.value = imageAlt
      mixedQuestionInput.value = questionText
      break
  }

  showModal(editModal)
  questionInput.focus()
}

function showModal(modal: HTMLElement) {
  modal.hidden = false
  const input = modal.querySelector('input,textarea,select')
  if (input) setTimeout(() => (input as HTMLElement).focus(), 30)
}

function closeModal(modal: HTMLElement) {
  modal.hidden = true
}

function showNewGameModal() {
  showModal(newGameModal)
}

// Event listeners
function setupEventListeners() {
  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    await handleLogin()
  })

  releaseBtn.addEventListener('click', releaseBuzzer)
  correctBtn.addEventListener('click', () => gradeAnswer(true))
  incorrectBtn.addEventListener('click', () => gradeAnswer(false))
  skipBtn.addEventListener('click', skipQuestion)
  backBtn.addEventListener('click', goBack)
  nextBtn.addEventListener('click', nextQuestion)

  editQuestionBtn.addEventListener('click', openEditModal)
  saveQuestionBtn.addEventListener('click', saveQuestion)

  saveScoreBtn.addEventListener('click', saveScore)

  newGameBtn.addEventListener('click', showNewGameModal)
  confirmNewGameBtn.addEventListener('click', createNewGame)

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(document.getElementById(btn.getAttribute('data-close')!)!))
  })

  confirmRemoveTeamBtn.addEventListener('click', confirmRemoveTeam)

  // Editor de contenido - selector de tipo
  contentTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => setContentType(btn.dataset.type as 'text' | 'image' | 'mixed'))
  })

  // Drag & drop para imagen simple
  setupImageUploadZone(imageUploadZone, imageFileInput, {
    onFileSelect: (file) => handleImageFileSelect(file, 'image'),
    onRemove: () => handleRemoveImage('image'),
  })

  // Drag & drop para imagen mixta
  setupImageUploadZone(mixedImageUploadZone, mixedImageFileInput, {
    onFileSelect: (file) => handleImageFileSelect(file, 'mixed'),
    onRemove: () => handleRemoveImage('mixed'),
  })

  // Botones eliminar imagen
  removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    handleRemoveImage('image')
  })
  mixedRemoveImageBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    handleRemoveImage('mixed')
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [editModal, scoreModal, newGameModal].forEach(closeModal)
    }
    // Teclas rápidas
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (e.key === 'r' && phase === 'blocked') releaseBuzzer()
    if (e.key === 'c' && (phase === 'won' || phase === 'doubleReady')) gradeAnswer(true)
    if (e.key === 'i' && (phase === 'won' || phase === 'doubleReady')) gradeAnswer(false)
    if (e.key === 'b') goBack()
    if (e.key === 'n' && phase !== 'won' && phase !== 'doubleReady') nextQuestion()
    if (e.key === 's' && (phase === 'open' || phase === 'blocked' || phase === 'chooseDouble')) skipQuestion()
    if (e.key === ' ' && phase === 'intro') advanceIntro()
    if (e.key === 'Enter' && phase === 'idle' && !currentClueId) startIntro()
  })
}

async function handleLogin() {
  const name = (document.getElementById('mod-name') as HTMLInputElement).value.trim()
  const password = (document.getElementById('mod-password') as HTMLInputElement).value

  if (!name || !password) {
    loginError.textContent = 'Introduce nombre y contraseña.'
    return
  }

  loginError.textContent = 'Conectando...'
  const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement
  submitBtn.disabled = true

  // 1. Si no hay sesión anónima, crear una
  const session = await getSession()
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      loginError.textContent = 'Error de conexión: ' + error.message
      submitBtn.disabled = false
      return
    }
  }

  // 2. Si no hay gameId, crear la partida primero
  if (!gameId) {
    const { data: newGameId, error: createError } = await supabase.rpc('create_game')
    if (createError) {
      loginError.textContent = 'Error creando partida: ' + createError.message
      submitBtn.disabled = false
      return
    }
    gameId = newGameId as string
    window.history.replaceState({}, '', `?game=${gameId}`)
  }

  // 3. Llamar RPC moderator_login
  const { data, error } = await supabase.rpc('moderator_login', {
    p_game_id: gameId!,
    p_name: name,
    p_password: password
  })

  submitBtn.disabled = false

  if (error) {
    loginError.textContent = 'Error: ' + error.message
    return
  }

  const result = data as any
  if (!result.success) {
    loginError.textContent = result.error || 'Error desconocido'
    return
  }

  // Guardar moderador en localStorage
  localStorage.setItem(`jimenapardy_moderator_${gameId}`, JSON.stringify({
    name: result.name
  }))

  await registerModeratorDevice()
}

async function createNewGame() {
  closeModal(newGameModal)
  newGameError.textContent = 'Creando partida con preguntas predefinidas...'

  // 1. Crear partida vacía
  const { data: newGameId, error: createError } = await supabase.rpc('create_game')
  if (createError) {
    newGameError.textContent = 'Error: ' + createError.message
    return
  }

  gameId = newGameId as string
  window.history.replaceState({}, '', `?game=${gameId}`)

  // 2. IMPORTANTE: Establecer moderator_id ANTES de actualizar pistas (RLS lo requiere)
  const user = await getCurrentUser()
  if (user) {
    const { error: modError } = await supabase
      .from('games')
      .update({ moderator_id: user.id })
      .eq('id', gameId)

    if (modError) {
      console.error('Error setting moderator_id:', modError)
      newGameError.textContent = 'Error configurando moderador: ' + modError.message
      return
    }
  }

  // 3. DIAGNÓSTICO: Verificar qué pistas existen en la BD
  console.log('=== DIAGNÓSTICO BD ===')
  const { data: allClues, error: cluesError } = await supabase
    .from('clues')
    .select('column_index, value, question_text, is_daily_double')
    .eq('game_id', gameId)
    .order('column_index', { ascending: true })
    .order('value', { ascending: true })

  if (cluesError) {
    console.error('Error fetching clues:', cluesError)
  } else {
    console.log('Pistas en BD:', allClues?.length || 0)
    allClues?.forEach((c: any, i: number) => {
      console.log(`  ${i+1}. col=${c.column_index} val=$${c.value} DD=${c.is_daily_double} q="${c.question_text?.substring(0,40) || '(vacía)'}"`)
    })

    // Agrupar por valor para ver qué tiers existen
    const values = [...new Set(allClues?.map((c: any) => c.value) || [])].sort((a,b) => a-b)
    console.log('Valores únicos en BD:', values)

    if (values.length !== 5 || !values.includes(200)) {
      console.error('❌ ESQUEMA ANTIGUO: Solo hay', values.length, 'valores, faltan $200')
      newGameError.textContent = `❌ ESQUEMA ANTIGUO: BD tiene ${values.length} valores (${values.join(', ')}). Falta $200. Ejecuta migraciones 001_init.sql y 002_add_moderator_auth.sql ACTUALIZADAS.`
      return
    }
  }

  // 4. Poblar pistas con datos estáticos del JSON
  const cluesData = generateCluesForGame()
  const categories = getCategories()
  let updatedCount = 0

  for (const clue of cluesData) {
    const { error, data } = await supabase
      .from('clues')
      .update({
        question_text: clue.question_text,
        is_daily_double: clue.is_daily_double,
        content_type: clue.content_type,
        image_path: clue.image_path,
        image_alt: clue.image_alt
      })
      .eq('game_id', gameId)
      .eq('column_index', clue.column_index)
      .eq('value', clue.value)
      .select()

    if (error) {
      console.error('Error updating clue:', clue, error)
      newGameError.textContent = 'Error actualizando pistas: ' + error.message
      return
    }

    if (data && data.length > 0) {
      updatedCount++
    } else {
      console.warn('No rows updated for clue:', clue.category, clue.value)
    }
  }

  console.log(`Updated ${updatedCount}/${cluesData.length} clues`)

  if (updatedCount === 0) {
    newGameError.textContent = 'ADVERTENCIA: No se actualizó ninguna pista. ¿Ejecutaste las migraciones 001 y 002 actualizadas?'
    return
  }

  // 5. Actualizar categorías en la partida
  const { error: catError } = await supabase
    .from('games')
    .update({ categories: categories })
    .eq('id', gameId)

  if (catError) {
    console.error('Error updating categories:', catError)
  }

  // 5. Recargar estado completo
  await loadGame(gameId)
}

init()