# Mobile Easy Use

**Un outil pour les développeurs Android et iOS qui donne aux agents IA accès au runtime pour explorer, déboguer et exécuter des tests UI automatisés.**

Documentation : [English](../README.md) · [简体中文](./README.zh.md) · **Français** · [Русский](./README.ru.md) · [Español](./README.es.md) · [العربية](./README.ar.md)

Par rapport au Web, il est plus difficile d'examiner les données internes, l'état métier et l'exécution d'une application mobile. **« La requête a réussi, pourquoi la liste ne s'est-elle pas mise à jour ? »** Ce type de problème dépend des données, de l'état et de la chronologie réels sur l'appareil, que l'analyse statique du code source ne suffit souvent pas à expliquer.

Mobile Easy Use donne aux agents IA un accès au runtime via MCP. Ils peuvent rapprocher le code source du comportement réel de l'application, lire les objets et l'état, intercepter les appels de méthodes, modifier temporairement les conditions d'exécution, puis manipuler et inspecter l'interface.

https://github.com/user-attachments/assets/e956fdbf-da6a-4608-a877-11a107f70760

## Explorer l'état et le comportement de l'application

Pour une même action, l'agent peut relier l'exécution des méthodes, les changements de données et le résultat affiché :

| Information d'exécution | Ce qu'elle révèle |
| --- | --- |
| Objets métier et état | Données, cache, configuration et changements après une action |
| Appels de méthodes | Méthodes exécutées, arguments, valeurs de retour, piles d'appels et threads |
| Temps d'exécution et mémoire | Durée des méthodes et variation de la mémoire du processus |
| Journaux métier | Étape atteinte et indices expliquant un échec |
| État de l'interface | Présence, visibilité, position et propriétés des contrôles |
| Captures d'écran | Apparence réelle et changements visuels après une action |
| Ressources de l'application | Identifiants et contenus des ressources Android |
| Résultats et contexte d'échec | Étape de l'échec, état, journaux et images collectés |

Les informations disponibles dépendent de la plateforme et de l'implémentation de l'application.

Ces observations accompagnent l'agent tout au long du développement :

- **Recherche et préparation** : relier les appels, les données et l'état réels au code source pour comprendre l'implémentation.
- **Validation d'une approche technique** : modifier temporairement la configuration, des champs ou des valeurs de retour pour vérifier les hypothèses, puis les restaurer.
- **Diagnostic** : relier les appels, l'état métier et l'interface pour localiser le problème.
- **Après modification** : rejouer le scénario pour vérifier le résultat. Les attentes confirmées peuvent devenir des tests de régression.

Par exemple, demandez à l'agent :

```text
Examine cette page contrôlée par un paramètre : vérifie la configuration
et le chemin d'exécution, puis change temporairement le paramètre pour
observer les données et l'interface dans les deux cas. Restaure-le ensuite.
Évalue l'approche à partir des preuves et précise ce qui reste à vérifier.
```

## Également pour les tests UI automatisés

Les mêmes capacités permettent des tests UI plus approfondis : cliquer, saisir et faire défiler, puis vérifier **l'interface, les captures et l'état métier natif** dans un même test. Après une actualisation, vérifiez à la fois la liste affichée et les données internes. Les remplacements temporaires préparent les conditions du test ; les observations expliquent les échecs.

Comparaison avec des tests centrés sur les interactions et les assertions d'interface :

| Tâche | Tests centrés sur l'UI | Mobile Easy Use |
| --- | --- | --- |
| Vérifier le résultat | Contrôler textes, éléments et captures | Vérifier aussi les objets natifs, le cache et l'état métier après la même action |
| Vérifier les états intermédiaires | Attendre les changements visibles | Lire l'état interne et vérifier les transitions : chargement, attente, fin |
| Préparer un scénario | Utiliser les étapes UI et les données disponibles | Remplacer aussi temporairement des champs ou des retours de méthodes pour déclencher une branche |
| Analyser un échec | Examiner assertions, captures et journaux disponibles | Relier aussi appels, arguments, retours et changements d'état pour expliquer l'échec |

### Exemple : un clic, trois niveaux de vérification

Sur la page initiale **UI → Class names and subclasses** d'Android ApiDemo, cliquer sur `FIRST` doit porter le compteur à 1 et afficher `FIRST:1`. Avant chaque exécution, ouvrez cette page dans son état initial et préparez une capture de référence après clic, vérifiée, à `baselines/first-clicked.jpg`, chemin relatif au fichier de test.

Les [tests Android](../fixtures/android/ApiDemo/tests/) et [iOS](../fixtures/ios/ApiDemo/tests/) contiennent des scénarios complets avec nettoyage. Pour une fenêtre, utilisez `expect().toHaveWindowScreenShot(...)`.

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

    // État métier natif
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

## Inspiration

Mobile Easy Use s'inspire de **quickjs-android**, **xLua** et **Frida**. Frida constitue sa base d'implémentation : le Runtime embarqué repose sur Frida Gadget et MCP utilise les ponts Java et Objective-C pour accéder aux objets de la plateforme.

Package npm : `@agent-easy-use/mobile-easy-use`.
