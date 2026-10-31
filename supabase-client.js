(() => {
  "use strict";
  const status = document.getElementById("cloudStatus");
  const message = document.getElementById("cloudMessage");
  const button = document.getElementById("testCloudBtn");

  if (!window.supabase || !window.TABLE_VERTE_SUPABASE_URL || !window.TABLE_VERTE_SUPABASE_KEY) {
    if (status) status.textContent = "Configuration manquante";
    if (message) message.textContent = "La bibliothèque ou la configuration Supabase n'a pas été chargée.";
    return;
  }

  const client = window.supabase.createClient(
    window.TABLE_VERTE_SUPABASE_URL,
    window.TABLE_VERTE_SUPABASE_KEY
  );
  window.tableVerteSupabase = client;

  button?.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Connexion en cours…";
    status.textContent = "Test en cours";
    message.textContent = "Communication avec Supabase…";
    try {
      const response = await fetch(
        `${window.TABLE_VERTE_SUPABASE_URL}/auth/v1/health`,
        { headers: { apikey: window.TABLE_VERTE_SUPABASE_KEY } }
      );
      if (!response.ok) throw new Error(`Réponse serveur : ${response.status}`);
      status.textContent = "Connecté";
      message.textContent = "Le serveur Supabase répond correctement. Prochaine étape : inscription et connexion des joueurs.";
    } catch (error) {
      console.error("Supabase connection test:", error);
      status.textContent = "Échec du test";
      message.textContent = "Impossible de contacter Supabase. Vérifie ta connexion Internet et la configuration.";
    } finally {
      button.disabled = false;
      button.textContent = "Tester à nouveau";
    }
  });
})();
