/* ======================================================
   RUOTA DELLA FORTUNA — renderer.js (COMPLETO)
   - Tabellone con celle e righe (wrap)
   - Ruota canvas con puntatore corretto (top = -PI/2)
   - Consonanti da tastiera
   - Vocali solo tramite "Compra vocale" (€250)
   - JOLLY 500: vinto solo se indovini consonante,
     poi spicchio diventa importo 500 (non sparisce)
   - JOLLY usabile per evitare PASSA/BANCAROTTA (prompt Sì/No)
   - Lettera già chiamata: sbarrata + toast
   - Consonanti finite / Vocali finite: toast
   - Soluzione: +1000 al TOTALE, poi "altra manche?" (mantiene totali)
   - Ruota: dopo spin chiude modale e mostra mini-preview in basso a sinistra
     (click preview -> riapre ruota)
====================================================== */


/* ======================================================
   STATO GIOCO (MODIFICA SOLO QUI IN FUTURO)
====================================================== */
let currentPhrase = "";
let usedLetters = new Set();        // contiene lettere NORMALIZZATE (A-Z)
let currentPlayer = 0;              // 0..2
let currentSpinAmount = 0;          // importo attivo per consonante
let consonantFoundThisTurn = false; // sblocca compra vocale
let pendingJolly = null;            // bonus jolly "in attesa" (500) valido solo se indovini consonante
let turnPhase = "idle";             // valori: // idle // spun // consonant-ok
let expressMode = false;       // true se il giocatore è in EXPRESS
let expressValue = 500;        // valore fisso consonanti

let buyingVowel = false;


/* jolly globale: una volta per tutta la partita */
let jollyAvailable = true;          // esiste ancora nella ruota come JOLLY (finché non vinto)
const JOLLY_BONUS = 500;            // valore bonus del jolly

/* giocatori */
const players = [
  { round: 0, total: 0, hasJolly:false },
  { round: 0, total: 0, hasJolly:false },
  { round: 0, total: 0, hasJolly:false }
];


/* ======================================================
   RUOTA CONFIG (2 PASSA + 2 BANCAROTTA NON vicini)
   - JOLLY: value="jolly" bonus=500
====================================================== */
let slices = [
  { label:"50€",   value:50,   color:"#3498db" },
  { label:"100€",  value:100,  color:"#2ecc71" },

  { label:"PASSA", value:"pass", color:"#ffffff", text:"#2b7cff" },

  { label:"150€",  value:150,  color:"#f1c40f", text:"#111" },
  { label:"200€",  value:200,  color:"#9b59b6" },

  { label:"BANCAROTTA", value:"bankrupt", color:"#000000", text:"#ffffff" },

  { label:"300€",  value:300,  color:"#e67e22" },
  { label:"400€",  value:400,  color:"#e84393" },
  { label:"100€",  value:100,  color:"#2ecc71" },

  { label:"JOLLY 500€", value:"jolly", bonus:500, color:"#00b894" },

  { label:"500€",  value:500,  color:"#fdcb6e", text:"#111" },
  { label:"200€",  value:200,  color:"#2ecc71" },

  { label:"EXPRESS", value:"express", color:"#7b1fa2" },

  { label:"PASSA", value:"pass", color:"#ffffff", text:"#2b7cff" },
  { label:"700€",  value:700,  color:"#2ecc71" },

  { label:"2000€", value:2000, color:"#d63031" },

  { label:"BANCAROTTA", value:"bankrupt", color:"#000000", text:"#ffffff" },
];


/* ======================================================
   ELEMENTI DOM
====================================================== */
const boardEl = document.getElementById("board");
const themeEl = document.getElementById("theme");

const openWheelBtn  = document.getElementById("openWheelBtn");
const wheelModal    = document.getElementById("wheelModal");
const spinWheelBtn  = document.getElementById("spinWheelBtn");
const closeWheelBtn = document.getElementById("closeWheelBtn");

const buyVowelBtn   = document.getElementById("buyVowelBtn");

const solveBtn      = document.getElementById("solveBtn");
const solveModal    = document.getElementById("solveModal");
const solutionInput = document.getElementById("solutionInput");
const confirmSolve  = document.getElementById("confirmSolve");
const cancelSolve   = document.getElementById("cancelSolve");

