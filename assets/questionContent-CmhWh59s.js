function x(t,a={}){const{maxWidth:e="100%",maxHeight:i="100%",showCheckerboard:c=!1,interactive:n=!1,onImageClick:g}=a,s=c?`background-image:
        linear-gradient(45deg, #1a2a5a 25%, transparent 25%),
        linear-gradient(-45deg, #1a2a5a 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1a2a5a 75%),
        linear-gradient(-45deg, transparent 75%, #1a2a5a 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;`:"",r=n?"cursor: pointer;":"",d=n&&g?`onclick="this.dispatchEvent(new CustomEvent('question-image-click'))"`:"",o=t.image_path?`https://wvaplnmcllwpioamgpct.supabase.co/storage/v1/object/public/question-images/${t.image_path}`:null;switch(t.content_type){case"image":return o?`
        <div class="question-media" style="width:${e};max-height:${i};${s}${r}${d}" data-content-type="image">
          <img src="${o}" alt="${t.image_alt||"Pregunta"}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%231a2a5a" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="12" fill="%23666" text-anchor="middle"%3EImagen no disponible%3C/text%3E%3C/svg%3E';this.alt='Imagen no cargada';" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
        </div>
      `:`<div class="question-media placeholder" style="width:${e};height:${i};${s}${r}display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;">${n?"Click para añadir imagen":"Sin imagen"}</div>`;case"mixed":return o?`
        <div class="question-media mixed" style="width:${e};max-height:${i};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
          <div class="image-wrapper" style="width:100%;height:60%;${s}display:flex;align-items:center;justify-content:center;overflow:hidden;${r}${d}" data-content-type="mixed-image">
            <img src="${o}" alt="${t.image_alt||"Pregunta"}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%231a2a5a" width="100" height="100"/%3E%3Ctext x="50" y="55" font-size="12" fill="%23666" text-anchor="middle"%3EImagen no disponible%3C/text%3E%3C/svg%3E';this.alt='Imagen no cargada';" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
          </div>
          <div class="question-text" style="width:100%;text-align:center;font-family:Anton,Impact,sans-serif;font-size:clamp(18px,3vw,28px);line-height:1.2;color:var(--gold-light);text-shadow:2px 2px #000;">${l(t.question_text)||'<span style="color:var(--muted)">Texto pendiente</span>'}</div>
        </div>
      `:`<div class="question-media mixed" style="width:${e};max-height:${i};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
          <div class="placeholder" style="${s}width:100%;height:60%;display:flex;align-items:center;justify-content:center;color:var(--muted);">${n?"Click para añadir imagen":"Sin imagen"}</div>
          <div class="question-text" style="width:100%;text-align:center;font-family:Anton,Impact,sans-serif;font-size:clamp(18px,3vw,28px);line-height:1.2;color:var(--gold-light);text-shadow:2px 2px #000;">${l(t.question_text)||'<span style="color:var(--muted)">Texto pendiente</span>'}</div>
        </div>`;case"text":default:return`
        <div class="question-media text-only" style="width:${e};max-height:${i};display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;">
          <div class="question-text" style="font-family:Anton,Impact,sans-serif;font-size:clamp(20px,3.5vw,32px);line-height:1.15;color:var(--gold-light);text-shadow:2px 2px #000;overflow-wrap:anywhere;">${l(t.question_text)||'<span style="color:var(--muted);font-family:Arial,sans-serif;font-size:16px;">Pregunta pendiente</span>'}</div>
        </div>
      `}}function l(t){const a=document.createElement("div");return a.textContent=t,a.innerHTML}function h(t){return{content_type:t.content_type||"text",question_text:t.question_text||"",image_path:t.image_path||null,image_alt:t.image_alt||null}}export{h as g,x as r};
