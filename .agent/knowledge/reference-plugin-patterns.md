# Reference Plugin Patterns

> Comprehensive patterns extracted from thorough examination of all reference plugins.
> **Sources examined**: `morpheus-bigip-loadbalancer-plugin`, `morpheus-dashboards`
> **Empty**: `morpheus-msdns-plugin`, `morpheus-plugin-core`, `morpheus-plugin-samples` (all empty dirs)

---

## BIG-IP Load Balancer Plugin

**Location**: `morpheus-bigip-loadbalancer-plugin/morpheus-bigip-loadbalancer-plugin/`
**Total**: 16 Groovy files, 4723-line main provider

### File Inventory
| File | Lines | Purpose |
|------|-------|---------|
| `BigIpPlugin.groovy` | 32 | Plugin class — registers providers via `pluginProviders.put` |
| `BigIpProvider.groovy` | 4723 | `LoadBalancerProvider` — full LB integration |
| `BigIpOptionSourceProvider.groovy` | 382 | 19 dropdown data methods via `getMethodNames()` |
| `BigIpUtility.groovy` | 295 | Constants, helpers, category builders |
| `CertificateController.groovy` | 43 | **Dead code** (never registered) — PluginController pattern |
| `BigIPEntitySync.groovy` | 32 | Abstract base for all sync classes |
| `PoolSync.groovy` | 123 | SyncTask pattern with rxJava3 Observable |
| `NodesSync.groovy` | - | Node synchronization |
| `HealthMonitorSync.groovy` | - | Health monitor sync |
| + 7 more sync classes | - | Partition, Policy, Profile, Certificate, Persistence, IRule, Instance |

### Plugin Registration (CRITICAL Pattern)
```groovy
class BigIpPlugin extends Plugin {
    @Override String getCode() { 'morpheus-bigip-plugin' }

    @Override void initialize() {
        BigIpProvider bigipProvider = new BigIpProvider(this, morpheus)
        BigIpOptionSourceProvider optionSource = new BigIpOptionSourceProvider(this, morpheus)
        // Uses pluginProviders.put(), NOT registerProvider()
        this.pluginProviders.put(bigipProvider.code, bigipProvider)
        this.pluginProviders.put(optionSource.code, optionSource)
        this.setName("BigIp")
    }

    @Override void onDestroy() { /* cleanup */ }

    BigIpProvider getProvider() {
        return getProviderByCode(BigIpProvider.PROVIDER_CODE)
    }
}
```

### PluginController Pattern (from CertificateController — dead code but valid pattern)
```groovy
class CertificateController implements PluginController {
    MorpheusContext morpheusContext
    Plugin plugin

    CertificateController(Plugin plugin, MorpheusLoadBalancerService context) {
        this.plugin = plugin
        this.morpheusContext = context
    }

    @Override
    List<Route> getRoutes() {
        // Route.build(url, responseType, permission)
        // Second param is "json" (response type), NOT method name
        return [Route.build("/bigIpPlugin/certInfo", "json",
                Permission.build("infrastructure-loadbalancer", "full"))]
    }

    // REQUIRED: All PluginProvider methods
    @Override String getCode() { 'bigIpCertController' }
    @Override String getName() { 'BigIP Certificate Controller' }
    @Override MorpheusContext getMorpheus() { morpheusContext }

    // Handler — method name derived from last URL segment
    def certInfo(ViewModel<Map> model) {
        // return JsonResponse.of(...)
    }
}
```