const canvas = document.getElementById("wheelCanvas");
const ctx = canvas.getContext("2d");


/* ======================================================
   UTIL / NORMALIZZAZIONE
====================================================== */
function pickRandom(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function norm(str){
  return String(str)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // rimuove accenti
    .replace(/\s+/g, " ")
    .trim();
}

function isVowel(letter){
  return ["A","E","I","O","U"].includes(letter);
}

function isConsonant(letter){
  return /^[A-Z]$/.test(letter) && !isVowel(letter);
}


/* ======================================================
   TOAST / WRONG LETTER
====================================================== */
function showToast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add("hide"), 1200);
  setTimeout(()=>t.remove(), 1700);
}

function showWrongLetter(letter){
  const el = document.createElement("div");
  el.className = "wrong-letter";
  el.textContent = letter;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1000);
}


/* ======================================================
   UI GIOCATORI
====================================================== */
function updatePlayerUI(i){
  const card = document.querySelector(`.player[data-player="${i}"]`);
  if(!card) return;

  card.querySelector(".player-round").textContent = `Manche: €${players[i].round}`;
  card.querySelector(".player-total").textContent = `Totale: €${players[i].total}`;
}

function setActivePlayer(i){
  document.querySelectorAll(".player").forEach(p => p.classList.remove("active"));
  document.querySelector(`.player[data-player="${i}"]`)?.classList.add("active");
  currentPlayer = i;
}

function nextPlayer(){
  consonantFoundThisTurn = false;
  currentSpinAmount = 0;
  pendingJolly = null;
  turnPhase = "idle";

  disableBuyVowel();

  setActivePlayer((currentPlayer + 1) % 3);
}

/* click su card per selezionare */
document.addEventListener("click", (e)=>{
  const card = e.target.closest(".player");
  if(card && card.dataset.player != null){
    setActivePlayer(Number(card.dataset.player));
  }
});

/* badge jolly */
function updateJollyUI(){
  document.querySelectorAll(".player").forEach((card, i)=>{
    let badge = card.querySelector(".jolly-badge");

    if(players[i].hasJolly){
      if(!badge){
        badge = document.createElement("div");
        badge.className = "jolly-badge";
        badge.textContent = "🎴 JOLLY";
        card.appendChild(badge);
      }
    }else{
      if(badge) badge.remove();
    }
  });
}


/* ======================================================
   FRASI — SOLO da data/phrases.json
====================================================== */
async function loadPhrases(){
  const res = await fetch("./data/phrases.json", { cache: "no-store" });

  if(!res.ok){
    console.error("❌ Errore caricamento data/phrases.json");
    alert("Errore: impossibile caricare le frasi del gioco.");
    throw new Error("phrases.json non trovato o non accessibile");
  }

  const data = await res.json();

  if(!Array.isArray(data) || data.length === 0){
    console.error("❌ phrases.json vuoto o formato errato", data);
    alert("Errore: phrases.json non contiene frasi valide.");
    throw new Error("phrases.json non valido");
  }

  return data;
}


/* VOCALI */

function enableBuyVowel(){
  if(!buyVowelBtn) return;

  buyVowelBtn.removeAttribute("disabled");   // 🔥 QUESTO È FONDAMENTALE
  buyVowelBtn.classList.remove("disabled");
  buyVowelBtn.style.pointerEvents = "auto";
  buyVowelBtn.style.opacity = "1";

  console.log("🟢 Compra vocale ABILITATA");
}

function disableBuyVowel(){
  if(!buyVowelBtn) return;

  buyVowelBtn.setAttribute("disabled", "disabled");
  buyVowelBtn.classList.add("disabled");
  buyVowelBtn.style.pointerEvents = "none";
  buyVowelBtn.style.opacity = "0.5";

  console.log("🔴 Compra vocale DISABILITATA");
}




