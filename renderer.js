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
let gameMode = "standard"; // standard | express | triplete
let tripleteActive = false;
let tripleteRevealTimer = null;
let answeringPlayer = null; // 🔥 chi ha prenotato
let tripleteIndex = 0;       // 0,1,2
let tripletePhrases = [];   // frasi dei 3 tabelloni
let finalRoundActive = false;
let finalRoundValue = 0;     // importo fisso (ruota + 1000)
let finalWheelLocked = false;
let buyingVowel = false;
let finalCountdownRunning = false;
let finalCountdownTimer = null;
let finalCountdownSeconds = 0;

/* FRASI GIÀ USATE (in tutta la partita) */
const usedPhrases = new Set();

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
  { label:"800€",   value:800,   color:"#3498db" },
  { label:"100€",  value:100,  color:"#2ecc71" },

  { label:"PASSA", value:"pass", color:"#ffffff", text:"#2b7cff" },

  { label:"EXPRESS", value:"express", color:"#7b1fa2" },

  { label:"150€",  value:150,  color:"#f1c40f", text:"#111" },
  { label:"200€",  value:200,  color:"#9b59b6" },

  { label:"BANCAROTTA", value:"bankrupt", color:"#000000", text:"#ffffff" },

  { label:"300€",  value:300,  color:"#e67e22" },
  { label:"400€",  value:400,  color:"#e84393" },
  { label:"EXPRESS", value:"express", color:"#7b1fa2" },
  { label:"100€",  value:100,  color:"#2ecc71" },

  { label:"JOLLY 500€", value:"jolly", bonus:500, color:"#00b894" },

  { label:"500€",  value:500,  color:"#fdcb6e", text:"#111" },
  { label:"200€",  value:200,  color:"#2ecc71" },

  { label:"EXPRESS", value:"express", color:"#7b1fa2" },
  { label:"400€",  value:400,  color:"#9b59b6" },

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

// Modal scelta modalità
const modeModal     = document.getElementById("modeModal");
const modeStandard  = document.getElementById("modeStandard");
const modeExpress   = document.getElementById("modeExpress");
const modeTriplete  = document.getElementById("modeTriplete");

// TRIPLETE button (per ora solo UI)
const reserveBtn = document.getElementById("reserveBtn");
// ROUND FINALE
const modeFinal = document.getElementById("modeFinal");


reserveBtn?.addEventListener("click", ()=>{
  if(!tripleteActive) return;

  // stop reveal
  if(tripleteRevealTimer){
    clearInterval(tripleteRevealTimer);
    tripleteRevealTimer = null;
  }

  answeringPlayer = null; // verrà scelto dopo
  showToast("📣 PRENOTATO! Scegli il giocatore");

  openTripletePlayerPicker();
});

function startTripleteReveal(){
  tripleteActive = true;

  // sicurezza
  if(tripleteRevealTimer){
    clearInterval(tripleteRevealTimer);
  }

  tripleteRevealTimer = setInterval(()=>{
    const hidden = [...document.querySelectorAll(".cell.hidden")];

    if(!hidden.length){
      clearInterval(tripleteRevealTimer);
      tripleteRevealTimer = null;
      return;
    }

    const cell = hidden[Math.floor(Math.random() * hidden.length)];
    cell.classList.remove("hidden");
    cell.classList.add("revealed");
  }, 900);
}


function startTripleteBoard(){
  console.log("TRIPLETE BOARD INDEX:", tripleteIndex);

  if(!tripletePhrases[tripleteIndex]){
    console.error("❌ Frase Triplete mancante", tripleteIndex);
    endTriplete();
    return;
  }


  usedLetters.clear();
  pendingJolly = null;
  currentSpinAmount = 0;
  consonantFoundThisTurn = false;

  currentPhrase = tripletePhrases[tripleteIndex];

  buildBoard(currentPhrase);

  // reset solo round
  players.forEach(p => p.round = 0);
  players.forEach((_,i)=>updatePlayerUI(i));

  showToast(`🎬 TRIPLETE ${tripleteIndex + 1}/3`);

  if(tripleteIndex < 2){
    startTripleteReveal();
  }else{
    startTripleteSuperFlash();
  }
}

