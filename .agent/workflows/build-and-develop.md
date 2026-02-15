---
description: Development workflow and rules for Octavia Load Balancer Plugin
---

# Octavia Load Balancer Plugin Development Workflow

## Project Information
- **Plugin Type**: Morpheus UI Extension Plugin
- **Backend**: Groovy/Java (JDK 11)
- **Frontend**: React (JSX compiled via asset-pipeline)
- **Build Tool**: Gradle 8.3

## Quick Commands

// turbo-all
1. **Build the plugin JAR**:
```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-11.0.29.7-hotspot'; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"; .\gradlew.bat shadowJar
```

2. **Clean and rebuild**:
```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-11.0.29.7-hotspot'; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"; .\gradlew.bat clean shadowJar
```

3. **Run tests**:
```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-11.0.29.7-hotspot'; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"; .\gradlew.bat test
```

## Development Rules

### Rule 1: Always Research Before Implementing
Before implementing any feature:
1. Consult NotebookLM for Morpheus documentation
2. Reference the knowledge file at `.agent/knowledge/octavia-plugin-knowledge.md`
3. Check example plugins in the ecosystem (morpheus-plugin-samples on GitHub)
4. Review the Octavia API documentation (`octaviaAPI.pdf` in project root)

### Rule 2: Follow Morpheus Plugin Patterns
- **Tab Providers**: Extend `AbstractInstanceTabProvider` or `AbstractNetworkTabProvider`
- **Controllers**: Implement `PluginController` with proper `Route` definitions and permissions
- **Option Sources**: Implement `OptionSourceProvider` for dropdown data
- **Views**: Use Handlebars templates in `src/main/resources/renderer/hbs/`
- **Assets**: Place JS/CSS/images in `src/assets/`

### Rule 2.5: Handlebars Template Rendering (CRITICAL)
**This is a common source of `FileNotFoundException` bugs. Follow exactly:**

1. **Renderer Initialization** in the plugin class:
   ```groovy
   // CORRECT — must pass "renderer" prefix + plugin classloader
   this.renderer = new HandlebarsRenderer("renderer", this.getClass().getClassLoader())
   this.renderer.registerAssetHelper(this.getName())
   this.renderer.registerNonceHelper(this.morpheus.getWebRequest())
   this.renderer.registerI18nHelper(this, this.morpheus)

   // WRONG — the no-arg constructor has no classloader and no prefix!
   // this.renderer = new HandlebarsRenderer()  ← DO NOT USE
   ```

2. **Template Files** must live at:
   ```
   src/main/resources/renderer/hbs/<template-name>.hbs
   ```
   The `"renderer"` argument becomes the classpath prefix; `hbs/` is the Handlebars convention.

3. **renderTemplate Calls** use the path relative to `renderer/` **without** `.hbs` suffix:
   ```groovy
   // CORRECT
   getRenderer().renderTemplate('hbs/octavia', model)

   // WRONG examples:
   // plugin.renderer.renderTemplate('hbs/octavia.hbs', model)   ← suffix added twice
   // plugin.renderer.renderTemplate('renderer/hbs/octavia', model) ← prefix added twice
   ```

4. **Tab Providers**: Use `getRenderer()` (inherited from `AbstractNetworkTabProvider` / `AbstractInstanceTabProvider`) not `plugin.renderer`.

5. **HandlebarsPluginTemplateLoader** auto-adds:
   - Prefix: the value passed to the constructor (e.g. `"renderer"`)
   - Suffix: `.hbs`
   - So `renderTemplate('hbs/octavia', ...)` resolves to classpath: `renderer/hbs/octavia.hbs`

6. **Verify JAR contents** after build:
   ```powershell
   jar tf build\libs\*.jar | findstr /i "hbs"
   ```
   Expect to see `renderer/hbs/octavia.hbs` in the output.

### Rule 3: Permission-Gated Operations
All API endpoints must have appropriate permissions:
- **Read operations**: Use `Permission.build('network', 'read')`
- **Write operations**: Use `Permission.build('network', 'manage')`
- Tab visibility controlled via `show()` method checking user permissions

### Rule 4: Mock Mode First
- Always test with mock mode enabled first (`OCTAVIA_MOCK=true`)
- Mock mode uses `PersistenceService` for in-memory storage
- Real API calls go through `OctaviaApiService` when mock disabled

### Rule 5: UI Development Guidelines
- React JSX lives in `src/assets/js/octavia-loadbalancer-ui.jsx`
- Use Morpheus CSS classes (`form-control`, `btn`, `panel`, `table`, etc.)
- Handle CSRF tokens properly using existing `csrfToken()` helper
- Use `apiFetch()` for all API calls to include proper headers

### Rule 6: Octavia Resource Hierarchy
When implementing CRUD operations, respect the hierarchy:
```
LoadBalancer → Listener → Pool → Members + HealthMonitor
```
- Can't create a listener without a load balancer
- Can't create a pool without a listener
- Members and health monitors attach to pools

### Rule 7: Error Handling
- Backend: Return `JsonResponse.of([success: false, error: msg], statusCode)`
- Frontend: Catch errors in `apiFetch()` and display user-friendly messages
- Log errors with `@Slf4j` annotation and `log.warn/error`

### Rule 8: Build Before Testing
// turbo
Always build the JAR before testing:
```powershell
.\gradlew.bat shadowJar
```

## File Location Guidelines

| Type | Location |
|------|----------|
| Plugin Class | `src/main/groovy/com/example/*.groovy` |
| Providers | `src/main/groovy/com/example/providers/` |
| Backend Services | `src/main/groovy/com/example/backend/` |
| React/JSX | `src/assets/js/` |
| Handlebars | `src/main/resources/renderer/hbs/` |
| Images | `src/assets/images/` |
| Tests | `src/test/groovy/` |

## Key Documentation Links
- Morpheus Plugin Docs: https://developer.morpheusdata.com/docs
- Morpheus Plugin API: https://developer.morpheusdata.com/api/index.html
- OpenStack Octavia API: https://docs.openstack.org/api-ref/load-balancer/v2/

## Development Checklist for New Features

1. [ ] Update knowledge file if architecture changes
2. [ ] Add new routes to `OctaviaController.getRoutes()`
3. [ ] Implement mock mode handling in `OctaviaApiService`
4. [ ] Update React UI for new functionality
5. [ ] Add appropriate permission checks
6. [ ] Test in mock mode first
7. [ ] Build and verify JAR creation
8. [ ] Test in real Morpheus environment
