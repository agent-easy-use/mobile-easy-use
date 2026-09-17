# Mobile Easy Use

**Beyond UI control. Deep runtime exploration.**

[English](../README.md) · [简体中文](./README.zh.md) · [Français](./README.fr.md) · [Русский](./README.ru.md) · **Español** · [العربية](./README.ar.md)

Da a los agentes de IA acceso al runtime de aplicaciones Android e iOS mediante MCP: inspeccionar objetos nativos y su estado, rastrear y sustituir llamadas a métodos, controlar la interfaz e interactuar directamente con una aplicación en ejecución.

La grabación muestra a un agente de IA operando una aplicación móvil en ejecución, siguiendo las rutas de llamadas reales y consultando datos del runtime, como el tiempo de ejecución de los métodos.

https://github.com/user-attachments/assets/e956fdbf-da6a-4608-a877-11a107f70760

## Por qué importa explorar el runtime al programar con IA

En proyectos complejos, el comportamiento depende de los datos, la configuración, la caché y el orden de las llamadas en ejecución. El código explica la implementación; explorar el runtime revela qué rama se ejecutó, en qué estado están los objetos y dónde ocurrió el fallo. Juntos aportan evidencias para las decisiones del agente.

Las observaciones guían al agente durante el ciclo de desarrollo:

- **Investigación y preparación**: relacionar el código con las llamadas, los datos y el estado de la aplicación en ejecución para entender su comportamiento real.
- **Validación de una propuesta técnica**: cambiar temporalmente configuración, campos o retornos de métodos en la aplicación en ejecución, comprobar hipótesis y restaurar los valores.
- **Diagnóstico**: reproducir el problema en la aplicación y relacionar llamadas reales, cambios de estado e interfaz para localizar el fallo.
- **Después de programar**: ejecutar la aplicación modificada y repetir el escenario para verificar el resultado real. Las expectativas confirmadas pueden convertirse en pruebas de regresión.

Por ejemplo, pide al agente que investigue una lista que no se actualiza:

```text
Usa to-android-probe para investigar por qué esta lista no se actualiza tras una petición exitosa.
```

El agente puede inspeccionar la siguiente información, según la plataforma y la implementación de la aplicación:

| Información del runtime | Qué permite conocer |
| --- | --- |
| Objetos y estado de negocio | Datos, caché, configuración y cambios posteriores a una acción |
| Llamadas a métodos | Métodos ejecutados, argumentos, resultados, pilas de llamadas e hilos |
| Tiempo de ejecución y memoria | Duración de los métodos y cambios en la memoria del proceso |
| Logs de negocio | Hasta dónde avanzó la ejecución y qué indicios explican un fallo |
| Estado de la interfaz | Existencia, visibilidad, posición y propiedades de los controles |
| Capturas de pantalla | Apariencia real y cambios visuales después de una acción |

## Pruebas UI automatizadas mejoradas

Mobile Easy Use también puede utilizarse como una herramienta de pruebas UI automatizadas mejoradas. Su acceso al estado y al comportamiento internos de la aplicación permite, además de las interacciones UI y las capturas, verificar el estado de negocio, controlar el comportamiento en ejecución e investigar fallos.

1. **Verificaciones más profundas**: comprueba la interfaz, las capturas y el estado de negocio nativo en conjunto. Tras actualizar una lista, verifica tanto el contenido mostrado como los datos internos y la caché.
2. **Mayor control de los escenarios**: sustituye temporalmente campos o retornos de métodos para provocar datos vacíos, fallos o ramas de configuración específicas.
3. **Fallos más fáciles de explicar**: relaciona llamadas reales, argumentos, retornos y cambios de estado. Si una lista no se actualiza, determina si los datos se guardaron o si falló la actualización de la interfaz.

### Ejemplo: un clic, tres niveles de verificación

```text
Usa to-android-test-script para generar una prueba de ApiDemo: pulsa FIRST y verifica que el contador sea 1, el botón muestre FIRST:1 y su captura coincida con la referencia.
```