/* ======================================================
   TABELLONE (wrap righe come prima)
====================================================== */
function buildBoard(phrase){
  boardEl.innerHTML = "";

  const words = phrase.split(" ");
  const maxCharsPerRow = 14;

  const rows = [];
  let currentRow = [];
  let currentLen = 0;

  words.forEach(word=>{
    if(currentLen + word.length <= maxCharsPerRow){
      currentRow.push(word);
      currentLen += word.length + 1;
    }else{
      rows.push(currentRow.join(" "));
      currentRow = [word];
      currentLen = word.length + 1;
    }
  });
  if(currentRow.length) rows.push(currentRow.join(" "));

  rows.forEach(rowText=>{
    const row = document.createElement("div");
    row.className = "board-row";

    rowText.split("").forEach(ch=>{
      const cell = document.createElement("div");

      if(ch === " "){
        cell.className = "cell space";
        cell.textContent = "";
      }else{
        cell.className = "cell hidden";
        cell.textContent = ch; // mantiene eventuali accenti, ma norm() li gestisce
      }

      row.appendChild(cell);
    });

    boardEl.appendChild(row);
  });
}

function revealAll(){
  document.querySelectorAll(".cell:not(.space)").forEach(cell=>{
    cell.classList.remove("hidden");
    cell.classList.add("revealed");
  });
}


/* ======================================================
   LETTERE DISPONIBILI (PER "FINITE")
====================================================== */
function remainingLettersOnBoard(){
  // lettere ancora nascoste (distinct) normalizzate
  const hidden = [...document.querySelectorAll(".cell.hidden")];
  const set = new Set(hidden.map(c => norm(c.textContent)));
  // rimuove roba non A-Z
  return [...set].filter(l => /^[A-Z]$/.test(l));
}

function remainingConsonants(){
  return remainingLettersOnBoard().filter(l => isConsonant(l));
}

function remainingVowels(){
  return remainingLettersOnBoard().filter(l => isVowel(l));
}

/*COMPRA VOCALE NEW */
function handleBoughtVowel(letter){
  const v = norm(letter);

  if(!isVowel(v)){
    showToast("❌ Devi digitare una vocale");
    return;
  }

  if(usedLetters.has(v)){
    showWrongLetter(v);
    showToast("⚠️ Vocale già chiamata");
    buyingVowel = false;
    return;
  }

  const vowelCost = expressMode ? 500 : 250;

  if(players[currentPlayer].round < vowelCost){
    showToast(`💸 Servono €${vowelCost} per la vocale`);
    buyingVowel = false;
    return;
  }

  // scala costo
  players[currentPlayer].round -= vowelCost;

  updatePlayerUI(currentPlayer);

  usedLetters.add(v);

  let found = 0;
  document.querySelectorAll(".cell.hidden").forEach(c=>{
    if(norm(c.textContent) === v){
      c.classList.remove("hidden");
      c.classList.add("revealed");
      found++;
    }
  });

  if(found){
    showToast(`🔊 Vocale ${v}: ${found} trovate`);
    }else{

    // 🔥 EXPRESS: vocale errata = bancarotta
    if(expressMode){
      showToast("💥 VOCALE ERRATA IN EXPRESS! BANCAROTTA");

      players[currentPlayer].round = 0;
      updatePlayerUI(currentPlayer);

      expressMode = false;

      // 🔓 riabilita la ruota
      spinWheelBtn.removeAttribute("disabled");
      spinWheelBtn.style.opacity = "1";
      spinWheelBtn.style.pointerEvents = "auto";

      buyingVowel = false;
      nextPlayer();
      return;
    }

    // comportamento standard
    showToast(`❌ Nessuna ${v} – turno perso`);
    setTimeout(()=>{
      nextPlayer();
    }, 800);
  }



  buyingVowel = false;
}



