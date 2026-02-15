---
trigger: always_on
---

# Octavia Load Balancer Plugin - Development Rules

## ⚠️ CRITICAL: Documentation Verification (NEVER HALLUCINATE)

**The local knowledge files are NOT the only source of truth.** Before implementing ANY feature:

1. **ALWAYS verify against official sources:**
   - Plugin Docs: https://developer.morpheusdata.com/docs
   - API Javadocs: https://developer.morpheusdata.com/api/index.html
   - Octavia API: https://docs.openstack.org/api-ref/load-balancer/v2/index.html
   - https://docs.openstack.org/api-ref/identity/v3/index.html
   - Use `mcp_notebooklm` tools to query documentation if in doubt

2. **Reference example plugins:**
   - `morpheus-bigip-loadbalancer-plugin/` - LoadBalancer patterns
   - `morpheus-dashboards/` - UI/Dashboard patterns

3. **When uncertain about an API or pattern:**
   - Query the NotebookLM MCP tool with the specific question
   - Read the actual class/interface Javadocs via URL crawling
   - Check the example plugin implementations
   - **NEVER guess or make up API methods/fields**

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

### When to Use NotebookLM vs URL Crawling
- **NotebookLM**: Quick answers, cross-referencing multiple docs, understanding concepts
- **URL Crawling**: Detailed API signatures, specific method parameters, code examples

---

## Core Principles

1. **Research First**: Always consult Morpheus documentation and example plugins before implementing
2. **Mock Before Real**: Test all features with mock mode before real Octavia API integration
3. **Permission Security**: All endpoints must have proper permission guards
4. **Hierarchical Resources**: Respect Octavia's Load Balancer → Listener → Pool → Member hierarchy

## Mandatory Patterns

### Backend Development
- Use `@Slf4j` for logging on all classes
- Return `JsonResponse` or `HTMLResponse` from controller methods
- Use `MorpheusContext` for all Morpheus data access
- Handle exceptions gracefully with proper error responses

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
