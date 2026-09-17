# Mobile Easy Use

**Beyond UI control. Deep runtime exploration.**

[English](../README.md) · [简体中文](./README.zh.md) · **Français** · [Русский](./README.ru.md) · [Español](./README.es.md) · [العربية](./README.ar.md)

Donnez aux agents IA accès au runtime des applications Android et iOS via MCP : inspecter les objets natifs et leur état, tracer et remplacer les appels de méthodes, contrôler l’interface et interagir directement avec une application en cours d’exécution.

La vidéo montre un agent IA qui utilise une application mobile, suit les chemins d’appel et mesure la durée d’exécution des méthodes.

https://github.com/user-attachments/assets/e956fdbf-da6a-4608-a877-11a107f70760

## Pourquoi l’exploration du runtime est importante dans le développement avec l’IA

Dans les projets complexes, le comportement dépend des données, de la configuration, du cache et de l’ordre des appels à l’exécution. Le code explique l’implémentation ; l’exploration du runtime révèle la branche réellement exécutée, l’état des objets et l’origine d’un échec. Ensemble, ils étayent les décisions de l’agent.

Les observations guident l’agent tout au long du cycle de développement :

- **Recherche et préparation** : rapprocher le code des appels, données et états de l’application en cours d’exécution pour comprendre son comportement réel.
- **Validation d’une approche technique** : modifier temporairement la configuration, des champs ou des retours de méthodes dans l’application en cours d’exécution, vérifier les hypothèses, puis restaurer les valeurs.
- **Diagnostic** : reproduire le problème dans l’application et relier les appels réels, les changements d’état et l’interface pour localiser l’échec.
- **Après modification** : exécuter l’application modifiée et rejouer le scénario pour vérifier le résultat réel. Les attentes confirmées peuvent devenir des tests de régression.

Par exemple, demandez à l’agent d’examiner une liste qui ne se met pas à jour :

```text
Utilise to-android-probe pour examiner pourquoi cette liste ne se met pas à jour après une requête réussie.
```

L’agent peut examiner les informations suivantes, selon la plateforme et l’implémentation de l’application :

| Information d'exécution | Ce qu'elle révèle |
| --- | --- |
| Objets métier et état | Données, cache, configuration et changements après une action |
| Appels de méthodes | Méthodes exécutées, arguments, valeurs de retour, piles d'appels et threads |
| Temps d'exécution et mémoire | Durée des méthodes et variation de la mémoire du processus |
| Journaux métier | Étape atteinte et indices expliquant un échec |
| État de l'interface | Présence, visibilité, position et propriétés des contrôles |
| Captures d'écran | Apparence réelle et changements visuels après une action |

## Tests UI automatisés enrichis

Mobile Easy Use peut aussi servir d’outil de tests UI automatisés enrichis. Son accès à l’état et au comportement internes de l’application permet, au-delà des interactions UI et des captures, de vérifier l’état métier, de contrôler le comportement à l’exécution et de diagnostiquer les échecs.

1. **Des vérifications plus approfondies** : vérifiez ensemble l’interface, les captures et l’état métier natif. Après une actualisation, contrôlez la liste affichée ainsi que les données internes et le cache.
2. **Des scénarios mieux maîtrisés** : remplacez temporairement des champs ou des retours de méthodes pour déclencher des données vides, des échecs ou des branches de configuration spécifiques.
3. **Des échecs plus faciles à expliquer** : reliez les appels réels, arguments, retours et changements d’état. Si une liste ne se met pas à jour, déterminez si les données ont été enregistrées ou si l’interface ne s’est pas actualisée.

### Exemple : un clic, trois niveaux de vérification

```text
Utilise to-android-test-script pour générer un test ApiDemo : cliquer sur FIRST, vérifier que le compteur vaut 1, que le bouton affiche FIRST:1 et que sa capture correspond à la référence.
```

Cela génère un fichier de test JavaScript, que vous pouvez ensuite exécuter avec `to-android-test`.

Exécutez depuis la page **UI → Class names and subclasses** dans son état initial, avec une capture de référence après clic vérifiée à `baselines/first-clicked.jpg`, relative au fichier de test.