/* ======================================================
   LETTERE — CONSONANTI DA TASTIERA
   - Serve uno spin valido (currentSpinAmount > 0)
   - Vocali bloccate (si comprano)
   - Lettera già chiamata -> sbarrata + toast
   - Consonanti finite -> toast
====================================================== */
function checkLetter(letterRaw){
  const target = norm(letterRaw);

  // solo A-Z
  if(!/^[A-Z]$/.test(target)) return { found: 0 };

  // se consonanti finite
  if(isConsonant(target) && remainingConsonants().length === 0){
    showToast("✅ Consonanti finite");
    return { found: 0 };
  }

  // vocali da tastiera bloccate
  if(isVowel(target)){
    if(remainingVowels().length === 0){
      showToast("✅ Vocali finite");
      return { found: 0 };
    }
    showToast("🔒 Le vocali si comprano (€250)");
    return { found: 0 };
  }

  // lettera già chiamata
  if(usedLetters.has(target)){
    showWrongLetter(target);
    showToast("⚠️ Lettera già chiamata");
    return { found: 0 };
  }

  // deve aver girato la ruota (o essere in pending jolly che comunque setta currentSpinAmount)
  if(currentSpinAmount <= 0){
    showToast("⚠️ Devi prima girare la ruota");
    return { found: 0 };
  }

  // segna come usata
  usedLetters.add(target);

  // controlla se esiste nel tabellone
  const allCells = document.querySelectorAll(".cell:not(.space)");
  let exists = false;

  allCells.forEach(c=>{
    if(norm(c.textContent) === target) exists = true;
  });

  // se NON esiste: sbagliata → turno passa + perdi pendingJolly (se era uscito)
  if(!exists){

    showWrongLetter(target);
    pendingJolly = null;
    currentSpinAmount = 0;

    // 🔥 EXPRESS: errore = bancarotta immediata
    if(expressMode){
      showToast("💥 ERRORE IN EXPRESS! BANCAROTTA");

      players[currentPlayer].round = 0;
      updatePlayerUI(currentPlayer);

      expressMode = false;

      // 🔓 riabilita la ruota
      spinWheelBtn.removeAttribute("disabled");
      spinWheelBtn.style.opacity = "1";
      spinWheelBtn.style.pointerEvents = "auto";

      nextPlayer();
      return { found: 0 };
    }

  // comportamento standard
  nextPlayer();
  return { found: 0 };
}


  // rivela solo celle hidden
  // celle corrette (ancora nascoste)
  const cells = [...document.querySelectorAll(".cell.hidden")]
    .filter(c => norm(c.textContent) === target);

  const FLASH_DELAY  = 600; // velocità sequenza BLU
  const REVEAL_DELAY = 600; // velocità sequenza REVEAL

  /* =========================
     FASE 1 — FLASH BLU
  ========================= */
  cells.forEach((cell, index) => {
    setTimeout(() => {
      cell.classList.add("flash");
    }, index * FLASH_DELAY);
  });

  /* =========================
     FASE 2 — REVEAL LETTERE
     parte solo dopo TUTTI i flash
  ========================= */
  const totalFlashTime = cells.length * FLASH_DELAY;

  cells.forEach((cell, index) => {
    setTimeout(() => {
      cell.classList.remove("flash");
      cell.classList.remove("hidden");
      cell.classList.add("revealed", "reveal");
    }, totalFlashTime + index * REVEAL_DELAY);
  });

  const found = cells.length;



  // premio standard
  const win = expressMode
  ? expressValue * found
  : currentSpinAmount * found;
  players[currentPlayer].round += win;
  updatePlayerUI(currentPlayer);
  showToast(`💰 +€${win}`);

  // abilita compra vocale nel turno
  consonantFoundThisTurn = true;
  turnPhase = "consonant-ok";   // ✅ FASE CORRETTA
  enableBuyVowel();



  // se era pendingJolly → ora vinci anche il jolly e trasformi lo spicchio
  if(pendingJolly){
    players[currentPlayer].hasJolly = true;
    updateJollyUI();

    const idx = slices.findIndex(s => s.value === "jolly");
    if(idx !== -1){
      slices[idx] = {
        label: `${pendingJolly}€`,
        value: pendingJolly,
        color:"#00b894",
        text:"#fff"
      };
    }

    jollyAvailable = false;
    pendingJolly = null;

    drawWheel();
    showToast("🎴 JOLLY vinto!");
  }


  return { found };
}


