---
trigger: always_on
---

# Octavia Load Balancer Plugin - Development Rules

## ⚠️ CRITICAL: Documentation Verification (NEVER HALLUCINATE)

**The local knowledge files are NOT the only source of truth.** Before implementing ANY feature:

1. **ALWAYS verify against official sources using context7 and MCP tools:**
   - **context7 (REQUIRED FIRST)**: Use `mcp_context7_resolve-library-id` + `mcp_context7_query-docs` to research any Morpheus Plugin API question. Always try context7 before URL crawling.
   - Plugin Docs: https://developer.morpheusdata.com/docs
   - API Javadocs: https://developer.morpheusdata.com/api/index.html
   - Octavia API: https://docs.openstack.org/api-ref/load-balancer/v2/index.html
   - OpenStack Identity: https://docs.openstack.org/api-ref/identity/v3/index.html
   - Use `mcp_notebooklm` tools to query documentation if in doubt

2. **Reference example plugins:**
   - `morpheus-bigip-loadbalancer-plugin/` - LoadBalancer patterns
   - `morpheus-dashboards/` - UI/Dashboard patterns

3. **When uncertain about an API or pattern:**
   - **First**: Use context7 to search for Morpheus Plugin API documentation
   - **Second**: Query the NotebookLM MCP tool with the specific question
   - **Third**: Read the actual class/interface Javadocs via URL crawling
   - Check the example plugin implementations
   - Review `bestpractice.md` in the project root for known pitfalls
   - **NEVER guess or make up API methods/fields**

---

## 📖 context7 Research (USE THIS FIRST!)

**Always use context7 MCP tools before implementing Morpheus Plugin API features.**

### How to Use
```
// Step 1: Resolve the library ID
mcp_context7_resolve-library-id(
  libraryName="morpheus plugin api",
  query="<your specific question>"
)

// Step 2: Query the docs with the resolved ID
mcp_context7_query-docs(
  libraryId="<resolved-id>",
  query="<your specific question>"
)
```

### When to Use context7
- Before implementing any new PluginController, TabProvider, or Route
- When unsure about method signatures, return types, or API patterns
- When debugging Morpheus framework behavior (Dispatcher, Route matching, etc.)
- Before using any Morpheus model class or service method
- When resolving rxJava2/rxJava3 API usage patterns

---

## 📚 NotebookLM Resource (USE THIS!)

**Notebook ID**: `ac01504b-af08-439e-b71a-7a1bd7051e87`
**Notebook Name**: HPE Morpheus Enterprise Software Documentation
**Sources**: 37 documents

### How to Query
```
mcp_notebooklm_notebook_query(
  notebook_id="ac01504b-af08-439e-b71a-7a1bd7051e87",
  query="<your specific question>"
)
```

### Key Sources Available
| Category | Sources |
|----------|---------|
| **HPE Morpheus Docs** | v8.0.10 PDF, CLI Reference |
| **Plugin Docs** | developer.morpheusdata.com/docs |
| **Plugin API Packages** | core.network.loadbalancer, core.network, model (847 classes) |
| **Octavia API** | docs.openstack.org/api-ref/load-balancer/v2 |
| **MorpheusContext** | Full API reference |

### When to Use NotebookLM vs context7 vs URL Crawling
- **context7**: Quick API lookup, method signatures, patterns (try FIRST)
- **NotebookLM**: Cross-referencing multiple docs, understanding concepts, Morpheus-specific features
- **URL Crawling**: Detailed Javadoc pages, specific method parameters, when context7/NotebookLM lack the answer

---

## 🚨 Known Pitfalls (from bestpractice.md)

### 1. PluginController Method Signatures (Silent 404)
The Morpheus Dispatcher uses Java Reflection. **All handler methods MUST have this exact signature:**
```groovy
def methodName(ViewModel<Map> model) {
    return JsonResponse.of([success: true, data: []])
}
```
**Wrong signatures cause silent 404s**, not compilation errors.