```javascript
const { describe, test, expect, run } = Test.create();
export { run };

describe('Counter button', () => {
  test('updates state, UI, and appearance', async () => {
    const button = R.id.api_ui_class_first;
    const clicked = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(button));
    expect(clicked.ok).toBe(true);

    // État de l’interface
    await expect(button).toBeVisible();
    await expect(button).toSatisfy(view => String(view.getText()) === 'FIRST:1');

    // Capture
    await expect(button).toHaveElementScreenShot('baselines/first-clicked.jpg');

    // État métier natif : accéder aux types natifs, lire les champs ou appeler les getters
    const count = await AndroidExp.runOnMainThread(() => Java.use(
      'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState'
    ).getInstance().getClickCount());
    expect(Number(count)).toBe(1);
  });
});
```

## Démarrage

Prérequis : Node.js 20+. Android nécessite ADB et un appareil ou émulateur. iOS nécessite macOS, Xcode et ses outils en ligne de commande ; les appareils physiques nécessitent également `iproxy` et la signature du Runner XCTest.

### 1. Installer les Skills

Depuis la racine du projet de l'application :

```bash
npx skills add agent-easy-use/mobile-easy-use --skill '*'
```

### 2. Intégrer Mobile Easy Use

Demandez à l'agent d'utiliser `to-android-integrate` ou `to-ios-integrate`. Le Skill télécharge et vérifie les artefacts, configure le projet de debug et fournit la version MCP compatible. Compilez ensuite cette version et installez-la sur l'appareil cible.

### 3. Configurer MCP

Utilisez exactement la version retournée par le Skill Integrate (`0.1.0` n'est ici qu'un exemple) :

```json
{
  "mcpServers": {
    "mobile-easy-use": {
      "command": "npx",
      "args": ["-y", "@agent-easy-use/mobile-easy-use@0.1.0"]
    }
  }
}
```

Définissez le répertoire de travail MCP sur la racine du projet cible, rechargez la configuration et vérifiez que `get_sdk_declarations` et `connect` sont disponibles.

### 4. Explorer ou tester

Après avoir compilé et installé l'application intégrée, demandez à l'agent d'utiliser `to-android-probe` ou `to-ios-probe` et décrivez le problème en langage naturel. Probe combine le code source, les Presets et les observations du runtime pour exécuter l'enquête et analyser les preuves.

Pour générer des tests, utilisez [to-android-test-script](../skills/to-android-test-script/SKILL.md) ou [to-ios-test-script](../skills/to-ios-test-script/SKILL.md). Pour exécuter les fichiers existants et résumer les résultats, utilisez [to-android-test](../skills/to-android-test/SKILL.md) ou [to-ios-test](../skills/to-ios-test/SKILL.md).

```text
Génère des tests pour l'actualisation de la liste : interface, captures et données internes.
Exécute les tests du dossier tests et résume les réussites, échecs et cas non exécutés.
```

## Répertoire des Skills

| Capacité | Utilisation |
| --- | --- |
| **Observable** | Améliorer facultativement l'observabilité avec des changements locaux et très peu intrusifs |
| **Integrate** | Configurer l'intégration de debug et sélectionner une version MCP compatible |
| **Probe** | Étudier le runtime en langage naturel, de la génération du probe à l'analyse des preuves |
| **Test** | Générer des fichiers à partir d’attentes explicites, exécuter les tests et résumer les résultats |
| **Presets** | Transformer les actions et requêtes courantes en capacités réutilisables pour Probe et Test |

Consultez les [Skills Android](../skills/to-android-probe/SKILL.md) et [iOS](../skills/to-ios-probe/SKILL.md) pour les workflows complets.

### Réutiliser les capacités avec Presets

Presets regroupe la navigation, les actions métier, la lecture d'état et les remplacements temporaires pour Probe et Test. Utilisez les Skills Presets pour [Android](../skills/to-android-presets/SKILL.md) ou [iOS](../skills/to-ios-presets/SKILL.md).

`presets.directory` dans `.meu/config.json` définit le répertoire de base, par défaut `.meu/presets`, avec des sous-répertoires `android/` et `ios/`. Chaque capacité contient `index.js` et `index.d.ts`. `presets.entry.js` expose les capacités publiques ; la compilation produit `presets.dist.js`, chargé par MCP sous `/meu/presets.js` à la connexion.

Après une modification, reconstruisez le bundle et reconnectez-vous. Avec un appareil disponible, le Skill vérifie les capacités à l'exécution ; sinon, il signale que leur comportement reste à vérifier.

## Inspiration

Mobile Easy Use s'inspire de **quickjs-android**, **xLua** et **Frida**. Frida constitue sa base d'implémentation : le Runtime embarqué repose sur Frida Gadget et MCP utilise les ponts Java et Objective-C pour accéder aux objets de la plateforme.

Package npm : `@agent-easy-use/mobile-easy-use`.
