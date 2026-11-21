import { supabase, getSession } from '../lib/supabase.js'

// Elementos DOM
const welcome = document.getElementById('welcome') as HTMLElement
const login = document.getElementById('login') as HTMLElement
const game = document.getElementById('game') as HTMLElement
const wagerPage = document.getElementById('wager-page') as HTMLElement
const replaceConfirm = document.getElementById('replace-confirm') as HTMLElement
const buzzer = document.getElementById('buzzer') as HTMLButtonElement
const statusText = document.getElementById('status') as HTMLElement
const teamNameEl = document.getElementById('team-name') as HTMLElement
const teamScoreEl = document.getElementById('team-score') as HTMLElement
const wagerTeamNameEl = document.getElementById('wager-team-name') as HTMLElement
const wagerInput = document.getElementById('wager-input') as HTMLInputElement
const wagerCapEl = document.getElementById('wager-cap') as HTMLElement
const wagerError = document.getElementById('wager-error') as HTMLElement
const loginError = document.getElementById('login-error') as HTMLElement

// Estado
let gameId: string | null = null
let teamId: string | null = null
let deviceToken: string
let currentPhase: string = 'idle'
let isWinner: boolean = false
let wagerCap: number = 0
let buzzCooldownUntil: number = 0

// Generar token único de dispositivo (persistente en localStorage)
function getDeviceToken(): string {
  let token = localStorage.getItem('jimenapardy_device_token')
  if (!token) {
    token = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('jimenapardy_device_token', token)
  }
  return token
}

deviceToken = getDeviceToken()

// Obtener gameId de URL
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

  // 1. Auth anónimo (identidad de dispositivo)
  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    loginError.textContent = 'Error de conexión: ' + error.message
    return
  }

  // 2. Intentar auto-reconnect: si hay team guardado, validar con captain_login
  const saved = localStorage.getItem(`jimenapardy_team_${gameId}`)
  if (saved) {
    try {
      const savedData = JSON.parse(saved) as { teamId: string; name: string; password: string }
      const { name, password } = savedData
      // Validar credenciales de nuevo (rápido, sin UI)
      const { data, error } = await supabase.rpc('captain_login', {
        p_game_id: gameId!,
        p_name: name,
        p_password: password
      })
      if (!error && data?.success) {
        teamId = data.team_id
        teamNameEl.textContent = name.toUpperCase()
        teamScoreEl.textContent = data.score.toString()
        await registerDevice()
        setupEventListeners()
        subscribeToGame()
        await fetchInitialGameState()
        enterGame()
        return
      }
    } catch (e) {
      console.log('Auto-reconnect failed, showing login:', e)
    }
  }

  // 3. Fallback: mostrar login normal
  setupEventListeners()
  subscribeToGame()
  showLogin()
}

function setupEventListeners() {
  welcome.querySelector('#enter')!.addEventListener('click', () => {
    welcome.hidden = true
    showLogin()
  })

  document.getElementById('login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    await handleLogin()
  })

  buzzer.addEventListener('click', handleBuzz)

  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !game.hidden && !buzzer.disabled) {
      e.preventDefault()
      handleBuzz()
    }
    if (e.key === 'Escape' && !wagerPage.hidden) {
      closeWager()
    }
  })

  document.getElementById('wager-form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    await confirmWager()
  })

  document.getElementById('confirm-replace')!.addEventListener('click', () => confirmReplaceDevice(true))
  document.getElementById('cancel-replace')!.addEventListener('click', () => confirmReplaceDevice(false))
}

