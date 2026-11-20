import { supabase, getCurrentUser, getSession } from '../lib/supabase.js'
import { v4 as uuidv4 } from 'https://esm.sh/uuid@9.0.0'

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
let currentClue: any = null
let buzzCooldownUntil: number = 0

// Generar token único de dispositivo
function generateDeviceToken(): string {
  return 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
}

deviceToken = generateDeviceToken()
localStorage.setItem('jimenapardy_device_token', deviceToken)

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

  // Verificar sesión existente
  const session = await getSession()
  if (session?.user) {
    await checkTeamAndEnter(session.user.id)
  }

  setupEventListeners()
  subscribeToGame()
}

function setupEventListeners() {
  // Welcome -> Login
  document.getElementById('enter')!.addEventListener('click', () => {
    welcome.hidden = true
    login.hidden = false
    ;(document.getElementById('email') as HTMLInputElement).focus()
  })

  // Login form
  document.getElementById('login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = (document.getElementById('email') as HTMLInputElement).value.trim()
    const password = (document.getElementById('password') as HTMLInputElement).value

    if (!email || !password) {
      loginError.textContent = 'Escribe correo y contraseña.'
      return
    }

    loginError.textContent = ''

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        loginError.textContent = 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.'
      } else {
        loginError.textContent = 'Error: ' + error.message
      }
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) await checkTeamAndEnter(user.id)
  })

  // Registro (click largo en "Entrar" o tecla R)
  document.getElementById('enter')!.addEventListener('contextmenu', async (e) => {
    e.preventDefault()
    await registerNewCaptain()
  })

  // Buzzer
  buzzer.addEventListener('click', handleBuzz)

  // Teclas: Espacio/Enter para buzzer, Escape para cerrar apuesta
  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !game.hidden && !buzzer.disabled) {
      e.preventDefault()
      handleBuzz()
    }
    if (e.key === 'Escape' && !wagerPage.hidden) {
      closeWager()
    }
  })

  // Wager form
  document.getElementById('wager-form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    await confirmWager()
  })

  // Replace confirm
  document.getElementById('confirm-replace')!.addEventListener('click', async () => {
    await confirmReplaceDevice(true)
  })
  document.getElementById('cancel-replace')!.addEventListener('click', () => {
    confirmReplaceDevice(false)
  })
}

async function registerNewCaptain() {
  const email = prompt('Correo electrónico para registrar nuevo capitán:')
  if (!email) return

  const password = prompt('Contraseña (mín. 6 caracteres):')
  if (!password || password.length < 6) {
    alert('Contraseña muy corta')
    return
  }

  const teamName = prompt('Nombre del equipo (máx. 24 chars):')
  if (!teamName) return

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    alert('Error en registro: ' + error.message)
    return
  }

  if (data.user && !data.session) {
    alert('Registro exitoso. Revisa tu correo para confirmar la cuenta antes de entrar.')
    return
  }

  if (data.user) {
    await joinGameAsCaptain(data.user.id, teamName)
  }
}

async function checkTeamAndEnter(userId: string) {
  // Buscar si ya es capitán de esta partida
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('game_id', gameId!)
    .eq('auth_user_id', userId)
    .single()

  if (teams) {
    teamId = teams.id
    teamNameEl.textContent = teams.name.toUpperCase()
    teamScoreEl.textContent = teams.score.toString()
    await registerDevice()
    enterGame()
  } else {
    // Preguntar si quiere unirse como nuevo capitán
    const join = confirm('No eres capitán de esta partida. ¿Quieres unirte como nuevo equipo?')
    if (join) {
      const teamName = prompt('Nombre del equipo:')
      if (teamName) {
        await joinGameAsCaptain(userId, teamName)
      }
    } else {
      await supabase.auth.signOut()
      showLogin()
    }
  }
}

async function joinGameAsCaptain(userId: string, teamName: string) {
  const { data, error } = await supabase
    .from('teams')
    .insert({ game_id: gameId!, auth_user_id: userId, name: teamName.slice(0, 24) })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      alert('Ya existe un equipo con este usuario en la partida')
    } else if (error.message.includes('check constraint')) {
      alert('Máximo 5 equipos por partida')
    } else {
      alert('Error: ' + error.message)
    }
    return
  }

  teamId = data.id
  teamNameEl.textContent = data.name.toUpperCase()
  teamScoreEl.textContent = '0'
  await registerDevice()
  enterGame()
}

async function registerDevice() {
  const { data, error } = await supabase.rpc('register_device', {
    p_game_id: gameId!,
    p_device_token: deviceToken
  })

  if (error) throw error

  if (data.replaced) {
    // Mostrar confirmación de reemplazo
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
    // El RPC ya invalidó el dispositivo anterior, solo entrar
    enterGame()
  } else {
    // Volver a login
    showLogin()
  }
}

function showLogin() {
  welcome.hidden = true
  login.hidden = false
  game.hidden = true
  wagerPage.hidden = true
  replaceConfirm.hidden = true
  ;(document.getElementById('password') as HTMLInputElement).value = ''
}

function enterGame() {
  welcome.hidden = true
  login.hidden = true
  game.hidden = false
  wagerPage.hidden = true
  replaceConfirm.hidden = true
  resetBuzzerUI()
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
  currentClue = g.current_clue_id

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

  if (!t.active_device_token && !game.hidden) {
    // Dispositivo desactivado (reemplazado desde otro teléfono)
    statusText.textContent = 'Sesión cerrada desde otro dispositivo'
    setTimeout(() => showLogin(), 2000)
  }
}

function updateBuzzerState(gameState: any) {
  const isDoubleReady = gameState.phase === 'doubleReady'
  const isWon = gameState.phase === 'won' || isDoubleReady
  const isWrong = gameState.phase === 'wrong'
  const isOpen = gameState.phase === 'open' || isWrong
  const isBlocked = gameState.phase === 'blocked' || gameState.phase === 'chooseDouble'

  // Winner
  const winnerId = isDoubleReady ? gameState.double_team_id : gameState.winner_team_id
  isWinner = winnerId === teamId

  // Reset visual
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

  // Cooldown local 100ms
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
      statusText.textContent = result.error || 'El moderador no ha terminado de hablar'
    } else {
      statusText.textContent = result.error || 'No se pudo pulsar'
    }
    resetBuzzerUI()
    return
  }

  if (result.winner) {
    isWinner = true
    buzzer.classList.add('winner', 'sent')
    buzzer.textContent = '¡PRIMERO!'
    statusText.textContent = result.daily_double ? '¡Daily Double! Confirma tu apuesta.' : '¡Ganaste el buzzer!'

    if (result.daily_double) {
      wagerCap = result.wager_cap
      // El servidor cambiará a awaitWager y se mostrará via Realtime
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
  // El servidor actualiza phase a doubleReady via Realtime
}

init()