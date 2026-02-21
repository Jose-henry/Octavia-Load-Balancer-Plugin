; (function () {
    // --- Step 1: Details ---
    const Step1_Details = ({ data, update, options }) => {
        const { Field } = window.Octavia;

        const cloud = options?.optionClouds?.[0]?.name || options?.cloud?.name || data?.cloud?.name || 'None';
        const resourcePool = options?.optionResourcePools?.[0]?.name || 'None';

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              React.createElement(
                "div",
                {className: "row"},
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "Cloud"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: cloud, readOnly: true, disabled: true}
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "Resource Pool"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: resourcePool, readOnly: true, disabled: true}
                    )
                  )
                )
              ),
              React.createElement(
                "div",
                {className: "row"},
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "Name", required: true},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.name || '', onChange: e => update('name', e.target.value), placeholder: "My Load Balancer"}
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "Description"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.description || '', onChange: e => update('description', e.target.value), placeholder: "Optional description"}
                    )
                  )
                )
              ),
              React.createElement(
                "div",
                {className: "row"},
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "VIP Subnet", required: true},
                    React.createElement(
                      "select",
                      {className: "form-control", value: data.vipSubnetId || '', onChange: e => update('vipSubnetId', e.target.value)},
                      React.createElement(
                        "option",
                        {value: true},
                        "Select Subnet..."
                      ),
                      (options.subnets || []).map(s => React.createElement(
                                   "option",
                                   {key: s.value, value: s.value},
                                   s.name,
                                   s.cidr ? `(${s.cidr})` : ''
                                 ))
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {className: "col-md-6"},
                  React.createElement(
                    Field,
                    {label: "IP Address"},
                    React.createElement(
                      "input",
                      {className: "form-control", value: data.vipAddress || '', onChange: e => update('vipAddress', e.target.value), placeholder: "Auto-assign"}
                    )
                  )
                )
              )
            )
        );
    };

    // --- Step 2: Listener ---
    const Step2_Listener = ({ data, update }) => {
        const { Field } = window.Octavia;
        const protocols = ['HTTP', 'HTTPS', 'TERMINATED_HTTPS', 'TCP', 'UDP', 'SCTP'];
        const showHeaders = ['HTTP', 'TERMINATED_HTTPS'].includes(data.listenerProtocol);
        const showTls = data.listenerProtocol === 'TERMINATED_HTTPS';
        const hideTimeouts = ['UDP', 'SCTP'].includes(data.listenerProtocol);

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              React.createElement(
                "div",
                {className: "form-group"},
                React.createElement(
                  "div",
                  {className: "col-sm-12"},
                  React.createElement(
                    "div",
                    {className: "checkbox"},
                    React.createElement(
                      "label",
                      null,
                      React.createElement(
                        "input",
                        {type: "checkbox", checked: data.createListener, onChange: e => update('createListener', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Listener"
                      )
                    )
                  )
                )
              ),
              data.createListener && React.createElement(
                         "div",
                         {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                         React.createElement(
                           "div",
                           {className: "row"},
                           React.createElement(
                             "div",
                             {className: "col-md-6"},
                             React.createElement(
                               Field,
                               {label: "Listener Name", required: true},
                               React.createElement(
                                 "input",
                                 {className: "form-control", value: data.listenerName || '', onChange: e => update('listenerName', e.target.value)}
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-3"},
                             React.createElement(
                               Field,
                               {label: "Protocol", required: true},
                               React.createElement(
                                 "select",
                                 {className: "form-control", value: data.listenerProtocol || 'HTTP', onChange: e => update('listenerProtocol', e.target.value)},
                                 protocols.map(p => React.createElement(
                     "option",
                     {key: p, value: p},
                     p
                   ))
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-3"},
                             React.createElement(
                               Field,
                               {label: "Port", required: true},
                               React.createElement(
                                 "input",
                                 {type: "number", className: "form-control", value: data.listenerPort || 80, onChange: e => update('listenerPort', parseInt(e.target.value)), min: "1", max: "65535"}
                               )
                             )
                           )
                         ),
                         React.createElement(
                           "div",
                           {className: "row"},
                           React.createElement(
                             "div",
                             {className: "col-md-6"},
                             React.createElement(
                               Field,
                               {label: "Connection Limit"},
                               React.createElement(
                                 "input",
                                 {type: "number", className: "form-control", value: data.connectionLimit || -1, onChange: e => update('connectionLimit', parseInt(e.target.value)), placeholder: "-1 for infinite"}
                               )
                             )
                           ),
                           React.createElement(
                             "div",
                             {className: "col-md-6"},
                             React.createElement(
                               Field,
                               {label: "Allowed CIDRs"},
                               React.createElement(
                                 "input",
                                 {className: "form-control", value: data.allowedCidrs || '', onChange: e => update('allowedCidrs', e.target.value), placeholder: "e.g. 192.168.1.0/24, 10.0.0.0/8"}
                               )
                             )
                           )
                         ),
                         !hideTimeouts && React.createElement(
                   "div",
                   null,
                   React.createElement(
                     "div",
                     {className: "row"},
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "Client Data Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.clientDataTimeout || 50000, onChange: e => update('clientDataTimeout', parseInt(e.target.value))}
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "TCP Inspect Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.tcpInspectTimeout || 0, onChange: e => update('tcpInspectTimeout', parseInt(e.target.value))}
                         )
                       )
                     )
                   ),
                   React.createElement(
                     "div",
                     {className: "row"},
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "Member Connect Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.memberConnectTimeout || 5000, onChange: e => update('memberConnectTimeout', parseInt(e.target.value))}
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "col-md-6"},
                       React.createElement(
                         Field,
                         {label: "Member Data Timeout"},
                         React.createElement(
                           "input",
                           {type: "number", className: "form-control", value: data.memberDataTimeout || 50000, onChange: e => update('memberDataTimeout', parseInt(e.target.value))}
                         )
                       )
                     )
                   )
                 ),
                         showHeaders && React.createElement(
                 "div",
                 {className: "well ml-3"},
                 React.createElement(
                   "label",
                   null,
                   "Insert Headers"
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedFor || false, onChange: e => update('insertXForwardedFor', e.target.checked)}
                     ),
                     " X-Forwarded-For"
                   )
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedPort || false, onChange: e => update('insertXForwardedPort', e.target.checked)}
                     ),
                     " X-Forwarded-Port"
                   )
                 ),
                 React.createElement(
                   "div",
                   {className: "checkbox"},
                   React.createElement(
                     "label",
                     null,
                     React.createElement(
                       "input",
                       {type: "checkbox", checked: data.insertXForwardedProto || false, onChange: e => update('insertXForwardedProto', e.target.checked)}
                     ),
                     " X-Forwarded-Proto"
                   )
                 )
               ),
                         showTls && React.createElement(
             "div",
             {className: "well ml-3"},
             React.createElement(
               "label",
               null,
               "TLS Configuration"
             ),
             React.createElement(
               Field,
               {label: "TLS Cipher String"},
               React.createElement(
                 "input",
                 {className: "form-control", value: data.tlsCipherString || '', onChange: e => update('tlsCipherString', e.target.value), placeholder: "Default"}
               )
             )
           )
                       )
            )
        );
    };

    // --- Step 3: Pool ---
    const Step3_Pool = ({ data, update }) => {
        const { Field } = window.Octavia;
        const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
        const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP'];

        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              React.createElement(
                "div",
                {className: "form-group"},
                React.createElement(
                  "div",
                  {className: "col-sm-12"},
                  React.createElement(
                    "div",
                    {className: "checkbox"},
                    React.createElement(
                      "label",
                      null,
                      React.createElement(
                        "input",
                        {type: "checkbox", checked: data.createPool, onChange: e => update('createPool', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Pool"
                      )
                    )
                  )
                )
              ),
              data.createPool && React.createElement(
                     "div",
                     {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                     React.createElement(
                       "div",
                       {className: "row"},
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Pool Name", required: true},
                           React.createElement(
                             "input",
                             {className: "form-control", value: data.poolName || '', onChange: e => update('poolName', e.target.value)}
                           )
                         )
                       ),
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Algorithm", required: true},
                           React.createElement(
                             "select",
                             {className: "form-control", value: data.poolAlgorithm || 'ROUND_ROBIN', onChange: e => update('poolAlgorithm', e.target.value)},
                             algorithms.map(a => React.createElement(
                      "option",
                      {key: a, value: a},
                      a
                    ))
                           )
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "row"},
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Protocol", required: true},
                           React.createElement(
                             "select",
                             {className: "form-control", value: data.poolProtocol || data.listenerProtocol || 'HTTP', onChange: e => update('poolProtocol', e.target.value)},
                             protocols.map(p => React.createElement(
                     "option",
                     {key: p, value: p},
                     p
                   ))
                           )
                         )
                       ),
                       React.createElement(
                         "div",
                         {className: "col-md-6"},
                         React.createElement(
                           Field,
                           {label: "Description"},
                           React.createElement(
                             "input",
                             {className: "form-control", value: data.poolDesc || '', onChange: e => update('poolDesc', e.target.value)}
                           )
                         )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "well"},
                       React.createElement(
                         "label",
                         null,
                         "Session Persistence"
                       ),
                       React.createElement(
                         "div",
                         {className: "row"},
                         React.createElement(
                           "div",
                           {className: "col-md-6"},
                           React.createElement(
                             Field,
                             {label: "Type"},
                             React.createElement(
                               "select",
                               {className: "form-control", value: data.sessionPersistence || 'None', onChange: e => update('sessionPersistence', e.target.value)},
                               React.createElement(
                                 "option",
                                 {value: "None"},
                                 "None"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "SOURCE_IP"},
                                 "Source IP"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "HTTP_COOKIE"},
                                 "HTTP Cookie"
                               ),
                               React.createElement(
                                 "option",
                                 {value: "APP_COOKIE"},
                                 "App Cookie"
                               )
                             )
                           )
                         ),
                         data.sessionPersistence === 'APP_COOKIE' && React.createElement(
                                              "div",
                                              {className: "col-md-6"},
                                              React.createElement(
                                                Field,
                                                {label: "Cookie Name", required: true},
                                                React.createElement(
                                                  "input",
                                                  {className: "form-control", value: data.cookieName || '', onChange: e => update('cookieName', e.target.value)}
                                                )
                                              )
                                            )
                       )
                     ),
                     React.createElement(
                       "div",
                       {className: "well"},
                       React.createElement(
                         "label",
                         null,
                         "TLS Encryption (Backend Re-encryption)"
                       ),
                       React.createElement(
                         "div",
                         {className: "checkbox"},
                         React.createElement(
                           "label",
                           null,
                           React.createElement(
                             "input",
                             {type: "checkbox", checked: data.poolTlsEnabled || false, onChange: e => update('poolTlsEnabled', e.target.checked)}
                           ),
                           "Enable TLS"
                         )
                       ),
                       data.poolTlsEnabled && React.createElement(
                         Field,
                         {label: "Cipher String"},
                         React.createElement(
                           "input",
                           {className: "form-control", value: data.poolTlsCipher || '', onChange: e => update('poolTlsCipher', e.target.value), placeholder: "Default"}
                         )
                       )
                     )
                   )
            )
        );
    };

    // --- Step 4: Members ---
    const Step4_Members = ({ data, update, options }) => {
        const { Badge } = window.Octavia;
        const [selectedInst, setSelectedInst] = React.useState('');
        const availableInstances = (options.instances || []).filter(i => !(data.members || []).find(m => m.id === i.value));
        const [extIp, setExtIp] = React.useState('');
        const [extPort, setExtPort] = React.useState(80);
        const [extWeight, setExtWeight] = React.useState(1);

        const addInternal = () => {
            if (!selectedInst) return;
            const inst = options.instances.find(i => i.value === selectedInst);
            const newMember = {
                id: inst.value, name: inst.name, type: 'INTERNAL',
                address: '10.0.0.' + Math.floor(Math.random() * 255), // Mock
                port: 80, weight: 1, role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setSelectedInst('');
        };

        const addExternal = () => {
            if (!extIp) return;
            const newMember = {
                id: 'ext-' + Math.floor(Math.random() * 10000),
                name: extIp, type: 'EXTERNAL',
                address: extIp, port: extPort, weight: extWeight, role: 'member'
            };
            update('members', [...(data.members || []), newMember]);
            setExtIp('');
        };

        const removeMember = (id) => {
            update('members', (data.members || []).filter(m => m.id !== id));
        };

        return (
            React.createElement(
              "div",
              null,
              !data.createPool ? React.createElement(
                     "div",
                     {className: "alert alert-warning"},
                     "Pool creation is disabled. No members can be added."
                   ) :
                    React.createElement(
                      "div",
                      null,
                      React.createElement(
                        "div",
                        {className: "row"},
                        React.createElement(
                          "div",
                          {className: "col-md-6"},
                          React.createElement(
                            "div",
                            {className: "panel panel-default"},
                            React.createElement(
                              "div",
                              {className: "panel-heading"},
                              "Add Instance Member"
                            ),
                            React.createElement(
                              "div",
                              {className: "panel-body"},
                              React.createElement(
                                "div",
                                {className: "input-group"},
                                React.createElement(
                                  "select",
                                  {className: "form-control", value: selectedInst, onChange: e => setSelectedInst(e.target.value)},
                                  React.createElement(
                                    "option",
                                    {value: true},
                                    "Select Instance..."
                                  ),
                                  availableInstances.map(i => React.createElement(
                              "option",
                              {key: i.value, value: i.value},
                              i.name
                            ))
                                ),
                                React.createElement(
                                  "span",
                                  {className: "input-group-btn"},
                                  React.createElement(
                                    "button",
                                    {className: "btn btn-success", onClick: addInternal, disabled: !selectedInst},
                                    "Add"
                                  )
                                )
                              )
                            )
                          )
                        ),
                        React.createElement(
                          "div",
                          {className: "col-md-6"},
                          React.createElement(
                            "div",
                            {className: "panel panel-default"},
                            React.createElement(
                              "div",
                              {className: "panel-heading"},
                              "Add External Member"
                            ),
                            React.createElement(
                              "div",
                              {className: "panel-body"},
                              React.createElement(
                                "div",
                                {className: "row"},
                                React.createElement(
                                  "div",
                                  {className: "col-xs-5"},
                                  React.createElement(
                                    "input",
                                    {className: "form-control input-sm", placeholder: "IP Address", value: extIp, onChange: e => setExtIp(e.target.value)}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-3"},
                                  React.createElement(
                                    "input",
                                    {type: "number", className: "form-control input-sm", placeholder: "Port", value: extPort, onChange: e => setExtPort(parseInt(e.target.value))}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-2"},
                                  React.createElement(
                                    "input",
                                    {type: "number", className: "form-control input-sm", placeholder: "Wgt", value: extWeight, onChange: e => setExtWeight(parseInt(e.target.value))}
                                  )
                                ),
                                React.createElement(
                                  "div",
                                  {className: "col-xs-2"},
                                  React.createElement(
                                    "button",
                                    {className: "btn btn-success btn-sm btn-block", onClick: addExternal, disabled: !extIp},
                                    "Add"
                                  )
                                )
                              )
                            )
                          )
                        )
                      ),
                      React.createElement(
                        "table",
                        {className: "table table-striped table-bordered"},
                        React.createElement(
                          "thead",
                          null,
                          React.createElement(
                            "tr",
                            null,
                            React.createElement(
                              "th",
                              null,
                              "Name"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Address"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Port"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Weight"
                            ),
                            React.createElement(
                              "th",
                              null,
                              "Type"
                            ),
                            React.createElement(
                              "th",
                              null
                            )
                          )
                        ),
                        React.createElement(
                          "tbody",
                          null,
                          (data.members || []).length === 0 ? React.createElement(
                                      "tr",
                                      null,
                                      React.createElement(
                                        "td",
                                        {colSpan: "6", className: "text-center text-muted"},
                                        "No members defined"
                                      )
                                    ) :
                                    (data.members || []).map(m => (
                                        React.createElement(
                                          "tr",
                                          {key: m.id},
                                          React.createElement(
                                            "td",
                                            null,
                                            m.name
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.address
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.port
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            m.weight
                                          ),
                                          React.createElement(
                                            "td",
                                            null,
                                            React.createElement(
                                              Badge,
                                              {text: m.type || 'INTERNAL', tone: m.type === 'EXTERNAL' ? 'warning' : 'info'}
                                            )
                                          ),
                                          React.createElement(
                                            "td",
                                            {className: "text-right"},
                                            React.createElement(
                                              "button",
                                              {className: "btn btn-xs", style: { backgroundColor: '#b00020', color: '#fff', border: 'none', padding: '4px 8px', fontWeight: 'bold' }, onClick: () => removeMember(m.id)},
                                              React.createElement(
                                                "i",
                                                {className: "fa fa-trash"}
                                              ),
                                              " REMOVE"
                                            )
                                          )
                                        )
                                    ))
                        )
                      )
                    )
            )
        );
    };

    // --- Step 5: Monitor ---
    const Step5_Monitor = ({ data, update }) => {
        const { Field } = window.Octavia;
        const types = ['HTTP', 'HTTPS', 'PING', 'TCP', 'TLS-HELLO', 'UDP-CONNECT', 'SCTP'];
        return (
            React.createElement(
              "div",
              {className: "form-horizontal"},
              React.createElement(
                "div",
                {className: "form-group"},
                React.createElement(
                  "div",
                  {className: "col-sm-12"},
                  React.createElement(
                    "div",
                    {className: "checkbox"},
                    React.createElement(
                      "label",
                      null,
                      React.createElement(
                        "input",
                        {type: "checkbox", checked: data.createMonitor, onChange: e => update('createMonitor', e.target.checked)}
                      ),
                      React.createElement(
                        "strong",
                        null,
                        "Create Health Monitor"
                      )
                    )
                  )
                )
              ),
              data.createMonitor && React.createElement(
                        "div",
                        {style: { borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }},
                        React.createElement(
                          "div",
                          {className: "row"},
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Name", required: true},
                              React.createElement(
                                "input",
                                {className: "form-control", value: data.monitorName || '', onChange: e => update('monitorName', e.target.value)}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Type", required: true},
                              React.createElement(
                                "select",
                                {className: "form-control", value: data.monitorType || 'HTTP', onChange: e => update('monitorType', e.target.value)},
                                types.map(t => React.createElement(
                 "option",
                 {key: t, value: t},
                 t
               ))
                              )
                            )
                          )
                        ),
                        (data.monitorType === 'HTTP' || data.monitorType === 'HTTPS') && React.createElement(
                                                                   "div",
                                                                   null,
                                                                   React.createElement(
                                                                     "div",
                                                                     {className: "row"},
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-6"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "HTTP Method"},
                                                                         React.createElement(
                                                                           "select",
                                                                           {className: "form-control", value: data.httpMethod || 'GET', onChange: e => update('httpMethod', e.target.value)},
                                                                           ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'OPTIONS', 'PATCH', 'CONNECT'].map(m => React.createElement(
                                                                                            "option",
                                                                                            {key: m, value: m},
                                                                                            m
                                                                                          ))
                                                                         )
                                                                       )
                                                                     ),
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-6"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "Expected Codes"},
                                                                         React.createElement(
                                                                           "input",
                                                                           {className: "form-control", value: data.expectedCodes || '200', onChange: e => update('expectedCodes', e.target.value), placeholder: "200, 200-204"}
                                                                         )
                                                                       )
                                                                     )
                                                                   ),
                                                                   React.createElement(
                                                                     "div",
                                                                     {className: "row"},
                                                                     React.createElement(
                                                                       "div",
                                                                       {className: "col-md-6"},
                                                                       React.createElement(
                                                                         Field,
                                                                         {label: "URL Path"},
                                                                         React.createElement(
                                                                           "input",
                                                                           {className: "form-control", value: data.urlPath || '/', onChange: e => update('urlPath', e.target.value), placeholder: "/"}
                                                                         )
                                                                       )
                                                                     )
                                                                   )
                                                                 ),
                        React.createElement(
                          "div",
                          {className: "row"},
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Delay (sec)", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.delay || 5, onChange: e => update('delay', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Timeout (sec)", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.timeout || 5, onChange: e => update('timeout', parseInt(e.target.value))}
                              )
                            )
                          )
                        ),
                        React.createElement(
                          "div",
                          {className: "row"},
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Max Retries", required: true},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.maxRetries || 3, onChange: e => update('maxRetries', parseInt(e.target.value))}
                              )
                            )
                          ),
                          React.createElement(
                            "div",
                            {className: "col-md-6"},
                            React.createElement(
                              Field,
                              {label: "Max Retries Down"},
                              React.createElement(
                                "input",
                                {type: "number", className: "form-control", value: data.maxRetriesDown || 3, onChange: e => update('maxRetriesDown', parseInt(e.target.value))}
                              )
                            )
                          )
                        )
                      )
            )
        );
    };

    // Expose Steps
    window.Octavia = window.Octavia || {};
    window.Octavia.Steps = {
        Step1_Details,
        Step2_Listener,
        Step3_Pool,
        Step4_Members,
        Step5_Monitor
    };
})();