### OptionSourceProvider Pattern
```groovy
class BigIpOptionSourceProvider implements OptionSourceProvider {
    Plugin plugin
    MorpheusContext morpheusContext

    @Override MorpheusContext getMorpheus() { morpheusContext }
    @Override Plugin getPlugin() { plugin }
    @Override String getCode() { 'bigip-option-source-provider' }
    @Override String getName() { 'BigIP Option Source Provider' }

    // KEY: Must declare all method names
    @Override
    List<String> getMethodNames() {
        return ['bigIpPluginPartitions', 'bigIpPluginBalanceModes',
                'bigIpPluginNodes', 'bigIpPluginHealthMonitors', ...]
    }

    // Static data — return list of [name, value] maps
    def bigIpPluginBalanceModes(params) {
        return BigIpUtility.BALANCE_MODE
    }

    // Dynamic data — use Morpheus services with blockingSubscribe
    def bigIpPluginPartitions(input) {
        def params = [Object[]].any { it.isAssignableFrom(input.getClass()) } ? input.first() : input
        def loadBalancerId = params.domain?.loadBalancerId ?: params.loadBalancerId
        def options = []
        morpheusContext.loadBalancer.partition
            .listSyncProjections(loadBalancerId.toLong(), category)
            .blockingSubscribe { options << [name: it.name, value: it.name] }
        return options
    }
}
```

### SyncTask Pattern (from PoolSync)
```groovy
class PoolSync extends BigIPEntitySync {
    def execute() {
        if (!shouldExecute()) return

        def svc = morpheusContext.loadBalancer.pool
        def apiItems = plugin.provider.listPools(loadBalancer)

        // Three-phase sync: add/update/delete
        Observable domainRecords = svc.listSyncProjections(loadBalancer.id)
        SyncTask<LoadBalancerPoolIdentityProjection, Map, NetworkLoadBalancerPool> syncTask =
            new SyncTask<>(domainRecords, apiItems.pools)

        syncTask.addMatchFunction { domainItem, cloudItem ->
            domainItem.externalId == cloudItem.fullPath
        }.withLoadObjectDetails { updateItems ->
            // Load full objects for items that need updating
            svc.listById(updateItems?.collect { it.existingItem.id }).map { pool ->
                new SyncTask.UpdateItem<>(existingItem: pool, masterItem: matchedItem.masterItem)
            }
        }.onAdd { addItems ->
            def adds = addItems.collect { pool ->
                new NetworkLoadBalancerPool(/* config map */)
            }
            svc.create(adds).blockingGet()
        }.onUpdate { updateItems ->
            // Compare and update changed fields
        }.onDelete { removeItems ->
            svc.remove(removeItems).blockingGet()
        }.start()
    }
}
```

### LoadBalancerProvider refresh() — Sync Orchestration
```groovy
@Override
ServiceResponse refresh(NetworkLoadBalancer loadBalancer) {
    // 1. Check connectivity
    hostOnline = ConnectionUtils.testHostConnectivity(apiHost, apiPort, true, true, null)

    if (hostOnline) {
        // 2. Execute syncs in dependency order
        (new PartitionSync(this.plugin, loadBalancer)).execute()
        (new NodesSync(this.plugin, loadBalancer)).execute()
        (new HealthMonitorSync(this.plugin, loadBalancer)).execute()
        (new PoolSync(this.plugin, loadBalancer)).execute()
        // ... 6 more sync classes ...

        // 3. Update status
        morpheusContext.async.loadBalancer.updateLoadBalancerStatus(loadBalancer, 'ok', null)
        morpheusContext.async.loadBalancer.clearLoadBalancerAlarm(loadBalancer)
    } else {
        morpheusContext.async.loadBalancer.updateLoadBalancerStatus(loadBalancer, 'offline', msg)
    }
}
```

### API Call Pattern (from BigIpProvider)
```groovy
def listPools(NetworkLoadBalancer loadBalancer) {
    def apiConfig = getConnectionBase(loadBalancer) // auth + url setup
    def endpointPath = "${apiConfig.path}/tm/ltm/pool"
    def params = [
        uri: apiConfig.url,
        path: endpointPath,
        username: apiConfig.username,
        password: apiConfig.password,
        authToken: apiConfig.authToken
    ]
    def results = callApi(params, 'GET')
    if (results.success) {
        return [success: true, pools: results.data.items, authToken: apiConfig.authToken]
    }
}
```