async function handleLogin() {
  const teamName = (document.getElementById('team-name-input') as HTMLInputElement).value.trim()
  const password = (document.getElementById('team-password') as HTMLInputElement).value

  if (!teamName || !password) {
    loginError.textContent = 'Escribe nombre y clave del equipo.'
    return
  }

  loginError.textContent = 'Conectando...'
  ;(document.getElementById('login-form')!.querySelector('button') as HTMLButtonElement).disabled = true

  const { data, error } = await supabase.rpc('captain_login', {
    p_game_id: gameId!,
    p_name: teamName,
    p_password: password
  })

  ;(document.getElementById('login-form')!.querySelector('button') as HTMLButtonElement).disabled = false

  if (error) {
    loginError.textContent = 'Error: ' + error.message
    console.error('captain_login error:', error)
    return
  }

  const result = data as any
  console.log('captain_login result:', result)  // DEBUG
  if (!result.success) {
    loginError.textContent = result.error || 'Error desconocido'
    return
  }

  // Guardar equipo en localStorage (incluye password para auto-reconnect)
  teamId = result.team_id
  localStorage.setItem(`jimenapardy_team_${gameId}`, JSON.stringify({
    teamId: result.team_id,
    name: result.name,
    score: result.score,
    password: password
  }))

  teamNameEl.textContent = result.name.toUpperCase()
  teamScoreEl.textContent = result.score.toString()

  console.log('Calling registerDevice with teamId:', teamId)  // DEBUG
  await registerDevice()
}

async function registerDevice() {
  const { data, error } = await supabase.rpc('register_device', {
    p_game_id: gameId!,
    p_team_id: teamId!,
    p_device_token: deviceToken
  })

  if (error) {
    loginError.textContent = 'Error: ' + error.message
    return
  }

  const result = data as any
  console.log('register_device result:', result)  // DEBUG
  if (result.replaced) {
    showReplaceConfirm()
  } else {
    enterGame()
  }
}

function showReplaceConfirm() {
  login.hidden = true
  game.hidden = true
  wagerPage.hidden = true
  replaceConfirm.hidden = false
}

async function confirmReplaceDevice(confirmed: boolean) {
  replaceConfirm.hidden = true
  if (confirmed) {
    enterGame()
  } else {
    // Cerrar sesión anónima y volver a login
    await supabase.auth.signOut()
    localStorage.removeItem(`jimenapardy_team_${gameId}`)
    showLogin()
  }
}

function showLogin() {
  welcome.hidden = true
  login.hidden = false
  game.hidden = true
  wagerPage.hidden = true
  replaceConfirm.hidden = true
  loginError.textContent = ''
  ;(document.getElementById('team-password') as HTMLInputElement).value = ''
  ;(document.getElementById('team-name-input') as HTMLInputElement).focus()
}

async function enterGame() {
  welcome.hidden = true
  login.hidden = true
  game.hidden = false
  wagerPage.hidden = true
  replaceConfirm.hidden = true
  resetBuzzerUI()

  // Obtener estado inicial de la partida (fase actual, etc.)
  await fetchInitialGameState()
}

async function fetchInitialGameState() {
  const { data, error } = await supabase.rpc('get_game_state', { p_game_id: gameId! })
  if (error) {
    console.error('Error fetching initial game state:', error)
    return
  }
  const state = data as any
  if (state?.game) {
    handleGameChange({ new: state.game })
  }
}