/* ======================================================
   INPUT DA TASTIERA
   - blocca se modale soluzione aperta
   - blocca se stai scrivendo dentro input
====================================================== */
document.addEventListener("keydown", (e)=>{
  if(!solveModal.classList.contains("hidden")) return;

  const el = document.activeElement;
  if(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

  const raw = e.key;
  if(!raw || raw.length !== 1) return;

  // accetta lettere incluse accentate -> norm() le riporta a A-Z
  if(!/^[a-zA-ZÀÈÉÌÒÙàèéìòù]$/.test(raw)) return;

  const letter = raw.toUpperCase();

// se sto comprando una vocale
if(buyingVowel){
  handleBoughtVowel(letter);
  return;
}

// altrimenti consonanti normali
checkLetter(letter);

});


/* ======================================================
   COMPRA VOCALE (€250)
   - solo dopo consonante indovinata nello stesso turno
   - serve almeno €250 in manche
   - vocali finite -> toast
   - se vocale già chiamata -> toast + sbarrata
   - se vocale non presente -> perdi 250 ma NON passi turno (standard)
====================================================== */
buyVowelBtn?.addEventListener("click", (e)=>{
  e.preventDefault();
  e.stopPropagation();

  if(turnPhase !== "consonant-ok"){
    showToast("⚠️ Devi prima indovinare una consonante");
    return;
  }

  if(players[currentPlayer].round < 250){
    showToast("💸 Non hai €250 per comprare una vocale");
    return;
  }

  buyingVowel = true;
  showToast("🔤 Digita una VOCALE (A E I O U)");
});



/* ======================================================
   SOLUZIONE (MODALE)
   - se corretta: +1000 al TOTALE + incassa manche
   - chiede: "vuoi giocare un'altra manche?"
   - se sì: nuova manche mantenendo TOTALE (e jolly posseduti)
====================================================== */
solveBtn?.addEventListener("click", ()=>{
  solutionInput.value = "";
  solveModal.classList.remove("hidden");
  solutionInput.focus();
});

cancelSolve?.addEventListener("click", ()=>{
  solveModal.classList.add("hidden");
});

confirmSolve?.addEventListener("click", ()=>{
  const attempt = solutionInput.value || "";
  solveModal.classList.add("hidden");

  if(!attempt.trim()) return;

  if(norm(attempt) === norm(currentPhrase)){
    revealAll();

    // incasso + bonus soluzione
    players[currentPlayer].total += players[currentPlayer].round + 1000;
    players[currentPlayer].round = 0;

    players.forEach((_,i)=>updatePlayerUI(i));

    showToast("🎉 SOLUZIONE CORRETTA! +€1000");

    // ⏱ attesa scenica prima della domanda
    setTimeout(()=>{
      const again = confirm(
        "👏 Complimenti!\nVuoi giocare un'altra manche?"
      );

      if(again){
        startNewRound();
      }
    }, 5000);

  }else{
    showToast("❌ Soluzione errata: passa turno");
    nextPlayer();
  }
});


/* ======================================================
   JOLLY “USA O NO” (POPUP)
====================================================== */
function askUseJolly(onYes, onNo){
  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-box">
      <h2>🎴 Vuoi usare il Jolly?</h2>
      <p>Puoi evitare questo effetto.</p>
      <div class="modal-actions">
        <button id="jollyYes" class="btn btn-primary">SÌ</button>
        <button id="jollyNo" class="btn">NO</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#jollyYes").onclick = ()=>{
    modal.remove();
    onYes();
  };

  modal.querySelector("#jollyNo").onclick = ()=>{
    modal.remove();
    onNo();
  };
}


/* ======================================================
   MINI-PREVIEW RUOTA (BOTTOM-LEFT)
   - dopo lo spin: chiude modale e mostra preview
   - click preview -> riapre ruota
====================================================== */
let wheelPreviewEl = null;

function ensureWheelPreview(){
  if(wheelPreviewEl) return;

  wheelPreviewEl = document.createElement("div");
  wheelPreviewEl.id = "wheelPreview";
  wheelPreviewEl.style.position = "fixed";
  wheelPreviewEl.style.right = "14px";
  wheelPreviewEl.style.bottom = "120px"; // ⬅️ prima era 14px
  wheelPreviewEl.style.left = "auto";
  wheelPreviewEl.style.zIndex = "2000";
  wheelPreviewEl.style.padding = "10px 12px";
  wheelPreviewEl.style.borderRadius = "14px";
  wheelPreviewEl.style.border = "2px solid rgba(43,124,255,.95)";
  wheelPreviewEl.style.background = "rgba(17,17,17,.92)";
  wheelPreviewEl.style.fontWeight = "900";
  wheelPreviewEl.style.cursor = "pointer";
  wheelPreviewEl.style.display = "none";
  wheelPreviewEl.style.userSelect = "none";
  wheelPreviewEl.title = "Clicca per riaprire la ruota";

  wheelPreviewEl.addEventListener("click", ()=>{
    wheelModal.classList.remove("hidden");
    wheelPreviewEl.style.display = "none";
  });

  document.body.appendChild(wheelPreviewEl);
}