### Utility Constants Pattern
```groovy
class BigIpUtility {
    static final BALANCE_MODE = [
        [name:'round robin', value:'roundrobin'],
        [name:'least connections', value:'leastconnections']
    ]
    static final VIRTUAL_SERVER_PROTOCOL_LIST = [
        [name:'tcp', value:'tcp'], [name:'udp', value:'udp'], [name:'sctp', value:'sctp']
    ]
    static final STICKY_MODE = [
        [name:'sourceip', value:'sourceip'], [name:'cookie', value:'cookie']
    ]

    // Category builder for namespacing
    static def getObjCategory(String type, String loadBalancerId) {
        return "${OBJ_CATEGORY_PREFIX[type]}${loadBalancerId ? '.' + loadBalancerId : ''}".toString()
    }
}
```

---

## Dashboard Plugin

**Location**: `morpheus-dashboards/morpheus-dashboards/morpheus-home-dashboard-plugin/`
**Total**: 26 Groovy providers, 23 React JSX widgets

### Plugin Registration (Many Providers)
```groovy
class MorpheusHomeDashboardPlugin extends Plugin {
    @Override String getCode() { 'morpheus-home-dashboard-plugin' }

    @Override void initialize() {
        try {
            this.setName("Morpheus Home Dashboard")
            // 20+ providers registered via pluginProviders.put
            RecentActivityItemProvider recentActivity = new RecentActivityItemProvider(this, morpheus)
            this.pluginProviders.put(recentActivity.code, recentActivity)
            InstanceCountItemProvider instanceCount = new InstanceCountItemProvider(this, morpheus)
            this.pluginProviders.put(instanceCount.code, instanceCount)
            // ... 18 more providers ...
        } catch(e) {
            log.error("error initializing: ${e}", e)
        }
    }
}
```

### DashboardItemTypeProvider Pattern
```groovy
class InstanceCountItemProvider extends AbstractDashboardItemTypeProvider {
    @Override MorpheusContext getMorpheus() { morpheusContext }
    @Override Plugin getPlugin() { plugin }
    @Override String getCode() { 'dashboard-item-instance-count' }
    @Override String getName() { 'Instance count' }

    @Override
    DashboardItemType getDashboardItemType() {
        def rtn = new DashboardItemType()
        rtn.name = getName()
        rtn.code = getCode()
        rtn.category = 'instance'
        rtn.uiSize = 'sm'
        rtn.templatePath = 'hbs/instances/instance-count-widget'
        rtn.scriptPath = 'instances/instance-count-widget.js'
        rtn.permission = morpheusContext.getPermission().getByCode('provisioning').blockingGet()
        rtn.setAccessTypes(['user', 'full'])
        return rtn
    }
}
```

### DashboardProvider — Layout Definition
```groovy
class HomeDashboardProvider extends AbstractDashboardProvider {
    @Override
    Dashboard getDashboard() {
        def rtn = new Dashboard()
        rtn.code = getCode()
        rtn.dashboardId = 'home'
        rtn.defaultDashboard = true
        rtn.templatePath = 'hbs/home-dashboard'
        rtn.scriptPath = 'home-dashboard.js'

        // Items arranged in groups (top, main, instances, jobs, activity)
        def dashboardItemGroups = [
            top: ['dashboard-item-environment-count', 'dashboard-item-current-health'],
            main: ['dashboard-item-user-favorites', 'dashboard-item-current-alarms'],
            instances: ['dashboard-item-instance-count', 'dashboard-item-instance-count-cloud'],
            // ... more groups
        ]
        // Populate DashboardItem list from groups using getMorpheus().getDashboard().getDashboardItemType(code)
    }
}
```

