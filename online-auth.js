(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const client = window.tableVerteSupabase;
  if (!client) return;

  let currentUser = null;
  let currentRoomId = null;
  let roomChannel = null;
  const setMessage = (text, error = false) => {
    const node = $("onlineMessage");
    if (node) { node.textContent = text; node.style.color = error ? "#ff9b91" : ""; }
  };
  const parsePresets = (value, min, max) => {
    const values = value.split(/[ ,;]+/).map(Number).filter(n => Number.isFinite(n) && n >= min && n <= max);
    return [...new Set(values)].slice(0, 6);
  };
  const showLoggedIn = (user, displayName) => {
    currentUser = user;
    $("authForms").classList.add("hidden");
    $("onlineLoggedIn").classList.remove("hidden");
    $("authStatus").textContent = "Connecté";
    $("loggedInName").textContent = displayName || user.email || "Joueur";
  };
  const showLoggedOut = () => {
    currentUser = null;
    currentRoomId = null;
    $("authForms").classList.remove("hidden");
    $("onlineLoggedIn").classList.add("hidden");
    $("onlineLobby").classList.add("hidden");
    $("authStatus").textContent = "Non connecté";
    if (roomChannel) client.removeChannel(roomChannel);
    roomChannel = null;
  };
  async function loadAccount(user) {
    const { data: profile } = await client.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const { data: prefs } = await client.from("player_preferences").select("bet_buttons,raise_buttons").eq("user_id", user.id).maybeSingle();
    if (prefs) {
      $("cloudBetPresets").value = Array.isArray(prefs.bet_buttons) ? prefs.bet_buttons.join(", ") : "30, 50, 75";
      $("cloudRaisePresets").value = Array.isArray(prefs.raise_buttons) ? prefs.raise_buttons.join(", ") : "2, 3";
    }
    showLoggedIn(user, profile?.display_name || user.user_metadata?.display_name);
  }
  async function refreshLobby() {
    if (!currentRoomId) return;
    const [{ data: room, error: roomError }, { data: players, error: playersError }] = await Promise.all([
      client.from("poker_rooms").select("id,name,room_code,status,max_players,mode").eq("id", currentRoomId).single(),
      client.from("room_players").select("display_name,seat_number,is_host,status").eq("room_id", currentRoomId).neq("status", "left").order("seat_number")
    ]);
    if (roomError || playersError) { setMessage("Impossible d'actualiser le lobby : " + (roomError?.message || playersError?.message), true); return; }
    $("lobbyTitle").textContent = room.name;
    $("lobbyCode").textContent = room.room_code;
    $("lobbyPlayers").replaceChildren();
    (players || []).forEach(player => {
      const li = document.createElement("li");
      li.textContent = `Place ${player.seat_number} — ${player.display_name}${player.is_host ? " (hôte)" : ""}`;
      $("lobbyPlayers").append(li);
    });
    $("lobbyStatus").textContent = `${players.length} / ${room.max_players} joueurs · ${room.status === "lobby" ? "En attente du lancement" : room.status}`;
    $("onlineLobby").classList.remove("hidden");
  }
  async function enterRoom(roomId) {
    currentRoomId = roomId;
    await refreshLobby();
    if (roomChannel) client.removeChannel(roomChannel);
    roomChannel = client.channel("room-" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, refreshLobby)
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_rooms", filter: `id=eq.${roomId}` }, refreshLobby)
      .subscribe();
    $("onlineLobby").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $("signInForm").addEventListener("submit", async (event) => {
    event.preventDefault(); setMessage("Connexion en cours…");
    const { data, error } = await client.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginPassword").value });
    if (error) { setMessage(error.message, true); return; }
    await loadAccount(data.user); setMessage("Tu es connecté. Tu peux créer ou rejoindre une partie.");
  });
  $("signUpForm").addEventListener("submit", async (event) => {
    event.preventDefault(); setMessage("Création du compte…");
    const displayName = $("signupName").value.trim();
    const { data, error } = await client.auth.signUp({
      email: $("signupEmail").value.trim(), password: $("signupPassword").value,
      options: { data: { display_name: displayName } }
    });
    if (error) { setMessage(error.message, true); return; }
    if (data.session && data.user) {
      await loadAccount(data.user);
      setMessage("Compte créé et connecté. Bienvenue !");
    } else {
      setMessage("Compte créé. Vérifie ta boîte e-mail pour confirmer l'adresse, puis connecte-toi.");
    }
  });
  $("signOutBtn").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) { setMessage(error.message, true); return; }
    showLoggedOut(); setMessage("Déconnexion effectuée.");
  });
  $("savePreferencesBtn").addEventListener("click", async () => {
    if (!currentUser) return;
    const bet = parsePresets($("cloudBetPresets").value, 1, 500);
    const raise = parsePresets($("cloudRaisePresets").value, 1, 100);
    if (!bet.length || !raise.length) { $("preferencesMessage").textContent = "Entre au moins une valeur valide dans chaque champ."; return; }
    const { error } = await client.from("player_preferences").upsert({ user_id: currentUser.id, bet_buttons: bet, raise_buttons: raise, updated_at: new Date().toISOString() });
    $("preferencesMessage").textContent = error ? "Erreur : " + error.message : "Boutons enregistrés sur ton compte.";
  });
  $("createOnlineForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!currentUser) return;
    const small = Number($("onlineSmallBlind").value), big = Number($("onlineBigBlind").value), stack = Number($("onlineStartingStack").value);
    if (big < small || small <= 0 || stack <= 0) { setMessage("Vérifie les blinds et le tapis de départ.", true); return; }
    setMessage("Création de la partie…");
    const { data, error } = await client.rpc("create_room", {
      p_name: $("onlineRoomName").value.trim() || "Partie entre amis", p_mode: "online",
      p_small_blind: small, p_big_blind: big, p_starting_stack: stack,
      p_max_players: Number($("onlineMaxPlayers").value)
    });
    if (error) { setMessage("Création impossible : " + error.message, true); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.created_room_id) { setMessage("La partie a été créée, mais sa réponse est inattendue. Actualise le lobby.", true); return; }
    await enterRoom(row.created_room_id); setMessage("Partie créée ! Partage le code avec tes amis.");
  });
  $("joinOnlineForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!currentUser) return;
    const code = $("joinRoomCode").value.trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) { setMessage("Le code doit contenir 6 caractères (A–F et 0–9).", true); return; }
    setMessage("Recherche de la partie…");
    const { data, error } = await client.rpc("join_room", { p_code: code });
    if (error) { setMessage("Impossible de rejoindre : " + error.message, true); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.joined_room_id) { setMessage("Réponse inattendue du serveur.", true); return; }
    await enterRoom(row.joined_room_id); setMessage("Tu as rejoint la partie !");
  });
  $("refreshLobbyBtn").addEventListener("click", refreshLobby);
  $("leaveLobbyBtn").addEventListener("click", () => { currentRoomId = null; $("onlineLobby").classList.add("hidden"); if (roomChannel) client.removeChannel(roomChannel); roomChannel = null; setMessage("Tu as quitté l'affichage du lobby. Ton inscription à la partie est conservée pour permettre une reconnexion."); });
  $("copyRoomCodeBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("lobbyCode").textContent); setMessage("Code copié."); } catch { setMessage("Copie non disponible : sélectionne le code manuellement.", true); } });

  client.auth.getSession().then(async ({ data, error }) => {
    if (error) { setMessage(error.message, true); return; }
    if (data.session?.user) await loadAccount(data.session.user);
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) showLoggedOut();
  });
})();