Esto genera un archivo de prueba JavaScript, que luego puedes ejecutar con `to-android-test`.

Ejecuta desde la página **UI → Class names and subclasses** en su estado inicial, con una captura de referencia revisada posterior al clic en `baselines/first-clicked.jpg`, relativa al archivo de prueba.

```javascript
const { describe, test, expect, run } = Test.create();
export { run };

describe('Counter button', () => {
  test('updates state, UI, and appearance', async () => {
    const button = R.id.api_ui_class_first;
    const clicked = await AndroidExp.runOnMainThread(() => AndroidExp.input.click(button));
    expect(clicked.ok).toBe(true);

    // Estado de la interfaz
    await expect(button).toBeVisible();
    await expect(button).toSatisfy(view => String(view.getText()) === 'FIRST:1');

    // Captura
    await expect(button).toHaveElementScreenShot('baselines/first-clicked.jpg');

    // Estado de negocio nativo: acceder a tipos nativos y leer campos o llamar a getters
    const count = await AndroidExp.runOnMainThread(() => Java.use(
      'com.agenteasyuse.mobileeasyuse.apidemo.state.ApiDemoState'
    ).getInstance().getClickCount());
    expect(Number(count)).toBe(1);
  });
});
```

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

### 4. Explorar o probar

Después de compilar e instalar la aplicación integrada, pide al agente que use `to-android-probe` o `to-ios-probe` y describe el problema en lenguaje natural. Probe combina el código fuente, los Presets y las observaciones del runtime para ejecutar la investigación y analizar las evidencias.

Genera pruebas con [to-android-test-script](../skills/to-android-test-script/SKILL.md) o [to-ios-test-script](../skills/to-ios-test-script/SKILL.md). Ejecuta archivos existentes y resume los resultados con [to-android-test](../skills/to-android-test/SKILL.md) o [to-ios-test](../skills/to-ios-test/SKILL.md).

```text
Genera pruebas de actualización de la lista que verifiquen UI, capturas y datos internos.
Ejecuta el directorio tests y resume los casos aprobados, fallidos y no ejecutados.
```

## Directorio de Skills

| Capacidad | Cuándo usarla |
| --- | --- |
| **Observable** | Mejorar opcionalmente la observabilidad con cambios locales y mínimamente invasivos |
| **Integrate** | Configurar la integración de debug y seleccionar una versión MCP compatible |
| **Probe** | Investigar el runtime en lenguaje natural, desde la generación del probe hasta el análisis |
| **Test** | Generar archivos a partir de expectativas explícitas, ejecutar pruebas y resumir resultados |
| **Presets** | Convertir acciones y consultas habituales en capacidades reutilizables para Probe y Test |

Consulta los Skills de [Android](../skills/to-android-probe/SKILL.md) e [iOS](../skills/to-ios-probe/SKILL.md) para conocer los flujos completos.

### Reutilizar capacidades con Presets

Presets reúne navegación, acciones de negocio, lectura de estado y cambios temporales de comportamiento para Probe y Test. Usa los Skills Presets de [Android](../skills/to-android-presets/SKILL.md) o [iOS](../skills/to-ios-presets/SKILL.md).

`presets.directory` en `.meu/config.json` define el directorio base, por defecto `.meu/presets`, con subdirectorios `android/` e `ios/`. Cada capacidad contiene `index.js` e `index.d.ts`. `presets.entry.js` exporta las capacidades públicas; la compilación genera `presets.dist.js`, que MCP carga como `/meu/presets.js` al conectar.

Después de un cambio, reconstruye el bundle y vuelve a conectar. Si hay un dispositivo disponible, el Skill verifica las capacidades ejecutándolas; en caso contrario, indica que su comportamiento sigue sin verificar.

## Inspiración

Mobile Easy Use se inspira en **quickjs-android**, **xLua** y **Frida**. Frida es la base de la implementación: el Runtime integrado usa Frida Gadget y MCP utiliza los puentes de Java y Objective-C para acceder a los objetos de la plataforma.

Paquete npm: `@agent-easy-use/mobile-easy-use`.
