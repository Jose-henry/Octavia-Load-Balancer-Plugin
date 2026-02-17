; (function () {
    // --- Step 1: Details ---
    const Step1_Details = ({ data, update, options }) => {
        const { Field } = window.Octavia;
        return (
            <div className="form-horizontal">
                <div className="row">
                    <div className="col-md-6">
                        <Field label="Name" required>
                            <input className="form-control" value={data.name || ''} onChange={e => update('name', e.target.value)} placeholder="My Load Balancer" />
                        </Field>
                    </div>
                    <div className="col-md-6">
                        <Field label="Description">
                            <input className="form-control" value={data.description || ''} onChange={e => update('description', e.target.value)} placeholder="Optional description" />
                        </Field>
                    </div>
                </div>
                <div className="row">
                    <div className="col-md-6">
                        <Field label="VIP Subnet" required>
                            <select className="form-control" value={data.vipSubnetId || ''} onChange={e => update('vipSubnetId', e.target.value)}>
                                <option value="">Select Subnet...</option>
                                {(options.subnets || []).map(s => <option key={s.value} value={s.value}>{s.name} {s.cidr ? `(${s.cidr})` : ''}</option>)}
                            </select>
                        </Field>
                    </div>
                    <div className="col-md-6">
                        <Field label="IP Address">
                            <input className="form-control" value={data.vipAddress || ''} onChange={e => update('vipAddress', e.target.value)} placeholder="Auto-assign" />
                        </Field>
                    </div>
                </div>
            </div>
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
            <div className="form-horizontal">
                <div className="form-group">
                    <div className="col-sm-12">
                        <div className="checkbox">
                            <label>
                                <input type="checkbox" checked={data.createListener} onChange={e => update('createListener', e.target.checked)} />
                                <strong>Create Listener</strong>
                            </label>
                        </div>
                    </div>
                </div>
                {data.createListener && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
                    <div className="row">
                        <div className="col-md-6">
                            <Field label="Listener Name" required>
                                <input className="form-control" value={data.listenerName || ''} onChange={e => update('listenerName', e.target.value)} />
                            </Field>
                        </div>
                        <div className="col-md-3">
                            <Field label="Protocol" required>
                                <select className="form-control" value={data.listenerProtocol || 'HTTP'} onChange={e => update('listenerProtocol', e.target.value)}>
                                    {protocols.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div className="col-md-3">
                            <Field label="Port" required>
                                <input type="number" className="form-control" value={data.listenerPort || 80} onChange={e => update('listenerPort', parseInt(e.target.value))} min="1" max="65535" />
                            </Field>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-md-6">
                            <Field label="Connection Limit">
                                <input type="number" className="form-control" value={data.connectionLimit || -1} onChange={e => update('connectionLimit', parseInt(e.target.value))} placeholder="-1 for infinite" />
                            </Field>
                        </div>
                        <div className="col-md-6">
                            <Field label="Allowed CIDRs">
                                <input className="form-control" value={data.allowedCidrs || ''} onChange={e => update('allowedCidrs', e.target.value)} placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8" />
                            </Field>
                        </div>
                    </div>

                    {!hideTimeouts && <div className="row">
                        <div className="col-md-3"><Field label="Client Data Timeout"><input type="number" className="form-control" value={data.clientDataTimeout || 50000} onChange={e => update('clientDataTimeout', parseInt(e.target.value))} /></Field></div>
                        <div className="col-md-3"><Field label="TCP Inspect Timeout"><input type="number" className="form-control" value={data.tcpInspectTimeout || 0} onChange={e => update('tcpInspectTimeout', parseInt(e.target.value))} /></Field></div>
                        <div className="col-md-3"><Field label="Member Connect Timeout"><input type="number" className="form-control" value={data.memberConnectTimeout || 5000} onChange={e => update('memberConnectTimeout', parseInt(e.target.value))} /></Field></div>
                        <div className="col-md-3"><Field label="Member Data Timeout"><input type="number" className="form-control" value={data.memberDataTimeout || 50000} onChange={e => update('memberDataTimeout', parseInt(e.target.value))} /></Field></div>
                    </div>}

                    {showHeaders && <div className="well ml-3">
                        <label>Insert Headers</label>
                        <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedFor || false} onChange={e => update('insertXForwardedFor', e.target.checked)} /> X-Forwarded-For</label></div>
                        <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedPort || false} onChange={e => update('insertXForwardedPort', e.target.checked)} /> X-Forwarded-Port</label></div>
                        <div className="checkbox"><label><input type="checkbox" checked={data.insertXForwardedProto || false} onChange={e => update('insertXForwardedProto', e.target.checked)} /> X-Forwarded-Proto</label></div>
                    </div>}

                    {showTls && <div className="well ml-3">
                        <label>TLS Configuration</label>
                        <Field label="TLS Cipher String">
                            <input className="form-control" value={data.tlsCipherString || ''} onChange={e => update('tlsCipherString', e.target.value)} placeholder="Default" />
                        </Field>
                    </div>}
                </div>}
            </div>
        );
    };

    // --- Step 3: Pool ---
    const Step3_Pool = ({ data, update }) => {
        const { Field } = window.Octavia;
        const algorithms = ['ROUND_ROBIN', 'LEAST_CONNECTIONS', 'SOURCE_IP'];
        const protocols = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SCTP'];

        return (
            <div className="form-horizontal">
                <div className="form-group">
                    <div className="col-sm-12">
                        <div className="checkbox">
                            <label>
                                <input type="checkbox" checked={data.createPool} onChange={e => update('createPool', e.target.checked)} />
                                <strong>Create Pool</strong>
                            </label>
                        </div>
                    </div>
                </div>
                {data.createPool && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
                    <div className="row">
                        <div className="col-md-6">
                            <Field label="Pool Name" required>
                                <input className="form-control" value={data.poolName || ''} onChange={e => update('poolName', e.target.value)} />
                            </Field>
                        </div>
                        <div className="col-md-6">
                            <Field label="Algorithm" required>
                                <select className="form-control" value={data.poolAlgorithm || 'ROUND_ROBIN'} onChange={e => update('poolAlgorithm', e.target.value)}>
                                    {algorithms.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </Field>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-md-6">
                            <Field label="Protocol" required>
                                <select className="form-control" value={data.poolProtocol || data.listenerProtocol || 'HTTP'} onChange={e => update('poolProtocol', e.target.value)}>
                                    {protocols.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div className="col-md-6">
                            <Field label="Description">
                                <input className="form-control" value={data.poolDesc || ''} onChange={e => update('poolDesc', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    <div className="well">
                        <label>Session Persistence</label>
                        <div className="row">
                            <div className="col-md-6">
                                <Field label="Type">
                                    <select className="form-control" value={data.sessionPersistence || 'None'} onChange={e => update('sessionPersistence', e.target.value)}>
                                        <option value="None">None</option>
                                        <option value="SOURCE_IP">Source IP</option>
                                        <option value="HTTP_COOKIE">HTTP Cookie</option>
                                        <option value="APP_COOKIE">App Cookie</option>
                                    </select>
                                </Field>
                            </div>
                            {data.sessionPersistence === 'APP_COOKIE' && <div className="col-md-6">
                                <Field label="Cookie Name" required>
                                    <input className="form-control" value={data.cookieName || ''} onChange={e => update('cookieName', e.target.value)} />
                                </Field>
                            </div>}
                        </div>
                    </div>
                    <div className="well">
                        <label>TLS Encryption (Backend Re-encryption)</label>
                        <div className="checkbox">
                            <label>
                                <input type="checkbox" checked={data.poolTlsEnabled || false} onChange={e => update('poolTlsEnabled', e.target.checked)} />
                                Enable TLS
                            </label>
                        </div>
                        {data.poolTlsEnabled && <Field label="Cipher String">
                            <input className="form-control" value={data.poolTlsCipher || ''} onChange={e => update('poolTlsCipher', e.target.value)} placeholder="Default" />
                        </Field>
                        }
                    </div>
                </div>}
            </div>
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
            <div>
                {!data.createPool ? <div className="alert alert-warning">Pool creation is disabled. No members can be added.</div> :
                    <div>
                        <div className="row">
                            <div className="col-md-6">
                                <div className="panel panel-default">
                                    <div className="panel-heading">Add Instance Member</div>
                                    <div className="panel-body">
                                        <div className="input-group">
                                            <select className="form-control" value={selectedInst} onChange={e => setSelectedInst(e.target.value)}>
                                                <option value="">Select Instance...</option>
                                                {availableInstances.map(i => <option key={i.value} value={i.value}>{i.name}</option>)}
                                            </select>
                                            <span className="input-group-btn">
                                                <button className="btn btn-success" onClick={addInternal} disabled={!selectedInst}>Add</button>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="col-md-6">
                                <div className="panel panel-default">
                                    <div className="panel-heading">Add External Member</div>
                                    <div className="panel-body">
                                        <div className="row">
                                            <div className="col-xs-5"><input className="form-control input-sm" placeholder="IP Address" value={extIp} onChange={e => setExtIp(e.target.value)} /></div>
                                            <div className="col-xs-3"><input type="number" className="form-control input-sm" placeholder="Port" value={extPort} onChange={e => setExtPort(parseInt(e.target.value))} /></div>
                                            <div className="col-xs-2"><input type="number" className="form-control input-sm" placeholder="Wgt" value={extWeight} onChange={e => setExtWeight(parseInt(e.target.value))} /></div>
                                            <div className="col-xs-2"><button className="btn btn-success btn-sm btn-block" onClick={addExternal} disabled={!extIp}>Add</button></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <table className="table table-striped table-bordered">
                            <thead><tr><th>Name</th><th>Address</th><th>Port</th><th>Weight</th><th>Type</th><th></th></tr></thead>
                            <tbody>
                                {(data.members || []).length === 0 ? <tr><td colSpan="6" className="text-center text-muted">No members defined</td></tr> :
                                    (data.members || []).map(m => (
                                        <tr key={m.id}>
                                            <td>{m.name}</td>
                                            <td>{m.address}</td>
                                            <td>{m.port}</td>
                                            <td>{m.weight}</td>
                                            <td><Badge text={m.type || 'INTERNAL'} tone={m.type === 'EXTERNAL' ? 'warning' : 'info'} /></td>
                                            <td className="text-right"><button className="btn btn-xs" style={{ backgroundColor: '#b00020', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => removeMember(m.id)}>&times;</button></td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>}
            </div>
        );
    };

    // --- Step 5: Monitor ---
    const Step5_Monitor = ({ data, update }) => {
        const { Field } = window.Octavia;
        const types = ['HTTP', 'HTTPS', 'PING', 'TCP', 'TLS-HELLO', 'UDP-CONNECT', 'SCTP'];
        return (
            <div className="form-horizontal">
                <div className="form-group">
                    <div className="col-sm-12">
                        <div className="checkbox">
                            <label>
                                <input type="checkbox" checked={data.createMonitor} onChange={e => update('createMonitor', e.target.checked)} />
                                <strong>Create Health Monitor</strong>
                            </label>
                        </div>
                    </div>
                </div>
                {data.createMonitor && <div style={{ borderLeft: '3px solid #ddd', paddingLeft: 15, marginLeft: 5 }}>
                    <div className="row">
                        <div className="col-md-6">
                            <Field label="Name" required>
                                <input className="form-control" value={data.monitorName || ''} onChange={e => update('monitorName', e.target.value)} />
                            </Field>
                        </div>
                        <div className="col-md-6">
                            <Field label="Type" required>
                                <select className="form-control" value={data.monitorType || 'HTTP'} onChange={e => update('monitorType', e.target.value)}>
                                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                        </div>
                    </div>

                    {(data.monitorType === 'HTTP' || data.monitorType === 'HTTPS') && <div>
                        <div className="row">
                            <div className="col-md-4">
                                <Field label="HTTP Method">
                                    <select className="form-control" value={data.httpMethod || 'GET'} onChange={e => update('httpMethod', e.target.value)}>
                                        {['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'OPTIONS', 'PATCH', 'CONNECT'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <div className="col-md-4">
                                <Field label="Expected Codes">
                                    <input className="form-control" value={data.expectedCodes || '200'} onChange={e => update('expectedCodes', e.target.value)} placeholder="200, 200-204" />
                                </Field>
                            </div>
                            <div className="col-md-4">
                                <Field label="URL Path">
                                    <input className="form-control" value={data.urlPath || '/'} onChange={e => update('urlPath', e.target.value)} placeholder="/" />
                                </Field>
                            </div>
                        </div>
                    </div>}

                    <div className="row">
                        <div className="col-md-3">
                            <Field label="Delay (sec)" required><input type="number" className="form-control" value={data.delay || 5} onChange={e => update('delay', parseInt(e.target.value))} /></Field>
                        </div>
                        <div className="col-md-3">
                            <Field label="Timeout (sec)" required><input type="number" className="form-control" value={data.timeout || 5} onChange={e => update('timeout', parseInt(e.target.value))} /></Field>
                        </div>
                        <div className="col-md-3">
                            <Field label="Max Retries" required><input type="number" className="form-control" value={data.maxRetries || 3} onChange={e => update('maxRetries', parseInt(e.target.value))} /></Field>
                        </div>
                        <div className="col-md-3">
                            <Field label="Max Retries Down"><input type="number" className="form-control" value={data.maxRetriesDown || 3} onChange={e => update('maxRetriesDown', parseInt(e.target.value))} /></Field>
                        </div>
                    </div>
                </div>}
            </div>
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
