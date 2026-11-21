import questionsData from '../data/questions.json'

export type StaticClue = {
  category: string
  value: number
  question: string
  answer: string
  content_type: 'text' | 'image' | 'mixed'
  image_path?: string
  image_alt?: string
}

export type StaticGameData = {
  categories: string[]
  clues: StaticClue[]
  daily_double: StaticClue & { column_index: number }
}

/**
 * Carga los datos estáticos de preguntas desde JSON
 */
export function loadStaticQuestions(): StaticGameData {
  const data = questionsData as any

  // Encontrar el Daily Double en las pistas
  const ddClue = data.clues.find((c: any) =>
    c.category === data.daily_double.category && c.value === data.daily_double.value
  )

  return {
    categories: data.categories,
    clues: data.clues,
    daily_double: {
      ...data.daily_double,
      column_index: data.categories.indexOf(data.daily_double.category)
    }
  }
}

/**
 * Genera las 25 pistas para create_game RPC usando datos estáticos
 * Asigna column_index basado en la categoría
 */
export function generateCluesForGame(): Array<{
  column_index: number
  value: number
  question_text: string
  is_daily_double: boolean
  content_type: 'text' | 'image' | 'mixed'
  image_path: string | null
  image_alt: string | null
}> {
  const staticData = loadStaticQuestions()

  return staticData.clues.map(clue => ({
    column_index: staticData.categories.indexOf(clue.category),
    value: clue.value,
    question_text: clue.question,
    is_daily_double: clue.category === staticData.daily_double.category &&
                     clue.value === staticData.daily_double.value,
    content_type: clue.content_type,
    image_path: clue.image_path || null,
    image_alt: clue.image_alt || null
  }))
}

/**
 * Obtiene categorías en orden
 */
export function getCategories(): string[] {
  return loadStaticQuestions().categories
}

/**
 * Obtiene info del Daily Double para el moderador
 */
export function getDailyDoubleInfo(): { category: string; value: number; column_index: number } {
  const dd = loadStaticQuestions().daily_double
  return { category: dd.category, value: dd.value, column_index: dd.column_index }
}