function showWheelPreview(text){
  ensureWheelPreview();
  wheelPreviewEl.textContent = `🎡 ${text} (clicca)`;
  wheelPreviewEl.style.display = "block";
}

function hideWheelPreview(){
  if(!wheelPreviewEl) return;
  wheelPreviewEl.style.display = "none";
}


/* ======================================================
   RUOTA (CANVAS) — SELEZIONE SPICCCHIO CORRETTA
   Puntatore in alto = -PI/2.
====================================================== */
const W = canvas.width;
const H = canvas.height;
const cX = W/2;
const cY = H/2;
const R = 250;

let wheelAngle = 0;   // rotazione ruota in radianti
let spinning = false;

function drawWheel(){
  ctx.clearRect(0,0,W,H);

  const slice = (2*Math.PI) / slices.length;

  for(let i=0;i<slices.length;i++){
    const s = slices[i];
    const start = wheelAngle + i*slice;
    const end   = start + slice;

    // spicchio
    ctx.beginPath();
    ctx.moveTo(cX,cY);
    ctx.arc(cX,cY,R,start,end);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();

    // testo centrato nello spicchio
    ctx.save();
    ctx.translate(cX,cY);
    ctx.rotate(start + slice/2);
    ctx.textAlign = "center";
    ctx.fillStyle = s.text || "#fff";
    ctx.font = "900 20px Arial";
    ctx.fillText(s.label, R - 75, 8);
    ctx.restore();
  }

  // bordo esterno
  ctx.beginPath();
  ctx.arc(cX,cY,R,0,2*Math.PI);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}

drawWheel();


