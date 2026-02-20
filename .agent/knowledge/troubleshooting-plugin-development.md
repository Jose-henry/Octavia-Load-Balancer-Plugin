# Morpheus Plugin Development: Troubleshooting & Best Practices

This document chronicles the specific architectural hurdles faced while building the Custom Octavia Load Balancer UI Plugin and the strict solutions required by the Morpheus Plugin API. 

## 1. Template Rendering Failures

**Error:** `Template file not found: hbs/octavia.hbs`

**Context:** The Morpheus UI failed to load the React application template on the custom Instance or Network tabs.
**Root Cause:**
When registering the `HandlebarsRenderer` inside the core `Plugin` class initialization (`CustomOctaviaLoadBalancerUiPlugin.groovy`), invoking the default no-argument constructor `new HandlebarsRenderer()` creates a renderer with no class loader and no directory prefix. The `DynamicTemplateLoader` therefore cannot find `.hbs` files inside the compiled plugin JAR because it does not know where to look.

**The Solution:**
1. **Initialize with Prefix and ClassLoader:** Provide the "renderer" string and the class's own class loader so Morpheus scans the JAR's `src/main/resources/renderer/` path natively.
   ```groovy
   // Correct Handlebars Initialization
   this.renderer = new HandlebarsRenderer("renderer", this.getClass().getClassLoader())
   // Register helpers so the {{asset}} tag works in the .hbs file
   this.renderer.registerAssetHelper(this.getName())
   this.renderer.registerNonceHelper(this.morpheus.getWebRequest())
   ```
2. **Correct Rendering Path:** Inside the TabProvider class, invoke the renderer relative to the `renderer/` prefix without the `.hbs` extension:
   ```groovy
   getRenderer().renderTemplate('hbs/octavia', model)
   ```
3. **Correct File Placement:** Place the exact file at `src/main/resources/renderer/hbs/octavia.hbs`.

---

## 2. API Authorization Errors on Custom Data Fetches 

**Error:** `401 Unauthorized` in React Frontend `apiFetch` calls.

**Context:** The frontend attempted to execute `XMLHttpRequest` or `fetch()` against Morpheus's core OptionSource API endpoints (e.g., `/api/options/loadbalancers`) to retrieve JSON data.
**Root Cause:**
Unlike normal UI browsing which relies on standard session cookies, any direct endpoint bound under the core `/api/...` path strictly requires an OAuth 2.0 Bearer token (`Authorization: Bearer <token>`) passed in the headers. Browser session cookies are ignored. Exposing these tokens globally in the DOM to the React frontend is a major security risk and unsupported.

**The Solution:**
Do not manually hit `/api/options/...` endpoints expecting JSON payloads via frontend JavaScript. 
* To feed standard form dropdowns, link an `OptionType` definition directly to the `OptionSourceProvider` in the backend; Morpheus handles the data pipe natively.
* To create a custom API for React to fetch JSON, you must abandon `OptionSourceProvider` and build a **PluginController**.

---

## 3. The "Silent 404" Plugin Controller Errors

**Error:** `404 Unable to find page` when querying `/plugin/octavia1234/loadbalancers`, despite the Morpheus Dispatcher logger confirming "Registered 12 routes".

**Context:** The plugin defined a proper `PluginController` to handle React's custom JSON data fetches dynamically.
**Root Cause A: Java Reflection Signature Mismatch**
The Morpheus Grails `Dispatcher` maps routes to Groovy methods via Java Reflection. If the method signature does not strictly take a `ViewModel<Map> model` parameter, the Router fails to find the endpoint and throws a generic 404.
* **Bad:** `def loadbalancers()` or `def loadbalancers(ViewModel model)` or `def loadbalancers(Map args)`
* **Good:** `def loadbalancers(ViewModel<Map> model)`

**Root Cause B: Unassigned Custom Role Permissions**
When `Route.build()` requires a specific plugin permission (e.g., `Permission.build("octavia-loadbalancer", "full")`), that permission belongs to your plugin, not the core platform. A System Admin's overriding access does not automatically grant them newly created custom plugin permissions. If an endpoint evaluates that the user lacks the attached role permission, the Morpheus Dispatcher throws a **404 Not Found** rather than an explicit **403 Forbidden** to obfuscate the API structure.

**The Solution:**
1. **Enforce Strict Method Signatures:** Every mapped controller endpoint must be defined exactly as:
   ```groovy
   def loadbalancers(ViewModel<Map> model) {
       // Return valid JSON
       return JsonResponse.of([success: true, data: []])
   }
   ```
2. **Assign Universal/Native Permissions:** If the UI extension should be available to any user managing specific infrastructure elements, map the `PluginController` routes to native Morpheus platform permissions (e.g., `infrastructure-networks` or `infrastructure-loadbalancer`). A System Admin natively inherits these, averting the silent 404 bypass.
   ```groovy
   @Override
   List<Route> getRoutes() {
       // Map to a native permission to avoid role-assignment silent drop
       def perm = Permission.build("infrastructure-networks", "full")
       return [
           Route.build("/octavia1234/loadbalancers", "loadbalancers", perm)
       ]
   }
   ```

---

## Summary: Architecture for Custom Plugin UI and API Data

When building a custom Web UI React App inside a Morpheus Plugin, follow this complete architecture stack:

1. **TabProviders (Frontend Shell):** Use `InstanceTabProvider` or `NetworkTabProvider` to inject a basic HTML Handlebars template. This template imports the React `.js` bundles using `{{asset 'my-app.js'}}`.
2. **React App (Frontend Runtime):** The React bundle lives inside the DOM snippet created by the Handlebars template and renders your interactive interface.
3. **PluginController (Backend API):** Build a `PluginController` that registers routes with the prefix `/plugin/$pluginCode/action`. 
4. **Data Fetching:** Have the React fetch methods call these `/plugin/*` routes. Because they exist outside the strict `/api/*` tree, these PluginController routes seamlessly authenticate using the native Morpheus Browser Session authentication (CSRF + session cookies). `credentials: 'include'` must be passed in the `fetch()` params.