### React Widget Pattern (Class Components)
```jsx
class InstanceCountWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loaded: false,
            autoRefresh: true,
            data: null,
            chartId: Morpheus.utils.generateGuid()  // Morpheus utility
        };
    }

    componentDidMount() {
        this.loadData();
        $(document).on('morpheus:refresh', this.refreshData); // Auto-refresh hook
    }

    loadData() {
        Morpheus.api.instances.count('group(status:count(id))').then(this.setData);
    }

    render() {
        return (
            <Widget>
                <WidgetHeader icon="..." title="Instance Status"
                    titleCode="gomorpheus.widget.title.instanceStatus"
                    link="/provisioning/instances"/>
                <div className="dashboard-widget-content">
                    <PieChartWidget data={this.state.data} config={this.state.chartConfig}/>
                </div>
            </Widget>
        );
    }
}

// MUST register the component
Morpheus.components.register('instance-count-widget', InstanceCountWidget);

// Render on DOM ready
$(document).ready(function () {
    const root = ReactDOM.createRoot(document.querySelector('#instance-count-widget'));
    root.render(<InstanceCountWidget/>);
});
```

### Key Morpheus JS Globals
| Global | Purpose |
|--------|---------|
| `Morpheus.api.*` | API client (instances, servers, etc.) |
| `Morpheus.utils.generateGuid()` | UUID generation |
| `Morpheus.components.register(name, Component)` | Register React component |
| `Morpheus.chart.*` | Chart utilities and tooltips |
| `$L({code:'...'})` | i18n/localization helper |
| `$(document).on('morpheus:refresh', fn)` | Auto-refresh event hook |
| `Morph.chartConfigs.statusColor(name)` | Status-to-color mapping |

---

## Build Configuration Patterns

### Dashboard build.gradle — Key Settings
```groovy
apply plugin: 'com.morpheusdata.morpheus-plugin-gradle'

dependencies {
    provided "com.morpheusdata:morpheus-plugin-api:$morphPluginApiVersion"
    provided "org.codehaus.groovy:groovy-all:$groovyVersion"
    testImplementation 'io.reactivex.rxjava3:rxjava:3.1.8'  // rxJava3 for tests
}

jar {
    manifest {
        attributes(
            'Plugin-Class': 'com.morpheusdata.dashboard.MorpheusHomeDashboardPlugin',
            'Morpheus-Min-Appliance-Version': "8.1.0"
        )
    }
}

assets {
    packagePlugin = false  // true for library plugins
}
```

---

## Key Architectural Insights for Octavia Plugin

### 1. Registration: `pluginProviders.put` vs `controllers.add`
- BigIP uses `this.pluginProviders.put(provider.code, provider)` for providers
- Controllers need `this.controllers.add(controller)` (separate list)
- Dashboard wraps `initialize()` in try-catch

### 2. Route.build() Second Parameter
- BigIP's CertificateController uses `"json"` as the second param
- This is the **response type**, not the method name
- Method name is derived from the last URL segment

### 3. OptionSourceProvider vs PluginController for Data
- BigIP uses `OptionSourceProvider` with `getMethodNames()` for native Morpheus form dropdowns
- Custom React UIs call `PluginController` routes via fetch for data
- **Our approach**: PluginController is correct for React-driven UI

### 4. SyncTask for Data Synchronization
- Use `SyncTask<ProjectionType, ApiItem, ModelType>` for add/update/delete sync
- Match via `addMatchFunction`, load details via `withLoadObjectDetails`
- Callbacks: `onAdd`, `onUpdate`, `onDelete`
- **Future use**: When implementing real Octavia API integration for LB sync

### 5. rxJava Patterns
- `blockingSubscribe { }` for collecting items into lists
- `blockingGet()` for single-item lookups
- `.toList().blockingGet()` for converting Observable to List
- `Observable.fromIterable(collection)` for wrapping existing collections

### 6. Permission Patterns
- BigIP uses `Permission.build("infrastructure-loadbalancer", "full")` for LB routes
- Dashboard uses `morpheusContext.getPermission().getByCode('provisioning').blockingGet()`
- **Our approach**: `Permission.build("infrastructure-networks", "full")` — System Admin inherits this