function subscribeToGame() {
  supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, handleGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` }, handleTeamChange)
    .subscribe()
}

function handleGameChange(payload: any) {
  const g = payload.new as any
  if (!g) return

  currentPhase = g.phase || 'idle'

  updateBuzzerState(g)

  if (g.phase === 'awaitWager' && g.double_team_id === teamId) {
    showWager(g.wager_cap)
  } else if (g.phase !== 'awaitWager') {
    hideWager()
  }
}

function handleTeamChange(payload: any) {
  const t = payload.new as any
  if (!t || t.id !== teamId) return

  teamScoreEl.textContent = t.score.toString()
  // Actualizar localStorage
  const saved = localStorage.getItem(`jimenapardy_team_${gameId}`)
  if (saved) {
    const parsed = JSON.parse(saved)
    parsed.score = t.score
    localStorage.setItem(`jimenapardy_team_${gameId}`, JSON.stringify(parsed))
  }

  if (!t.active_device_token && !game.hidden) {
    statusText.textContent = 'Sesión cerrada desde otro dispositivo'
    setTimeout(() => {
      localStorage.removeItem(`jimenapardy_team_${gameId}`)
      showLogin()
    }, 2000)
  }
}

function updateBuzzerState(gameState: any) {
  const isDoubleReady = gameState.phase === 'doubleReady'
  const isWon = gameState.phase === 'won' || isDoubleReady
  const isWrong = gameState.phase === 'wrong'
  const isOpen = gameState.phase === 'open' || isWrong
  const isBlocked = gameState.phase === 'blocked' || gameState.phase === 'chooseDouble'

  const winnerId = isDoubleReady ? gameState.double_team_id : gameState.winner_team_id
  isWinner = winnerId === teamId

  buzzer.classList.remove('sent', 'winner')
  buzzer.disabled = false
  buzzer.textContent = 'BUZZER'

  if (isBlocked) {
    buzzer.disabled = true
    statusText.textContent = 'Buzzer bloqueado: esperando al moderador'
  } else if (isOpen) {
    statusText.textContent = '¡Buzzer libre! Pulsa para competir'
  } else if (isWon) {
    if (isWinner) {
      buzzer.classList.add('winner', 'sent')
      buzzer.textContent = '¡PRIMERO!'
      statusText.textContent = '¡Ganaste el buzzer! Espera la calificación.'
    } else {
      buzzer.classList.add('sent')
      buzzer.disabled = true
      buzzer.textContent = 'OCUPADO'
      statusText.textContent = 'Otro equipo ganó el buzzer'
    }
  } else if (gameState.phase === 'correct') {
    buzzer.disabled = true
    buzzer.textContent = 'BUZZER'
    statusText.textContent = 'Respuesta correcta. Esperando siguiente pregunta...'
  } else {
    buzzer.disabled = true
    statusText.textContent = 'Buzzer bloqueado'
  }
}

async function handleBuzz() {
  if (buzzer.disabled) return

  const now = Date.now()
  if (now < buzzCooldownUntil) return
  buzzCooldownUntil = now + 100

  buzzer.classList.add('sent')
  buzzer.textContent = 'ENVIADO'
  statusText.textContent = 'Enviando...'

  const { data, error } = await supabase.rpc('buzz', {
    p_game_id: gameId!,
    p_device_token: deviceToken
  })

  if (error) {
    console.error('Buzz error:', error)
    resetBuzzerUI()
    statusText.textContent = 'Error: ' + error.message
    return
  }

  const result = data as any
  if (!result.success) {
    if (result.early) {
      // Penalidad local: 2 segundos sin poder buzzear
      statusText.textContent = '⚠️ Muy temprano: penalizado 2s'
      buzzer.disabled = true
      buzzer.textContent = 'ESPERA...'
      setTimeout(() => {
        if (buzzer.disabled && currentPhase === 'blocked') {
          resetBuzzerUI()
        }
      }, 2000)
    } else {
      statusText.textContent = result.error || 'No se pudo pulsar'
      resetBuzzerUI()
    }
    return
  }

  if (result.winner) {
    isWinner = true
    buzzer.classList.add('winner', 'sent')
    buzzer.textContent = '¡PRIMERO!'
    statusText.textContent = result.daily_double ? '¡Daily Double! Confirma tu apuesta.' : '¡Ganaste el buzzer!'

    if (result.daily_double) {
      wagerCap = result.wager_cap
    }
  } else {
    resetBuzzerUI()
  }
}

function resetBuzzerUI() {
  buzzer.classList.remove('sent', 'winner')
  buzzer.disabled = false
  buzzer.textContent = 'BUZZER'
}

function showWager(cap: number) {
  wagerCap = cap
  wagerCapEl.textContent = `Máximo: $${cap}`
  wagerInput.max = cap.toString()
  wagerInput.value = cap > 0 ? cap.toString() : '0'
  wagerError.textContent = ''
  game.hidden = true
  wagerPage.hidden = false
  wagerTeamNameEl.textContent = `APUESTA DAILY DOUBLE — ${teamNameEl.textContent}`
  wagerInput.focus()
}

function hideWager() {
  wagerPage.hidden = true
  if (!game.hidden) return
  game.hidden = false
}

async function confirmWager() {
  const amount = parseInt(wagerInput.value, 10)
  if (isNaN(amount) || amount < 0 || amount > wagerCap) {
    wagerError.textContent = `Apuesta inválida (0–${wagerCap})`
    return
  }

  wagerError.textContent = 'Enviando...'

  const { data, error } = await supabase.rpc('confirm_wager', {
    p_game_id: gameId!,
    p_wager: amount
  })

  if (error) {
    wagerError.textContent = 'Error: ' + error.message
    return
  }

  hideWager()
}

function closeWager() {
  hideWager()
}

init()