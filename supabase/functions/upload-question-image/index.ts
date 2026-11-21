import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 1. Obtener usuario autenticado (anon key + JWT en header)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Sin autorización' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuario no autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parsear FormData
    const formData = await req.formData()
    const file = formData.get('file') as File
    const gameId = formData.get('gameId') as string
    const clueId = formData.get('clueId') as string

    if (!file || !gameId || !clueId) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros: file, gameId, clueId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Validar archivo
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Tipo no permitido. Solo PNG, JPEG, WebP' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const maxSize = 5 * 1024 * 1024 // 5 MB
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: 'Archivo muy grande. Máximo 5 MB' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Verificar que el usuario es moderador de esta partida
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('moderator_id')
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return new Response(JSON.stringify({ error: 'Partida no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (game.moderator_id !== user.id) {
      return new Response(JSON.stringify({ error: 'No autorizado: solo el moderador puede subir imágenes' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Verificar que la pista existe y pertenece a la partida
    const { data: clue, error: clueError } = await supabase
      .from('clues')
      .select('id, image_path')
      .eq('id', clueId)
      .eq('game_id', gameId)
      .single()

    if (clueError || !clue) {
      return new Response(JSON.stringify({ error: 'Casilla no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Generar nombre único con UUID
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const fileName = `${crypto.randomUUID()}.${ext}`
    const storagePath = `games/${gameId}/clues/${clueId}/${fileName}`

    // 7. Subir a Storage (usando service_role para bypass RLS de escritura)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('question-images')
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Error subiendo imagen: ' + uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 8. Obtener URL pública (bucket es privado, pero generamos signed URL de larga duración)
    // Para lectura pública, el bucket debe tener policy de SELECT público
    // Alternativa: signed URL que expira en 1 año
    const { data: urlData } = await supabaseAdmin.storage
      .from('question-images')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1 año

    const imageUrl = urlData?.signedUrl

    // 9. Retornar info para que el frontend llame a update_clue_image RPC
    return new Response(JSON.stringify({
      success: true,
      storagePath,
      imageUrl,
      fileName,
      fileSize: file.size,
      mimeType: file.type,
      oldImagePath: clue.image_path,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Edge Function error:', err)
    return new Response(JSON.stringify({ error: 'Error interno: ' + err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})