function endTriplete(){
  tripleteActive = false;

  if(tripleteRevealTimer){
    clearInterval(tripleteRevealTimer);
    tripleteRevealTimer = null;
  }

  reserveBtn.style.display = "none";
  answeringPlayer = null;

  showToast("🏁 TRIPLETE COMPLETATO");

  setTimeout(()=>{
    askGameMode();
  }, 1500);
}

function startTripleteSuperFlash(){
  if(tripleteRevealTimer){
    clearInterval(tripleteRevealTimer);
    tripleteRevealTimer = null;
  }

  // tutte le celle con lettere (no spazi)
  const cells = [...document.querySelectorAll(".cell:not(.space)")];

  // sicurezza
  if(!cells.length) return;

  // tutte nascoste
  cells.forEach(c=>{
    c.classList.add("hidden");
    c.classList.remove("revealed");
  });

  // copia e shuffle delle celle da flashare
  let flashQueue = [...cells].sort(() => Math.random() - 0.5);

  let index = 0;

  tripleteRevealTimer = setInterval(()=>{

    // se finite → passo alla modalità normale
    if(index >= flashQueue.length){
      clearInterval(tripleteRevealTimer);
      tripleteRevealTimer = null;

      showToast("⚡ SUPER FLASH COMPLETATO");

      // 🔁 da qui in poi comportamento tabellone 1 e 2
      startTripleteReveal();
      return;
    }

    const cell = flashQueue[index];

    // flash ON
    cell.classList.remove("hidden");
    cell.classList.add("revealed");

    // flash OFF dopo breve tempo
    setTimeout(()=>{
      cell.classList.add("hidden");
      cell.classList.remove("revealed");
    }, 350);

    index++;

  }, 700);
}


function showModeModal(){
  modeModal?.classList.remove("hidden");
}

function hideModeModal(){
  modeModal?.classList.add("hidden");
}


async function startFromMode(mode) {

  console.log("🎮 MODALITÀ SCELTA:", mode);

  // ===== reset stato comune =====
  gameMode = mode;
  expressMode = false;
  buyingVowel = false;

  // stop timer triplete
  if (tripleteRevealTimer) {
    clearInterval(tripleteRevealTimer);
    tripleteRevealTimer = null;
  }

  tripleteActive = false;
  answeringPlayer = null;

  // chiude modale scelta modalità
  modeModal.classList.add("hidden");

  /* =====================================================
     🔴 ULTIMO ROUND
  ===================================================== */
  if (mode === "final") {

    finalRoundActive = true;
    finalRoundValue = 0;
    finalWheelLocked = false;

    reserveBtn.style.display = "none";
    showToast("🔴 ULTIMO ROUND");

    const data = await loadPhrases();
    const themeObj = pickRandom(data);

    themeEl.textContent = themeObj.theme || "ULTIMO ROUND";

    const phrase = pickUnusedPhrase(themeObj.phrases);
    if (!phrase) {
      showToast("⚠️ Nessuna frase disponibile");
      askGameMode();
      return;
    }

    currentPhrase = phrase;

    // reset stato round
    usedLetters.clear();
    currentSpinAmount = 0;
    consonantFoundThisTurn = false;
    pendingJolly = null;

    players.forEach(p => p.round = 0);
    players.forEach((_, i) => updatePlayerUI(i));

    buildBoard(currentPhrase);
    drawWheel();
    disableBuyVowel();

    // ruota attiva
    spinWheelBtn.removeAttribute("disabled");
    spinWheelBtn.style.opacity = "1";
    spinWheelBtn.style.pointerEvents = "auto";

    return;
  }

  /* =====================================================
     🟣 TRIPLETE
  ===================================================== */
  if (mode === "triplete") {

    tripleteActive = true;
    reserveBtn.style.display = "inline-block";
    tripleteIndex = 0;

    const data = await loadPhrases();
    const themeObj = pickRandom(data);

    themeEl.textContent = themeObj.theme || "TRIPLETE";

    tripletePhrases = [];

    for (let i = 0; i < 3; i++) {
      const phrase = pickUnusedPhrase(themeObj.phrases);
      if (!phrase) break;
      tripletePhrases.push(phrase);
    }

    if (tripletePhrases.length === 0) {
      showToast("⚠️ Nessuna frase per TRIPLETE");
      askGameMode();
      return;
    }

    startTripleteBoard();
    return;
  }

  /* =====================================================
     🟢 STANDARD / EXPRESS
  ===================================================== */
  reserveBtn.style.display = "none";
  finalRoundActive = false;

  await startNewRound();
}



