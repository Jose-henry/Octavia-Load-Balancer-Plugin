# Reference Plugin Patterns

## BIG-IP Load Balancer Plugin
**Location**: `morpheus-bigip-loadbalancer-plugin/morpheus-bigip-loadbalancer-plugin/`

### Key Files
| File | Lines | Pattern |
|------|-------|---------|
| `BigIpPlugin.groovy` | 32 | Plugin registration, provider setup |
| `BigIpProvider.groovy` | 4723 | `LoadBalancerProvider` interface |
| `BigIpOptionSourceProvider.groovy` | - | Dropdown data sources |
| `BigIpUtility.groovy` | 295 | Constants, helpers |
| `sync/*.groovy` | - | Data sync patterns |
| `CertificateController.groovy` | - | Controller pattern |

### Plugin Registration Pattern
```groovy
class BigIpPlugin extends Plugin {
    @Override String getCode() { 'morpheus-bigip-plugin' }
    
    @Override void initialize() {
        BigIpProvider bigipProvider = new BigIpProvider(this, morpheus)
        BigIpOptionSourceProvider optionSource = new BigIpOptionSourceProvider(this, morpheus)
        this.pluginProviders.put(bigipProvider.code, bigipProvider)
        this.pluginProviders.put(optionSource.code, optionSource)
        this.setName("BigIp")
    }
}
```

### OptionType Patterns
```groovy
// Text input
new OptionType(name:'Name', code:'plugin.bigip.pool.name', fieldName:'name',
    displayOrder:10, fieldLabel:'Name', required:true,
    inputType:OptionType.InputType.TEXT, fieldContext:'domain')

// Dropdown with option source
new OptionType(name:'balanceMode', code:'plugin.bigip.pool.balanceMode',
    fieldName:'vipBalance', displayOrder:12, fieldLabel:'Balance Mode',
    required:true, inputType:OptionType.InputType.SELECT,
    optionSource:'bigIpPluginBalanceModes', fieldContext:'domain')

// Multi-select typeahead
new OptionType(name:'members', code:'plugin.bigip.pool.members',
    fieldName:'members.id', displayOrder:14, fieldLabel:'Members',
    required:false, inputType:OptionType.InputType.MULTI_TYPEAHEAD,
    optionSource:'bigIpPluginNodes')
```

### Utility Constants Pattern
```groovy
class BigIpUtility {
    static final BALANCE_MODE = [
        [name:'round robin', value:'roundrobin'],
        [name:'least connections', value:'leastconnections']
    ]
    static final VIRTUAL_SERVER_PROTOCOL_LIST = [
        [name:'tcp', value:'tcp'], [name:'udp', value:'udp']
    ]
}
```

---

## Dashboard Plugin
**Location**: `morpheus-dashboards/morpheus-dashboards/morpheus-home-dashboard-plugin/`

### Key Files
| File | Pattern |
|------|---------|
| `MorpheusHomeDashboardPlugin.groovy` | Multiple provider registration |
| `*ItemProvider.groovy` | Dashboard item providers |
| `assets/js/*.jsx` | React widget components |

### React Widget Pattern
```jsx
class InstanceCountWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = { loaded: false, data: null };
    }

    componentDidMount() {
        this.loadData();
        $(document).on('morpheus:refresh', this.refreshData);
    }

    loadData() {
        Morpheus.api.instances.count('group(status:count(id))')
            .then(this.setData);
    }

    render() {
        return (
            <Widget>
                <WidgetHeader icon="..." title="..." link="/provisioning/instances"/>
                <div className="dashboard-widget-content">
                    <PieChartWidget data={this.state.data} config={this.state.chartConfig}/>
                </div>
            </Widget>
        );
    }
}

// Register the widget
Morpheus.components.register('instance-count-widget', InstanceCountWidget);
```

### Morpheus Globals
- `Morpheus.api.*` - API client methods
- `Morpheus.utils.generateGuid()` - UUID generation
- `Morpheus.components.register()` - Component registration
- `Morpheus.chart.*` - Chart utilities
- `$L({code:'...'})` - Localization helper

---

## Patterns for Octavia Plugin

### Recommended OptionTypes
```groovy
// For Octavia Load Balancer create form
getLoadBalancerOptionTypes() {
    return [
        new OptionType(name:'name', fieldName:'name', fieldLabel:'Name',
            required:true, inputType:OptionType.InputType.TEXT),
        new OptionType(name:'vipSubnetId', fieldName:'vipSubnetId',
            fieldLabel:'Subnet', required:true,
            inputType:OptionType.InputType.SELECT,
            optionSource:'octaviaSubnets'),
        new OptionType(name:'adminStateUp', fieldName:'adminStateUp',
            fieldLabel:'Admin State', defaultValue:'on',
            inputType:OptionType.InputType.CHECKBOX)
    ]
}
```

### Recommended Constants File
Create `OctaviaUtility.groovy`:
```groovy
class OctaviaUtility {
    static final PROTOCOLS = [
        [name:'HTTP', value:'HTTP'],
        [name:'HTTPS', value:'HTTPS'],
        [name:'TCP', value:'TCP'],
        [name:'UDP', value:'UDP']
    ]
    static final ALGORITHMS = [
        [name:'Round Robin', value:'ROUND_ROBIN'],
        [name:'Least Connections', value:'LEAST_CONNECTIONS'],
        [name:'Source IP', value:'SOURCE_IP']
    ]
    static final MONITOR_TYPES = [
        [name:'HTTP', value:'HTTP'],
        [name:'HTTPS', value:'HTTPS'],
        [name:'TCP', value:'TCP'],
        [name:'PING', value:'PING']
    ]
}
```