/* ======================================================
   SPIN RUOTA
   - centra lo spicchio scelto sotto il puntatore (top)
====================================================== */
function spinWheel(){
  if(spinning) return;
  spinning = true;
  turnPhase = "idle";


  // nuovo spin → reset stato turno
  consonantFoundThisTurn = false;
  currentSpinAmount = 0;
  disableBuyVowel();

  // scegli index random
  const index = Math.floor(Math.random() * slices.length);
  const slice = (2*Math.PI) / slices.length;

  // wheelAngle finale per mettere lo spicchio scelto sotto il puntatore in alto (-PI/2)
  const targetAngle = (-Math.PI/2) - (index*slice + slice/2);

  // giri extra per animazione
  const spins = 6 * 2*Math.PI;

  const start = wheelAngle;
  const end = targetAngle + spins;

  const startTime = performance.now();
  const duration = 3000;

  function anim(t){
    const p = Math.min((t - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);

    wheelAngle = start + (end - start) * ease;
    drawWheel();

    if(p < 1){
      requestAnimationFrame(anim);
    }else{
      wheelAngle = targetAngle;
      drawWheel();
      spinning = false;

      // chiudi modale ruota e mostra preview
      wheelModal.classList.add("hidden");

      // risultato corretto
      handleWheelResult(slices[index]);
    }
  }

  requestAnimationFrame(anim);
}


/* ======================================================
   RISULTATO RUOTA
   - mostra preview in basso a sinistra
====================================================== */
function handleWheelResult(r){

  // importo normale
  if(typeof r.value === "number"){
    currentSpinAmount = r.value;
    turnPhase = "spun";   // ✅
    showToast(`🎯 Importo: ${r.value}€`);
    showWheelPreview(`${r.label}`);
    return;
  }

  // bancarotta
  if(r.value === "bankrupt"){
    showWheelPreview("BANCAROTTA");

    if(players[currentPlayer].hasJolly){
      askUseJolly(
        ()=>{
          players[currentPlayer].hasJolly = false;
          updateJollyUI();
          showToast("🎴 Jolly usato! Bancarotta evitata");
        },
        ()=>{
          players[currentPlayer].round = 0;
          updatePlayerUI(currentPlayer);
          showToast("💥 BANCAROTTA");
          nextPlayer();
        }
      );
      return;
    }

    players[currentPlayer].round = 0;
    updatePlayerUI(currentPlayer);
    showToast("💥 BANCAROTTA");
    nextPlayer();
    return;
  }

  // passa
  if(r.value === "pass"){
    showWheelPreview("PASSA");

    if(players[currentPlayer].hasJolly){
      askUseJolly(
        ()=>{
          players[currentPlayer].hasJolly = false;
          updateJollyUI();
          showToast("🎴 Jolly usato! Turno salvato");
        },
        ()=>{
          showToast("⏭ PASSA TURNO");
          nextPlayer();
        }
      );
      return;
    }

    showToast("⏭ PASSA TURNO");
    nextPlayer();
    return;
  }

  // EXPRESS
if (r.value === "express") {

  expressMode = true;
  expressValue = 500;

  currentSpinAmount = expressValue; // valore fisso
  turnPhase = "consonant-ok";       // può subito chiamare lettere

  showToast("🟣 EXPRESS! Consonanti +500€, Vocali -500€, errore = BANCAROTTA");

  // 🔒 blocca la ruota
  spinWheelBtn.setAttribute("disabled", "disabled");
  spinWheelBtn.style.opacity = "0.5";
  spinWheelBtn.style.pointerEvents = "none";

  return;
}

  // jolly
  if(r.value === "jolly"){
    showWheelPreview("JOLLY");

    if(!jollyAvailable){
      showToast("⚠️ Jolly già usato in partita");
      currentSpinAmount = 0;
      pendingJolly = null;
      return;
    }

    // pending: vale come importo 500 SOLO se indovini consonante
    pendingJolly = r.bonus || JOLLY_BONUS;
    currentSpinAmount = pendingJolly;

    showToast(`🎴 JOLLY! Indovina una consonante per ${pendingJolly}€`);
    return;
  }
}


/* ======================================================
   MODALE RUOTA — APRI/CHIUDI/SPIN
====================================================== */
openWheelBtn?.addEventListener("click", ()=>{
  wheelModal.classList.remove("hidden");
  hideWheelPreview(); // se riapri manualmente, nascondo preview
});

closeWheelBtn?.addEventListener("click", ()=>{
  wheelModal.classList.add("hidden");
});

spinWheelBtn?.addEventListener("click", ()=>{
  spinWheel();
});


/* ======================================================
   NUOVA MANCHE (mantiene totali + jolly posseduti + jollyAvailable)
   - reset board, round, usedLetters
====================================================== */
async function startNewRound(){
  const data = await loadPhrases();
  const themeObj = pickRandom(data);

  themeEl.textContent = themeObj.theme || "FRASI";
  currentPhrase = pickRandom(themeObj.phrases);

  usedLetters.clear();
  currentSpinAmount = 0;
  consonantFoundThisTurn = false;
  pendingJolly = null;

  // reset SOLO round, non total
  players.forEach(p=>{
    p.round = 0;
  });

  buildBoard(currentPhrase);

  // parte il giocatore corrente (puoi cambiare se vuoi)
  setActivePlayer(currentPlayer);
  players.forEach((_,i)=>updatePlayerUI(i));
  updateJollyUI();

  drawWheel();
  hideWheelPreview();
  disableBuyVowel();


  console.log("Nuova manche - Frase:", currentPhrase);
}


/* ======================================================
   AVVIO PARTITA COMPLETA (reset totali e jolly)
====================================================== */
async function initGame(){
  const data = await loadPhrases();
  const themeObj = pickRandom(data);

  themeEl.textContent = themeObj.theme || "FRASI";
  currentPhrase = pickRandom(themeObj.phrases);

  usedLetters.clear();
  currentSpinAmount = 0;
  consonantFoundThisTurn = false;
  pendingJolly = null;

  // reset giocatori COMPLETO
  players.forEach(p=>{
    p.round = 0;
    p.total = 0;
    p.hasJolly = false;
  });

  // reset ruota: jolly disponibile
  jollyAvailable = true;

  buildBoard(currentPhrase);

  setActivePlayer(0);
  players.forEach((_,i)=>updatePlayerUI(i));
  updateJollyUI();

  drawWheel();
  hideWheelPreview();
  disableBuyVowel();


  console.log("Partita - Frase:", currentPhrase);
}

initGame();



