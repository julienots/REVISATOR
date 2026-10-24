# 📚⚡ Revisator

Application Android de révision : à partir de tes cours (texte, PDF, photo, dictée, transcription de vidéo ou de podcast), elle génère **fiches de révision, mots-clés avec définitions, formules et syntaxes, quiz, examens blancs et podcasts audio**, puis suit ce que tu as réellement acquis.

## 📲 Installer

1. Télécharge **[`dist/Revisator.apk`](dist/Revisator.apk)** sur ton téléphone Android (5.0 ou plus).
2. Ouvre le fichier et autorise « Installer des applications inconnues » si Android le demande.
3. Lance **Revisator**, puis « Essayer avec un exemple » pour découvrir l'app.

## ✨ Fonctionnalités

| | |
|---|---|
| 📥 **Importer un cours** | Coller du texte, fichier `.txt`/`.md`/`.html`, **PDF**, **photo** (mode IA), **dictée vocale**, lien + transcription de **vidéo / podcast**, ou « Partager vers Revisator » depuis une autre app |
| 📋 **Fiche de révision** | Résumé, points clés par partie, définitions, formules, dates et chiffres, « À retenir absolument » ; partageable |
| 🔑 **Mots-clés** | Terme + définition, en flashcards avec **répétition espacée** (boîtes de Leitner) |
| 🧮 **Syntaxes** | Formules, équations et code détectés automatiquement |
| ❓ **Quiz** | QCM, vrai/faux, textes à trous, avec explication de chaque réponse |
| 📝 **Examen blanc** | Questions ouvertes + QCM, chronomètre, **note sur 20** et liste de **ce qui n'est pas compris** |
| 🧠 **Technique Feynman** | Tu expliques le cours avec tes mots, l'app repère les notions oubliées |
| 🎧 **Podcast** | La fiche lue à voix haute (voix Android), vitesse réglable, musique de fond |
| 🧑‍🏫 **Choisir son prof** | Mme Douce (bienveillante), M. Rigueur (exigeant), Socrate (questionne), Prof Feynman (simplifie), Coach Max (motive), M. Blagues (humour) — ou pas de prof. Chaque prof a son ton et sa méthode conseillée |
| 🎯 **Modes d'apprentissage** | Active ceux que tu veux ; l'app mesure ta réussite dans chacun et **te recommande les plus efficaces pour toi** |
| ❌ **Carnet d'erreurs** | Chaque erreur est enregistrée avec la correction ; rejoue-les jusqu'à les réussir 2 fois d'affilée |
| 🎵 **Musique pour réviser** | Lo-fi, piano calme, pluie, bruit brun, ondes alpha binaurales — générées par l'app, sans Internet |
| 🍅 **Pomodoro** | 25/5 min (réglable), écran maintenu allumé, musique automatique |
| 📊 **Progression** | **Pourcentage d'acquisition** par cours et global (flashcards + quiz + examen), série de jours |
| 💾 **Données** | Tout reste sur le téléphone ; export / import de sauvegarde |

### Deux moteurs de génération

- **⚡ Hors-ligne (par défaut)** : analyse du texte (titres, définitions du type « X : … », « X est … », « On appelle X … », mots-clés fréquents, formules) — gratuit, instantané, sans compte.
- **✨ IA Claude (optionnel)** : ajoute ta clé API Anthropic dans *Profil*. Claude produit des fiches et quiz plus riches, des moyens mnémotechniques, lit les photos et PDF scannés, corrige tes examens comme un vrai prof et répond à tes questions dans « Demander au prof ». La clé est stockée uniquement sur ton téléphone.

## 🛠️ Développement

```
www/                  application (HTML/CSS/JS, sans framework)
  js/nlp.js           générateur hors-ligne (fiches, quiz, examen, correction)
  js/ai.js            mode IA (SDK Claude)
  js/audio.js         musiques génératives, synthèse et dictée vocales
  js/teachers.js      personnalités de profs et modes d'apprentissage
  vendor/vendor.js    SDK Claude + pdf.js empaquetés (tools/vendor)
android/              coque native (WebView + pont voix/dictée/partage)
build-apk.sh          construit dist/Revisator.apk
```

- Tester dans un navigateur : `cd www && python3 -m http.server` puis http://localhost:8000
- Reconstruire les dépendances JS : `cd tools/vendor && npm ci && npm run build`
- Construire l'APK (Debian/Ubuntu) :
  ```
  sudo apt-get install aapt dalvik-exchange apksigner zipalign android-sdk-platform-23 openjdk-17-jdk-headless
  ./build-apk.sh
  ```
  Le workflow GitHub Actions `.github/workflows/apk.yml` fait la même chose à chaque push et publie l'APK en artefact.

La clé de signature `android/revisator.keystore` (mot de passe `revisator`) est volontairement versionnée pour que chaque nouvelle version s'installe par-dessus la précédente. Pour une publication sur le Play Store, crée ta propre clé et passe-la via `KEYSTORE` / `KS_PASS`.
