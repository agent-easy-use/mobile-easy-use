# Mobile Easy Use

**Un outil pour les développeurs Android et iOS qui permet aux agents IA d'observer et de contrôler le comportement d'une application en cours d'exécution.**

Documentation : [English](../README.md) · [简体中文](./README.zh.md) · **Français** · [Русский](./README.ru.md) · [Español](./README.es.md) · [العربية](./README.ar.md)

Par rapport au Web, il est plus difficile d'examiner les données internes, l'état métier et l'exécution d'une application mobile. **« La requête a réussi, pourquoi la liste ne s'est-elle pas mise à jour ? »** Ce type de problème dépend des données, de l'état et de la chronologie réels sur l'appareil, que l'analyse statique du code source ne suffit souvent pas à expliquer.

Mobile Easy Use donne aux agents IA un accès au runtime via MCP. Ils peuvent rapprocher le code source du comportement réel de l'application, lire les objets et l'état, intercepter les appels de méthodes, modifier temporairement les conditions d'exécution, puis manipuler et inspecter l'interface.

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

## Plus qu'une solution de test automatisé de l'interface

Mobile Easy Use prend en charge les interactions et vérifications UI, tout en donnant accès à l'intérieur de l'application : observation des données, hooks de méthodes, remplacement temporaire de valeurs de retour ou de champs et appel de méthodes internes.

| Capacité | Automatisation UI traditionnelle | Mobile Easy Use |
| --- | :---: | :---: |
| Interactions, état de l'UI et captures d'écran | ✓ | ✓ |
| Observer les objets métier et leur état | — | ✓ |
| Hooker les méthodes et suivre les appels | — | ✓ |
| Mesurer le temps d'exécution et la mémoire | — | ✓ |
| Modifier temporairement les conditions d'exécution | — | ✓ |
| Appeler des méthodes internes | — | ✓ |

Ces capacités interviennent pendant tout le développement : comprendre l'état réel avant de coder, vérifier les hypothèses pendant l'implémentation, puis valider ensemble l'état métier et l'interface.

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

### 4. Explorer avec Probe

Après avoir compilé et installé l'application intégrée, demandez à l'agent d'utiliser `to-android-probe` ou `to-ios-probe` et décrivez le problème en langage naturel. Probe combine le code source, les Presets et les observations du runtime pour exécuter l'enquête et analyser les preuves.

## Quatre familles de Skills

| Capacité | Utilisation |
| --- | --- |
| **Observable** | Améliorer facultativement l'observabilité avec des changements locaux et très peu intrusifs |
| **Integrate** | Configurer l'intégration de debug et sélectionner une version MCP compatible |
| **Probe** | Étudier le runtime en langage naturel, de la génération du probe à l'analyse des preuves |
| **Presets** | Transformer les actions et requêtes courantes en capacités réutilisables |

Consultez les [Skills Android](../skills/to-android-probe/SKILL.md) et [iOS](../skills/to-ios-probe/SKILL.md) pour les workflows complets.

## Inspiration

Mobile Easy Use s'inspire de **quickjs-android**, **xLua** et **Frida**. Frida constitue sa base d'implémentation : le Runtime embarqué repose sur Frida Gadget et MCP utilise les ponts Java et Objective-C pour accéder aux objets de la plateforme.

Package npm : `@agent-easy-use/mobile-easy-use`.
