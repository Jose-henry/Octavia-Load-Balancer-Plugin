# Morpheus Plugin Documentation Summary

> **Source**: https://developer.morpheusdata.com/docs
> **Purpose**: Quick reference for plugin development patterns

---

## Getting Started

### Technology Stack
- **Language**: Groovy 3.0.x (or Java) on Java 11 (OpenJDK)
- **Build**: Gradle 7.x/8.x with ShadowJar plugin
- **API**: morpheus-plugin-api (rxJava2-based)
- **Views**: Handlebars templates

### Project Structure
```
./
├── build.gradle
├── src/main/groovy/           # Groovy source code
├── src/main/resources/
│   ├── renderer/hbs/          # Handlebars templates
│   ├── i18n/                  # Localization files
│   └── scribe/                # Scribe scripts
├── src/assets/
│   ├── images/
│   ├── javascript/
│   └── stylesheets/
└── src/test/groovy/           # Tests
```

### Plugin Class Pattern
```groovy
import com.morpheus.core.Plugin

class MyPlugin extends Plugin {
    @Override
    void initialize() {
        this.setName("My Plugin Name")
        
        // Register providers
        CustomTabProvider tabProvider = new CustomTabProvider(this, morpheus)
        this.registerProvider(tabProvider)
        
        // Register controllers
        this.controllers.add(new MyPluginController())
    }
}
```

### Manifest Attributes (build.gradle)
```groovy
jar {
    manifest {
        attributes(
            'Plugin-Class': 'com.example.MyPlugin',
            'Plugin-Version': archiveVersion.get(),
            'Morpheus-Name': 'Plugin Name',
            'Morpheus-Organization': 'My Org',
            'Morpheus-Code': 'my-plugin-code',
            'Morpheus-Min-Appliance-Version': "8.0.0"
        )
    }
}
```

---

## HTTP Routing (Controllers)

### PluginController Pattern
```groovy
class MyController implements PluginController {
    List<Route> getRoutes() {
        [
            Route.build("/myprefix/list", "listItems", Permission.build("network", "read")),
            Route.build("/myprefix/create", "create", Permission.build("network", "full"))
        ]
    }
    
    def listItems(ViewModel<Map> model) {
        return JsonResponse.of([success: true, items: []])
    }
    
    def create(ViewModel<Map> model) {
        def data = model.object  // Request body
        return JsonResponse.of([success: true])
    }
}
```

### Response Types
- `JsonResponse.of(object)` - JSON response
- `HTMLResponse.success(html)` - HTML response
- `HTMLResponse.error(message)` - Error HTML

### Permission Builder
```groovy
Permission.build("permissionCode", "accessLevel")
// Access levels: "none", "read", "full"
// Permission codes: "admin", "network", "instance", etc.
```

---

## Views (Handlebars Templates)

### Template Location
`src/main/resources/renderer/<plugin-code>/<view>.hbs`

### Rendering
```groovy
getRenderer().renderTemplate("prefix/viewname", model)
// Do NOT include .hbs extension
```

### Asset Helper
```handlebars
<script src="{{asset "/my-script.js"}}"></script>
<img src="{{asset "/images/icon.png"}}" />
<link rel="stylesheet" href="{{asset "/styles.css"}}" />
```

Assets location: `src/assets/{plugin-code}/`

---

## Provider Types

| Provider | Purpose |
|----------|---------|
| `InstanceTabProvider` | Tab on Instance detail page |
| `ServerTabProvider` | Tab on Server detail page |
| `NetworkTabProvider` | Tab on Network detail page |
| `LoadBalancerProvider` | Full LB integration |
| `TaskProvider` | Custom task types |
| `ReportProvider` | Custom reports |
| `BackupProvider` | Backup integration |
| `CloudProvider` | Cloud infrastructure |
| `IPAMProvider` | IP address management |
| `DNSProvider` | DNS management |
| `DatasetProvider` | Dropdown data sources |

---

## Data Services

### Accessing via MorpheusContext
```groovy
morpheus.services.network.list()
morpheus.services.computeServer.get(id)
morpheus.services.instance.listIdentityProjections(cloud)
```

### rxJava2 Pattern
```groovy
// IMPORTANT: Code doesn't execute until subscribe()
morpheus.services.network.list()
    .filter { it.enabled }
    .map { it.name }
    .toList()
    .subscribe { names -> 
        log.info("Networks: $names")
    }
```

---

## Option Types (Form Fields)

### Input Types
- `TEXT`, `TEXTAREA`, `NUMBER`
- `CHECKBOX`, `RADIO`
- `SELECT`, `MULTI_SELECT`
- `TYPEAHEAD`, `MULTI_TYPEAHEAD`
- `PASSWORD`, `HIDDEN`

### Option Source (Deprecated - Use DatasetProvider)
```groovy
new OptionType(
    name: 'subnet',
    fieldName: 'subnetId',
    fieldLabel: 'Subnet',
    inputType: OptionType.InputType.SELECT,
    optionSource: 'octaviaSubnets'
)
```

---

## DataSet Providers (0.15.x+)

Replaced Option Sources for dynamic dropdowns:
```groovy
class MyDatasetProvider extends AbstractDatasetProvider<Network, Long> {
    @Override
    Observable<Network> listOptions(DataQuery query) {
        return morpheus.services.network.list(query)
    }
    
    @Override
    String itemName(Network item) {
        return item.name
    }
    
    @Override
    Long itemValue(Network item) {
        return item.id
    }
}
```

---

## Localization

### Properties File
`src/main/resources/i18n/messages.properties`
```properties
gomorpheus.label.loadBalancer=Load Balancer
gomorpheus.button.create=Create
```

### Usage in Templates
```handlebars
{{i18n 'gomorpheus.label.loadBalancer'}}
```

### Usage in Code
```groovy
morpheus.localization.get("gomorpheus.label.loadBalancer")
```

---

## Developer Portal Crawl Summary
> **Crawled**: https://developer.morpheusdata.com/ (Guides & Docs)

### Site Structure
- **Guides**: Detailed tutorials on specific plugin types (UI, Task, IPAM).
- **API**: Javadocs for core libraries.
- **Examples**: Reference implementations.

### UI Extension Insights
- **Inheritance**: Extend `AbstractInstanceTabProvider` or `AbstractServerTabProvider`.
- **Visibility**: Override `show(object, context)` to control when tab appears.
- **Templates**: Standard Handlebars with `ViewModel` data wrapper.
- **Assets**: Use `AssetHelper` for CSS/JS injection.

### Plugin Architecture
- **Provider Pattern**: Plugins register "Providers" (Capabilities) with the Core.
- **Context API**: `MorpheusContext` is the bridge to core services.
- **Syncing**: Data synchronization handled via `MorpheusDataService` context.
