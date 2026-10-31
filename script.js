(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const PHASES = ["Préflop", "Flop", "Turn", "River", "Abattage"];
  const state = {
    players: [], pot: 0, currentBet: 0, lastFullRaise: 0, currentPlayer: 0,
    dealer: 0, phaseIndex: 0, handNumber: 1, smallBlind: 25, bigBlind: 50, turnTimerSeconds: 30,
    startingStack: 2000, chipLabel: "jetons", gameName: "Partie du vendredi",
    history: [], snapshots: [], handClosed: false, roundActions: new Set(),
    lastAggressor: null, actionCount: 0, betPresets: [30, 50, 75], raisePresets: [2, 3]
  };
  let nextPlayerId = 1;
  let timerInterval = null, timerRemaining = 0, timerKey = "", timerExpiredForKey = "";
  const money = n => Math.max(0, Math.floor(n)).toLocaleString("fr-FR");
  const bb = n => `${(Math.max(0, Number(n) || 0) / state.bigBlind).toLocaleString("fr-FR", {maximumFractionDigits: 1})} BB`;
  const unit = () => state.chipLabel.toUpperCase();
  function parsePresets(value, fallback, min, max) {
    const values = String(value).split(/[;,\s]+/).map(Number).filter(v => Number.isFinite(v) && v >= min && v <= max);
    return [...new Set(values)].slice(0, 5).length ? [...new Set(values)].slice(0, 5) : fallback;
  }
  function setRaiseAmount(value) {
    const input = $("raiseAmount"), numeric = $("raiseAmountNumber");
    const min = Number(input.min), max = Number(input.max);
    const safe = Math.max(min, Math.min(max, Math.round(Number(value) || min)));
    input.value = String(safe); numeric.value = String(safe);
    $("raiseAmountLabel").textContent = money(safe);
    $("raiseBtn").textContent = state.currentBet > 0 ? `Relancer à ${money(safe)}` : `Miser ${money(safe)}`;
  }
  function renderQuickButtons(validTurn, maxTotal, minTotal) {
    const wrap = $("quickBetButtons"); wrap.innerHTML = "";
    const isRaise = state.currentBet > 0;
    const presets = isRaise ? state.raisePresets : state.betPresets;
    presets.forEach(value => {
      const button = document.createElement("button"); button.type = "button"; button.className = "quick-bet-button";
      let target;
      if (isRaise) {
        target = Math.round(state.currentBet * value);
        button.textContent = `${value}×`;
        button.title = `Relancer à ${money(target)} ${state.chipLabel}`;
      } else {
        target = Math.round(Math.max(state.pot, state.bigBlind) * value / 100);
        button.textContent = `${value}% pot`;
        button.title = `Miser ${money(target)} ${state.chipLabel}`;
      }
      target = Math.max(minTotal, Math.min(maxTotal, target));
      button.disabled = !validTurn || $("raiseBtn").disabled || target <= state.currentBet || target <= (current()?.streetBet || 0);
      button.addEventListener("click", () => setRaiseAmount(target));
      wrap.append(button);
    });
  }
  const active = () => state.players.filter(p => !p.folded && !p.eliminated);
  const canAct = () => state.players.filter(p => !p.folded && !p.eliminated && p.stack > 0);
  function calculatePots() { return PokerRules.calculateSidePots(state.players); }
  function refundUncalledExcess() {
    const unmatched = PokerRules.getUncalledExcess(state.players);
    if (!unmatched || unmatched.amount <= 0) return;
    const p = unmatched.player, amount = unmatched.amount;
    p.stack += amount;
    p.handBet -= amount;
    p.streetBet = Math.max(0, p.streetBet - amount);
    state.pot = Math.max(0, state.pot - amount);
    log(`${p.name} récupère ${money(amount)} ${state.chipLabel} non suivis`, amount);
  }
  function advanceBoardToShowdown() {
    while (state.phaseIndex < 4) state.phaseIndex++;
    state.handClosed = true;
    state.players.forEach(p => { p.streetBet = 0; p.acted = false; });
    state.currentBet = 0;
    log("Tous les tours de mise sont terminés — abattage");
    render(); openSettlement();
  }
  const current = () => state.players[state.currentPlayer];
  const log = (message, amount = null) => {
    state.history.unshift({message, amount, phase: PHASES[state.phaseIndex] || "Main"});
    if (state.history.length > 80) state.history.pop();
  };
  function showNotice(title, message, icon = "♠") {
    $("modalTitle").textContent = title; $("modalText").textContent = message;
    $("modalIcon").textContent = icon; $("noticeDialog").showModal();
  }
  function playerTemplate(name) {
    return { id: nextPlayerId++, name, stack: state.startingStack, streetBet: 0, handBet: 0, folded: false, allIn: false, eliminated: false, acted: false, lastActedBet: 0, lastActedRaiseSize: state.bigBlind, lastAction: "", dealer: false, smallBlind: false, bigBlind: false };
  }
  function renderPlayerInputs(names = ["Joueur 1", "Joueur 2", "Joueur 3", "Joueur 4"]) {
    $("playerInputs").innerHTML = "";
    names.forEach((name, i) => addPlayerInput(name, i));
    updatePlayerCount();
  }
  function addPlayerInput(name = "", index = null) {
    const count = $("playerInputs").children.length;
    if (count >= 9) return;
    const i = index ?? count;
    const row = document.createElement("div"); row.className = "player-input-row";
    const badge = document.createElement("span"); badge.className = "player-index"; badge.textContent = String(i + 1);
    const input = document.createElement("input"); input.type = "text"; input.maxLength = 24; input.required = true; input.value = name || `Joueur ${i + 1}`; input.setAttribute("aria-label", `Nom du joueur ${i + 1}`);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-player"; remove.textContent = "×"; remove.setAttribute("aria-label", "Retirer ce joueur");
    remove.addEventListener("click", () => { if ($("playerInputs").children.length <= 2) return showNotice("Minimum 2 joueurs", "Une partie nécessite au moins deux joueurs."); row.remove(); renumberInputs(); });
    row.append(badge, input, remove); $("playerInputs").append(row);
    renumberInputs();
  }
  function renumberInputs() {
    [...$("playerInputs").children].forEach((row, i) => {
      row.querySelector(".player-index").textContent = i + 1;
      row.querySelector("input").setAttribute("aria-label", `Nom du joueur ${i + 1}`);
    });
    updatePlayerCount();
  }
  function updatePlayerCount() {
    const n = $("playerInputs").children.length;
    $("playerCountLabel").textContent = `${n} joueur${n > 1 ? "s" : ""}`;
    $("addPlayerBtn").disabled = n >= 9;
  }
  function createGame(e) {
    e.preventDefault();
    const names = [...$("playerInputs").querySelectorAll("input")].map(i => i.value.trim());
    const stack = Number($("startingStack").value), sb = Number($("smallBlind").value), bb = Number($("bigBlind").value);
    if (names.length < 2 || names.length > 9 || names.some(n => !n)) return showNotice("Noms de joueurs", "Ajoutez entre 2 et 9 joueurs et renseignez chaque nom.");
    if (new Set(names.map(n => n.toLocaleLowerCase())).size !== names.length) return showNotice("Noms identiques", "Chaque joueur doit avoir un nom différent.");
    if (!Number.isSafeInteger(stack) || stack < 100 || !Number.isSafeInteger(sb) || !Number.isSafeInteger(bb) || sb < 1 || bb <= sb) return showNotice("Paramètres invalides", "Le tapis doit être d'au moins 100, la petite blinde positive et la grosse blinde supérieure à la petite.");
    state.startingStack = stack; state.smallBlind = sb; state.bigBlind = bb;
    state.chipLabel = $("chipLabel").value; state.gameName = $("gameName").value.trim() || "Partie de poker";
    state.turnTimerSeconds = Number($("turnTimer").value) || 0;
    state.betPresets = parsePresets($("betPresets").value, [30, 50, 75], 1, 300);
    state.raisePresets = parsePresets($("raisePresets").value, [2, 3], 1.1, 10);
    try { localStorage.setItem("tableVertePresets", JSON.stringify({bet: state.betPresets, raise: state.raisePresets})); } catch (_) {}
    state.players = names.map(playerTemplate); state.dealer = 0; state.handNumber = 1;
    state.history = []; state.snapshots = []; $("setupScreen").classList.add("hidden"); $("gameScreen").classList.remove("hidden");
    startHand(true);
  }
  function snapshot() {
    state.snapshots.push(JSON.stringify({
      players: state.players, pot: state.pot, currentBet: state.currentBet, lastFullRaise: state.lastFullRaise,
      currentPlayer: state.currentPlayer, dealer: state.dealer, phaseIndex: state.phaseIndex,
      handNumber: state.handNumber, history: state.history, handClosed: state.handClosed,
      roundActions: [...state.roundActions], lastAggressor: state.lastAggressor, actionCount: state.actionCount
    }));
    if (state.snapshots.length > 30) state.snapshots.shift();
  }
  function undo() {
    if (!state.snapshots.length) return showNotice("Rien à annuler", "Aucune action récente ne peut être annulée.");
    const prior = JSON.parse(state.snapshots.pop());
    Object.assign(state, prior, {roundActions: new Set(prior.roundActions)});
    timerKey = ""; timerExpiredForKey = ""; stopTurnTimer(); render();
  }
  function startHand(first = false) {
    stopTurnTimer(); timerKey = ""; timerExpiredForKey = "";
    const eligible = state.players.filter(p => p.stack > 0);
    state.players.forEach(p => { p.folded = p.stack <= 0; p.eliminated = p.stack <= 0; p.streetBet = 0; p.handBet = 0; p.allIn = false; p.acted = false; p.lastActedBet = 0; p.lastActedRaiseSize = state.bigBlind; p.lastAction = ""; p.dealer = false; p.smallBlind = false; p.bigBlind = false; });
    if (eligible.length < 2) {
      render();
      showNotice("Partie terminée", eligible.length ? `${eligible[0].name} remporte la partie !` : "Tous les tapis sont épuisés.", "🏆");
      return;
    }
    if (!first) {
      let next = state.dealer;
      do { next = (next + 1) % state.players.length; } while (state.players[next].stack <= 0);
      state.dealer = next; state.handNumber++;
    }
    state.pot = 0; state.currentBet = 0; state.lastFullRaise = state.bigBlind;
    state.phaseIndex = 0; state.handClosed = false; state.roundActions = new Set(); state.lastAggressor = null; state.actionCount = 0;
    state.players[state.dealer].dealer = true;
    const headsUp = eligible.length === 2;
    const sbIndex = headsUp ? state.dealer : nextEligible(state.dealer);
    const bbIndex = nextEligible(sbIndex);
    state.players[sbIndex].smallBlind = true; state.players[bbIndex].bigBlind = true;
    postBlind(sbIndex, state.smallBlind); postBlind(bbIndex, state.bigBlind);
    // The nominal big blind remains the amount to call even when the BB is short-stacked.
    state.currentBet = state.bigBlind;
    state.lastFullRaise = state.bigBlind;
    const firstToAct = headsUp ? sbIndex : nextEligible(bbIndex);
    state.currentPlayer = state.players[firstToAct].stack > 0 ? firstToAct : nextEligible(bbIndex);
    log(`Main #${state.handNumber} commencée`, null);
    log(`${state.players[sbIndex].name} poste la petite blinde`, Math.min(state.smallBlind, state.players[sbIndex].handBet));
    log(`${state.players[bbIndex].name} poste la grosse blinde`, Math.min(state.bigBlind, state.players[bbIndex].handBet));
    if (canAct().length <= 1) {
      const soleActor = canAct()[0];
      if (!soleActor || soleActor.streetBet >= state.currentBet) { advanceBoardToShowdown(); return; }
      state.currentPlayer = state.players.indexOf(soleActor);
    }
    render();
  }
  function nextEligible(from) {
    for (let step = 1; step <= state.players.length; step++) {
      const i = (from + step) % state.players.length;
      if (!state.players[i].folded && !state.players[i].eliminated && state.players[i].stack > 0) return i;
    }
    return from;
  }
  function postBlind(index, amount) {
    const p = state.players[index], actual = Math.min(amount, p.stack);
    p.stack -= actual; p.streetBet += actual; p.handBet += actual; state.pot += actual;
    if (p.stack === 0) p.allIn = true;
  }
  function beginAction() {
    if (state.handClosed || !current() || current().folded || current().eliminated || current().stack <= 0) return false;
    return true;
  }
  function pushSnapshot() { snapshot(); }
  function fold() {
    if (!beginAction()) return;
    const p = current();
    pushSnapshot(); p.folded = true; p.acted = true; p.lastActedBet = state.currentBet; p.lastAction = "Couché";
    log(`${p.name} se couche`); advanceAfterAction();
  }
  function checkCall() {
    if (!beginAction()) return;
    const p = current(), due = Math.max(0, state.currentBet - p.streetBet);
    pushSnapshot();
    if (due === 0) { p.acted = true; p.lastAction = "Check"; log(`${p.name} check`); }
    else {
      const paid = Math.min(due, p.stack);
      p.stack -= paid; p.streetBet += paid; p.handBet += paid; state.pot += paid;
      p.acted = true; p.lastAction = p.stack === 0 ? "À tapis" : "Suit";
      if (p.stack === 0) p.allIn = true;
      log(`${p.name} ${p.stack === 0 ? "suit à tapis" : "suit"}`, paid);
    }
    p.lastActedBet = state.currentBet; p.lastActedRaiseSize = state.lastFullRaise;
    advanceAfterAction();
  }
  function minRaiseTotal() {
    const p = current();
    if (!p) return state.bigBlind;
    if (state.currentBet === 0) return state.bigBlind;
    return state.currentBet + state.lastFullRaise;
  }
  function raise() {
    if (!beginAction()) return;
    const p = current(), total = Number($("raiseAmount").value);
    const maxTotal = p.streetBet + p.stack, due = Math.max(0, state.currentBet - p.streetBet);
    if (!PokerRules.isRaiseReopened(p, state.currentBet)) return showNotice("Relance non rouverte", "Une relance à tapis trop faible ne rouvre pas encore les relances pour vous. Vous pouvez suivre ou vous coucher.");
    if (!Number.isSafeInteger(total) || total <= state.currentBet || total > maxTotal) return showNotice("Mise invalide", "Choisissez une mise totale supérieure à la mise actuelle et ne dépassant pas votre tapis.");
    const minTotal = minRaiseTotal();
    if (total < minTotal && total !== maxTotal) return showNotice("Relance trop faible", `La relance minimale doit atteindre ${money(minTotal)} ${state.chipLabel}, sauf si vous êtes à tapis.`);
    pushSnapshot();
    const paid = total - p.streetBet;
    p.stack -= paid; p.streetBet = total; p.handBet += paid; state.pot += paid;
    const raiseSize = total - state.currentBet;
    if (raiseSize >= state.lastFullRaise) {
      state.lastFullRaise = raiseSize;
      state.players.forEach(other => { if (other !== p && !other.folded && !other.eliminated && other.stack > 0) other.acted = false; });
    }
    state.currentBet = total; state.lastAggressor = p.id; p.acted = true; p.lastActedBet = total; p.lastActedRaiseSize = state.lastFullRaise; p.lastAction = p.stack === 0 ? "À tapis" : (due === 0 ? "Mise" : "Relance");
    if (p.stack === 0) p.allIn = true;
    log(`${p.name} ${due === 0 ? "mise" : "relance"} à ${money(total)}`, paid);
    state.roundActions.add(p.id);
    advanceAfterAction();
  }
  function bettingRoundComplete() {
    const able = canAct();
    if (able.length === 0) return true;
    if (able.length === 1) return able[0].streetBet >= state.currentBet;
    return able.every(p => p.acted && p.streetBet === state.currentBet);
  }
  function advanceAfterAction() {
    state.actionCount++;
    if (active().length === 1) { awardUncontested(); return; }
    if (bettingRoundComplete()) {
      if (canAct().length <= 1) { advanceBoardToShowdown(); return; }
      endBettingRound(); return;
    }
    let next = state.currentPlayer;
    for (let step = 0; step < state.players.length; step++) {
      next = (next + 1) % state.players.length;
      const p = state.players[next];
      if (!p.folded && !p.eliminated && p.stack > 0 && (!p.acted || p.streetBet < state.currentBet)) {
        state.currentPlayer = next; render(); return;
      }
    }
    endBettingRound();
  }
  function endBettingRound() {
    state.players.forEach(p => { p.streetBet = 0; p.acted = false; p.lastActedBet = 0; p.lastActedRaiseSize = state.bigBlind; });
    state.currentBet = 0; state.lastFullRaise = state.bigBlind; state.roundActions = new Set();
    if (state.phaseIndex >= 3) {
      state.phaseIndex = 4; state.handClosed = true;
      log("Fin des enchères — abattage"); render(); openSettlement(); return;
    }
    state.phaseIndex++;
    if (canAct().length <= 1) { advanceBoardToShowdown(); return; }
    state.currentPlayer = nextEligible(state.dealer);
    log(`Passage à la phase ${PHASES[state.phaseIndex]}`); render();
  }
  function awardUncontested() {
    refundUncalledExcess();
    const winner = active()[0];
    winner.stack += state.pot;
    log(`${winner.name} remporte le pot sans contestation`, state.pot);
    state.pot = 0; state.handClosed = true; render();
    showNotice("Pot remporté", `${winner.name} remporte la main. Le pot lui a été ajouté au tapis.`, "🏆");
    $("endHandBtn").classList.remove("hidden");
  }
  function openSettlement() {
    refundUncalledExcess();
    render();
    const pots = calculatePots();
    const host = $("winnerChoices"); host.innerHTML = "";
    if (!pots.length && state.pot > 0) pots.push({ amount: state.pot, cap: 0, eligible: active() });
    pots.forEach((pot, index) => {
      const group = document.createElement("fieldset"); group.className = "pot-choice-group";
      const legend = document.createElement("legend");
      legend.textContent = pots.length > 1 ? `${index === 0 ? "Pot principal" : `Pot secondaire ${index}`} · ${money(pot.amount)} ${state.chipLabel}` : `Pot · ${money(pot.amount)} ${state.chipLabel}`;
      group.append(legend);
      const eligible = pot.eligible.length ? pot.eligible : active();
      eligible.forEach(p => {
        const label = document.createElement("label"); label.className = "winner-choice";
        const input = document.createElement("input"); input.type = "checkbox"; input.value = String(p.id); input.dataset.potIndex = String(index);
        if (eligible.length === 1) { input.checked = true; input.disabled = true; }
        const name = document.createElement("strong"); name.textContent = p.name;
        const stack = document.createElement("span"); stack.textContent = `${money(p.stack)} ${state.chipLabel}`;
        label.append(input, name, stack); group.append(label);
      });
      host.append(group);
    });
    $("settleText").textContent = pots.length > 1
      ? "Sélectionnez le ou les gagnants de chaque pot séparément. Les joueurs couchés ne peuvent pas remporter de pot ; les pots secondaires ne sont accessibles qu'aux joueurs ayant contribué à leur niveau."
      : `Pot de ${money(state.pot)} ${state.chipLabel}. Sélectionnez le ou les gagnants selon les cartes physiques. En cas de partage, le reste indivisible est attribué dans l'ordre des sièges.`;
    if (!$("settleDialog").open) $("settleDialog").showModal();
  }
  function settle(e) {
    e.preventDefault();
    const pots = calculatePots();
    if (!pots.length && state.pot > 0) pots.push({ amount: state.pot, cap: 0, eligible: active() });
    const groups = [...$("winnerChoices").querySelectorAll(".pot-choice-group")];
    if (!groups.length) return showNotice("Pot vide", "Aucun pot à attribuer.");
    let awarded = 0;
    for (let i = 0; i < groups.length; i++) {
      const pot = pots[i];
      const ids = [...groups[i].querySelectorAll("input:checked")].map(input => Number(input.value));
      if (!ids.length) return showNotice("Gagnant manquant", `Choisissez le ou les gagnants du pot ${i + 1}.`);
      const eligibleIds = new Set((pot?.eligible?.length ? pot.eligible : active()).map(p => p.id));
      if (ids.some(id => !eligibleIds.has(id))) return showNotice("Gagnant invalide", "Un joueur ne peut remporter un pot secondaire auquel il n'a pas contribué.");
      const winners = state.players.filter(p => ids.includes(p.id)).sort((a, b) => {
        const ai = state.players.indexOf(a), bi = state.players.indexOf(b), n = state.players.length;
        return ((ai - state.dealer - 1 + n) % n) - ((bi - state.dealer - 1 + n) % n);
      });
      const amount = pot?.amount ?? 0;
      const shares = PokerRules.splitPot(amount, winners.length);
      winners.forEach((p, j) => p.stack += shares[j]);
      awarded += amount;
      log(`${winners.map(p => p.name).join(" et ")} remporte${winners.length > 1 ? "nt" : ""} ${groups.length > 1 ? `le pot ${i + 1}` : "le pot"}`, amount);
    }
    if (awarded !== state.pot) log(`Vérification du pot : ${money(awarded)} attribués sur ${money(state.pot)}`);
    state.pot = 0; state.handClosed = true;
    $("settleDialog").close(); render(); $("endHandBtn").classList.remove("hidden");
  }
  function nextStreet() {
    if (state.handClosed) return;
    pushSnapshot();
    // Use the current action flow; this is a manual override for tables where all remaining players are all-in.
    state.players.forEach(p => { p.streetBet = 0; p.acted = false; });
    state.currentBet = 0; state.lastFullRaise = state.bigBlind;
    if (state.phaseIndex >= 3 || canAct().length <= 1) {
      state.phaseIndex = 4; state.handClosed = true; render(); openSettlement(); return;
    }
    state.phaseIndex++;
    state.currentPlayer = nextEligible(state.dealer);
    log(`Phase ${PHASES[state.phaseIndex]} lancée manuellement`);
    render();
  }
  function render() {
    $("gameNameLabel").textContent = state.gameName.toLocaleUpperCase();
    $("phaseLabel").textContent = PHASES[state.phaseIndex] || "Abattage";
    $("potValue").textContent = money(state.pot); $("potUnit").textContent = unit(); $("potBb").textContent = bb(state.pot);
    const callAmount = Math.max(0, state.currentBet - (current()?.streetBet || 0));
    $("toCallValue").textContent = `${money(callAmount)} ${state.chipLabel}`; $("toCallBb").textContent = bb(callAmount);
    $("currentBetValue").textContent = `${money(state.currentBet)} ${state.chipLabel}`; $("currentBetBb").textContent = bb(state.currentBet);
    $("blindValues").textContent = `${money(state.smallBlind)} / ${money(state.bigBlind)}`;
    $("blindBb").textContent = `${bb(state.smallBlind)} / ${bb(state.bigBlind)}`;
    $("seats").innerHTML = "";
    const n = state.players.length;
    state.players.forEach((p, i) => {
      const seat = document.createElement("div"); seat.className = "seat";
      if (i === state.currentPlayer && !state.handClosed && !p.folded && !p.eliminated && p.stack > 0) seat.classList.add("current");
      if (p.folded || p.eliminated) seat.classList.add("folded");
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      seat.style.left = `${50 + 37 * Math.cos(angle)}%`;
      seat.style.top = `${50 + 39 * Math.sin(angle)}%`;
      const name = document.createElement("div"); name.className = "seat-name"; name.textContent = p.name;
      const stack = document.createElement("div"); stack.className = "seat-stack"; stack.textContent = money(p.stack);
      const stackBb = document.createElement("div"); stackBb.className = "seat-bb"; stackBb.textContent = bb(p.stack);
      const detail = document.createElement("div"); detail.className = "seat-detail";
      detail.textContent = p.folded ? "Couché" : p.eliminated ? "Éliminé" : p.allIn ? "À tapis" : p.streetBet ? `Mise : ${money(p.streetBet)} · ${bb(p.streetBet)}` : "En jeu";
      seat.append(name, stack, stackBb, detail);
      if (p.dealer) { const b = document.createElement("span"); b.className = "seat-badge dealer"; b.textContent = "D · DONNEUR"; seat.append(b); }
      else if (p.smallBlind) { const b = document.createElement("span"); b.className = "seat-badge"; b.textContent = "SB"; seat.append(b); }
      else if (p.bigBlind) { const b = document.createElement("span"); b.className = "seat-badge"; b.textContent = "BB"; seat.append(b); }
      $("seats").append(seat);
    });
    const p = current(), validTurn = !!p && !state.handClosed && !p.folded && !p.eliminated && p.stack > 0;
    $("turnPlayerName").textContent = validTurn ? p.name : state.handClosed ? "Main terminée" : "En attente";
    $("turnEyebrow").textContent = validTurn ? "AU TOUR DE JOUER" : state.handClosed ? "ABATTAGE" : "EN ATTENTE";
    $("turnSubtitle").textContent = validTurn ? (Math.max(0, state.currentBet - p.streetBet) > 0 ? `Il vous faut ${money(Math.min(Math.max(0, state.currentBet - p.streetBet), p.stack))} ${state.chipLabel} pour suivre` : "Vous pouvez checker ou miser") : state.handClosed ? "Attribuez le pot pour continuer" : "En attente du prochain tour";
    $("turnPosition").textContent = `${state.players.filter(x => !x.folded && !x.eliminated).length} en jeu · Main #${state.handNumber}`;
    const due = validTurn ? Math.max(0, state.currentBet - p.streetBet) : 0;
    $("checkCallBtn").textContent = due > 0 ? `Suivre ${money(Math.min(due,p.stack))}` : "Checker";
    $("checkCallBtn").disabled = !validTurn;
    $("foldBtn").disabled = !validTurn;
    const maxTotal = validTurn ? p.streetBet + p.stack : state.bigBlind;
    const minTotal = validTurn ? Math.min(maxTotal, minRaiseTotal()) : state.bigBlind;
    const raiseInput = $("raiseAmount"); raiseInput.min = String(Math.max(1, Math.min(minTotal, maxTotal))); raiseInput.max = String(Math.max(raiseInput.min, maxTotal));
    raiseInput.step = String(Math.max(1, Math.min(state.bigBlind, 100)));
    if (Number(raiseInput.value) < Number(raiseInput.min) || Number(raiseInput.value) > Number(raiseInput.max)) raiseInput.value = raiseInput.min;
    $("raiseAmountNumber").min = raiseInput.min; $("raiseAmountNumber").max = raiseInput.max;
    $("raiseAmountNumber").value = raiseInput.value;
    $("raiseAmountLabel").textContent = money(Number(raiseInput.value));
    $("raiseLabel").textContent = state.currentBet > 0 ? "Mise totale à atteindre" : "Montant de la mise";
    $("raiseMinLabel").textContent = `Min. ${money(Number(raiseInput.min))}`;
    $("raiseMaxLabel").textContent = `Max. ${money(Number(raiseInput.max))}`;
    $("raiseBtn").textContent = state.currentBet > 0 ? `Relancer à ${money(Number(raiseInput.value))}` : `Miser ${money(Number(raiseInput.value))}`;
    const raiseReopened = validTurn && PokerRules.isRaiseReopened(p, state.currentBet);
    $("raiseBtn").disabled = !validTurn || !raiseReopened || Number(raiseInput.max) <= state.currentBet || Number(raiseInput.max) <= p?.streetBet;
    $("raiseAmount").disabled = !validTurn || $("raiseBtn").disabled;
    $("raiseAmountNumber").disabled = !validTurn || $("raiseBtn").disabled;
    renderQuickButtons(validTurn, Number(raiseInput.max), Number(raiseInput.min));
    $("nextStreetBtn").classList.add("hidden");
    $("endHandBtn").classList.toggle("hidden", !state.handClosed);
    $("undoBtn").disabled = state.snapshots.length === 0;
    $("tableHint").textContent = state.handClosed ? "Main terminée — attribuez le pot puis lancez la suivante" : "Les cartes sont distribuées physiquement";
    renderCards(); renderHistory(); updateTurnTimer();
  }
  function stopTurnTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }
  function updateTurnTimer() {
    const p = current();
    const valid = !!p && !state.handClosed && !p.folded && !p.eliminated && p.stack > 0 && state.turnTimerSeconds > 0;
    const box = $("timerBox");
    if (!valid) {
      stopTurnTimer(); timerKey = ""; box.classList.add("hidden"); box.classList.remove("urgent");
      $("timerValue").textContent = state.turnTimerSeconds || "—"; return;
    }
    box.classList.remove("hidden");
    const key = `${state.handNumber}:${state.phaseIndex}:${p.id}:${state.actionCount}`;
    if (key !== timerKey) {
      stopTurnTimer(); timerKey = key; timerRemaining = state.turnTimerSeconds;
      box.classList.remove("urgent");
      $("timerValue").textContent = String(timerRemaining);
      timerInterval = setInterval(() => {
        if (timerKey !== key || state.handClosed) { stopTurnTimer(); return; }
        timerRemaining -= 1;
        $("timerValue").textContent = String(Math.max(0, timerRemaining));
        if (timerRemaining <= 5) box.classList.add("urgent");
        if (timerRemaining <= 0) {
          stopTurnTimer();
          if (timerExpiredForKey !== key && current() && !state.handClosed) {
            timerExpiredForKey = key;
            log(`Temps écoulé pour ${current().name} — couché automatiquement`);
            fold();
          }
        }
      }, 1000);
    } else {
      $("timerValue").textContent = String(Math.max(0, timerRemaining));
      box.classList.toggle("urgent", timerRemaining <= 5);
    }
  }
  function renderCards() {
    const host = $("communityCards"); host.innerHTML = "";
    const faceCount = state.phaseIndex === 0 ? 0 : state.phaseIndex === 1 ? 3 : state.phaseIndex === 2 ? 4 : state.phaseIndex >= 3 ? 5 : 0;
    for (let i = 0; i < 5; i++) {
      const card = document.createElement("div"); card.className = "playing-card card-back";
      card.textContent = i < faceCount ? "·" : "♠";
      card.setAttribute("aria-label", i < faceCount ? `Carte commune ${i + 1} distribuée physiquement` : "Emplacement de carte commune");
      host.append(card);
    }
    // Les cartes sont physiques : aucun rang ni couleur fictif n'est affiché.
  }
  function renderHistory() {
    const list = $("historyList"); list.innerHTML = "";
    if (!state.history.length) { const li = document.createElement("li"); li.className = "empty-history"; li.textContent = "Les actions apparaîtront ici."; list.append(li); return; }
    state.history.slice(0, 12).forEach(item => {
      const li = document.createElement("li"), left = document.createElement("span"), right = document.createElement("span");
      left.textContent = item.message; right.textContent = item.amount === null ? item.phase : `+${money(item.amount)} ${state.chipLabel}`;
      li.append(left, right); list.append(li);
    });
  }
  function newGame() {
    stopTurnTimer(); timerKey = "";
    if (!$("gameScreen").classList.contains("hidden") && state.actionCount > 0 && !confirm("Revenir au paramétrage ? La partie en cours sera perdue.")) return;
    $("gameScreen").classList.add("hidden"); $("setupScreen").classList.remove("hidden");
  }
  $("setupForm").addEventListener("submit", createGame);
  $("addPlayerBtn").addEventListener("click", () => addPlayerInput());
  $("newGameBtn").addEventListener("click", newGame);
  $("previewBtn").addEventListener("click", () => {
    const shell = document.querySelector(".app-shell");
    const enabled = !shell.classList.contains("phone-preview");
    shell.classList.toggle("phone-preview", enabled);
    document.body.classList.toggle("preview-background", enabled);
    $("previewBtn").setAttribute("aria-pressed", String(enabled));
    $("previewBtn").textContent = enabled ? "↗ Quitter l’aperçu" : "▣ Aperçu téléphone";
    if (enabled) window.scrollTo({top: 0, behavior: "smooth"});
  });
  $("modalOk").addEventListener("click", () => $("noticeDialog").close());
  $("foldBtn").addEventListener("click", fold);
  $("checkCallBtn").addEventListener("click", checkCall);
  $("raiseBtn").addEventListener("click", raise);
  $("raiseAmount").addEventListener("input", () => {
    $("raiseAmountNumber").value = $("raiseAmount").value;
    $("raiseAmountLabel").textContent = money(Number($("raiseAmount").value));
    $("raiseBtn").textContent = state.currentBet > 0 ? `Relancer à ${money(Number($("raiseAmount").value))}` : `Miser ${money(Number($("raiseAmount").value))}`;
  });
  $("raiseAmountNumber").addEventListener("input", () => {
    const value = Number($("raiseAmountNumber").value);
    if (!Number.isFinite(value)) return;
    $("raiseAmount").value = String(Math.max(Number($("raiseAmount").min), Math.min(Number($("raiseAmount").max), value)));
    $("raiseAmountLabel").textContent = money(Number($("raiseAmount").value));
    $("raiseBtn").textContent = state.currentBet > 0 ? `Relancer à ${money(Number($("raiseAmount").value))}` : `Miser ${money(Number($("raiseAmount").value))}`;
  });
  $("undoBtn").addEventListener("click", undo);
  $("nextStreetBtn").addEventListener("click", nextStreet);
  $("endHandBtn").addEventListener("click", () => {
    if (!state.handClosed) return showNotice("Main en cours", "Terminez les enchères avant d'attribuer le pot.");
    startHand(false);
  });
  $("settleForm").addEventListener("submit", settle);
  $("cancelSettleBtn").addEventListener("click", () => $("settleDialog").close());
  $("clearHistoryBtn").addEventListener("click", () => { state.history = []; renderHistory(); });
  renderPlayerInputs();
  try {
    const saved = JSON.parse(localStorage.getItem("tableVertePresets") || "null");
    if (saved) {
      if (Array.isArray(saved.bet)) $("betPresets").value = saved.bet.join(", ");
      if (Array.isArray(saved.raise)) $("raisePresets").value = saved.raise.join(", ");
    }
  } catch (_) {}
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
})();