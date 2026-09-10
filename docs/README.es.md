# Mobile Easy Use

**Una herramienta para desarrolladores de Android e iOS que permite a los agentes de IA observar y controlar el comportamiento de una aplicación en ejecución.**

Documentación: [English](../README.md) · [简体中文](./README.zh.md) · [Français](./README.fr.md) · [Русский](./README.ru.md) · **Español** · [العربية](./README.ar.md)

En comparación con el desarrollo web, es más difícil inspeccionar los datos internos, el estado de negocio y la ejecución de una aplicación móvil. **«La solicitud se completó, ¿por qué no se actualizó la lista?»** Este tipo de problema depende de los datos, el estado y los tiempos reales del dispositivo, que el análisis estático del código fuente no siempre puede explicar.

Mobile Easy Use proporciona a los agentes de IA acceso al runtime mediante MCP. Así pueden relacionar el código fuente con el comportamiento real de la aplicación, leer objetos y estados, interceptar llamadas a métodos, cambiar temporalmente las condiciones de ejecución e interactuar con la interfaz.

## Explorar el estado y el comportamiento de la aplicación

En torno a una misma acción, el agente puede conectar la ejecución de métodos y los cambios de datos con lo que aparece en pantalla:

| Información del runtime | Qué permite conocer |
| --- | --- |
| Objetos y estado de negocio | Datos, caché, configuración y cambios posteriores a una acción |
| Llamadas a métodos | Métodos ejecutados, argumentos, resultados, pilas de llamadas e hilos |
| Tiempo de ejecución y memoria | Duración de los métodos y cambios en la memoria del proceso |
| Logs de negocio | Hasta dónde avanzó la ejecución y qué indicios explican un fallo |
| Estado de la interfaz | Existencia, visibilidad, posición y propiedades de los controles |
| Capturas de pantalla | Apariencia real y cambios visuales después de una acción |
| Recursos de la aplicación | Identificadores y contenidos de recursos Android |
| Resultados y contexto del fallo | Paso del fallo, estado, logs e imágenes recopiladas |

La información disponible depende de la plataforma y de la implementación de la aplicación.

## Más que una solución de automatización de UI

Mobile Easy Use cubre la interacción y verificación de la interfaz, y además permite entrar en la aplicación: observar el flujo de datos, aplicar hooks a métodos, sustituir temporalmente valores de retorno o campos e invocar métodos internos.

| Capacidad | Automatización UI tradicional | Mobile Easy Use |
| --- | :---: | :---: |
| Interacciones, estado de la UI y capturas | ✓ | ✓ |
| Observar objetos y estados de negocio | — | ✓ |
| Aplicar hooks y seguir llamadas | — | ✓ |
| Medir tiempo de ejecución y memoria | — | ✓ |
| Cambiar temporalmente condiciones del runtime | — | ✓ |
| Invocar métodos internos | — | ✓ |

Estas capacidades participan en todo el desarrollo: entender el estado real antes de programar, comprobar hipótesis durante la implementación y validar conjuntamente el estado de negocio y la interfaz al finalizar.

## Primeros pasos

Requisitos: Node.js 20+. Android necesita ADB y un dispositivo o emulador. iOS necesita macOS, Xcode y sus herramientas de línea de comandos; los dispositivos físicos también necesitan `iproxy` y la firma del XCTest Runner.

### 1. Instalar los Skills

Desde la raíz del proyecto de la aplicación:

```bash
npx skills add agent-easy-use/mobile-easy-use --skill '*'
```

### 2. Integrar Mobile Easy Use

Pide al agente que use `to-android-integrate` o `to-ios-integrate`. El Skill descarga y verifica los artefactos, configura el proyecto de debug y devuelve la versión MCP compatible. Después, compila esa versión e instálala en el dispositivo.

### 3. Configurar MCP

Usa exactamente la versión devuelta por Integrate (`0.1.0` es solo un ejemplo):

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

Configura el directorio de trabajo de MCP en la raíz del proyecto objetivo, recarga la configuración y comprueba que `get_sdk_declarations` y `connect` estén disponibles.

### 4. Explorar con Probe

Después de compilar e instalar la aplicación integrada, pide al agente que use `to-android-probe` o `to-ios-probe` y describe el problema en lenguaje natural. Probe combina el código fuente, los Presets y las observaciones del runtime para ejecutar la investigación y analizar las evidencias.

## Cuatro capacidades de Skills

| Capacidad | Cuándo usarla |
| --- | --- |
| **Observable** | Mejorar opcionalmente la observabilidad con cambios locales y mínimamente invasivos |
| **Integrate** | Configurar la integración de debug y seleccionar una versión MCP compatible |
| **Probe** | Investigar el runtime en lenguaje natural, desde la generación del probe hasta el análisis |
| **Presets** | Convertir acciones y consultas habituales en capacidades reutilizables |

Consulta los Skills de [Android](../skills/to-android-probe/SKILL.md) e [iOS](../skills/to-ios-probe/SKILL.md) para conocer los flujos completos.

## Inspiración

Mobile Easy Use se inspira en **quickjs-android**, **xLua** y **Frida**. Frida es la base de la implementación: el Runtime integrado usa Frida Gadget y MCP utiliza los puentes de Java y Objective-C para acceder a los objetos de la plataforma.

Paquete npm: `@agent-easy-use/mobile-easy-use`.