// Listener
modeStandard.addEventListener("click", () => startFromMode("standard"));
modeExpress.addEventListener("click",  () => startFromMode("express"));
modeTriplete.addEventListener("click", () => startFromMode("triplete"));
modeFinal.addEventListener("click", () => startFromMode("final"));


// SCELTA GIOCATORE
function openTripletePlayerPicker(){
  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-box">
      <h2>Chi risponde?</h2>
      <div class="modal-actions">
        <button class="btn btn-primary" data-p="0">Giocatore 1</button>
        <button class="btn btn-primary" data-p="1">Giocatore 2</button>
        <button class="btn btn-primary" data-p="2">Giocatore 3</button>
      </div>
    </div>
  `;

  modal.querySelectorAll("button").forEach(btn=>{
    btn.onclick = ()=>{
      answeringPlayer = Number(btn.dataset.p);
      modal.remove();

      // apre popup soluzione standard
      solveBtn.click();
    };
  });

  document.body.appendChild(modal);
}

// COUNTDOWN 
function startFinalCountdown(seconds, onEnd){
  const el = document.getElementById("finalCountdown");

  // reset
  if(finalCountdownTimer){
    clearInterval(finalCountdownTimer);
    finalCountdownTimer = null;
  }
  finalCountdownRunning = false;

  finalCountdownSeconds = seconds;
  finalCountdownRunning = true;

  el.textContent = finalCountdownSeconds;
  el.classList.remove("hidden");

  finalCountdownTimer = setInterval(()=>{
    finalCountdownSeconds--;
    el.textContent = finalCountdownSeconds;

    if(finalCountdownSeconds <= 0){
      clearInterval(finalCountdownTimer);
      finalCountdownTimer = null;
      finalCountdownRunning = false;
      el.classList.add("hidden");
      onEnd?.();
    }
  }, 1000);
}


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
   FUNZIONE PER PRENDERE UNA FRASE NON USATA
====================================================== */

function pickUnusedPhrase(phrases){
  const available = phrases.filter(p => !usedPhrases.has(norm(p)));

  if (available.length === 0) {
    showToast("⚠️ Frasi terminate per questo tema");
    return null;
  }

  const phrase = pickRandom(available);
  usedPhrases.add(norm(phrase));

  return phrase;
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

  if (!finalRoundActive) {
    disableBuyVowel();
  }


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

function askGameMode(){
  modeModal.classList.remove("hidden");
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

function enableSpinWheel(){
  spinWheelBtn.removeAttribute("disabled");
  spinWheelBtn.style.opacity = "1";
  spinWheelBtn.style.pointerEvents = "auto";
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
      if(finalRoundActive){
      showToast("🔕 Vocale senza premio (ULTIMO ROUND)");
      buyingVowel = false;
      return;
    }
    }else{

    // 🔥 EXPRESS: vocale errata = bancarotta
    if(expressMode){
    showToast("💥 VOCALE ERRATA IN EXPRESS! BANCAROTTA TOTALE");

    players[currentPlayer].round = 0;
    players[currentPlayer].total = 0;

    updatePlayerUI(currentPlayer);

    expressMode = false;

    enableSpinWheel();   // 🔓
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

  // VOCALI
  if (isVowel(target)) {

    // 🔴 ULTIMO ROUND → vocali libere, senza premio
    if (finalRoundActive) {

      if (usedLetters.has(target)) {
        showWrongLetter(target);
        showToast("⚠️ Vocale già chiamata");
        nextPlayer();
        return { found: 0 };
      }

      usedLetters.add(target);

      let found = 0;
      document.querySelectorAll(".cell.hidden").forEach(c=>{
        if(norm(c.textContent) === target){
          c.classList.remove("hidden");
          c.classList.add("revealed");
          found++;
        }
      });

      if(found){
        showToast(`🔊 Vocale ${target} rivelata (nessun premio)`);
      }else{
        showToast("❌ Vocale non presente");
        nextPlayer();
      }

      return { found };
    }
    
    /* ======================================================
   TASTIERA MOBILE (iPhone / iPad)
====================================================== */
const mobileKeyboard = document.getElementById("mobileKeyboard");

if (mobileKeyboard) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  mobileKeyboard.innerHTML = "";

  letters.forEach(letter => {
    const btn = document.createElement("button");
    btn.textContent = letter;

    btn.addEventListener("click", () => {
      if (btn.classList.contains("used")) return;

      // usa ESATTAMENTE la stessa logica della tastiera fisica
      checkLetter(letter);

      btn.classList.add("used");
    });

    mobileKeyboard.appendChild(btn);
  });
}

    // STANDARD / EXPRESS
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

    /* =========================
       🟣 EXPRESS → ERRORE = BANCAROTTA TOTALE
    ========================= */
    if(expressMode){
      showToast("💥 BANCAROTTA TOTALE (EXPRESS)");

      players[currentPlayer].round = 0;
      players[currentPlayer].total = 0;
      players[currentPlayer].hasJolly = false;

      updatePlayerUI(currentPlayer);
      updateJollyUI();

      expressMode = false;
      turnPhase = "idle";

      enableSpinWheel();   // 🔓 SBLOCCA RUOTA
      nextPlayer();
      return { found: 0 };
    }

    /* =========================
       STANDARD
    ========================= */
    showToast("⚠️ Lettera già chiamata – turno perso");
    nextPlayer();
    return { found: 0 };
  }


  // deve aver girato la ruota (o essere in pending jolly che comunque setta currentSpinAmount)
  if (!finalRoundActive && currentSpinAmount <= 0) {
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
  if (!exists) {

    showWrongLetter(target);
    pendingJolly = null;
    currentSpinAmount = 0;

    /* =========================
       🟣 EXPRESS – ERRORE = BANCAROTTA TOTALE
    ========================= */
    if (expressMode) {
    showToast("💥 BANCAROTTA TOTALE (EXPRESS)");

    players[currentPlayer].round = 0;
    players[currentPlayer].total = 0;
    players[currentPlayer].hasJolly = false;

    updatePlayerUI(currentPlayer);
    updateJollyUI();

    // reset express
    expressMode = false;
    turnPhase = "idle";

    enableSpinWheel();   // 🔓 SBLOCCA RUOTA
    nextPlayer();
    return { found: 0 };
  }


    /* =========================
       STANDARD / ALTRE MODALITÀ
    ========================= */
    showToast("❌ Lettera non presente – passa il turno");
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

  /* =========================
 🔴 ULTIMO ROUND – CONSONANTI
  ========================= */
  if (finalRoundActive) {

    if (found > 0) {

      const win = finalRoundValue * found;

      players[currentPlayer].round += win;
      updatePlayerUI(currentPlayer);

      showToast(`🔥 +€${win} (ULTIMO ROUND)`);

      // ⏱ tempo reale fine reveal lettere
      const revealEndTime =
        totalFlashTime + (cells.length - 1) * REVEAL_DELAY;

      // ⏳ parte SOLO dopo che l’ultima lettera è visibile
      setTimeout(() => {
        startFinalCountdown(5, () => {
          showToast("⏭ Tempo scaduto");
          nextPlayer();
        });
      }, revealEndTime);

    } else {
      showToast("❌ Consonante errata");
      nextPlayer();
    }

    return { found };
  }


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

    // 🔴 ULTIMO ROUND → ferma countdown
    if(finalRoundActive && finalCountdownRunning){
      clearInterval(finalCountdownTimer);
      finalCountdownTimer = null;
      finalCountdownRunning = false;

      document.getElementById("finalCountdown")?.classList.add("hidden");
    }

    solutionInput.value = "";
    solveModal.classList.remove("hidden");
    solutionInput.focus();
  });

cancelSolve?.addEventListener("click", ()=>{
  solveModal.classList.add("hidden");

  if(tripleteActive){
    // se avevano prenotato e poi annullano, riprendo reveal
    answeringPlayer = null;
    startTripleteReveal();
  }
});


confirmSolve?.addEventListener("click", ()=>{
  const attempt = solutionInput.value || "";
  solveModal.classList.add("hidden");

  if(!attempt.trim()) return;

    if (norm(attempt) === norm(currentPhrase)) {
    revealAll();

    /* ======================
   🔴 ULTIMO ROUND – SOLUZIONE CORRETTA
    ====================== */
    if (finalRoundActive) {

      // trasferisce la manche nel totale
      players[currentPlayer].total += players[currentPlayer].round;
      players[currentPlayer].round = 0;

      updatePlayerUI(currentPlayer);

      showToast("🏆 SOLUZIONE CORRETTA! PREMI INCASSATI");

      finalRoundActive = false;
      finalWheelLocked = false;

      setTimeout(() => {
        askGameMode();
      }, 2500);

      return; // ⛔️ FERMA QUI
    }


    /* ======================
   🟣 TRIPLETE – SOLUZIONE
    ====================== */
    if (tripleteActive) {

      // stop reveal / superflash
      if(tripleteRevealTimer){
        clearInterval(tripleteRevealTimer);
        tripleteRevealTimer = null;
      }

      // assegna premio SOLO se prenotato
      if(answeringPlayer !== null){
        players[answeringPlayer].total += 1000;
        updatePlayerUI(answeringPlayer);
        showToast(`🏆 +1000€ a Giocatore ${answeringPlayer + 1}`);
      }else{
        showToast("🏆 Soluzione corretta!");
      }

      answeringPlayer = null;

      // AVANZA TABELLONE
      tripleteIndex++;

      // SE FINITI I 3 TABELLONI → END
      if(tripleteIndex >= 3){
        endTriplete();
        return;
      }

      // ALTRIMENTI PARTE IL PROSSIMO
      setTimeout(()=>{
        startTripleteBoard();
      }, 1200);

      return;
    }



  

    /* ======================
       STANDARD / EXPRESS
    ====================== */
    players[currentPlayer].total += players[currentPlayer].round + 1000;
    players[currentPlayer].round = 0;

    players.forEach((_, i) => updatePlayerUI(i));

    showToast("🎉 SOLUZIONE CORRETTA! +€1000");

    setTimeout(() => {
      const again = confirm(
        "👏 Complimenti!\nVuoi giocare un'altra manche?"
      );

      if (again) {
        askGameMode();
      }
    }, 5000);

  } else {
    showToast("❌ Soluzione errata");

    /* ======================
   🔴 ULTIMO ROUND – SOLUZIONE ERRATA
    ====================== */
    if (finalRoundActive) {

      showToast("❌ Soluzione errata – il tempo riparte");

  // 🔁 riparte countdown SOLO se ci sono lettere scoperte
  startFinalCountdown(5, () => {
    showToast("⏭ Tempo scaduto");
    nextPlayer();
  });

  return;

  }


    /* ======================
       TRIPLETE → riprende reveal
    ====================== */
    if (tripleteActive) {
      answeringPlayer = null;
      startTripleteReveal();
      return; // ⛔️ niente nextPlayer
    }

    /* ======================
       STANDARD / EXPRESS
    ====================== */
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

  const activeSlices = getActiveSlices();
  const slice = (2*Math.PI) / activeSlices.length;

  activeSlices.forEach((s, i)=>{
    const start = wheelAngle + i*slice;
    const end   = start + slice;

    ctx.beginPath();
    ctx.moveTo(cX,cY);
    ctx.arc(cX,cY,R,start,end);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();

    ctx.save();
    ctx.translate(cX,cY);
    ctx.rotate(start + slice/2);
    ctx.textAlign = "center";
    ctx.fillStyle = s.text || "#fff";
    ctx.font = "900 20px Arial";
    ctx.fillText(s.label, R - 75, 8);
    ctx.restore();
  });
}


function getActiveSlices(){
  return (gameMode === "express")
    ? slices
    : slices.filter(s => s.value !== "express");
}



/* ======================================================
   SPIN RUOTA
   - centra lo spicchio scelto sotto il puntatore (top)
====================================================== */
function spinWheel(){
  if (finalRoundActive && finalWheelLocked) {
    showToast("🔒 Ruota già impostata");
    return;
  }

  if(spinning) return;
  spinning = true;
  turnPhase = "idle";

  consonantFoundThisTurn = false;
  currentSpinAmount = 0;
  disableBuyVowel();

  const activeSlices = getActiveSlices();                 // ✅
  const index = Math.floor(Math.random() * activeSlices.length);
  const slice = (2*Math.PI) / activeSlices.length;        // ✅

  const targetAngle = (-Math.PI/2) - (index*slice + slice/2);
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

      wheelModal.classList.add("hidden");

      handleWheelResult(activeSlices[index]);             // ✅
    }
  }

  requestAnimationFrame(anim);
}



/* ======================================================
   RISULTATO RUOTA
   - mostra preview in basso a sinistra
   - BANCAROTTA = round + totale = 0 (SEMPRE)
====================================================== */
function handleWheelResult(r){

  /* ===============================
     🔴 ULTIMO ROUND – gestione ruota
  =============================== */
  if (finalRoundActive && !finalWheelLocked) {

    // ❌ PASSA o BANCAROTTA → rigira
    if (r.value === "pass" || r.value === "bankrupt") {
      showToast("🔄 PASSA/BANCAROTTA – rigira");
      setTimeout(() => spinWheel(), 700);
      return;
    }

    // ✅ IMPORTO VALIDO (numero o jolly)
    if (typeof r.value === "number" || r.value === "jolly") {

      const baseValue =
        r.value === "jolly"
          ? (r.bonus || 500)
          : r.value;

      finalRoundValue = baseValue + 1000;
      finalWheelLocked = true;

      currentSpinAmount = finalRoundValue;
      turnPhase = "consonant-ok";

      showToast(`🔴 ULTIMO ROUND: €${finalRoundValue}`);

      // 🔒 blocca ruota
      spinWheelBtn.setAttribute("disabled", "disabled");
      spinWheelBtn.style.opacity = "0.5";
      spinWheelBtn.style.pointerEvents = "none";

      showWheelPreview(`IMPORTO FINALE €${finalRoundValue}`);
      return;
    }
  }

  /* ===============================
     🎯 STANDARD / EXPRESS – IMPORTO
  =============================== */
  if (typeof r.value === "number") {

    currentSpinAmount = r.value;
    turnPhase = "spun";

    showToast(`🎯 IMPORTO: €${currentSpinAmount}`);
    showWheelPreview(`€${currentSpinAmount}`);
    return;
  }

  /* ===============================
     💥 BANCAROTTA — RESET TOTALE
  =============================== */
  if (r.value === "bankrupt") {
    showWheelPreview("💥 BANCAROTTA");

    // 🔁 possibilità uso Jolly
    if (players[currentPlayer].hasJolly) {
      askUseJolly(
        // ✅ USA JOLLY
        () => {
          players[currentPlayer].hasJolly = false;
          updateJollyUI();
          showToast("🎴 Jolly usato! Bancarotta evitata");
        },
        // ❌ NON USA JOLLY → RESET TOTALE
        () => {
          players[currentPlayer].round = 0;
          players[currentPlayer].total = 0; // 🔥 RESET TOTALE
          updatePlayerUI(currentPlayer);
          showToast("💥 BANCAROTTA TOTALE");
          nextPlayer();
        }
      );
      return;
    }

    // ❌ senza Jolly
    players[currentPlayer].round = 0;
    players[currentPlayer].total = 0; // 🔥 RESET TOTALE
    updatePlayerUI(currentPlayer);
    showToast("💥 BANCAROTTA TOTALE");

    expressMode = false;
    enableSpinWheel();   // 🔓

    nextPlayer();
    return;

  }

  /* ===============================
     ⏭ PASSA TURNO
  =============================== */
  if (r.value === "pass") {
    showWheelPreview("PASSA");

    if (players[currentPlayer].hasJolly) {
      askUseJolly(
        () => {
          players[currentPlayer].hasJolly = false;
          updateJollyUI();
          showToast("🎴 Jolly usato! Turno salvato");
        },
        () => {
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

  /* ===============================
     🟣 EXPRESS
  =============================== */
  if (r.value === "express") {

    if (gameMode !== "express") {
      showToast("⚠️ EXPRESS non attivo in questa manche");
      return;
    }

    expressMode = true;
    expressValue = 500;

    currentSpinAmount = expressValue;
    turnPhase = "consonant-ok";

    showToast("🟣 EXPRESS! Consonanti +500€, Vocali -500€, errore = BANCAROTTA");

    // 🔒 blocca ruota
    spinWheelBtn.setAttribute("disabled", "disabled");
    spinWheelBtn.style.opacity = "0.5";
    spinWheelBtn.style.pointerEvents = "none";
    return;
  }

  /* ===============================
     🎴 JOLLY
  =============================== */
  if (r.value === "jolly") {
    showWheelPreview("JOLLY");

    if (!jollyAvailable) {
      showToast("⚠️ Jolly già usato in partita");
      currentSpinAmount = 0;
      pendingJolly = null;
      return;
    }

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
   ⌨️ TASTIERA MOBILE (TOGGLE MANUALE)
====================================================== */
const mobileKeyboard = document.getElementById("mobileKeyboard");
const toggleKeyboardBtn = document.getElementById("toggleKeyboardBtn");

if (mobileKeyboard) {

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  letters.forEach(letter => {
    const btn = document.createElement("button");
    btn.textContent = letter;

    btn.addEventListener("click", () => {
      if (buyingVowel) {
        handleBoughtVowel(letter);
      } else {
        checkLetter(letter);
      }
    });

    mobileKeyboard.appendChild(btn);
  });
}

toggleKeyboardBtn?.addEventListener("click", () => {
  mobileKeyboard.classList.toggle("visible");

  toggleKeyboardBtn.textContent =
    mobileKeyboard.classList.contains("visible")
      ? "❌ CHIUDI TASTIERA"
      : "⌨️ APRI TASTIERA";
});

/* ======================================================
   NUOVA MANCHE (mantiene totali + jolly posseduti + jollyAvailable)
   - reset board, round, usedLetters
====================================================== */
async function startNewRound(){
  expressMode = false;     // 🔥 RESET SICURO
  turnPhase = "idle";      // 🔥 RESET FASE

  const data = await loadPhrases();
  const themeObj = pickRandom(data);

  themeEl.textContent = themeObj.theme || "FRASI";
  const phrase = pickUnusedPhrase(themeObj.phrases);
  if (!phrase) {
    askGameMode();
    return;
  }

  currentPhrase = phrase;


  usedLetters.clear();
  currentSpinAmount = 0;
  consonantFoundThisTurn = false;
  pendingJolly = null;

  players.forEach(p=>{
    p.round = 0;
  });

  buildBoard(currentPhrase);

  currentPlayer = 0;
  setActivePlayer(currentPlayer);
  players.forEach((_,i)=>updatePlayerUI(i));
  updateJollyUI();

  drawWheel();
  hideWheelPreview();
  disableBuyVowel();

  // 🔓 RIABILITA SEMPRE LA RUOTA A INIZIO MANCHE
  spinWheelBtn.removeAttribute("disabled");
  spinWheelBtn.style.opacity = "1";
  spinWheelBtn.style.pointerEvents = "auto";

}

/* ======================================================
   ⌨️ TASTIERA MOBILE (iPhone / iPad)
====================================================== */
const mobileKeyboard = document.getElementById("mobileKeyboard");

if (mobileKeyboard) {

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  letters.forEach(letter => {
    const btn = document.createElement("button");
    btn.textContent = letter;

    btn.addEventListener("click", () => {

      // se sto comprando una vocale
      if (buyingVowel) {
        handleBoughtVowel(letter);
        return;
      }

      // altrimenti consonante normale
      checkLetter(letter);
    });

    mobileKeyboard.appendChild(btn);
  });
}

/* ======================================================
   AVVIO PARTITA COMPLETA (reset totali e jolly)
====================================================== */
async function initGame(){
  // 🔁 ripristina frasi già usate (se presenti)
  const saved = JSON.parse(localStorage.getItem("usedPhrases") || "[]");
  saved.forEach(p => usedPhrases.add(p));

  const data = await loadPhrases();
  const themeObj = pickRandom(data);

  themeEl.textContent = themeObj.theme || "FRASI";
  const phrase = pickUnusedPhrase(themeObj.phrases);
  if (!phrase) {
    alert("Frasi terminate");
    return;
  }
  currentPhrase = phrase;


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

(async ()=>{
  await initGame();
  modeModal.classList.remove("hidden");
})();

window.addEventListener("beforeunload", () => {
  localStorage.setItem(
    "usedPhrases",
    JSON.stringify([...usedPhrases])
  );
});