### 2. Permission-Based Silent 404s
Custom permissions (e.g., `Permission.build("octavia-loadbalancer", "full")`) are NOT auto-granted to admins. Use **native Morpheus permissions** like `infrastructure-networks` or `infrastructure-loadbalancer` to avoid silent 404s.

### 3. HandlebarsRenderer Initialization
```groovy
// CORRECT — must pass "renderer" prefix + plugin classloader
this.renderer = new HandlebarsRenderer("renderer", this.getClass().getClassLoader())
// WRONG — no-arg constructor can't find templates!
// this.renderer = new HandlebarsRenderer()
```

### 4. PluginProvider Interface Methods
Controllers MUST implement all `PluginProvider` methods:
```groovy
@Override String getCode() { 'my-controller' }
@Override String getName() { 'My Controller' }
@Override MorpheusContext getMorpheus() { morpheusContext }
@Override Plugin getPlugin() { plugin }
```

### 5. Route URL Format  
Routes match the **full browser URL path**. Include `/plugin/` prefix if that's what the browser sends, or omit it if the Dispatcher auto-adds it. **Always verify by checking server logs.**

---

## Core Principles

1. **Research First**: Always use context7 + NotebookLM + example plugins before implementing
2. **Mock Before Real**: Test all features with mock mode before real Octavia API integration
3. **Permission Security**: All endpoints must have proper permission guards (use native permissions)
4. **Hierarchical Resources**: Respect Octavia's Load Balancer → Listener → Pool → Member hierarchy

## Mandatory Patterns

### Backend Development
- Use `@Slf4j` for logging on all classes
- Return `JsonResponse` or `HTMLResponse` from controller methods
- Use `MorpheusContext` for all Morpheus data access
- Handle exceptions gracefully with proper error responses
- All handler methods: `def methodName(ViewModel<Map> model)`

### Frontend Development
- Use `apiFetch()` wrapper for all API calls (handles CSRF/auth)
- Follow Morpheus UI conventions (Bootstrap-like classes)
- Implement loading states and error handling
- Use React hooks (`useState`, `useEffect`) for state management

### API Design
- RESTful endpoints under `/plugin/octavia1234/`
- JSON request/response format
- Include `networkId` or `instanceId` as context identifier
- Return `success: boolean` in all responses

## File Modification Guidelines

When modifying files:
1. **Groovy**: Follow existing code style with proper indentation
2. **JSX**: Use functional components with hooks
3. **HBS**: Keep templates minimal, delegate logic to React
4. **Gradle**: Don't modify dependency versions without reason

## Testing Requirements

Before any PR/commit:
1. Build must succeed: `.\gradlew.bat shadowJar`
2. Tests must pass: `.\gradlew.bat test`
3. UI must render without console errors
4. Mock mode must work fully

## Documentation Requirements

Keep these updated when making changes:
- `.agent/knowledge/octavia-plugin-knowledge.md` - Architecture docs
- `.agent/knowledge/morpheus-api-reference.md` - Morpheus API reference
- `.agent/knowledge/octavia-api-reference.md` - Octavia API reference
- `.agent/knowledge/reference-plugin-patterns.md` - Code patterns
- `bestpractice.md` - Troubleshooting & lessons learned
- Code comments for complex logic
- README if deployment steps change

## Official Documentation URLs

| Resource | URL |
|----------|-----|
| Plugin Docs | https://developer.morpheusdata.com/docs |
| API Javadocs | https://developer.morpheusdata.com/api/index.html |
| LoadBalancerProvider | https://developer.morpheusdata.com/api/com/morpheusdata/core/network/loadbalancer/LoadBalancerProvider.html |
| NetworkLoadBalancer Model | https://developer.morpheusdata.com/api/com/morpheusdata/model/NetworkLoadBalancer.html |
| OptionType | https://developer.morpheusdata.com/api/com/morpheusdata/model/OptionType.html |
| **Octavia API v2** | https://docs.openstack.org/api-ref/load-balancer/v2/index.html |
